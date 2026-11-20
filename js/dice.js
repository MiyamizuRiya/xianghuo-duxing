/* ============================================================
 * 掷骰动画 · 遮罩层与音效
 * 提供 DiceUI.check / damage / opposed / raw 等接口，均为 Promise
 * ============================================================ */
(function () {
  'use strict';

  const DiceUI = {};

  /* ---------------- 音效（WebAudio 合成，无外部文件） ---------------- */
  let actx = null;
  let muted = localStorage.getItem('aaf_mute') === '1';

  function ctx() {
    if (!actx) {
      try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { actx = null; }
    }
    if (actx && actx.state === 'suspended') actx.resume();
    return actx;
  }

  function clack(delay = 0, vol = 0.5, freq = 2200) {
    if (muted) return;
    const a = ctx(); if (!a) return;
    const t = a.currentTime + delay;
    const dur = 0.045;
    const buf = a.createBuffer(1, a.sampleRate * dur, a.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) {
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2.2);
    }
    const src = a.createBufferSource(); src.buffer = buf;
    const bp = a.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = freq; bp.Q.value = 1.2;
    const g = a.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(bp); bp.connect(g); g.connect(a.destination);
    src.start(t);
  }

  function thud(delay = 0) {
    if (muted) return;
    const a = ctx(); if (!a) return;
    const t = a.currentTime + delay;
    const osc = a.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(120, t);
    osc.frequency.exponentialRampToValueAtTime(48, t + 0.18);
    const g = a.createGain();
    g.gain.setValueAtTime(0.55, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    osc.connect(g); g.connect(a.destination);
    osc.start(t); osc.stop(t + 0.25);
    clack(delay, 0.3, 900);
  }

  function shimmer() {
    if (muted) return;
    const a = ctx(); if (!a) return;
    const t = a.currentTime;
    [880, 1174, 1568, 2093].forEach((f, i) => {
      const osc = a.createOscillator(); osc.type = 'sine'; osc.frequency.value = f;
      const g = a.createGain();
      g.gain.setValueAtTime(0.0001, t + i * 0.07);
      g.gain.exponentialRampToValueAtTime(0.12, t + i * 0.07 + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.07 + 0.5);
      osc.connect(g); g.connect(a.destination);
      osc.start(t + i * 0.07); osc.stop(t + i * 0.07 + 0.55);
    });
  }

  DiceUI.toggleMute = function () {
    muted = !muted;
    localStorage.setItem('aaf_mute', muted ? '1' : '0');
    return muted;
  };
  DiceUI.isMuted = () => muted;

  /* ---------------- 基础 DOM ---------------- */
  let overlay = null;

  function ensureOverlay() {
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.className = 'dice-overlay';
    overlay.innerHTML =
      '<div class="dice-box">' +
      '  <div class="dice-title"></div>' +
      '  <div class="dice-sub"></div>' +
      '  <div class="dice-stage"></div>' +
      '  <div class="dice-verdict"></div>' +
      '  <div class="dice-note"></div>' +
      '  <button class="dice-continue">继 续</button>' +
      '</div>';
    document.body.appendChild(overlay);
    return overlay;
  }

  const TENS = ['00', '10', '20', '30', '40', '50', '60', '70', '80', '90'];

  function makeDie(kind, theme) {
    const die = document.createElement('div');
    die.className = 'die die-' + (theme || 'bone') + (kind === 'd10' ? ' d10shape' : '');
    const face = document.createElement('div');
    face.className = 'die-face';
    die.appendChild(face);
    die._face = face;
    die._kind = kind;
    return die;
  }

  function faceText(die, v) {
    if (die._kind === 'tens') return TENS[v];
    return String(v);
  }

  function randOf(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  /* 掷一颗骰子的翻滚动画，返回 Promise(最终值) */
  function tumble(die, finalV, delayMs, durMs) {
    return new Promise(resolve => {
      setTimeout(() => {
        die.classList.add('tumbling');
        const pool = die._kind === 'tens' ? TENS.map((_, i) => i)
          : die._kind === 'd10' ? [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
          : Array.from({ length: die._sides }, (_, i) => i + 1);
        let ticks = 0;
        const iv = setInterval(() => {
          die._face.textContent = faceText(die, randOf(pool));
          die.style.setProperty('--rx', (Math.random() * 40 - 20) + 'deg');
          die.style.setProperty('--ry', (Math.random() * 50 - 25) + 'deg');
          die.style.setProperty('--tz', (Math.random() * 16) + 'px');
          if (ticks % 3 === 0) clack(0, 0.16 + Math.random() * 0.1, 1600 + Math.random() * 1400);
          ticks++;
        }, 62);
        setTimeout(() => {
          clearInterval(iv);
          die.classList.remove('tumbling');
          die.classList.add('settled');
          die._face.textContent = faceText(die, finalV);
          die.style.setProperty('--rx', '0deg');
          die.style.setProperty('--ry', '0deg');
          die.style.setProperty('--tz', '0px');
          clack(0, 0.4, 2100);
          resolve(finalV);
        }, durMs);
      }, delayMs);
    });
  }

  /* ---------------- 通用遮罩流程 ---------------- */
  function openBox(cfg) {
    ensureOverlay();
    overlay.querySelector('.dice-title').textContent = cfg.title || '';
    overlay.querySelector('.dice-sub').textContent = cfg.sub || '';
    const stage = overlay.querySelector('.dice-stage');
    stage.innerHTML = '';
    const verdict = overlay.querySelector('.dice-verdict');
    verdict.textContent = ''; verdict.className = 'dice-verdict';
    const note = overlay.querySelector('.dice-note');
    note.textContent = ''; note.className = 'dice-note';
    const btn = overlay.querySelector('.dice-continue');
    btn.style.display = 'none';
    overlay.classList.add('show');
    return { stage, verdict, note, btn };
  }

  function waitForButton(btn) {
    return new Promise(res => {
      btn.style.display = '';
      btn.onclick = () => { overlay.classList.remove('show'); res(); };
    });
  }

  const rnd = n => 1 + Math.floor(Math.random() * n);

  /* ---------------- 检定：1D100（含奖励/惩罚骰） ---------------- */
  const DIFF_NAME = { normal: '常规', hard: '困难', extreme: '极难' };
  const LEVEL_NAME = { crit: '大成功', extreme: '极难成功', hard: '困难成功', success: '成功', fail: '失败', fumble: '大失败' };
  const LEVEL_CLASS = { crit: 'v-crit', extreme: 'v-extreme', hard: 'v-hard', success: 'v-success', fail: 'v-fail', fumble: 'v-fumble' };

  function levelOrder(l) { return { crit: 5, extreme: 4, hard: 3, success: 2, fail: 1, fumble: 0 }[l]; }

  DiceUI.LEVEL_NAME = LEVEL_NAME;

  DiceUI.evalLevel = function (value, diff, roll) {
    if (roll === 1) return 'crit';
    const fumeAt = value >= 50 ? 96 : 100;
    if (roll >= fumeAt) return 'fumble';
    const v = Math.floor(value);
    if (roll <= Math.floor(v / 5)) return 'extreme';
    if (roll <= Math.floor(v / 2)) return 'hard';
    if (roll <= v) return 'success';
    return 'fail';
  };

  DiceUI.check = function (cfg) {
    // cfg: {statLabel, value, diff, bonus(-1惩罚/0/1奖励), title, extraNote, theme, fumbleAt96}
    return new Promise(resolve => {
      const { stage, verdict, btn } = openBox({
        title: cfg.title || (cfg.statLabel + '检定'),
        sub: '目标 ' + cfg.value + (cfg.diff && cfg.diff !== 'normal' ? ' · ' + DIFF_NAME[cfg.diff] + '难度' : '') +
          (cfg.bonus === 1 ? ' · 奖励骰' : cfg.bonus === -1 ? ' · 惩罚骰' : '')
      });
      const tensCount = (cfg.bonus === 1 || cfg.bonus === -1) ? 2 : 1;
      const tensDies = [];
      const unitsDie = makeDie('units', cfg.theme || 'bone');
      for (let i = 0; i < tensCount; i++) {
        const d = makeDie('tens', i === 1 ? 'amber' : (cfg.theme || 'bone'));
        stage.appendChild(d); tensDies.push(d);
      }
      stage.appendChild(unitsDie);

      const tensVals = tensDies.map(() => Math.floor(Math.random() * 10));
      const unitsVal = Math.floor(Math.random() * 10);

      const anims = tensDies.map((d, i) => tumble(d, tensVals[i], i * 140, 1150 + i * 160));
      anims.push(tumble(unitsDie, unitsVal, tensCount * 140, 1250 + tensCount * 120));
      Promise.all(anims).then(() => {
        let keptIdx = 0;
        if (tensCount === 2) {
          keptIdx = cfg.bonus === 1
            ? (tensVals[0] <= tensVals[1] ? 0 : 1)
            : (tensVals[0] >= tensVals[1] ? 0 : 1);
          tensDies.forEach((d, i) => { if (i !== keptIdx) d.classList.add('dimmed'); });
        }
        const tens = tensVals[keptIdx];
        const roll = (tens === 0 && unitsVal === 0) ? 100 : tens * 10 + unitsVal;
        let level = DiceUI.evalLevel(cfg.value, cfg.diff, roll);
        if (cfg.fumbleAt96 && roll >= 96) level = 'fumble';

        // 判定是否达到难度要求
        const target = cfg.diff === 'hard' ? Math.floor(cfg.value / 2)
          : cfg.diff === 'extreme' ? Math.floor(cfg.value / 5) : cfg.value;
        const passed = level === 'crit' ? true : (level !== 'fumble' && roll <= target);

        setTimeout(() => {
          verdict.textContent = roll + '　' + LEVEL_NAME[level] + (passed || level === 'fumble' ? '' : '（未达' + DIFF_NAME[cfg.diff] + '难度）');
          verdict.className = 'dice-verdict ' + (LEVEL_CLASS[level]) + (passed ? '' : ' noPass');
          if (level === 'crit' || level === 'extreme') shimmer();
          if (level === 'fumble' || (cfg.theme === 'blood' && !passed)) thud();
          waitForButton(btn).then(() => resolve({ roll, level, passed }));
        }, 380);
      });
    });
  };

  /* ---------------- 对抗检定 ---------------- */
  DiceUI.opposed = function (cfg) {
    // cfg: {title, a:{label, value}, b:{label, value}, aDiff, bDiff, themeA, themeB}
    return new Promise(resolve => {
      const { stage, verdict, btn } = openBox({ title: cfg.title || '对抗检定', sub: cfg.sub || '' });
      const rows = [];
      [cfg.a, cfg.b].forEach((side, idx) => {
        const row = document.createElement('div');
        row.className = 'opposed-row';
        const tag = document.createElement('div');
        tag.className = 'opposed-tag' + (idx === 1 ? ' foe' : '');
        tag.textContent = side.label + '　' + side.value;
        const diceRow = document.createElement('div');
        diceRow.className = 'opposed-dice';
        const t = makeDie('tens', idx === 1 ? 'foe' : 'bone');
        const u = makeDie('units', idx === 1 ? 'foe' : 'bone');
        diceRow.appendChild(t); diceRow.appendChild(u);
        row.appendChild(tag); row.appendChild(diceRow);
        stage.appendChild(row);
        rows.push({ t, u, side });
      });

      const rolls = rows.map(() => ({ tens: Math.floor(Math.random() * 10), units: Math.floor(Math.random() * 10) }));
      const anims = [];
      rows.forEach((r, i) => {
        anims.push(tumble(r.t, rolls[i].tens, i * 150, 1100 + i * 120));
        anims.push(tumble(r.u, rolls[i].units, i * 150 + 100, 1200 + i * 120));
      });
      Promise.all(anims).then(() => {
        const res = rolls.map(r => (r.tens === 0 && r.units === 0) ? 100 : r.tens * 10 + r.units);
        const levels = res.map((roll, i) => DiceUI.evalLevel(rows[i].side.value, 'normal', roll));
        let winner;
        if (levelOrder(levels[0]) > levelOrder(levels[1])) winner = 0;
        else if (levelOrder(levels[0]) < levelOrder(levels[1])) winner = 1;
        else if (cfg.a.value > cfg.b.value) winner = 0;
        else if (cfg.a.value < cfg.b.value) winner = 1;
        else winner = cfg.aggressor === 'b' ? 1 : 0;
        setTimeout(() => {
          verdict.innerHTML =
            '<span class="vr">' + cfg.a.label + ' ' + res[0] + ' ' + LEVEL_NAME[levels[0]] + '</span>' +
            '<span class="vs">对</span>' +
            '<span class="vr">' + cfg.b.label + ' ' + res[1] + ' ' + LEVEL_NAME[levels[1]] + '</span>' +
            '<div class="vwin ' + (winner === 0 ? 'w-you' : 'w-foe') + '">' + (winner === 0 ? cfg.a.label : cfg.b.label) + '占得上风</div>';
          if (winner === 0) shimmer(); else thud();
          waitForButton(btn).then(() => resolve({ rolls: res, levels, winner }));
        }, 380);
      });
    });
  };

  /* ---------------- 伤害 / 数值骰 ---------------- */
  function parseDice(spec) {
    // "2D6" / "1D3+1D4" / "1D4+1" / "3D6" ... 返回 [{n,sides}...] 与加值
    const parts = String(spec).split('+');
    const dice = []; let flat = 0;
    parts.forEach(p => {
      const m = p.trim().match(/^(\d*)[dD](\d+)$/);
      if (m) dice.push({ n: parseInt(m[1] || '1', 10), sides: parseInt(m[2], 10) });
      else flat += parseInt(p.trim(), 10) || 0;
    });
    return { dice, flat };
  }
  DiceUI.parseDice = parseDice;

  DiceUI.damage = function (spec, opts) {
    // 返回 {total, rolls:[各骰]}；opts: {title, sub, theme, minOne}
    opts = opts || {};
    return new Promise(resolve => {
      const { dice, flat } = parseDice(spec);
      const count = dice.reduce((s, d) => s + d.n, 0);
      if (count === 0 && flat !== 0) { resolve({ total: flat, rolls: [] }); return; }
      const { stage, verdict, btn } = openBox({ title: opts.title || '掷骰', sub: opts.sub || spec });
      const dies = [];
      dice.forEach(d => {
        for (let i = 0; i < d.n; i++) {
          const die = makeDie('d' + d.sides, opts.theme || 'blood');
          die._sides = d.sides;
          stage.appendChild(die); dies.push({ die, sides: d.sides });
        }
      });
      if (dies.length > 6) stage.classList.add('crowded'); else stage.classList.remove('crowded');
      const vals = dies.map(x => rnd(x.sides));
      Promise.all(dies.map((x, i) => tumble(x.die, vals[i], (i % 4) * 130, 1050 + i * 90))).then(() => {
        let total = vals.reduce((a, b) => a + b, 0) + flat;
        if (opts.minOne && total < 1) total = 1;
        setTimeout(() => {
          verdict.textContent = (opts.totalLabel || '合计') + ' ' + total + (flat ? '（含加值 ' + flat + '）' : '');
          verdict.className = 'dice-verdict ' + (opts.theme === 'bone' ? 'v-success' : 'v-hurt');
          thud();
          waitForButton(btn).then(() => resolve({ total, rolls: vals }));
        }, 300);
      });
    });
  };

  /* ---------------- 幸运等自定骰组 ---------------- */
  DiceUI.custom = function (cfg) {
    // cfg: {title, sub, dice:[{sides,label?}], theme, totalLabel, multiply}
    return new Promise(resolve => {
      const { stage, verdict, btn } = openBox({ title: cfg.title, sub: cfg.sub || '' });
      const dies = cfg.dice.map(dc => {
        const die = makeDie('d' + dc.sides, cfg.theme || 'gold');
        die._sides = dc.sides;
        stage.appendChild(die);
        return die;
      });
      const results = dies.map((die, i) => rnd(cfg.dice[i].sides));
      Promise.all(dies.map((die, i) => tumble(die, results[i], i * 120, 1100 + i * 100))).then(() => {
        const total = results.reduce((a, b) => a + b, 0);
        setTimeout(() => {
          verdict.textContent = (cfg.totalLabel || '合计') + ' ' + (cfg.multiply ? total + ' × ' + cfg.multiply + ' = ' + total * cfg.multiply : total);
          verdict.className = 'dice-verdict v-luck';
          shimmer();
          waitForButton(btn).then(() => resolve({ rolls: results, total: total * (cfg.multiply || 1) }));
        }, 300);
      });
    });
  };

  window.DiceUI = DiceUI;
})();
