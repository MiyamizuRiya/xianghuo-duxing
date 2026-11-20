/* ============================================================
 * 《向火独行》网页版 · 主引擎
 * 状态管理 / 条目渲染 / 检定流程 / 角色创建 / 结局
 * ============================================================ */
(function () {
  'use strict';

  /* ==================== 常量 ==================== */
  const ATTR_LIST = [
    { k: 'STR', n: '力量' }, { k: 'CON', n: '体质' }, { k: 'SIZ', n: '体型' }, { k: 'DEX', n: '敏捷' },
    { k: 'APP', n: '外貌' }, { k: 'INT', n: '智力' }, { k: 'POW', n: '意志' }, { k: 'EDU', n: '教育' }
  ];
  const ATTR_CN = { '力量': 'STR', '体质': 'CON', '体型': 'SIZ', '敏捷': 'DEX', '外貌': 'APP', '智力': 'INT', '意志': 'POW', '教育': 'EDU' };

  const SKILL_BASE = {
    '侦查': 25, '聆听': 20, '图书馆使用': 20, '博物学': 10, '急救': 30, '格斗(斗殴)': 25,
    '潜行': 20, '攀爬': 20, '汽车驾驶': 20, '骑术': 5, '追踪': 10, '乔装': 5, '锁匠': 1,
    '恐吓': 15, '取悦': 15, '说服': 10, '话术': 5, '心理学': 10, '考古学': 1, '历史': 5,
    '估价': 5, '法律': 5, '医学': 1,
    '科学(植物学)': 1, '科学(生物学)': 1, '科学(药学)': 1,
    '艺术/手艺(摄影)': 5, '艺术/手艺(绘画)': 5, '艺术/手艺(修复)': 5,
    '外语(拉丁文)': 1, '外语(法语)': 1, '外语(德语)': 1
  };

  const SOCIAL4 = ['取悦', '话术', '恐吓', '说服'];

  const PROF = {
    antiquarian: {
      name: '文物学家', credit: 20,
      fixed: ['估价', '历史', '图书馆使用', '侦查'],
      choose: [
        { label: '艺术/手艺（专业领域）', options: ['艺术/手艺(摄影)', '艺术/手艺(绘画)', '艺术/手艺(修复)'] },
        { label: '外语（选择一种）', options: ['外语(拉丁文)', '外语(法语)', '外语(德语)'] },
        { label: '交涉技能（四选一）', options: SOCIAL4 }
      ],
      extra: 1, extraLabel: '个人专长（再选一项）'
    },
    doctor: {
      name: '医生', credit: 30,
      fixed: ['急救', '外语(拉丁文)', '医学', '心理学', '科学(生物学)', '科学(药学)'],
      choose: [], extra: 2, extraLabel: '学术/个人专长（再选两项）'
    },
    journalist: {
      name: '记者', credit: 20,
      fixed: ['艺术/手艺(摄影)', '历史', '图书馆使用', '母语', '心理学'],
      choose: [{ label: '交涉技能（四选一）', options: SOCIAL4 }],
      extra: 2, extraLabel: '个人专长（再选两项）'
    },
    detective: {
      name: '私家侦探', credit: 20,
      fixed: ['艺术/手艺(摄影)', '乔装', '法律', '图书馆使用', '心理学', '侦查'],
      choose: [{ label: '交涉技能（四选一）', options: SOCIAL4 }],
      extra: 1, extraLabel: '个人专长（再选一项）'
    },
    professor: {
      name: '教授', credit: 30,
      fixed: ['图书馆使用', '母语', '心理学'],
      choose: [{ label: '外语（选择一种）', options: ['外语(拉丁文)', '外语(法语)', '外语(德语)'] }],
      extra: 4, extraLabel: '学术/个人专长（再选四项）'
    }
  };

  const SECRET_TOAST = {
    ladder: '发现秘密 · 悬崖上的隐蔽阶梯',
    spellA: '发现秘密 · 阿博加斯特的咒语',
    spellSummon: '发现秘密 · 仪式「召唤天之火」',
    spellCommand: '发现秘密 · 仪式「号令天之火」',
    appointment: '发现秘密 · 今晚九点，另一边的坟地'
  };

  const IMG = {
    map: { src: 'assets/img/map.png', cap: '烬头村与周边' },
    road: { src: 'assets/img/road.jpg', cap: '' },
    dusk: { src: 'assets/img/dusk.jpg', cap: '' },
    valley: { src: 'assets/img/valley.jpg', cap: '' },
    man: { src: 'assets/img/man.jpg', cap: '' },
    night: { src: 'assets/img/night.jpg', cap: '' },
    beacon: { src: 'assets/img/beacon.jpg', cap: '' },
    bear: { src: 'assets/img/bear.jpg', cap: '' },
    starchart: { src: 'assets/img/starchart.png', cap: '星图 · 北落师门' },
    field: { src: 'assets/img/field.jpg', cap: '' },
    panorama: { src: 'assets/img/panorama.jpg', cap: '' }
  };

  const SAVE_KEY = 'aaf_save_v1';
  const CKPT_KEY = 'aaf_ckpt_v1';

  /* ==================== 状态 ==================== */
  let state = null;

  function newState() {
    return {
      entry: 1, name: '', age: 28, profession: '',
      attrs: null,
      hp: 0, hpMax: 0, san: 0, sanStart: 0, luck: 0, mp: 0, mpMax: 0,
      dbSpec: '', skills: {}, ticks: {}, flags: {}, items: [],
      tried: {}, usedKeys: {}, sanLost: false, mythos: 0,
      lastSpend: 0,
      log: []
    };
  }

  function save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch (e) { } }
  function loadSave() {
    try {
      const s = localStorage.getItem(SAVE_KEY);
      if (!s) return null;
      const st = JSON.parse(s);
      if (st && st.attrs && st.entry) return st;
      return null;
    } catch (e) { return null; }
  }
  function saveCheckpoint() {
    try { localStorage.setItem(CKPT_KEY, JSON.stringify({ state: JSON.parse(JSON.stringify(state)) })); } catch (e) { }
  }
  function loadCheckpoint() {
    try {
      const s = localStorage.getItem(CKPT_KEY);
      return s ? JSON.parse(s) : null;
    } catch (e) { return null; }
  }

  function statValue(name) {
    if (ATTR_CN[name]) return state.attrs ? state.attrs[ATTR_CN[name]] : 0;
    if (name === '幸运') return state.luck;
    if (name === '理智') return state.san;
    if (name in state.skills) return state.skills[name];
    if (name in SKILL_BASE) return SKILL_BASE[name];
    return 0;
  }

  function calcDb() {
    const s = state.attrs.STR + state.attrs.SIZ;
    if (s < 65) return '-2';
    if (s < 85) return '-1';
    if (s < 125) return '';
    if (s < 165) return '+1D4';
    return '+1D6';
  }

  /* ==================== 小工具 ==================== */
  const $ = sel => document.querySelector(sel);
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  /* 文本排版：技能「」高亮 */
  function fmt(text) {
    let s = esc(text);
    s = s.replace(/「([^」]+)」/g, '<span class="sk">「$1」</span>');
    s = s.replace(/【剧终】/g, '<span class="fin">【剧终】</span>');
    return s;
  }

  function toast(msg, cls) {
    const box = $('#toasts');
    if (!box) return;
    const t = document.createElement('div');
    t.className = 'toast ' + (cls || '');
    t.innerHTML = msg;
    box.appendChild(t);
    setTimeout(() => t.classList.add('on'), 30);
    setTimeout(() => { t.classList.remove('on'); setTimeout(() => t.remove(), 600); }, 3400);
  }

  function updateVitals() {
    if (!state || !state.attrs) return;
    const set = (id, cur, max) => {
      const el = $(id);
      if (!el) return;
      const num = el.querySelector('.chip-num');
      if (num) num.textContent = Math.max(0, cur);
      const bar = el.querySelector('.chip-bar i');
      if (bar) bar.style.width = Math.max(0, Math.min(100, cur / max * 100)) + '%';
    };
    set('#chip-hp', state.hp, state.hpMax);
    set('#chip-san', state.san, Math.max(1, state.sanStart));
    const luckEl = $('#chip-luck .chip-num');
    if (luckEl) luckEl.textContent = state.luck;
    const mpEl = $('#chip-mp .chip-num');
    if (mpEl) mpEl.textContent = state.mp;
    const hpChip = $('#chip-hp');
    if (hpChip) hpChip.classList.toggle('low', state.hp <= Math.ceil(state.hpMax / 2));
    const sanChip = $('#chip-san');
    if (sanChip) sanChip.classList.toggle('low', state.san <= Math.ceil(state.sanStart / 2));
  }

  /* ==================== 屏幕切换 ==================== */
  function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    $(id).classList.add('active');
    window.scrollTo(0, 0);
  }

  /* ==================== 回退与历程 ==================== */
  let backStack = []; // 回退快照栈（仅存于本次会话，不写入存档）

  function addToLog(id) {
    if (!Array.isArray(state.log)) state.log = [];
    if (state.log[state.log.length - 1] === id) return;
    state.log.push(id);
    if (state.log.length > 400) state.log = state.log.slice(-400);
  }

  function canBack() {
    if (!state) return false;
    return backStack.some(it => it.id !== state.entry);
  }

  function updateBackBtn() {
    const btn = $('#btn-back');
    if (!btn) return;
    const can = canBack();
    btn.disabled = !can;
    btn.classList.toggle('off', !can);
  }

  function goBack() {
    if (!state || !canBack()) return;
    // 骰子结算进行中不允许回退，避免状态错乱
    if (document.querySelector('.dice-overlay.show')) return;
    const cur = state.entry;
    while (backStack.length && backStack[backStack.length - 1].id === cur) backStack.pop();
    if (!backStack.length) { updateBackBtn(); return; }
    const target = backStack.pop();
    state = target.snap;
    if (!Array.isArray(state.log)) state.log = [];
    save();
    toast('已回到条目 · ' + target.id + ' ·，掷骰与结算已回退');
    goTo(target.id, { noSnap: true });
  }

  function openHistory() {
    const d = $('#history');
    d.classList.add('open');
    const body = d.querySelector('.history-body');
    const log = (state && Array.isArray(state.log)) ? state.log.slice() : [];
    if (!log.length) { body.innerHTML = '<div class="sheet-empty">还没有翻开任何一页。</div>'; return; }
    body.innerHTML = '';
    log.reverse().forEach(id => {
      const e = window.ENTRIES[id];
      if (!e || !e.t || !e.t.length) return;
      const item = document.createElement('div');
      item.className = 'hist-item' + (id === state.entry ? ' cur' : '');
      const preview = (e.t[0] || '').replace(/\s/g, '').slice(0, 36);
      let textHtml = '';
      e.t.forEach(p => { textHtml += '<p>' + fmt(p) + '</p>'; });
      item.innerHTML =
        '<div class="hist-head"><span class="hist-no">' + (isNaN(id) ? '✦ 终幕' : '· ' + id + ' ·') +
        '</span><span class="hist-preview">' + esc(preview) + '…</span><i>▾</i></div>' +
        '<div class="hist-text">' + textHtml + '</div>';
      item.querySelector('.hist-head').onclick = () => item.classList.toggle('open');
      body.appendChild(item);
    });
  }

  /* ==================== 角色码（导出/导入） ==================== */
  const CODE_VERSION = 1;
  const PROF_KEYS = ['antiquarian', 'doctor', 'journalist', 'detective', 'professor'];
  const DB_ENUM = ['', '-2', '-1', '+1D4', '+1D6'];
  const SKILL_ORDER = Object.keys(SKILL_BASE).concat(['母语', '闪避', '信用评级', '克苏鲁神话']).sort();
  const FLAG_ORDER = ['ladder', 'spellA', 'spellSummon', 'spellCommand', 'appointment', 'nightWalk', 'nightFight', 'penalty', 'libShelves', 'map', 'suitcases', 'truth', 'lastFumble', 'sanLost'];
  const ITEM_ORDER = ['knife', 'book'];
  const TRIED_ORDER = ['o16', 'o84', 'o115', 'o57', 'o34', 'o96', 'o83', 'o126', 'o219', 'o29', 'o7'];
  const USED_ORDER = ['botany'];

  function wv(b, n) {
    n = Math.max(0, Math.floor(n) || 0);
    do { let x = n & 0x7f; n = Math.floor(n / 128); if (n) x |= 0x80; b.push(x); } while (n);
  }
  function rv(b, p) {
    let n = 0, s = 0, x;
    do {
      if (p >= b.length) return null;
      x = b[p++];
      n |= (x & 0x7f) << s;
      s += 7;
      if (s > 35) return null;
    } while (x & 0x80);
    return { v: n, p };
  }
  function packBits(arr) {
    const out = [];
    for (let i = 0; i < arr.length; i += 8) {
      let x = 0;
      for (let j = 0; j < 8 && i + j < arr.length; j++) if (arr[i + j]) x |= (1 << j);
      out.push(x);
    }
    return out;
  }
  function readBits(b, p, n) {
    const out = [];
    for (let i = 0; i < n; i++) {
      const byte = b[p + (i >> 3)];
      if (byte === undefined) return null;
      out.push(!!(byte & (1 << (i & 7))));
    }
    return { bits: out, p: p + Math.ceil(n / 8) };
  }

  function writeCode(st) {
    if (!st || !st.attrs) return null;
    const b = [0xA7, 0x5C, CODE_VERSION];
    const nm = new TextEncoder().encode(st.name || '');
    wv(b, nm.length); nm.forEach(x => b.push(x));
    b.push(Math.max(0, Math.min(255, st.age || 0)));
    const pi = PROF_KEYS.indexOf(st.profession);
    b.push(pi < 0 ? 255 : pi);
    ATTR_LIST.forEach(a => b.push(Math.max(0, Math.min(255, st.attrs[a.k] || 0))));
    wv(b, st.hp); wv(b, st.hpMax); wv(b, st.san); wv(b, st.sanStart); wv(b, st.mp); wv(b, st.mpMax); wv(b, st.luck);
    const dbi = DB_ENUM.indexOf(st.dbSpec || '');
    b.push(dbi < 0 ? 0 : dbi);
    wv(b, st.mythos || 0); wv(b, st.lastSpend || 0);
    SKILL_ORDER.forEach(sk => b.push(Math.max(0, Math.min(255, st.skills[sk] || 0))));
    packBits(SKILL_ORDER.map(sk => !!st.ticks[sk])).forEach(x => b.push(x));
    packBits(FLAG_ORDER.map(f => f === 'sanLost' ? !!st.sanLost : !!st.flags[f])).forEach(x => b.push(x));
    packBits(ITEM_ORDER.map(i => (st.items || []).includes(i))).forEach(x => b.push(x));
    packBits(TRIED_ORDER.map(t => !!(st.tried || {})[t])).forEach(x => b.push(x));
    packBits(USED_ORDER.map(u => !!(st.usedKeys || {})[u])).forEach(x => b.push(x));
    packBits(SKILL_ORDER.map(sk => (st.profSkills || []).includes(sk))).forEach(x => b.push(x));
    wv(b, st.entry || 1);
    return btoa(String.fromCharCode.apply(null, b));
  }

  function readCode(code) {
    let raw;
    try { raw = atob(String(code).trim()); } catch (e) { return null; }
    const b = [];
    for (let i = 0; i < raw.length; i++) b.push(raw.charCodeAt(i));
    if (b.length < 4 || b[0] !== 0xA7 || b[1] !== 0x5C) return null;
    if (b[2] !== CODE_VERSION) return null;
    let p = 3;
    const st = newState();
    try {
      let r = rv(b, p); if (!r) return null; p = r.p;
      const nl = r.v;
      if (nl > 120 || p + nl > b.length) return null;
      st.name = new TextDecoder().decode(Uint8Array.from(b.slice(p, p + nl)));
      p += nl;
      st.age = b[p++];
      const pi = b[p++];
      st.profession = (pi >= 0 && pi < PROF_KEYS.length) ? PROF_KEYS[pi] : '';
      st.attrs = {};
      ATTR_LIST.forEach(a => { st.attrs[a.k] = b[p++] || 0; });
      r = rv(b, p); if (!r) return null; st.hp = r.v; p = r.p;
      r = rv(b, p); if (!r) return null; st.hpMax = r.v; p = r.p;
      r = rv(b, p); if (!r) return null; st.san = r.v; p = r.p;
      r = rv(b, p); if (!r) return null; st.sanStart = r.v; p = r.p;
      r = rv(b, p); if (!r) return null; st.mp = r.v; p = r.p;
      r = rv(b, p); if (!r) return null; st.mpMax = r.v; p = r.p;
      r = rv(b, p); if (!r) return null; st.luck = r.v; p = r.p;
      const dbi = b[p++];
      st.dbSpec = DB_ENUM[dbi] || '';
      r = rv(b, p); if (!r) return null; st.mythos = r.v; p = r.p;
      r = rv(b, p); if (!r) return null; st.lastSpend = r.v; p = r.p;
      st.skills = {};
      SKILL_ORDER.forEach(sk => { const v = b[p++]; if (v > 0) st.skills[sk] = v; });
      Object.keys(SKILL_BASE).forEach(k => { if (!(k in st.skills)) st.skills[k] = SKILL_BASE[k]; });
      if (!('闪避' in st.skills)) st.skills['闪避'] = Math.floor(st.attrs.DEX / 2);
      if (!('母语' in st.skills)) st.skills['母语'] = st.attrs.EDU;
      if (!('信用评级' in st.skills)) st.skills['信用评级'] = st.profession ? (PROF[st.profession] || {}).credit : 0;
      if (!('克苏鲁神话' in st.skills)) st.skills['克苏鲁神话'] = st.mythos;
      let rb = readBits(b, p, SKILL_ORDER.length); if (!rb) return null; p = rb.p;
      st.ticks = {};
      SKILL_ORDER.forEach((sk, i) => { if (rb.bits[i]) st.ticks[sk] = true; });
      rb = readBits(b, p, FLAG_ORDER.length); if (!rb) return null; p = rb.p;
      st.flags = {};
      FLAG_ORDER.forEach((f, i) => { if (rb.bits[i]) st.flags[f] = true; });
      st.sanLost = !!st.flags.sanLost;
      rb = readBits(b, p, ITEM_ORDER.length); if (!rb) return null; p = rb.p;
      st.items = [];
      ITEM_ORDER.forEach((it, i) => { if (rb.bits[i]) st.items.push(it); });
      rb = readBits(b, p, TRIED_ORDER.length); if (!rb) return null; p = rb.p;
      st.tried = {};
      TRIED_ORDER.forEach((t, i) => { if (rb.bits[i]) st.tried[t] = true; });
      rb = readBits(b, p, USED_ORDER.length); if (!rb) return null; p = rb.p;
      st.usedKeys = {};
      USED_ORDER.forEach((u, i) => { if (rb.bits[i]) st.usedKeys[u] = true; });
      rb = readBits(b, p, SKILL_ORDER.length); if (!rb) return null; p = rb.p;
      st.profSkills = [];
      SKILL_ORDER.forEach((sk, i) => { if (rb.bits[i]) st.profSkills.push(sk); });
      r = rv(b, p); if (!r) return null;
      st.entry = r.v || 1;
    } catch (e) { return null; }
    if (!st.attrs.STR) return null;
    st.log = [st.entry];
    return st;
  }

  function copyText(t) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(t).then(() => true).catch(() => legacyCopy(t));
    }
    return Promise.resolve(legacyCopy(t));
  }
  function legacyCopy(t) {
    const ta = document.createElement('textarea');
    ta.value = t;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { }
    ta.remove();
    return ok;
  }

  function openExportModal() {
    if (!state || !state.attrs) { toast('调查员尚未创建，无法导出', 'mythos'); return; }
    const code = writeCode(state);
    if (!code) { toast('导出失败', 'mythos'); return; }
    const modal = $('#modal');
    modal.querySelector('.modal-title').textContent = '导 出 角 色';
    const body = modal.querySelector('.modal-body');
    body.innerHTML = '<textarea id="code-out" readonly spellcheck="false"></textarea>' +
      '<div class="modal-note">这串字符包含角色的属性、技能、状态与进度秘密。保存或分享它，任何浏览器都能以此快速继续。点击文本框可全选。</div>';
    const ta = body.querySelector('#code-out');
    ta.value = code;
    ta.onclick = () => ta.select();
    const acts = modal.querySelector('.modal-actions');
    acts.innerHTML = '';
    acts.appendChild(mkBtn('复 制 角 色 码', async () => {
      const ok = await copyText(code);
      toast(ok ? '角色码已复制到剪贴板' : '复制失败，请手动全选复制', ok ? '' : 'mythos');
    }, 'hot'));
    acts.appendChild(mkBtn('关 闭', () => modal.classList.remove('show'), 'dim'));
    modal.classList.add('show');
    setTimeout(() => { try { ta.select(); } catch (e) { } }, 60);
  }

  function openImportModal() {
    const modal = $('#modal');
    modal.querySelector('.modal-title').textContent = '导 入 角 色';
    const body = modal.querySelector('.modal-body');
    body.innerHTML = '<textarea id="code-in" spellcheck="false" placeholder="在此粘贴角色码……"></textarea>' +
      '<div class="modal-note">导入后将直接进入该角色所在的剧情位置，并覆盖当前进度。</div>';
    const acts = modal.querySelector('.modal-actions');
    acts.innerHTML = '';
    acts.appendChild(mkBtn('导 入', () => {
      const code = body.querySelector('#code-in').value.trim();
      if (!code) { toast('请先粘贴角色码', 'mythos'); return; }
      const st = readCode(code);
      if (!st) { toast('角色码无效或版本不兼容', 'mythos'); return; }
      state = st;
      backStack.length = 0;
      localStorage.removeItem(CKPT_KEY);
      save();
      updateVitals();
      modal.classList.remove('show');
      toast('导入成功 · ' + (st.name || '调查员') + ' · 位于条目 ' + st.entry);
      goTo(st.entry, { noSnap: true });
    }, 'hot'));
    acts.appendChild(mkBtn('取 消', () => modal.classList.remove('show'), 'dim'));
    modal.classList.add('show');
    setTimeout(() => { try { body.querySelector('#code-in').focus(); } catch (e) { } }, 60);
  }

  /* ==================== 条目渲染 ==================== */
  async function goTo(id, opts) {
    const e = window.ENTRIES[id];
    if (!e) { console.error('缺少条目', id); return; }

    // 枢纽重定向（在快照之前判定，避免中转条目产生无效快照）
    if (id === 25) {
      const tried6 = ['o16', 'o84', 'o115', 'o57', 'o34', 'o96'].filter(k => state.tried[k]).length;
      if (tried6 >= 4) { goTo(3); return; }
    }
    if (id === 120) {
      const tried5 = ['o83', 'o126', 'o219', 'o29', 'o7'].filter(k => state.tried[k]).length;
      if (tried5 >= 3) { goTo(98); return; }
    }

    // 回退快照：记录抵达本条目之前的状态（供「上一页」恢复）
    if (!opts || !opts.noSnap) {
      backStack.push({ id: id, snap: JSON.parse(JSON.stringify(state)) });
      if (backStack.length > 80) backStack.shift();
    }
    addToLog(id);
    updateBackBtn();

    state.entry = id;
    if (id === 166 || id === 64) saveCheckpoint();
    save();

    showScreen('#screen-game');
    const card = $('#entry-card');
    card.classList.remove('enter');
    void card.offsetWidth;

    // 标题
    const noEl = $('#entry-no');
    noEl.textContent = '· ' + (isNaN(id) ? '' : id) + ' ·';
    noEl.style.display = isNaN(id) ? 'none' : '';

    // 图片
    const imgBox = $('#entry-img');
    if (e.img && IMG[e.img]) {
      imgBox.innerHTML = '<img src="' + IMG[e.img].src + '" alt="">' + (IMG[e.img].cap ? '<div class="img-cap">' + IMG[e.img].cap + '</div>' : '');
      imgBox.style.display = '';
    } else imgBox.style.display = 'none';

    // 正文
    const textBox = $('#entry-text');
    textBox.innerHTML = '';
    (e.t || []).forEach((p, i) => {
      const el = document.createElement('p');
      el.innerHTML = fmt(p);
      el.style.animationDelay = (i * 0.14) + 's';
      textBox.appendChild(el);
    });

    $('#fx-area').innerHTML = '';
    $('#choices').innerHTML = '';
    card.classList.add('enter');

    // 结局
    if (e.ending) { await sleep(500); renderEnding(e); return; }

    // 效果队列
    const alive = await applyFxQueue(e.fx || []);
    if (!alive) return;

    // 特殊处理
    if (e.special && SPECIAL[e.special]) { SPECIAL[e.special](state, e); return; }

    // 检定
    if (e.check) { handleCheck(state, e.check); return; }

    renderChoices(e);
  }

  /* ==================== 效果队列 ==================== */
  async function applyFxQueue(fxList) {
    for (const fx of fxList) {
      const alive = await applyFx(fx);
      if (!alive) return false;
    }
    return true;
  }

  async function applyFx(fx) {
    // 标记 / 物品 / 秘密
    if (fx.flag) {
      state.flags[fx.flag] = true;
      if (SECRET_TOAST[fx.flag]) toast(SECRET_TOAST[fx.flag], 'secret');
      save();
      return true;
    }
    if (fx.tick) {
      if (!state.ticks[fx.tick]) { state.ticks[fx.tick] = true; toast('「' + fx.tick + '」获得成长标记 ✓'); }
      save();
      return true;
    }
    if (fx.item) {
      if (!state.items.includes(fx.item)) {
        state.items.push(fx.item);
        toast(fx.item === 'knife' ? '获得 · 狩猎小刀' : '获得 · 《阿撒托斯及其他》诗集');
      }
      save();
      return true;
    }
    if (fx.skill) {
      const [name, delta] = fx.skill;
      if (!(name in state.skills)) state.skills[name] = SKILL_BASE[name] || 0;
      state.skills[name] += delta;
      toast('「' + name + '」永久 +' + delta);
      save();
      return true;
    }
    if (fx.mythos) {
      state.mythos += fx.mythos;
      toast('「克苏鲁神话」+' + fx.mythos, 'mythos');
      save();
      return true;
    }

    // 生命值
    if (fx.hp !== undefined) {
      if (fx.hp === '0to1') {
        if (state.hp <= 0) { state.hp = 1; updateVitals(); toast('生命值 +1（恢复意识）'); }
        save(); return true;
      }
      if (fx.ifWounded && state.hp >= state.hpMax) { save(); return true; }
      if (typeof fx.hp === 'number') {
        applyHpDelta(fx.hp);
        return true;
      }
      const isDamage = fx.hp.startsWith('-');
      const specHp = fx.hp.replace(/^[+-]/, '');
      if (!/[dD]/.test(specHp)) {
        applyHpDelta(parseInt(specHp, 10) * (isDamage ? -1 : 1));
        return true;
      }
      // 骰子伤害/回复
      const roll = await rollPanel({
        title: isDamage ? '伤害' : '回复',
        spec: specHp,
        theme: isDamage ? 'blood' : 'leaf',
        applyText: t => (isDamage ? '你受到 <b>' + t + '</b> 点伤害' : '你回复 <b>' + t + '</b> 点生命值')
      });
      applyHpDelta(isDamage ? -roll : roll);
      if (state.hp <= 0 && fx.zeroGo) { goTo(fx.zeroGo); return false; }
      if (state.hp <= 0 && !fx.zeroGo) { /* 由后续条目处理 */ }
      return true;
    }

    // 理智
    if (fx.san !== undefined) {
      if (fx.ifLost && !state.sanLost) { save(); return true; }
      if (typeof fx.san === 'number') {
        applySanDelta(fx.san);
        return true;
      }
      const isLoss = fx.san.startsWith('-');
      const specSan = fx.san.replace(/^[+-]/, '');
      if (!/[dD]/.test(specSan)) {
        applySanDelta(parseInt(specSan, 10) * (isLoss ? -1 : 1));
        return true;
      }
      const roll = await rollPanel({
        title: '理智流失',
        spec: specSan,
        theme: 'pale',
        applyText: t => '理智值 <b>-' + t + '</b>'
      });
      applySanDelta(isLoss ? -roll : roll);
      if (state.san <= 0 && fx.zeroGo) { goTo(fx.zeroGo); return false; }
      return true;
    }
    return true;
  }

  function applyHpDelta(d) {
    state.hp = Math.max(0, Math.min(state.hpMax, state.hp + d));
    if (d < 0) toast('生命值 ' + d, 'hurt'); else if (d > 0) toast('生命值 +' + d, 'heal');
    updateVitals();
    const chip = $('#chip-hp');
    chip.classList.add('pulse'); setTimeout(() => chip.classList.remove('pulse'), 700);
    save();
  }

  function applySanDelta(d) {
    state.san = Math.max(0, Math.min(99 - state.mythos, state.san + d));
    if (d < 0) { state.sanLost = true; toast('理智值 ' + d, 'san'); }
    else if (d > 0) toast('理智值 +' + d, 'san');
    updateVitals();
    const chip = $('#chip-san');
    chip.classList.add('pulse'); setTimeout(() => chip.classList.remove('pulse'), 700);
    save();
  }

  /* 行内掷骰面板（伤害/理智流失等） */
  function rollPanel(cfg) {
    return new Promise(resolve => {
      const area = $('#fx-area');
      const panel = document.createElement('div');
      panel.className = 'roll-panel';
      panel.innerHTML =
        '<div class="roll-panel-title">' + cfg.title + '　<span class="roll-spec">' + esc(cfg.spec) + '</span></div>' +
        '<button class="choice-btn roll-btn">' + (cfg.btn || '掷 骰') + '</button>' +
        '<div class="roll-result"></div>';
      area.appendChild(panel);
      panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
      panel.querySelector('.roll-btn').onclick = async () => {
        panel.querySelector('.roll-btn').style.display = 'none';
        const r = await DiceUI.damage(cfg.spec, { title: cfg.title, theme: cfg.theme, totalLabel: cfg.title === '理智流失' ? '失去' : '合计' });
        const res = panel.querySelector('.roll-result');
        res.innerHTML = cfg.applyText(r.total);
        res.classList.add('on');
        resolve(r.total);
      };
    });
  }

  /* ==================== 检定流程 ==================== */
  function netBonus(check) {
    let b = check.bonus || 0;
    if (check.bonusIf && state.flags[check.bonusIf]) b = 1;
    if (state.flags.penalty && check.stat !== '幸运' && check.stat !== '理智') b -= 1;
    return Math.max(-1, Math.min(1, b));
  }

  function checkLabel(check) {
    return check.label || ('「' + check.stat + '」检定');
  }

  async function performCheck(check) {
    let value = statValue(check.stat);
    if (check.doubled) value = value * 2;
    const diffName = check.diff === 'hard' ? '（困难）' : check.diff === 'extreme' ? '（极难）' : '';
    const r = await DiceUI.check({
      statLabel: '「' + check.stat + '」',
      title: checkLabel(check) + diffName,
      value: value,
      diff: check.diff || 'normal',
      bonus: netBonus(check),
      fumbleAt96: !!check.fumbleAt96
    });
    state.flags.lastFumble = (r.level === 'fumble');
    return r;
  }

  function handleCheck(st, check) {
    // 可选检定：先给出按钮
    if (check.optional) {
      const area = $('#choices');
      const b1 = mkBtn(checkLabel(check) + '　<span class="btn-sub">' + statValue(check.stat) + '</span>', async () => {
        area.innerHTML = '';
        const r = await performCheck(check);
        if (r.passed && check.succFx) await applyFxQueue(check.succFx);
        goTo(check.after);
      });
      const b2 = mkBtn(check.skipLabel || '不做处理，继续', () => { area.innerHTML = ''; goTo(check.after); }, 'dim');
      area.appendChild(b1); area.appendChild(b2);
      return;
    }

    // 已死者直接走向失败分支（重伤濒死）
    if (check.failIfDead && st.hp <= 0) { goTo(check.fail); return; }

    (async () => {
      const r = await performCheck(check);
      if (r.passed) {
        if (check.succFx) await applyFxQueue(check.succFx);
        goTo(check.succ);
        return;
      }
      // 失败
      if (r.level === 'fumble' && check.fumble) { goTo(check.fumble); return; }
      if (check.always) { goTo(check.always); return; }
      if (check.push && r.level !== 'fumble') {
        offerPush(check);
        return;
      }
      if (check.push && r.level === 'fumble') { goTo(check.push.fumbleFirst); return; }
      if (check.failFx) await applyFxQueue(check.failFx);
      goTo(check.fail);
    })();
  }

  function offerPush(check) {
    const area = $('#choices');
    const b1 = mkBtn('孤注一掷——重新掷骰', async () => {
      area.innerHTML = '';
      const r = await performCheck(check);
      if (r.passed) { if (check.succFx) await applyFxQueue(check.succFx); goTo(check.succ); }
      else goTo(check.push.failPush);
    }, 'hot');
    const b2 = mkBtn('接受失败', async () => {
      area.innerHTML = '';
      if (check.push.fumbleFirst && check.failFx) await applyFxQueue(check.failFx);
      goTo(check.fail);
    }, 'dim');
    area.appendChild(b1); area.appendChild(b2);
  }

  /* ==================== 选项渲染 ==================== */
  function mkBtn(html, fn, cls) {
    const b = document.createElement('button');
    b.className = 'choice-btn' + (cls ? ' ' + cls : '');
    b.innerHTML = html;
    b.onclick = fn;
    return b;
  }

  function renderChoices(e) {
    const area = $('#choices');

    // 秘密提示
    (e.choices || []).forEach(c => {
      if (c.secret && state.flags[c.secret]) {
        const hint = document.createElement('div');
        hint.className = 'secret-hint';
        hint.innerHTML = '✦ ' + esc(c.st || '');
        area.appendChild(hint);
      }
    });

    (e.choices || []).forEach((c, i) => {
      if (c.secret && !state.flags[c.secret]) return;
      if (c.show && !c.show(state)) return;
      if (c.key && state.usedKeys[c.key]) return;
      if (c.check && c.check.key && state.usedKeys[c.check.key]) return;
      if (e.hub === 'day2' && c.key && state.tried[c.key]) return;
      if (e.hub === 'day3' && c.key && state.tried[c.key]) return;

      const btn = mkBtn(
        fmt(c.t) + (c.st && c.secret ? ' <span class="btn-sub">✦</span>' : ''),
        async () => {
          if (c.key) { state.tried[c.key] = true; save(); }
          if (c.fx) await applyFxQueue(c.fx);
          if (c.check) {
            const r = await performCheck(c.check);
            if (r.passed) {
              if (c.check.succFx) await applyFxQueue(c.check.succFx);
              goTo(c.check.succ);
            } else if (c.check.fail === 'stay') {
              if (c.check.key) { state.usedKeys[c.check.key] = true; save(); }
              goTo(state.entry);
            } else {
              goTo(c.check.fail);
            }
            return;
          }
          goTo(c.to);
        },
        c.secret ? 'secret' : ''
      );
      btn.style.animationDelay = (i * 0.08) + 's';
      area.appendChild(btn);
    });

    if (e.auto !== undefined && e.auto) {
      area.appendChild(mkBtn('继 续', () => goTo(e.auto(state))));
    }
  }

  /* ==================== 特殊条目 ==================== */
  const SPECIAL = {

    /* 8：行李 */
    luggage(st, e) {
      const to = st.attrs.SIZ === 40 ? 23 : 38;
      $('#choices').appendChild(mkBtn('继续', () => goTo(to)));
    },

    /* 263：属性分配 */
    assignAttrs(st, e) {
      const pool = [40, 50, 50, 50, 60, 60, 70, 80];
      const area = $('#choices');
      const wrap = document.createElement('div');
      wrap.className = 'create-panel';
      let html = '<div class="create-title">创建调查员 · 分配属性</div>';
      ATTR_LIST.forEach(a => {
        html += '<div class="attr-row"><span class="attr-name">' + a.n + ' <i>' + a.k + '</i></span><select data-attr="' + a.k + '"></select></div>';
      });
      html += '<div class="create-note">将 40、50、50、50、60、60、70、80 分配给八项属性。</div>';
      html += '<button class="choice-btn create-go" disabled>确认</button>';
      wrap.innerHTML = html;
      area.appendChild(wrap);

      const selects = wrap.querySelectorAll('select');
      function refresh() {
        const used = {};
        let assigned = 0;
        selects.forEach(s => { if (s.value) { used[s.value] = (used[s.value] || 0) + 1; assigned++; } });
        const remain = {};
        pool.forEach(v => { remain[v] = (remain[v] || 0) + 1; });
        Object.keys(used).forEach(v => { remain[v] -= used[v] || 0; });
        selects.forEach(s => {
          const cur = s.value;
          s.innerHTML = '<option value="">——</option>';
          const opts = {};
          pool.forEach(v => { opts[v] = remain[v] || 0; });
          if (cur) opts[cur] = (opts[cur] || 0) + 1;
          Object.keys(opts).sort((a, b) => a - b).forEach(v => {
            for (let i = 0; i < opts[v]; i++) {
              const o = document.createElement('option');
              o.value = v; o.textContent = v;
              s.appendChild(o);
            }
          });
          s.value = cur;
        });
        wrap.querySelector('.create-go').disabled = assigned !== 8;
      }
      selects.forEach(s => s.addEventListener('change', refresh));
      refresh();
      wrap.querySelector('.create-go').onclick = () => {
        st.attrs = {};
        selects.forEach(s => { st.attrs[s.dataset.attr] = parseInt(s.value, 10); });
        save();
        goTo(8);
      };
    },

    /* 233：衍生数值 */
    derived(st, e) {
      st.san = st.attrs.POW; st.sanStart = st.attrs.POW;
      st.mp = Math.floor(st.attrs.POW / 5); st.mpMax = st.mp;
      updateVitals(); save();
      const area = $('#fx-area');
      const box = document.createElement('div');
      box.className = 'stat-card';
      let rows = '';
      ATTR_LIST.forEach(a => {
        const v = st.attrs[a.k];
        rows += '<div class="sc-attr"><b>' + a.n + '</b><span>' + v + '</span><i>½' + Math.floor(v / 2) + ' · 1/5 ' + Math.floor(v / 5) + '</i></div>';
      });
      box.innerHTML =
        '<div class="create-title">你的调查员</div>' +
        '<div class="sc-grid">' + rows + '</div>' +
        '<div class="sc-derived">初始理智值（=意志）<b>' + st.san + '</b>　·　魔法值（=意志÷5）<b>' + st.mp + '</b></div>';
      area.appendChild(box);
      $('#choices').appendChild(mkBtn('继续', () => goTo(134)));
    },

    /* 134：HP / 幸运 / 敏捷检定 */
    hpLuckDex(st, e) {
      st.hpMax = Math.floor((st.attrs.SIZ + st.attrs.CON) / 10);
      st.hp = st.hpMax;
      updateVitals(); save();
      const area = $('#choices');
      const info = document.createElement('div');
      info.className = 'stat-card slim';
      info.innerHTML = '生命值（HP）= (体型 ' + st.attrs.SIZ + ' + 体质 ' + st.attrs.CON + ') ÷ 10 = <b>' + st.hpMax + '</b>';
      area.appendChild(info);

      const btn = mkBtn('投掷幸运值　<span class="btn-sub">3D6 × 5</span>', async () => {
        btn.remove();
        const r = await DiceUI.custom({
          title: '幸运值', sub: '投掷 3D6，结果乘以 5',
          dice: [{ sides: 6 }, { sides: 6 }, { sides: 6 }],
          theme: 'gold', totalLabel: '幸运值', multiply: 5
        });
        st.luck = r.total;
        updateVitals(); save();
        const lab = document.createElement('div');
        lab.className = 'stat-card slim';
        lab.innerHTML = '你的幸运值是 <b>' + st.luck + '</b>。现在进行敏捷检定。';
        area.appendChild(lab);
        handleCheck(st, { stat: '敏捷', succ: 261, fail: 59 });
      });
      area.appendChild(btn);
    },

    /* 71：姓名 / 年龄 / 职业 */
    identity(st, e) {
      const area = $('#choices');
      const wrap = document.createElement('div');
      wrap.className = 'create-panel';
      wrap.innerHTML =
        '<div class="create-title">为你的调查员起名</div>' +
        '<div class="id-row"><label>姓名</label><input id="pc-name" type="text" maxlength="12" placeholder="例如：贾斯珀·希尔"></div>' +
        '<div class="id-row"><label>年龄</label><input id="pc-age" type="number" min="23" max="36" value="28"></div>' +
        '<div class="create-note">年龄应在 23 到 36 岁之间。然后选择你的职业：</div>' +
        '<div class="prof-grid"></div>';
      area.appendChild(wrap);
      const grid = wrap.querySelector('.prof-grid');
      const profs = [['antiquarian', '文物学家', 102], ['doctor', '医生', 226], ['journalist', '记者', 239], ['detective', '私家侦探', 249], ['professor', '教授', 265]];
      profs.forEach(([key, name, to]) => {
        const b = document.createElement('button');
        b.className = 'prof-btn';
        b.innerHTML = name + '<span>信用评级 ' + PROF[key].credit + '</span>';
        b.onclick = () => {
          const nm = wrap.querySelector('#pc-name').value.trim();
          st.name = nm || '无名调查员';
          const age = parseInt(wrap.querySelector('#pc-age').value, 10);
          st.age = isNaN(age) ? 28 : Math.max(23, Math.min(36, age));
          st.profession = key;
          save();
          goTo(to);
        };
        grid.appendChild(b);
      });
    },

    /* 职业技能分配 */
    profession(st, e) {
      const cfg = PROF[e.prof];
      const area = $('#choices');
      const wrap = document.createElement('div');
      wrap.className = 'create-panel';
      let html = '<div class="create-title">' + cfg.name + ' · 本职技能</div>';
      cfg.choose.forEach((c, i) => {
        html += '<div class="attr-row"><span class="attr-name">' + c.label + '</span><select data-choose="' + i + '"><option value="">——</option>' +
          c.options.map(o => '<option value="' + o + '">' + o + '</option>').join('') + '</select></div>';
      });
      for (let i = 0; i < cfg.extra; i++) {
        html += '<div class="attr-row"><span class="attr-name">' + cfg.extraLabel + '</span><select data-extra="' + i + '"><option value="">——</option></select></div>';
      }
      html += '<div class="alloc-table" id="alloc-table"></div>';
      html += '<div class="create-note">将 70%、60%、60%、50%、50%、50%、40%、40% 分配到各项本职技能（忽略基础值）。</div>';
      html += '<button class="choice-btn create-go" disabled>确认</button>';
      wrap.innerHTML = html;
      area.appendChild(wrap);

      const values = [70, 60, 60, 50, 50, 50, 40, 40];
      const extraPool = Object.keys(SKILL_BASE).concat(['母语'])
        .filter(s => !cfg.fixed.includes(s));

      function refresh() {
        // 附加技能选项
        wrap.querySelectorAll('select[data-extra]').forEach(sel => {
          const cur = sel.value;
          const taken = [];
          wrap.querySelectorAll('select[data-choose]').forEach(s => { if (s.value) taken.push(s.value); });
          wrap.querySelectorAll('select[data-extra]').forEach(s => { if (s.value && s !== sel) taken.push(s.value); });
          sel.innerHTML = '<option value="">——</option>' + extraPool
            .filter(s => !taken.includes(s))
            .map(s => '<option value="' + s + '">' + s + '</option>').join('');
          sel.value = cur;
        });
        // 技能表
        const chosen = cfg.fixed.slice();
        wrap.querySelectorAll('select[data-choose]').forEach(s => { if (s.value) chosen.push(s.value); });
        wrap.querySelectorAll('select[data-extra]').forEach(s => { if (s.value) chosen.push(s.value); });
        const table = wrap.querySelector('#alloc-table');
        if (chosen.length !== 8) {
          table.innerHTML = '<div class="create-note warn">还需选择 ' + (8 - chosen.length) + ' 项技能。</div>';
          wrap.querySelector('.create-go').disabled = true;
          return;
        }
        // 记住旧值（表格会被重建）
        const prev = {};
        table.querySelectorAll('select').forEach(s => { if (s.value) prev[s.dataset.skill] = s.value; });
        let html2 = '';
        chosen.forEach((s, i) => {
          html2 += '<div class="attr-row"><span class="attr-name">' + s + '</span><select data-skill="' + i + '"></select></div>';
        });
        table.innerHTML = html2;
        const sels = table.querySelectorAll('select');
        let assigned = 0;
        const remain = {};
        values.forEach(v => remain[v] = (remain[v] || 0) + 1);
        Object.keys(prev).forEach(v => { if (remain[v] !== undefined) remain[v] = Math.max(0, remain[v] - 1); });
        sels.forEach(sel => {
          const cur = prev[sel.dataset.skill] || '';
          sel.innerHTML = '<option value="">——</option>';
          const opts = {};
          values.forEach(v => opts[v] = remain[v] || 0);
          if (cur) opts[cur] = (opts[cur] || 0) + 1;
          Object.keys(opts).sort((a, b) => b - a).forEach(v => {
            for (let k = 0; k < opts[v]; k++) {
              const o = document.createElement('option');
              o.value = v; o.textContent = v + '%';
              sel.appendChild(o);
            }
          });
          sel.value = cur;
          if (cur) assigned++;
          sel.onchange = () => refresh();
        });
        wrap.querySelector('.create-go').disabled = assigned !== 8;
      }
      wrap.querySelectorAll('select[data-choose],select[data-extra]').forEach(s => s.addEventListener('change', refresh));
      refresh();

      wrap.querySelector('.create-go').onclick = () => {
        st.skills = {};
        const chosen = cfg.fixed.slice();
        wrap.querySelectorAll('select[data-choose]').forEach(s => { if (s.value) chosen.push(s.value); });
        wrap.querySelectorAll('select[data-extra]').forEach(s => { if (s.value) chosen.push(s.value); });
        wrap.querySelectorAll('#alloc-table select').forEach((sel, i) => {
          st.skills[chosen[i]] = parseInt(sel.value, 10);
        });
        st.profSkills = chosen.slice();
        // 其余技能设为基础值
        Object.keys(SKILL_BASE).forEach(k => { if (!(k in st.skills)) st.skills[k] = SKILL_BASE[k]; });
        if (!('母语' in st.skills)) st.skills['母语'] = st.attrs.EDU;
        st.skills['信用评级'] = cfg.credit;
        st.skills['闪避'] = Math.floor(st.attrs.DEX / 2);
        st.skills['克苏鲁神话'] = st.mythos || 0;
        st.dbSpec = calcDb();
        updateVitals(); save();
        goTo(128);
      };
    },

    /* 128：兴趣技能 */
    interest(st, e) {
      const area = $('#choices');
      const wrap = document.createElement('div');
      wrap.className = 'create-panel';
      const profSkills = st.profSkills || [];
      const pool = Object.keys(SKILL_BASE).concat(['母语'])
        .filter(s => s !== '母语' && !profSkills.includes(s));
      let html = '<div class="create-title">个人兴趣技能</div><div class="interest-grid">';
      pool.forEach(s => {
        html += '<label class="int-item"><input type="checkbox" value="' + s + '"><span>' + s + '</span><i>+' + 20 + '</i></label>';
      });
      html += '</div><div class="create-note">选择四项本职技能以外的技能，各 +20 点。</div>';
      html += '<button class="choice-btn create-go" disabled>确认（已选 <span class="int-n">0</span>/4）</button>';
      wrap.innerHTML = html;
      area.appendChild(wrap);
      const boxes = wrap.querySelectorAll('input[type=checkbox]');
      const go = wrap.querySelector('.create-go');
      const n = wrap.querySelector('.int-n');
      boxes.forEach(b => b.addEventListener('change', () => {
        const cnt = wrap.querySelectorAll('input:checked').length;
        n.textContent = cnt;
        go.disabled = cnt !== 4;
        if (cnt === 4) boxes.forEach(x => { if (!x.checked) x.disabled = true; });
        else boxes.forEach(x => x.disabled = false);
      }));
      go.onclick = () => {
        wrap.querySelectorAll('input:checked').forEach(b => { st.skills[b.value] += 20; });
        save();
        goTo(144);
      };
    },

    /* 29：窄道 */
    cliffPath(st, e) {
      const area = $('#choices');
      area.appendChild(mkBtn('放弃这条路', () => goTo(120)));
      if (st.attrs.DEX > st.attrs.SIZ) {
        area.appendChild(mkBtn('继续前进', () => goTo(42)));
      } else {
        area.appendChild(mkBtn('比较体型与敏捷，继续前进……', async () => {
          area.innerHTML = '';
          handleCheck(st, { stat: '敏捷', succ: 42, fail: 36 });
        }));
      }
    },

    /* 55：坠落伤害 */
    async fallDamage(st, e) {
      const r = await rollPanel({
        title: '坠落伤害', spec: '2D6', theme: 'blood',
        applyText: t => '你摔在岩石上，受到 <b>' + t + '</b> 点伤害'
      });
      st.hp = Math.max(0, st.hp - r);
      updateVitals(); save();
      if (st.hp <= 0) { goTo(92); return; }
      if (r >= st.hpMax / 2) goTo(67); else goTo(73);
    },

    /* 73：落地检查 */
    fallCheck(st, e) {
      $('#choices').appendChild(mkBtn('继续', () => goTo(st.hp <= 0 ? 92 : 82)));
    },

    /* 97：划伤 + 急救 */
    async gash(st, e) {
      const r = await rollPanel({
        title: '划伤', spec: '1D3', theme: 'blood',
        applyText: t => '你失去 <b>' + t + '</b> 点生命值'
      });
      st.hp = Math.max(0, st.hp - r);
      updateVitals(); save();
      if (st.hp <= 0) { goTo(92); return; }
      const area = $('#choices');
      area.appendChild(mkBtn('尝试「急救」检定　<span class="btn-sub">' + statValue('急救') + '</span>', async () => {
        area.innerHTML = '';
        const c = await performCheck({ stat: '急救' });
        if (c.passed) {
          applyHpDelta(1);
          if (!st.ticks['急救']) { st.ticks['急救'] = true; toast('「急救」获得成长标记 ✓'); }
        }
        goTo(79);
      }));
      area.appendChild(mkBtn('简单包扎，继续赶路', () => { area.innerHTML = ''; goTo(79); }, 'dim'));
    },

    /* 52：彻夜不眠 */
    sleepless(st, e) {
      handleCheck(st, {
        stat: '体质', succ: 64, fail: 64,
        succFx: [], failFx: [{ flag: 'penalty' }],
        label: '「体质」检定（熬夜）'
      });
    },

    /* 166：翌日清晨 */
    morningAfter(st, e) {
      const area = $('#choices');
      if (st.flags.nightWalk) {
        area.appendChild(mkBtn('循着昨夜的脚印找过去', () => goTo(178)));
        area.appendChild(mkBtn('直接去找长途车', () => goTo(192)));
      } else {
        area.appendChild(mkBtn('动身去找长途车', () => goTo(192)));
      }
    },

    /* 64：第三日清晨 */
    day3morning(st, e) {
      const area = $('#choices');
      if (st.flags.nightFight) {
        area.appendChild(mkBtn('勘查昨夜战斗的后果', () => goTo(70)));
        area.appendChild(mkBtn('按捺不安，动身出发', () => goTo(78)));
      } else {
        area.appendChild(mkBtn('继续', () => goTo(78)));
      }
    },

    /* 150：追逐怪人 */
    async chaseMan(st, e) {
      const r = await DiceUI.opposed({
        title: '追逐 · 对抗检定',
        a: { label: '你', value: st.attrs.DEX },
        b: { label: '怪男人', value: 38 },
        aggressor: 'a'
      });
      goTo(r.winner === 0 ? 172 : 87);
    },

    /* 155：逃离熊 */
    async fleeBear(st, e) {
      const r = await DiceUI.opposed({
        title: '逃离黑熊 · 对抗检定',
        a: { label: '你', value: st.attrs.DEX },
        b: { label: '黑熊', value: 58 },
        aggressor: 'a'
      });
      goTo(r.winner === 0 ? 161 : 167);
    },

    /* 40：火刑架上的法术选择 */
    pyreSpells(st, e) {
      const area = $('#choices');
      if (st.flags.spellA) area.appendChild(mkBtn('念出阿博加斯特教你的咒语', () => goTo(50), 'secret'));
      if (st.flags.spellSummon) area.appendChild(mkBtn('吟诵「召唤天之火」', () => goTo(80), 'secret'));
      if (st.flags.spellCommand) area.appendChild(mkBtn('吟诵「号令天之火」', () => goTo(90), 'secret'));
      area.appendChild(mkBtn('你没有学过任何咒语……静待火焰逼近', () => goTo(65), 'dim'));
    },

    /* 80 / 90：魔法值消耗 */
    mpSpend(st, e) {
      const maxSpend = Math.min(10, st.mp + st.hp - 1);
      const area = $('#choices');
      if (maxSpend < 1) {
        area.appendChild(mkBtn('你已无力集中精神施法……静待火焰逼近', () => goTo(65), 'dim'));
        return;
      }
      const wrap = document.createElement('div');
      wrap.className = 'create-panel';
      wrap.innerHTML =
        '<div class="create-title">施放法术</div>' +
        '<div class="mp-row">当前魔法值 <b>' + st.mp + '</b>　当前生命值 <b>' + st.hp + '</b></div>' +
        '<div class="mp-row"><input type="range" id="mp-range" min="1" max="' + maxSpend + '" value="' + Math.min(maxSpend, st.mp) + '"></div>' +
        '<div class="mp-row">消耗 <b id="mp-n">' + Math.min(maxSpend, st.mp) + '</b> 点　→　成功率 <b id="mp-rate">' + Math.min(maxSpend, st.mp) * 10 + '%</b></div>' +
        (st.mp < 10 ? '<div class="create-note warn">魔法值不足时可以透支生命值，但不能耗到归零。</div>' : '') +
        '<button class="choice-btn create-go">诵读咒文</button>';
      area.appendChild(wrap);
      const range = wrap.querySelector('#mp-range');
      range.addEventListener('input', () => {
        wrap.querySelector('#mp-n').textContent = range.value;
        wrap.querySelector('#mp-rate').textContent = (range.value * 10) + '%';
      });
      wrap.querySelector('.create-go').onclick = async () => {
        const spend = parseInt(range.value, 10);
        const useMp = Math.min(st.mp, spend);
        const useHp = spend - useMp;
        st.mp -= useMp;
        if (useHp > 0) { st.hp = Math.max(1, st.hp - useHp); toast('生命值 -' + useHp + '（透支施法）', 'hurt'); }
        toast('魔法值 -' + useMp, 'san');
        st.lastSpend = spend;
        updateVitals(); save();
        goTo(198);
      };
    },

    /* 198：施法检定 */
    starSpell(st, e) {
      const target = st.lastSpend * 10;
      (async () => {
        const r = await DiceUI.check({
          statLabel: '法术',
          title: '「号令群星」施法检定',
          sub: '',
          value: target,
          diff: 'normal',
          bonus: 0,
          fumbleAt96: true
        });
        goTo(r.passed ? 209 : 65);
      })();
    },

    /* 167：被熊袭击 */
    bearMaul(st, e) {
      Combat.bearMaul(st).then(to => goTo(to));
    },

    /* 173 / 235 / 262：战斗 */
    combat(st, e) {
      Combat.run(st, e.combat).then(to => goTo(to));
    },

    /* 171：诗集结局 */
    bookEnding(st, e) {
      (async () => {
        const r = await performCheck({ stat: '理智', label: '「理智」检定（研读诗集）' });
        if (r.passed) { applySanDelta(-1); }
        else {
          const d = await DiceUI.damage('1D4', { title: '理智流失', theme: 'pale', totalLabel: '失去' });
          applySanDelta(-d.total);
        }
        st.mythos += 4;
        toast('「克苏鲁神话」+4', 'mythos');
        save();
        renderEnding({
          t: e.t.concat(['你将再也难以轻松入眠。']),
          ending: { type: 'mythos', epitaph: '研读《阿撒托斯及其他》——你叩响了禁忌之门。' }
        });
      })();
    }
  };

  /* ==================== 结局 ==================== */
  function renderEnding(e) {
    const end = e.ending;
    const scr = $('#screen-ending');
    const box = scr.querySelector('.ending-card');
    const deathTypes = ['death', 'pyrrhic', 'transcend'];
    box.className = 'ending-card ' + end.type;

    let html = '<div class="fin-mark">【 剧 终 】</div>';
    (e.t || []).forEach(p => { html += '<p>' + fmt(p) + '</p>'; });
    html += '<div class="epitaph">' + fmt(end.epitaph) + '</div>';

    // 生存结局：技能成长
    if (end.type === 'survival') {
      html += '<div class="adv-zone" id="adv-zone"></div>';
    }

    html += '<div class="ending-actions" id="ending-actions"></div>';
    box.innerHTML = html;
    showScreen('#screen-ending');

    const acts = box.querySelector('#ending-actions');

    if (end.type === 'survival') {
      const zone = box.querySelector('#adv-zone');
      const ticked = Object.keys(state.ticks);
      if (ticked.length) {
        zone.innerHTML = '<div class="adv-title">你在这次冒险中成功使用过的技能，有机会得到提升（掷出高于当前技能值即 +1D10）。</div><div class="adv-list"></div>' +
          '<button class="choice-btn" id="adv-go">尝试技能成长</button>';
        zone.querySelector('#adv-go').onclick = async () => {
          zone.querySelector('#adv-go').remove();
          const list = zone.querySelector('.adv-list');
          for (const sk of ticked) {
            const cur = state.skills[sk] !== undefined ? state.skills[sk] : statValue(sk);
            const r = await DiceUI.custom({
              title: '「' + sk + '」成长检定', sub: '当前 ' + cur + ' · 需掷出更高',
              dice: [{ sides: 100 }], theme: 'gold', totalLabel: '掷出'
            });
            const line = document.createElement('div');
            if (r.rolls[0] > cur) {
              const g = await DiceUI.damage('1D10', { title: '「' + sk + '」提升', theme: 'leaf', totalLabel: '提升' });
              state.skills[sk] = cur + g.total;
              line.innerHTML = '<span class="adv-ok">✦ 「' + sk + '」 ' + cur + ' → <b>' + state.skills[sk] + '</b></span>';
            } else {
              line.innerHTML = '<span class="adv-no">「' + sk + '」 ' + cur + ' · 未能提升</span>';
            }
            list.appendChild(line);
            save();
          }
        };
      }
      if (state.items.includes('book')) {
        const bb = mkBtn('研读《阿撒托斯及其他》<span class="btn-sub">一星期之后……</span>', () => { goTo(171); }, 'secret');
        acts.appendChild(bb);
      }
      acts.appendChild(mkBtn('查看你的调查员', () => { openSheet(); }));
    }

    if (deathTypes.includes(end.type)) {
      const ck = loadCheckpoint();
      if (ck && ck.state) {
        acts.appendChild(mkBtn('回到今日清晨，重新尝试', () => {
          state = ck.state;
          save();
          goTo(state.entry);
        }, 'hot'));
      }
    }
    if (canBack()) {
      acts.appendChild(mkBtn('回到上一页，另作打算', () => goBack(), deathTypes.includes(end.type) ? '' : 'hot'));
    }
    acts.appendChild(mkBtn('重新开始新的冒险', () => restart()));
    scr.querySelector('#ending-flavor').textContent =
      end.type === 'survival' ? '你可以保留自己的角色，在其他《克苏鲁的呼唤》冒险中继续使用。'
        : '为何不重新尝试呢？选择不同的选项，你也许就能逃脱、甚至智胜烬头村的村民。';
  }

  function restart() {
    if (!confirm('确定要放弃当前进度，重新创建调查员吗？')) return;
    localStorage.removeItem(SAVE_KEY);
    localStorage.removeItem(CKPT_KEY);
    state = newState();
    startNew();
  }

  /* ==================== 角色卡抽屉 ==================== */
  function openSheet() {
    const d = $('#sheet');
    d.classList.add('open');
    const body = d.querySelector('.sheet-body');
    if (!state.attrs) { body.innerHTML = '<div class="sheet-empty">调查员尚未创建。</div>'; return; }
    let html = '<div class="sheet-name">' + esc(state.name) + '<span>' + esc(state.profession ? PROF[state.profession].name : '') + ' · ' + state.age + '岁</span></div>';
    html += '<div class="sheet-vitals">' +
      '<div class="sv hp"><label>生命</label><b>' + state.hp + '</b><i>/' + state.hpMax + '</i></div>' +
      '<div class="sv san"><label>理智</label><b>' + state.san + '</b><i>/' + (99 - state.mythos) + '</i></div>' +
      '<div class="sv mp"><label>魔法</label><b>' + state.mp + '</b><i>/' + state.mpMax + '</i></div>' +
      '<div class="sv luck"><label>幸运</label><b>' + state.luck + '</b></div>' +
      '</div>';
    html += '<div class="sheet-attrs">';
    ATTR_LIST.forEach(a => {
      const v = state.attrs[a.k];
      html += '<div class="sa"><b>' + a.n + '</b><span>' + v + '</span><i>' + Math.floor(v / 2) + ' / ' + Math.floor(v / 5) + '</i></div>';
    });
    html += '</div>';
    html += '<div class="sheet-db">伤害加值 <b>' + (state.dbSpec || '0') + '</b>　·　克苏鲁神话 <b>' + state.mythos + '</b></div>';
    const names = Object.keys(state.skills).sort((a, b) => state.skills[b] - state.skills[a]);
    html += '<div class="sheet-skills">';
    names.forEach(n => {
      html += '<div class="ss' + (state.ticks[n] ? ' ticked' : '') + '"><span>' + n + (state.ticks[n] ? ' <i>✓</i>' : '') + '</span><b>' + state.skills[n] + '</b></div>';
    });
    html += '</div>';
    const items = [];
    if (state.items.includes('knife')) items.push('狩猎小刀');
    if (state.items.includes('book')) items.push('《阿撒托斯及其他》');
    if (state.flags.map) items.push('烬头村周边地图');
    if (items.length) html += '<div class="sheet-items">携带：' + items.join(' · ') + '</div>';
    const secrets = Object.keys(SECRET_TOAST).filter(k => state.flags[k]);
    if (secrets.length) html += '<div class="sheet-secrets">✦ 已知的秘密：' + secrets.length + ' 项</div>';
    html += '<button class="choice-btn flat" id="btn-export-sheet">导出角色码</button>';
    body.innerHTML = html;
    const exportBtn = body.querySelector('#btn-export-sheet');
    if (exportBtn) exportBtn.onclick = openExportModal;
  }

  /* ==================== 背景余烬 ==================== */
  function startEmbers() {
    const cv = $('#embers');
    if (!cv) return;
    if (location.hash === '#still' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      cv.style.display = 'none';
      document.body.classList.add('still');
      return;
    }
    const ctx = cv.getContext('2d');
    let W, H, parts = [];
    function resize() {
      W = cv.width = window.innerWidth;
      H = cv.height = window.innerHeight;
    }
    resize();
    window.addEventListener('resize', resize);
    for (let i = 0; i < 36; i++) {
      parts.push({
        x: Math.random() * 2000, y: Math.random() * 1200,
        r: 0.6 + Math.random() * 1.8,
        v: 0.15 + Math.random() * 0.45,
        drift: (Math.random() - 0.5) * 0.22,
        a: 0.15 + Math.random() * 0.5,
        p: Math.random() * Math.PI * 2
      });
    }
    (function tick() {
      ctx.clearRect(0, 0, W, H);
      const t = Date.now() / 1000;
      parts.forEach(p => {
        p.y -= p.v; p.x += p.drift + Math.sin(t * 0.7 + p.p) * 0.12;
        if (p.y < -8) { p.y = H + 8; p.x = Math.random() * W; }
        if (p.x < -8) p.x = W + 8; if (p.x > W + 8) p.x = -8;
        const flick = 0.65 + 0.35 * Math.sin(t * 3 + p.p * 5);
        ctx.beginPath();
        ctx.arc(p.x % (W + 16), p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,' + Math.floor(120 + 60 * flick) + ',40,' + (p.a * flick) + ')';
        ctx.fill();
      });
      requestAnimationFrame(tick);
    })();
  }

  /* ==================== 启动 ==================== */
  function startNew() {
    state = newState();
    showScreen('#screen-game');
    goTo(1);
  }

  function continueGame() {
    const s = loadSave();
    if (!s) { startNew(); return; }
    state = s;
    goTo(state.entry || 1);
  }

  function init() {
    startEmbers();

    // 错误可见化：任何运行错误以浮窗提示，不再静默中断流程
    window.addEventListener('error', ev => {
      toast('运行错误：' + (ev.message || '未知'), 'mythos');
    });
    window.addEventListener('unhandledrejection', ev => {
      const r = ev.reason;
      toast('流程中断：' + (r && r.message ? r.message : String(r)), 'mythos');
    });

    $('#btn-start').onclick = () => {
      const s = loadSave();
      if (s && s.attrs) {
        if (confirm('检测到未完成的冒险。确定要放弃它并重新开始吗？')) startNew();
      } else startNew();
    };
    const saved = loadSave();
    if (saved && saved.attrs) {
      const bc = $('#btn-continue');
      bc.style.display = '';
      bc.onclick = () => continueGame();
    }

    $('#btn-sheet').onclick = openSheet;
    $('#sheet').addEventListener('click', ev => {
      if (ev.target.id === 'sheet' || ev.target.classList.contains('sheet-close')) $('#sheet').classList.remove('open');
    });
    $('#btn-back').onclick = goBack;
    $('#btn-history').onclick = openHistory;
    $('#history').addEventListener('click', ev => {
      if (ev.target.id === 'history' || ev.target.classList.contains('sheet-close')) $('#history').classList.remove('open');
    });
    $('#btn-import').onclick = openImportModal;
    $('#modal').addEventListener('click', ev => {
      if (ev.target.id === 'modal') $('#modal').classList.remove('show');
    });
    updateBackBtn();
    document.addEventListener('keydown', ev => {
      if (ev.altKey && ev.key === 'ArrowLeft') {
        const t = ev.target;
        if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) return;
        ev.preventDefault();
        goBack();
      }
    });
    $('#btn-map').onclick = () => {
      const mo = $('#map-overlay');
      mo.classList.add('show');
      mo.onclick = () => mo.classList.remove('show');
    };
    $('#btn-mute').onclick = function () {
      const m = DiceUI.toggleMute();
      this.classList.toggle('off', m);
    };
    if (DiceUI.isMuted()) $('#btn-mute').classList.add('off');
    $('#btn-restart').onclick = restart;

    // 标题屏氛围
    $('#screen-title').classList.add('active');

    // 隐藏跳转钩子：#e173 形式（需已有存档，供调试与复查用）
    const m = location.hash.match(/^#e(\d+)$/);
    if (m) {
      const s = loadSave();
      if (s && s.attrs) { state = s; goTo(parseInt(m[1], 10)); }
    }
  }

  window.AAF = {
    init, goTo, startNew, continueGame,
    get state() { return state; }
  };

  document.addEventListener('DOMContentLoaded', init);
})();
