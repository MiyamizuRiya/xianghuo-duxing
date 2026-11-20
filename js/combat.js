/* ============================================================
 * 战斗系统 · 对抗检定与三轮战斗流程
 * 由 engine.js 调用 Combat.run(key, cfg) → Promise(目标条目号)
 * ============================================================ */
(function () {
  'use strict';

  const Combat = {};

  /* ---------------- 玩家武器伤害 ---------------- */
  function playerWeapon(state) {
    return state.items.includes('knife') ? '1D4' : '1D3';
  }
  function playerDamageSpec(state) {
    const db = state.dbSpec; // '' | '-1' | '+1D4'
    if (!db) return playerWeapon(state);
    if (db === '-1') return playerWeapon(state) + '-1';
    return playerWeapon(state) + db;
  }

  function log(line, cls) {
    const box = document.getElementById('combat-log');
    if (!box) return;
    const p = document.createElement('p');
    p.className = 'clog ' + (cls || '');
    p.innerHTML = line;
    box.appendChild(p);
    box.scrollTop = box.scrollHeight;
  }

  function setHpBar(sel, cur, max) {
    const el = document.querySelector(sel);
    if (!el) return;
    el.querySelector('.cbar-fill').style.width = Math.max(0, Math.min(100, cur / max * 100)) + '%';
    el.querySelector('.cbar-num').textContent = Math.max(0, cur) + ' / ' + max;
  }

  function buttons(list) {
    const box = document.getElementById('combat-actions');
    box.innerHTML = '';
    list.forEach(b => {
      const btn = document.createElement('button');
      btn.className = 'choice-btn combat-btn' + (b.cls ? ' ' + b.cls : '');
      btn.innerHTML = b.t;
      btn.onclick = () => { box.innerHTML = ''; b.fn(); };
      box.appendChild(btn);
    });
  }

  /* ---------------- 通用对抗结算 ---------------- */
  async function resolveExchange(state, cfg, attack) {
    // attack: {skill, dmg, label}；玩家选择闪避或反击后调用
    const isFight = attack._response === 'fight';
    const playerStat = isFight ? (state.skills['格斗(斗殴)'] || 25) : (state.skills['闪避'] || Math.floor(state.attrs.DEX / 2));
    const res = await DiceUI.opposed({
      title: cfg.name + '的' + attack.label,
      a: { label: isFight ? '你的反击' : '你的闪避', value: playerStat },
      b: { label: cfg.name, value: attack.skill },
      aggressor: 'b'
    });
    return { playerWon: res.winner === 0, isFight };
  }

  async function damageEnemy(state, cfg, cstate) {
    let spec = playerDamageSpec(state);
    const r = await DiceUI.damage(spec, { title: '你的伤害', sub: (state.items.includes('knife') ? '狩猎小刀' : '赤手空拳') + (state.dbSpec ? ' + 伤害加值' + state.dbSpec : '') });
    let dmg = r.total;
    if (cfg.armor) {
      const absorb = Math.min(cstate.armorPool, dmg);
      cstate.armorPool -= absorb; dmg -= absorb;
      if (absorb > 0) log(cfg.name + '厚实的皮毛吸收了 ' + absorb + ' 点伤害。', 'dim');
    }
    if (dmg <= 0) { log('你的攻击没能造成伤害。', 'dim'); return; }
    cstate.enemyHp -= dmg;
    setHpBar('#enemy-hp', cstate.enemyHp, cfg.hp);
    log('你击中了' + cfg.name + '，造成 <b>' + dmg + '</b> 点伤害。', 'good');
  }

  async function damagePlayer(state, cfg, cstate, dmgSpec, label) {
    const r = await DiceUI.damage(dmgSpec, { title: cfg.name + '的' + label + '命中了你', theme: 'blood' });
    const dmg = r.total;
    state.hp = Math.max(0, state.hp - dmg);
    setHpBar('#player-hp', state.hp, state.hpMax);
    log(cfg.name + '击中了你，你受到 <b>' + dmg + '</b> 点伤害。', 'bad');
    if (dmg >= state.hpMax / 2) {
      cstate.majorWound = true;
      log('你受到了<b>重伤</b>！', 'bad');
      const con = await DiceUI.check({ statLabel: '「体质」', title: '重伤检定', value: state.attrs.CON, theme: 'blood' });
      if (!con.passed) return 'down';
    }
    if (state.hp <= 0) return 'down';
    return 'ok';
  }

  /* ---------------- 战斗主流程 ---------------- */
  Combat.run = function (state, key, entryCfg) {
    return new Promise(resolve => {
      const cfg = Combat.CONFIG[key];
      const cstate = {
        round: 0, enemyHp: cfg.hp, armorPool: cfg.armor || 0,
        majorWound: false, over: false
      };

      // 渲染战斗面板
      const panel = document.createElement('div');
      panel.className = 'combat-panel';
      panel.innerHTML =
        '<div class="combat-head">' +
        '  <span class="combat-foe">' + cfg.name + '</span>' +
        '  <span class="combat-round" id="combat-round"></span>' +
        '</div>' +
        '<div class="cbar foe"><div class="cbar-fill"></div><span class="cbar-num"></span></div>' +
        '<div class="cbar-label">' + cfg.name + '生命值</div>' +
        '<div class="cbar you" id="player-hp"><div class="cbar-fill"></div><span class="cbar-num"></span></div>' +
        '<div class="cbar-label">你的生命值</div>' +
        '<div id="combat-log" class="combat-log"></div>' +
        '<div id="combat-actions" class="combat-actions"></div>';
      document.getElementById('choices').innerHTML = '';
      document.getElementById('choices').appendChild(panel);
      panel.querySelector('.cbar.foe').id = 'enemy-hp';
      setHpBar('#enemy-hp', cstate.enemyHp, cfg.hp);
      setHpBar('#player-hp', state.hp, state.hpMax);
      log(cfg.intro, 'dim');
      if (state.items.includes('knife')) log('你握紧了买来的狩猎小刀（1D4' + (state.dbSpec ? state.dbSpec : '') + ' 伤害）。', 'dim');
      else log('你赤手空拳（1D3' + (state.dbSpec ? state.dbSpec : '') + ' 伤害）。', 'dim');

      const finish = target => { if (!cstate.over) { cstate.over = true; resolve(target); } };

      async function respondToAttack(attack) {
        buttons([
          { t: '闪避 <span class="btn-sub">「闪避」' + (state.skills['闪避'] || Math.floor(state.attrs.DEX / 2)) + '</span>', fn: async () => { attack._response = 'dodge'; await exchange(attack); } },
          { t: '反击 <span class="btn-sub">「格斗(斗殴)」' + (state.skills['格斗(斗殴)'] || 25) + '</span>', cls: 'hot', fn: async () => { attack._response = 'fight'; await exchange(attack); } }
        ]);
      }

      async function exchange(attack) {
        const r = await resolveExchange(state, cfg, attack);
        if (r.playerWon && r.isFight) {
          log('你的反击压过了' + cfg.name + '的动作！', 'good');
          await damageEnemy(state, cfg, cstate);
        } else if (r.playerWon) {
          log('你灵巧地躲开了' + attack.label + '。', 'good');
        } else if (!r.isFight) {
          const st = await damagePlayer(state, cfg, cstate, attack.dmg, attack.label);
          if (st === 'down') { finish(cfg.onPlayerDown); return; }
        } else {
          log('你的反击被' + cfg.name + '化解，它顺势出手！', 'bad');
          const st = await damagePlayer(state, cfg, cstate, attack.dmg, attack.label);
          if (st === 'down') { finish(cfg.onPlayerDown); return; }
        }
        afterExchange();
      }

      function afterExchange() {
        if (cstate.over) return;
        if (cstate.pending && cstate.pending.length) { nextAttack(); return; }
        // 回合结束：检查敌人状态
        if (cfg.lowThreshold && cstate.enemyHp <= cfg.lowThreshold) { finish(cfg.onLow); return; }
        if (cstate.enemyHp <= 0) { finish(cfg.onDown); return; }
        endRound();
      }

      function nextAttack() {
        const atk = cstate.pending.shift();
        log('<b>第 ' + cstate.round + ' 轮</b>　' + cfg.name + '的' + atk.label + '袭来！');
        respondToAttack(atk);
      }

      function endRound() {
        if (cfg.maxRounds && cstate.round >= cfg.maxRounds) {
          // 熊：三轮结束仍站立 → onSurvive
          finish(cfg.onSurvive);
          return;
        }
        if (cfg.fleeOption && cstate.round >= cfg.fleeAfter) {
          buttons([
            { t: '继续搏斗', cls: 'hot', fn: () => startRound() },
            { t: '尝试绕过他逃跑 <span class="btn-sub">困难「闪避」</span>', fn: tryFlee }
          ]);
          return;
        }
        startRound();
      }

      async function tryFlee() {
        const dodge = state.skills['闪避'] || Math.floor(state.attrs.DEX / 2);
        const r = await DiceUI.check({ statLabel: '「闪避」', title: '逃跑 · 困难「闪避」检定', value: dodge, diff: 'hard' });
        if (r.passed) { log('你抓住空隙，从他身边一掠而过！', 'good'); finish(cfg.onFlee); return; }
        log('他拦在了你的去路面前——', 'bad');
        cstate.pending = [{ skill: cfg.fight, dmg: cfg.dmg, label: '攻击' }];
        cstate.round++;
        document.getElementById('combat-round').textContent = '第 ' + cstate.round + ' 轮';
        nextAttack();
      }

      function startRound() {
        cstate.round++;
        cstate.armorPool = cfg.armor || 0;
        document.getElementById('combat-round').textContent = '第 ' + cstate.round + ' 轮';
        if (cfg.roundInit) cfg.roundInit(cstate, log, async (oddOrEven) => {
          if (cstate.over) return;
          if (oddOrEven === 'attack') {
            cstate.pending = [{ skill: cfg.fight, dmg: cfg.dmg, label: '攻击' }];
            nextAttack();
          } else {
            // 车夫闪避：玩家主动攻击
            log(cfg.name + '摆出了防御的架势。');
            playerAttack();
          }
        });
        else {
          cstate.pending = cfg.attacks(cstate.round).slice();
          nextAttack();
        }
      }

      async function playerAttack() {
        const r = await DiceUI.opposed({
          title: '你的攻击',
          a: { label: '你的攻击', value: state.skills['格斗(斗殴)'] || 25 },
          b: { label: cfg.name + '的闪避', value: cfg.dodge },
          aggressor: 'a'
        });
        if (r.winner === 0) {
          log('你的攻击突破了' + cfg.name + '的防守！', 'good');
          await damageEnemy(state, cfg, cstate);
          if (cfg.lowThreshold && cstate.enemyHp <= cfg.lowThreshold) { finish(cfg.onLow); return; }
          if (cstate.enemyHp <= 0) { finish(cfg.onDown); return; }
        } else {
          log(cfg.name + '躲开了你的攻击。', 'dim');
        }
        endRound();
      }

      startRound();
    });
  };

  /* ---------------- 敌人配置 ---------------- */
  Combat.CONFIG = {
    bear: {
      name: '黑熊',
      hp: 20, armor: 3, fight: 35, dodge: 0,
      intro: '黑熊立起身来，比你高出许多。它浓密厚实的皮毛会吸收你每轮造成伤害的前3点。它的利爪撕裂空气，向你扑来。',
      attacks: r => r === 2
        ? [{ skill: 35, dmg: '2D6', label: '利爪' }, { skill: 25, dmg: '1D8', label: '啃咬' }]
        : [{ skill: 35, dmg: '2D6', label: '利爪' }, { skill: 35, dmg: '2D6', label: '利爪' }],
      maxRounds: 3,
      onSurvive: 201, onDown: 201, onPlayerDown: 193, lowThreshold: 0
    },
    carter: {
      name: '车夫',
      hp: 9, fight: 30, dodge: 15, dmg: '1D6',
      intro: '上年纪的车夫攥着短棍，眼神里是以命相搏的决心。每轮掷 1D6：单数他攻击，双数他闪避你的攻击。',
      roundInit: (cstate, log, next) => {
        DiceUI.damage('1D6', { title: '车夫的行动', sub: '单数攻击 · 双数闪避', theme: 'bone', totalLabel: '掷出' }).then(r => {
          if (r.total % 2 === 1) next('attack');
          else next('defend');
        });
      },
      onLow: 241, lowThreshold: 4, onDown: 241, onPlayerDown: 247
    },
    craftsman: {
      name: '工匠',
      hp: 12, fight: 35, dodge: 0, dmg: '1D3+1D4',
      intro: '结实的工匠堵住了屋门，铁锤般的拳头从暗处砸来。他每轮攻击一次，每次命中造成 1D3+1D4 点伤害。',
      attacks: () => [{ skill: 35, dmg: '1D3+1D4', label: '重拳' }],
      fleeOption: true, fleeAfter: 3,
      onLow: 268, lowThreshold: 6, onDown: 268, onPlayerDown: 2, onFlee: 12
    }
  };

  /* ---------------- 溃逃被熊追上（条目167）：双爪各35%/3D6 ---------------- */
  Combat.bearMaul = function (state) {
    return new Promise(resolve => {
      const panel = document.createElement('div');
      panel.className = 'combat-panel';
      panel.innerHTML =
        '<div class="combat-head"><span class="combat-foe">黑熊的利爪</span></div>' +
        '<div id="combat-log" class="combat-log"></div>' +
        '<div id="combat-actions" class="combat-actions"></div>';
      document.getElementById('choices').innerHTML = '';
      document.getElementById('choices').appendChild(panel);
      log('熊在你身后几寸远的地方咆哮，双爪带着风声挥下——', 'dim');

      let major = false;
      const btn = document.createElement('button');
      btn.className = 'choice-btn combat-btn hot';
      btn.textContent = '承受攻击';
      btn.onclick = async () => {
        btn.remove();
        for (let i = 1; i <= 2; i++) {
          const hit = await DiceUI.check({ statLabel: '熊爪', title: '第 ' + i + ' 爪 · 命中检定', value: 35, theme: 'blood' });
          if (hit.passed) {
            const r = await DiceUI.damage('3D6', { title: '第 ' + i + ' 爪伤害' });
            state.hp = Math.max(0, state.hp - r.total);
            log('第 ' + i + ' 爪撕裂了你的皮肉，你受到 <b>' + r.total + '</b> 点伤害。', 'bad');
            if (r.total >= state.hpMax / 2) major = true;
          } else {
            log('第 ' + i + ' 爪从你身边擦过。', 'dim');
          }
        }
        if (state.hp <= 0) { resolve(193); return; }
        if (major) { resolve(179); return; }
        resolve(186);
      };
      document.getElementById('combat-actions').appendChild(btn);
    });
  };

  window.Combat = Combat;
})();
