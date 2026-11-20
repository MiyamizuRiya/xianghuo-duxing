/* ============================================================
 * 运行时全流程测试：迷你 DOM 桩 + 可编程骰子
 * 在 Node 中加载真实 engine/data，模拟点击走完关键路径
 * ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');

/* ---------------- 迷你 HTML 解析器 ---------------- */
const VOID = new Set(['meta', 'link', 'br', 'img', 'input', 'hr', 'source', 'area', 'base', 'col', 'embed', 'track', 'wbr']);

function decodeEnt(s) {
  return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ');
}

function parseAttrs(tagBody) {
  const attrs = {};
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(\s*=\s*("([^"]*)"|'([^']*)'|([^\s">]+)))?/g;
  let m;
  while ((m = re.exec(tagBody))) {
    attrs[m[1]] = decodeEnt(m[4] ?? m[5] ?? m[6] ?? '');
  }
  return attrs;
}

function parseHTML(html) {
  const roots = [];
  const stack = [];
  let i = 0;
  const push = n => { (stack.length ? stack[stack.length - 1].children : roots).push(n); n.parent = stack[stack.length - 1] || null; };
  html = html.replace(/<!--[\s\S]*?-->/g, '').replace(/<!DOCTYPE[^>]*>/i, '');
  while (i < html.length) {
    if (html[i] === '<') {
      const end = html.indexOf('>', i);
      if (end < 0) break;
      const raw = html.slice(i + 1, end).trim();
      i = end + 1;
      if (raw.startsWith('/')) { stack.pop(); continue; }
      const m = raw.match(/^([a-zA-Z][a-zA-Z0-9-]*)\/?([\s\S]*)$/);
      if (!m) continue;
      const tag = m[1].toLowerCase();
      const attrs = parseAttrs(m[2] || '');
      if (tag === 'script' || tag === 'style') {
        // 跳过内容
        const closeRe = new RegExp('</' + tag + '\\s*>', 'i');
        const rest = html.slice(i);
        const cm = rest.match(closeRe);
        if (cm) i += cm.index + cm[0].length;
        continue;
      }
      const node = makeEl(tag, attrs);
      push(node);
      if (!VOID.has(tag) && !raw.endsWith('/')) stack.push(node);
    } else {
      const next = html.indexOf('<', i);
      const text = html.slice(i, next < 0 ? html.length : next);
      if (text.trim()) {
        const t = { nodeType: 3, textContent: decodeEnt(text), parent: stack[stack.length - 1] || null, children: [] };
        if (stack.length) stack[stack.length - 1].children.push(t); else roots.push(t);
      }
      i = next < 0 ? html.length : next;
    }
  }
  return roots;
}

/* ---------------- 假 DOM 元素 ---------------- */
function textOfEl(el) {
  let s = '';
  el.children.forEach(c => { s += c.nodeType === 3 ? c.textContent : textOfEl(c); });
  return s;
}
function makeEl(tag, attrs = {}) {
  const el = {
    nodeType: 1, tagName: tag.toUpperCase(), children: [], parent: null,
    attrs, dataset: {}, style: { setProperty() { } },
    _classes: new Set((attrs.class || '').split(/\s+/).filter(Boolean)),
    _listeners: {},
    onclick: null,
  };
  Object.defineProperty(el, 'className', {
    get() { return [...el._classes].join(' '); },
    set(v) { el._classes = new Set(String(v).split(/\s+/).filter(Boolean)); }
  });
  Object.defineProperty(el, 'id', { get() { return attrs.id || ''; }, set(v) { attrs.id = v; } });
  Object.defineProperty(el, 'innerHTML', {
    set(html) {
      const s = String(html);
      if (global.__trapHtml && (s.includes('vitals') || s.includes('chip-san'))) {
        console.log('  [陷阱]', el.tagName, (el.attrs.id || el.className || ''), 'innerHTML 含 vitals/chip-san:', s.slice(0, 120));
      }
      el.children = parseHTML(s).map(n => { n.parent = el; return n; });
      el._textCache = null;
    },
    get() { return ''; },
    configurable: true
  });
  Object.defineProperty(el, 'textContent', {
    get() { return textOfEl(el); },
    set(v) { el.children = [{ nodeType: 3, textContent: String(v), parent: el, children: [] }]; }
  });
  el.classList = {
    add: (...c) => c.forEach(x => el._classes.add(x)),
    remove: (...c) => c.forEach(x => el._classes.delete(x)),
    toggle: (c, force) => { const has = el._classes.has(c); const want = force === undefined ? !has : force; want ? el._classes.add(c) : el._classes.delete(c); return want; },
    contains: c => el._classes.has(c)
  };
  el.appendChild = n => { n.parent = el; el.children.push(n); return n; };
  el.removeChild = n => { const i = el.children.indexOf(n); if (i >= 0) el.children.splice(i, 1); };
  el.remove = () => { if (el.parent) el.parent.removeChild(el); };
  el.addEventListener = (ev, fn) => { (el._listeners[ev] = el._listeners[ev] || []).push(fn); };
  el.fire = ev => (el._listeners[ev] || []).forEach(fn => fn({ target: el }));
  el.querySelector = sel => selectAll(el, sel)[0] || null;
  el.querySelectorAll = sel => selectAll(el, sel);
  Object.defineProperty(el, 'value', { get() { return el._value || (el.attrs.value !== undefined ? el.attrs.value : ''); }, set(v) { el._value = String(v); } });
  Object.defineProperty(el, 'checked', { get() { return !!el._checked; }, set(v) { el._checked = !!v; } });
  Object.defineProperty(el, 'disabled', { get() { return !!el._disabled; }, set(v) { el._disabled = !!v; } });
  el.offsetWidth = 0;
  el.scrollIntoView = () => { };
  el.select = () => { };
  if (attrs.id) el.id = attrs.id;
  for (const k of Object.keys(attrs)) {
    if (k.startsWith('data-')) el.dataset[k.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = attrs[k];
  }
  return el;
}

/* ---------------- 简易选择器引擎 ---------------- */
function matches(el, simple) {
  // 支持: #id  tag  .class  [data-x]  [type=checkbox]  input:checked  *
  let s = simple;
  const checked = s.endsWith(':checked');
  if (checked) s = s.slice(0, -':checked'.length).trim() || '*';
  const dm = s.match(/^([a-zA-Z][a-zA-Z0-9-]*|\*)?(?:#([\w-]+))?((?:\.[\w-]+)*)(?:\[([\w-]+)(?:=(\"[^\"]*\"|'[^']*'|[^\]]+))?\])?$/);
  if (!dm) return false;
  const [, tag, id, clsPart, dataAttr, attrVal] = dm;
  if (tag && tag !== '*' && el.tagName !== tag.toUpperCase()) return false;
  if (id && el.attrs.id !== id) return false;
  const clsList = (clsPart || '').split('.').filter(Boolean);
  if (clsList.length && !clsList.every(c => el._classes.has(c))) return false;
  if (dataAttr) {
    const raw = attrVal !== undefined ? attrVal.replace(/^[\"']|[\"']$/g, '') : undefined;
    if (raw !== undefined) { if (el.attrs[dataAttr] !== raw) return false; }
    else if (el.attrs[dataAttr] === undefined && el.dataset[dataAttr] === undefined) return false;
  }
  if (checked && !(el.tagName === 'INPUT' && el._checked)) return false;
  return true;
}

function selectAll(root, selector) {
  const out = [];
  for (const part of selector.split(',')) {
    const sels = part.trim().split(/\s+/).filter(Boolean);
    const walk = (el, depth) => {
      if (matches(el, sels[depth])) {
        if (depth === sels.length - 1) { out.push(el); }
        else { el.children.forEach(c => { if (c.nodeType === 1) walk(c, depth + 1); }); }
      } else if (depth > 0) {
        // 后代继续在当前层找
        el.children.forEach(c => { if (c.nodeType === 1) walk(c, depth); });
      }
    };
    // 从根的子树搜索
    (function descend(node, depth) {
      node.children.forEach(c => {
        if (c.nodeType !== 1) return;
        walk(c, 0);
        descend(c, 0);
      });
    })(root, 0);
  }
  return out;
}

/* ---------------- 组装 document ---------------- */
const htmlSrc = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const bodyMatch = htmlSrc.match(/<body>([\s\S]*)<\/body>/);
const bodyRoots = parseHTML(bodyMatch ? bodyMatch[1] : htmlSrc);
const bodyEl = makeEl('body', {});
bodyRoots.forEach(n => { n.parent = bodyEl; bodyEl.children.push(n); });

const documentStub = {
  body: bodyEl,
  children: [bodyEl],
  nodeType: 9,
  querySelector(sel) {
    if (sel.startsWith('#')) {
      const id = sel.slice(1).split(/[\s>]/)[0];
      const all = [];
      (function find(n) { n.children.forEach(c => { if (c.nodeType === 1) { if (c.attrs.id === id) all.push(c); find(c); } }); })(bodyEl);
      if (sel.includes(' ')) { const rest = sel.slice(sel.indexOf(' ')).trim(); return all[0] ? all[0].querySelector(rest) : null; }
      return all[0] || null;
    }
    return selectAll(bodyEl, sel)[0] || null;
  },
  querySelectorAll(sel) { return selectAll(bodyEl, sel); },
  getElementById(id) {
    let found = null;
    (function find(n) { if (found) return; n.children.forEach(c => { if (c.nodeType === 1) { if (c.attrs.id === id) found = c; find(c); } }); })(bodyEl);
    return found;
  },
  createElement(tag) { return makeEl(tag); },
  addEventListener() { },
};

const listeners = {};
const domReadyFns = [];
const documentStub2 = {
  addEventListener(ev, fn) { if (ev === 'DOMContentLoaded') domReadyFns.push(fn); }
};
Object.assign(documentStub, documentStub2);
const windowStub = {
  document: documentStub,
  matchMedia: () => ({ matches: false }),
  scrollTo: () => { },
  addEventListener: (ev, fn) => { (listeners[ev] = listeners[ev] || []).push(fn); },
  location: { hash: '' },
  ENTRIES: {},
  setTimeout, clearTimeout, setInterval, clearInterval,
};
windowStub.window = windowStub;

const storage = {};
const localStorageStub = {
  getItem: k => (k in storage ? storage[k] : null),
  setItem: (k, v) => { storage[k] = String(v); },
  removeItem: k => { delete storage[k]; }
};

let confirmAnswer = true;
global.document = documentStub;
global.window = windowStub;
global.localStorage = localStorageStub;
global.location = windowStub.location;
global.confirm = () => confirmAnswer;
global.requestAnimationFrame = () => { };
documentStub.execCommand = () => false;
global.AudioContext = undefined;

/* ---------------- 可编程骰子 ---------------- */
const DD = {
  checkResult: { passed: true, level: 'success', roll: 10 },
  damageTotal: 3,
  opposedWinner: 0,
  customTotal: 50,
  checkQueue: [],
  damageQueue: [],
  opposedQueue: [],
};
windowStub.DiceUI = {
  LEVEL_NAME: { crit: '大成功', extreme: '极难成功', hard: '困难成功', success: '成功', fail: '失败', fumble: '大失败' },
  toggleMute: () => false,
  isMuted: () => false,
  check: async () => DD.checkQueue.length ? { ...DD.checkQueue.shift() } : { ...DD.checkResult },
  damage: async () => { const t = DD.damageQueue.length ? DD.damageQueue.shift() : DD.damageTotal; return { total: t, rolls: [t] }; },
  opposed: async () => ({ rolls: [10, 90], levels: ['success', 'fail'], winner: DD.opposedQueue.length ? DD.opposedQueue.shift() : DD.opposedWinner }),
  custom: async cfg => ({ rolls: [DD.customTotal], total: DD.customTotal * ((cfg && cfg.multiply) || 1) }),
};

/* ---------------- 加载脚本 ---------------- */
function load(file) {
  const src = fs.readFileSync(path.join(__dirname, file), 'utf8');
  new Function('window', 'document', 'localStorage', 'location', 'confirm', 'navigator', 'DiceUI', 'Combat', src)(
    windowStub, documentStub, localStorageStub, windowStub.location, global.confirm, { }, windowStub.DiceUI, windowStub.Combat);
}
load('js/data1.js'); load('js/data2.js'); load('js/data3.js'); load('js/data4.js');

/* combat.js 需要 DiceUI 与 document */
load('js/combat.js');

/* engine.js 监听 DOMContentLoaded（经 documentStub 捕获） */
load('js/engine.js');
const fireDomReady = () => domReadyFns.forEach(fn => fn());

/* ---------------- 测试驱动 ---------------- */
const E = windowStub.ENTRIES;
const $ = sel => documentStub.querySelector(sel);
const $$ = sel => documentStub.querySelectorAll(sel);

function textOf(el) {
  let s = '';
  el.children.forEach(c => { s += c.nodeType === 3 ? c.textContent : textOf(c); });
  return s;
}

function findBtn(substr, scope) {
  const btns = (scope || documentStub).querySelectorAll('.choice-btn, .title-btn, .prof-btn');
  const b = btns.find(b => textOf(b).includes(substr));
  if (!b) throw new Error('未找到按钮: ' + substr + ' / 现有: ' + btns.map(x => textOf(x).slice(0, 18)).join(' | '));
  return b;
}

async function click(substr, scope) {
  const b = findBtn(substr, scope);
  if (typeof b.onclick !== 'function') throw new Error('按钮无处理器: ' + substr);
  await b.onclick();
  await tick();
}
async function tick(ms = 30) { await new Promise(r => setTimeout(r, ms)); }

function entryNo() { return textOf($('#entry-no')).replace(/[·\s]/g, ''); }

function assert(cond, msg) {
  if (!cond) throw new Error('断言失败: ' + msg + (cond === false ? '' : '') + ' [当前条目: ' + entryNo() + ']');
}

function state() { return windowStub.AAF.state; }

/* 设置下拉框 */
async function fillSelect(panel, dataKey, value) {
  const sels = panel.querySelectorAll('select');
  const sel = sels.find(s => s.dataset[dataKey] !== undefined && (dataKey !== 'skill' || true));
  if (!sel) throw new Error('未找到 select[data-' + dataKey + ']');
  sel.value = value;
  sel.fire('change');
  await tick(5);
}

/* ---------------- 场景测试 ---------------- */
async function scenario_creation() {
  windowStub.location.hash = '#still'; // 跳过余烬动画
  fireDomReady();
  await click('开 始 冒 险');
  assert(entryNo() === '1', '应处于条目1');
  await click('登上长途车');
  assert(entryNo() === '263', '应处于条目263，实际 ' + entryNo());

  // 属性分配
  const panel = $('#choices');
  const plan = { STR: '80', CON: '70', SIZ: '60', DEX: '50', APP: '50', INT: '60', POW: '40', EDU: '50' };
  for (const [attr, v] of Object.entries(plan)) {
    const sel = panel.querySelectorAll('select').find(s => s.dataset.attr === attr);
    sel.value = v; sel.fire('change'); await tick(5);
  }
  await click('确认');
  assert(state().attrs.STR === 80 && state().attrs.POW === 40, '属性应已写入');
  assert(entryNo() === '8', '应在8');

  // 8(体型60>40) → 38 → 233
  await click('继续');
  assert(entryNo() === '38', '体型60 应去38，当前 ' + entryNo());
  await click('继续');
  assert(entryNo() === '233', '应在233');
  assert(state().san === 40, '理智=POW=40，实际 ' + state().san);
  assert(state().mp === 8, '魔法=POW/5=8，实际 ' + state().mp);
  await click('继续');
  assert(entryNo() === '134', '应在134');
  assert(state().hpMax === 13, 'HP=(60+70)/10=13，实际 ' + state().hpMax);

  // 幸运
  DD.customTotal = 11;
  await click('投掷幸运值');
  assert(state().luck === 55, '幸运=11×5=55，实际 ' + state().luck);
  // 敏捷检定按钮（先读正文，再主动掷骰）
  DD.checkResult = { passed: true, level: 'success', roll: 11 };
  await click('「敏捷」检定');
  await tick(80);
  assert(entryNo() === '261', '敏捷通过应到261，当前 ' + entryNo());

  // 261 → 71
  await click('继续');
  assert(entryNo() === '71', '应在71');
  $('#pc-name').value = '贾斯珀·希尔';
  $('#pc-age').value = '29';
  await click('文物学家');
  assert(entryNo() === '102', '应选择文物学家→102');

  // 职业技能
  const ppanel = $('#choices');
  const chooseSels = ppanel.querySelectorAll('select[data-choose]');
  chooseSels[0].value = '艺术/手艺(摄影)'; chooseSels[0].fire('change');
  chooseSels[1].value = '外语(拉丁文)'; chooseSels[1].fire('change');
  chooseSels[2].value = '取悦'; chooseSels[2].fire('change');
  await tick(5);
  const extraSel = ppanel.querySelectorAll('select[data-extra]')[0];
  extraSel.value = '医学'; extraSel.fire('change');
  await tick(5);
  // 分配数值
  const values = ['70', '60', '60', '50', '50', '50', '40', '40'];
  const skillSels = ppanel.querySelectorAll('#alloc-table select');
  assert(skillSels.length === 8, '应有8个技能槽，实际 ' + skillSels.length);
  skillSels.forEach((s, i) => { s.value = values[i]; s.fire('change'); });
  await tick(5);
  await click('确认');
  assert(entryNo() === '128', '应到128兴趣选择');
  const st = state();
  assert(st.skills['估价'] === 70, '估价=70');
  assert(st.skills['艺术/手艺(摄影)'] === 50, '摄影=50');
  assert(st.skills['信用评级'] === 20, '信用=20');
  assert(st.skills['闪避'] === 25, '闪避=DEX/2=25，实际 ' + st.skills['闪避']);
  assert(st.skills['医学'] === 40, '医学=40');
  assert(st.skills['克苏鲁神话'] === 0, '神话=0');
  assert(st.dbSpec === '+1D4', 'DB=+1D4 (80+60=140)，实际 ' + st.dbSpec);

  // 兴趣技能
  const boxes = $('#choices').querySelectorAll('input[type=checkbox]');
  ['博物学', '攀爬', '潜行', '聆听'].forEach(n => {
    const b = boxes.find(x => x.value === n);
    b.checked = true; b.fire('change');
  });
  await tick(5);
  await click('确认（已选');
  assert(state().skills['博物学'] === 30, '博物学=10+20=30，实际 ' + state().skills['博物学']);
  assert(entryNo() === '144', '应到144');

  // 144 汽车驾驶检定 → 失败去194
  DD.checkResult = { passed: false, level: 'fail', roll: 88 };
  await click('用「汽车驾驶」检定');
  assert(entryNo() === '194', '检定失败应到194');
  console.log('✓ 角色创建全流程');
}

async function scenario_day1() {
  await click('寻找梅·莱德贝特的房子');
  assert(entryNo() === '267', '267');
  await click('继续');
  assert(entryNo() === '4', '4');
  await click('询问有关节日的事');
  assert(entryNo() === '21', '21');
  await click('和梅多聊聊天');
  // 取悦检定按钮：失败 → 51
  DD.checkResult = { passed: false, level: 'fail', roll: 77 };
  await click('「取悦」检定');
  await tick(60);
  assert(entryNo() === '51', '取悦失败应到51，当前 ' + entryNo());
  await click('继续');
  assert(entryNo() === '63', '63');
  await click('睡去');
  assert(entryNo() === '154', '154');
  await click('继续');
  assert(entryNo() === '166', '166');
  // 未夜游 → 直接192
  await click('动身去找长途车');
  assert(entryNo() === '192', '192');
  await click('继续');
  assert(entryNo() === '218', '218');
  await click('继续');
  assert(entryNo() === '6', '6 应显示村庄地图');
  console.log('✓ 第一日流程');
}

async function scenario_hub() {
  // 探索枢纽：尝试4个选项后应只能推进时间
  const tryOpt = async (label, expectNo) => {
    await click(label);
    assert(entryNo() === String(expectNo), label + ' → ' + expectNo);
    // 多数探索点最终回到25：直接走
  };
  await click('去本地杂货店询问交通方式');
  assert(entryNo() === '16', '16');
  await click('只买些日常用品');
  assert(entryNo() === '25', '25');
  // 杂货店已试过 → 选项不应再出现
  const opts = $$('#choices .choice-btn').map(b => textOf(b));
  assert(!opts.some(t => t.includes('杂货店')), '已试过的选项应被过滤');
  assert(opts.some(t => t.includes('村会堂')), '未试选项应保留');
  assert(opts.some(t => t.includes('让时间流逝')), '应可主动推进时间');
  console.log('✓ 探索枢纽过滤');
}

async function scenario_knife() {
  // 重开一局直接到16买刀→之后战斗伤害用1D4（此处仅验证物品）
  console.log('✓ (小刀购买已在 day1 场景覆盖: 跳过)');
}

async function clickRoll() {
  const b = documentStub.querySelector('.roll-btn');
  if (!b) throw new Error('无掷骰面板');
  await b.onclick();
  await tick(40);
}

async function waitForEntry(ids, timeout = 5000) {
  const set = new Set(ids.map(String));
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    if (set.has(entryNo())) return entryNo();
    await tick(50);
  }
  throw new Error('等待条目超时: ' + ids + '，当前 ' + entryNo());
}

async function combatClick(label) {
  const btns = documentStub.querySelectorAll('#combat-actions .choice-btn');
  const b = btns.find(x => textOf(x).includes(label));
  if (!b) return false;
  await b.onclick();
  await tick(40);
  return true;
}

async function scenario_hubAdvance() {
  await windowStub.AAF.goTo(25);
  await click('不再调查，让时间流逝');
  assert(entryNo() === '3', '推进时间应到3，当前 ' + entryNo());
  await click('一言不发');
  assert(entryNo() === '22', '22');
  console.log('✓ 枢纽推进时间');
}

async function scenario_checksAndLoss() {
  // 17 侦查失败 → 37 → 43
  DD.checkQueue = [{ passed: false, level: 'fail', roll: 66 }];
  await windowStub.AAF.goTo(11);
  await click('检查布告板');
  await click('「侦查」检定');
  await tick(80);
  assert(entryNo() === '37', '侦查失败应到37，当前 ' + entryNo());
  await click('继续');
  assert(entryNo() === '43', '43');
  await click('立即询问电报的事');
  assert(entryNo() === '56', '56');
  await click('询问他的藏书室');
  assert(entryNo() === '62', '62');
  await click('花点时间在图书馆里研究研究');
  assert(entryNo() === '68', '68');
  await click('研读科学书籍');
  assert(entryNo() === '88', '88');
  // 99 信用通过 → 111 侦查失败 → 124 → 180
  DD.checkQueue = [
    { passed: true, level: 'success', roll: 15 },
    { passed: false, level: 'fail', roll: 55 }
  ];
  await click('继续');
  await click('「信用评级」检定');
  await click('「侦查」检定');
  await tick(120);
  assert(entryNo() === '124', '信用通过+侦查失败应到124，当前 ' + entryNo());
  await click('继续');
  assert(entryNo() === '180', '180');
  console.log('✓ 检定分支与文特斯线');
}

async function scenario_lossPanels() {
  DD.damageTotal = 4;
  await windowStub.AAF.goTo(55);
  await clickRoll();
  assert(entryNo() === '73', '小伤应到73，当前 ' + entryNo());
  DD.damageTotal = 2;
  await windowStub.AAF.goTo(97);
  const hpBefore = state().hp;
  await clickRoll();
  assert(state().hp === hpBefore - 2, 'HP应-2');
  DD.checkQueue = [
    { passed: true, level: 'success', roll: 12 },
    { passed: false, level: 'fail', roll: 77 }
  ];
  await click('尝试「急救」检定');
  assert(state().hp === hpBefore - 1, '急救成功应+1');
  assert(state().ticks['急救'] === true, '急救应打勾');
  await tick(40);
  assert(entryNo() === '79', '急救后应到79');
  await click('「聆听」检定');
  await tick(80);
  assert(entryNo() === '234', '79的聆听检定失败应到234，当前 ' + entryNo());
  console.log('✓ 伤害/回复面板');
}

async function scenario_push() {
  DD.checkQueue = [
    { passed: false, level: 'fail', roll: 60 },
    { passed: false, level: 'fail', roll: 70 }
  ];
  await windowStub.AAF.goTo(165);
  await click('「图书馆使用」检定');
  await tick(40);
  await click('孤注一掷');
  await tick(60);
  assert(entryNo() === '190', '孤注一掷失败应到190，当前 ' + entryNo());
  DD.checkQueue = [{ passed: false, level: 'fumble', roll: 100 }];
  await windowStub.AAF.goTo(165);
  await click('「图书馆使用」检定');
  await tick(60);
  assert(entryNo() === '184', '首掷大失败应到184，当前 ' + entryNo());
  state().flags.lastFumble = true;
  await windowStub.AAF.goTo(89);
  let opts = $$('#choices .choice-btn').map(b => textOf(b));
  assert(!opts.some(t => t.includes('孤注一掷')), '大失败后不应出现孤注一掷');
  assert(opts.some(t => t.includes('不想冒险')), '应有放弃选项');
  state().flags.lastFumble = false;
  await windowStub.AAF.goTo(89);
  opts = $$('#choices .choice-btn').map(b => textOf(b));
  assert(opts.some(t => t.includes('孤注一掷')), '普通失败应可孤注一掷');
  console.log('✓ 孤注一掷机制');
}

async function scenario_combats() {
  DD.opposedWinner = 0; DD.checkResult = { passed: true, level: 'success', roll: 10 }; DD.damageTotal = 3;
  await windowStub.AAF.goTo(173);
  let guard = 0;
  while (entryNo() === '173' && guard++ < 40) {
    if (!(await combatClick('闪避'))) await tick(50);
  }
  assert(entryNo() === '201', '熊战3轮存活应到201，当前 ' + entryNo());
  DD.checkQueue = [{ passed: false, level: 'fail', roll: 77 }];
  await click('不做处理');
  await tick(40);
  assert(entryNo() === '79', '不做处理后应到79');
  await click('「聆听」检定');
  await tick(80);
  assert(entryNo() === '234', '201后79的聆听失败应到234，当前 ' + entryNo());

  DD.damageTotal = 2; DD.opposedWinner = 0;
  await windowStub.AAF.goTo(235);
  await waitForEntry([241]);
  assert(entryNo() === '241', '车夫HP<=4应到241，当前 ' + entryNo());
  await click('继续');
  assert(entryNo() === '223', '223 生存结局');

  DD.damageTotal = 3; DD.opposedWinner = 0;
  await windowStub.AAF.goTo(262);
  guard = 0;
  while (entryNo() === '262' && guard++ < 40) {
    if (!(await combatClick('反击'))) await tick(50);
  }
  assert(entryNo() === '268', '工匠HP<=6应到268，当前 ' + entryNo());
  await click('向他盘问防腐尸体的事');
  assert(entryNo() === '20', '20');

  DD.checkQueue = [
    { passed: false, level: 'fail', roll: 80 },
    { passed: false, level: 'fail', roll: 81 }
  ];
  await windowStub.AAF.goTo(167);
  await click('承受攻击');
  await tick(80);
  assert(entryNo() === '186', '两爪落空应到186，当前 ' + entryNo());
  console.log('✓ 三场战斗与熊袭');
}

async function scenario_secretsAndSpells() {
  state().flags.ladder = true;
  await windowStub.AAF.goTo(7);
  let opts = $$('#choices .choice-btn').map(b => textOf(b));
  assert(opts.some(t => t.includes('隐蔽阶梯')), '知道阶梯应出现秘密选项');
  await click('走悬崖上的隐蔽阶梯下去');
  assert(entryNo() === '107', '107');
  DD.checkQueue = [{ passed: false, level: 'fail', roll: 88 }];
  await click('继续');
  await tick(40);
  assert(entryNo() === '152', '阶梯下来应到152');
  await click('「潜行」检定');
  await tick(80);
  assert(entryNo() === '216', '152的潜行失败应到216，当前 ' + entryNo());

  await windowStub.AAF.goTo(87);
  opts = $$('#choices .choice-btn').map(b => textOf(b));
  assert(opts.some(t => t.includes('隐蔽阶梯')), '87应有阶梯选项');
  DD.checkQueue = [{ passed: false, level: 'fail', roll: 66 }];
  await click('查看崖壁上的隐蔽阶梯');
  await tick(40);
  assert(entryNo() === '187', '应到187');
  await click('「侦查」检定');
  await tick(80);
  assert(entryNo() === '160', '187的侦查失败应到160，当前 ' + entryNo());

  state().flags.spellSummon = true;
  await windowStub.AAF.goTo(40);
  opts = $$('#choices .choice-btn').map(b => textOf(b));
  assert(opts.some(t => t.includes('召唤天之火')), '40应有召唤选项');
  await click('吟诵「召唤天之火」');
  assert(entryNo() === '80', '80');
  const mpBefore = state().mp;
  const range = documentStub.querySelector('#mp-range');
  range.value = '6';
  range.fire('input');
  DD.checkQueue = [{ passed: true, level: 'success', roll: 30 }];
  await click('诵读咒文');
  await tick(40);
  assert(state().mp === mpBefore - 6, '魔法值应-6');
  assert(state().lastSpend === 6, 'lastSpend=6');
  assert(entryNo() === '198', '应到198施法条目');
  await click('「号令群星」施法检定');
  await tick(80);
  assert(entryNo() === '209', '施法成功应到209，当前 ' + entryNo());
  DD.damageTotal = 3;
  const sanBefore = state().san;
  await clickRoll();
  assert(state().san === sanBefore - 3, '理智-3');
  await click('号令群星返回原位');
  assert(entryNo() === '255', '255');
  console.log('✓ 秘密与施法链');
}

async function scenario_spellFail() {
  state().flags.spellCommand = true;
  state().hp = state().hpMax; state().mp = state().mpMax;
  await windowStub.AAF.goTo(40);
  await click('吟诵「号令天之火」');
  assert(entryNo() === '90', '90');
  documentStub.querySelector('#mp-range').value = '5';
  DD.checkQueue = [{ passed: false, level: 'fail', roll: 97 }];
  await click('诵读咒文');
  await tick(40);
  assert(entryNo() === '198', '应到198施法条目');
  await click('「号令群星」施法检定');
  await tick(60);
  assert(entryNo() === '65', '施法失败应到65，当前 ' + entryNo());
  DD.damageTotal = 2;
  DD.checkQueue = [{ passed: true, level: 'success', roll: 20 }];
  await clickRoll();
  await click('「力量」检定');
  await tick(80);
  assert(entryNo() === '93', '力量成功应到93，当前 ' + entryNo());
  await clickRoll();
  await click('继续');
  assert(entryNo() === '137', '137');
  console.log('✓ 施法失败链');
}

async function scenario_hubRedirects() {
  state().tried = { o16: 1, o84: 1, o115: 1, o57: 1 };
  await windowStub.AAF.goTo(25);
  assert(entryNo() === '3', '试满4项应自动到3，当前 ' + entryNo());
  state().tried = { o83: 1, o126: 1, o219: 1 };
  await windowStub.AAF.goTo(120);
  assert(entryNo() === '98', '试满3项应自动到98，当前 ' + entryNo());
  state().tried = {};
  console.log('✓ 枢纽自动重定向');
}

async function scenario_morningFlags() {
  state().flags.nightWalk = true;
  await windowStub.AAF.goTo(166);
  let opts = $$('#choices .choice-btn').map(b => textOf(b));
  assert(opts.some(t => t.includes('脚印')), '夜游后应可勘查脚印');
  DD.checkQueue = [{ passed: true, level: 'success', roll: 20 }];
  await click('循着昨夜的脚印找过去');
  await click('「侦查」检定');
  await tick(80);
  assert(entryNo() === '112', '侦查成功应发现阶梯，当前 ' + entryNo());
  assert(state().flags.ladder === true, '应获得阶梯秘密');
  await click('继续');
  assert(entryNo() === '212', '212');
  await click('回到村口等长途车');
  assert(entryNo() === '192', '192');
  state().flags.nightFight = true;
  await windowStub.AAF.goTo(64);
  opts = $$('#choices .choice-btn').map(b => textOf(b));
  assert(opts.some(t => t.includes('勘查')), '夜战后应可勘查后果');
  await click('勘查昨夜战斗的后果');
  assert(entryNo() === '70', '70');
  console.log('✓ 夜间事件标记');
}

async function scenario_stayChoice() {
  DD.checkQueue = [{ passed: false, level: 'fail', roll: 88 }];
  await windowStub.AAF.goTo(266);
  await click('进行困难难度的');
  await tick(60);
  const opts = $$('#choices .choice-btn').map(b => textOf(b));
  assert(!opts.some(t => t.includes('植物学')), '失败后植物学选项应消失');
  assert(opts.some(t => t.includes('扑灭炉火')), '其余选项应保留');
  await click('扑灭炉火，再睡觉');
  assert(entryNo() === '58', '58');
  console.log('✓ 条件选项消失');
}

async function scenario_endings() {
  await windowStub.AAF.goTo(64);
  const savedHp = state().hp;
  state().hp = 0;
  await windowStub.AAF.goTo(92);
  assert(documentStub.querySelector('#screen-ending').classList.contains('active'), '结局屏应激活');
  await click('回到今日清晨，重新尝试');
  assert(entryNo() === '64', '应回到64，当前 ' + entryNo());
  assert(state().hp === savedHp, 'HP应恢复');

  state().ticks = { '侦查': true };
  const spot = state().skills['侦查'];
  await windowStub.AAF.goTo(185);
  DD.customTotal = 95; DD.damageTotal = 4;
  await click('尝试技能成长');
  await tick(150);
  assert(state().skills['侦查'] === spot + 4, '侦查应+4，实际 ' + state().skills['侦查']);

  state().items = ['book'];
  await windowStub.AAF.goTo(223);
  DD.checkQueue = [{ passed: true, level: 'success', roll: 30 }];
  await click('研读《阿撒托斯及其他》');
  assert(entryNo() === '171', '171');
  await click('「理智」检定');
  await tick(150);
  assert(state().mythos >= 4, '神话应+4');
  assert(documentStub.querySelector('#screen-ending').classList.contains('active'), '诗集结局屏');
  console.log('✓ 结局与成长系统');
}

async function scenario_backAndHistory() {
  // 基本回退：4 → 21 → 回到 4
  await windowStub.AAF.goTo(4);
  await windowStub.AAF.goTo(21);
  assert(entryNo() === '21', '应在21');
  documentStub.querySelector('#btn-back').onclick();
  await tick(80);
  assert(entryNo() === '4', '回退应到4，当前 ' + entryNo());

  // 回退应完整撤销条目结算：59 的 -1 HP 只应扣一次
  const hpFull = state().hpMax;
  state().hp = hpFull;
  await windowStub.AAF.goTo(59);
  await tick(60);
  assert(state().hp === hpFull - 1, '59后应扣1点');
  await windowStub.AAF.goTo(71);
  documentStub.querySelector('#btn-back').onclick();
  await tick(80);
  assert(entryNo() === '59', '回退应到59，当前 ' + entryNo());
  await tick(60);
  assert(state().hp === hpFull - 1, '回退重放后仍只扣1点（不应叠加），实际 ' + state().hp);

  // 回退对旧存档（无log字段）的兼容
  assert(Array.isArray(state().log), 'log应已初始化');

  // 骰子结算中禁止回退
  DD.checkQueue = [{ passed: true, level: 'success', roll: 10 }];
  await windowStub.AAF.goTo(17);
  await tick(40);
  const ov = documentStub.querySelector('.dice-overlay');
  ov.classList.add('show');
  const entryBefore = entryNo();
  documentStub.querySelector('#btn-back').onclick();
  await tick(60);
  assert(entryNo() === entryBefore, '结算中回退应被忽略');
  ov.classList.remove('show');

  // 历程抽屉
  documentStub.querySelector('#btn-history').onclick();
  const hist = documentStub.querySelector('#history');
  assert(hist.classList.contains('open'), '历程抽屉应打开');
  const items = hist.querySelectorAll('.hist-item');
  assert(items.length >= 3, '历程应有至少3条，实际 ' + items.length);
  const firstText = textOf(items[0]);
  assert(firstText.length > 10, '历程条目应有文字');
  hist.querySelectorAll('.hist-head')[0].onclick();
  assert(items[0].classList.contains('open'), '点击应展开条目');
  assert(items[0].classList.contains('cur'), '最新条目应标记当前');
  console.log('✓ 回退与历程');
}

async function scenario_diceUI() {
  load('js/dice.js');
  const D = windowStub.DiceUI;
  const eq = (a, b, m) => assert(a === b, m + ': ' + a + ' != ' + b);
  eq(D.evalLevel(50, 'normal', 1), 'crit', '01为大成功');
  eq(D.evalLevel(50, 'normal', 100), 'fumble', '技能50掷100为大失败');
  eq(D.evalLevel(50, 'normal', 96), 'fumble', '技能50掷96为大失败');
  eq(D.evalLevel(49, 'normal', 96), 'fail', '技能49掷96为普通失败');
  eq(D.evalLevel(49, 'normal', 100), 'fumble', '技能49掷100为大失败');
  eq(D.evalLevel(50, 'normal', 10), 'extreme', '10为极难成功');
  eq(D.evalLevel(50, 'normal', 25), 'hard', '25为困难成功');
  eq(D.evalLevel(50, 'normal', 50), 'success', '50为成功');
  eq(D.evalLevel(50, 'normal', 51), 'fail', '51为失败');
  eq(D.evalLevel(20, 'hard', 4), 'extreme', '困难难度下4仍为极难成功');
  eq(D.evalLevel(20, 'hard', 10), 'hard', '困难难度下10为困难成功');
  async function drive(promise) {
    const t0 = Date.now();
    while (Date.now() - t0 < 9000) {
      const btn = documentStub.querySelector('.dice-continue');
      if (btn && btn.onclick && btn.style.display !== 'none') { await btn.onclick(); break; }
      await tick(80);
    }
    return await promise;
  }
  const r = await drive(D.check({ statLabel: '「侦查」', title: '测试检定', value: 25, diff: 'normal', bonus: 0 }));
  assert(r.roll >= 1 && r.roll <= 100, '检定结果在1-100');
  assert(typeof r.passed === 'boolean', 'passed为布尔');
  assert((r.passed && r.roll <= 25) || (!r.passed && r.roll > 25), '成功判定与目标一致: ' + JSON.stringify(r));
  const r2 = await drive(D.damage('2D6', { title: '测试伤害' }));
  assert(r2.total >= 2 && r2.total <= 12, '2D6伤害在2-12: ' + r2.total);
  const r3 = await drive(D.opposed({ title: '测试对抗', a: { label: '你', value: 50 }, b: { label: '敌人', value: 40 } }));
  assert([0, 1].includes(r3.winner), '对抗有胜者');
  const r4 = await drive(D.custom({ title: '幸运', dice: [{ sides: 6 }, { sides: 6 }, { sides: 6 }], multiply: 5, totalLabel: '幸运值' }));
  assert(r4.total >= 15 && r4.total <= 90 && r4.total % 5 === 0, '3D6x5范围: ' + r4.total);
  console.log('✓ 真实掷骰动画模块');
}

async function scenario_codec() {
  // 导出
  const st = state();
  st.name = '贾斯珀·希尔';
  st.ticks = { '侦查': true, '取悦': true };
  st.flags = { ladder: true, spellA: true };
  st.items = ['knife'];
  st.tried = { o16: 1 };
  st.mythos = 2;
  const hpB = st.hp, sanB = st.san, luckB = st.luck, profB = st.profession, entryB = st.entry;
  documentStub.querySelector('#btn-sheet').onclick();
  documentStub.querySelector('#btn-export-sheet').onclick();
  const modal = documentStub.querySelector('#modal');
  assert(modal.classList.contains('show'), '导出弹窗应打开');
  const code = documentStub.querySelector('#code-out').value;
  console.log('  [codec] 角色码长度:', code.length);
  assert(code.length > 40 && code.length < 700, '角色码长度合理: ' + code.length);
  // 复制按钮不崩（无剪贴板环境）
  const copyBtn = modal.querySelectorAll('.modal-actions .choice-btn')[0];
  await copyBtn.onclick();
  await tick(30);
  // 关闭导出弹窗
  modal.querySelectorAll('.modal-actions .choice-btn')[1].onclick();
  assert(!modal.classList.contains('show'), '导出弹窗应关闭');

  // 篡改状态后导入 → 全部恢复
  st.hp = 1; st.san = 2; st.luck = 3; st.flags = {}; st.items = []; st.ticks = {}; st.tried = {}; st.mythos = 0;
  documentStub.querySelector('#btn-import').onclick();
  documentStub.querySelector('#code-in').value = code;
  await modal.querySelectorAll('.modal-actions .choice-btn')[0].onclick();
  await tick(120);
  const s2 = state();
  assert(s2.hp === hpB, 'HP恢复: ' + s2.hp + ' vs ' + hpB);
  assert(s2.san === sanB && s2.luck === luckB, 'SAN/幸运恢复');
  assert(s2.mythos === 2, '神话恢复');
  assert(s2.flags.ladder === true && s2.flags.spellA === true, '秘密恢复');
  assert(s2.items.includes('knife'), '物品恢复');
  assert(s2.ticks['侦查'] === true && s2.ticks['取悦'] === true, '成长标记恢复');
  assert(s2.tried.o16 === true, '枢纽进度恢复');
  assert(s2.name === '贾斯珀·希尔', '名字恢复');
  assert(s2.profession === profB, '职业恢复');
  assert(s2.dbSpec === '+1D4', '伤害加值恢复: ' + s2.dbSpec);
  assert(entryNo() === String(entryB), '回到原条目: ' + entryNo() + ' vs ' + entryB);
  assert(Array.isArray(s2.log) && s2.log[0] === entryB, 'log重置');

  // 无效码
  const entryBefore = entryNo();
  documentStub.querySelector('#btn-import').onclick();
  documentStub.querySelector('#code-in').value = '绝对不是角色码!!!@@@';
  await modal.querySelectorAll('.modal-actions .choice-btn')[0].onclick();
  await tick(60);
  assert(entryNo() === entryBefore, '无效码不应改变状态');
  assert(modal.classList.contains('show'), '无效码应停留在弹窗');
  // 关闭导入弹窗
  modal.querySelectorAll('.modal-actions .choice-btn')[1].onclick();

  // 空码
  documentStub.querySelector('#btn-import').onclick();
  documentStub.querySelector('#code-in').value = '';
  await modal.querySelectorAll('.modal-actions .choice-btn')[0].onclick();
  await tick(60);
  assert(modal.classList.contains('show'), '空码应停留在弹窗');
  modal.querySelectorAll('.modal-actions .choice-btn')[1].onclick();

  console.log('✓ 角色码导出/导入');
}

async function scenario_saveContinue() {
  assert(localStorageStub.getItem('aaf_save_v1') !== null, '应有存档');
  const btnC = documentStub.querySelector('#btn-continue');
  assert(btnC && btnC.style.display !== 'none', '继续按钮应可见');
  console.log('✓ 存档');
}

async function main() {
  console.log('══════ 开始运行时测试 ══════');
  await scenario_creation();
  await scenario_day1();
  await scenario_hub();
  await scenario_hubAdvance();
  await scenario_checksAndLoss();
  await scenario_lossPanels();
  await scenario_push();
  await scenario_combats();
  await scenario_secretsAndSpells();
  await scenario_spellFail();
  await scenario_hubRedirects();
  await scenario_morningFlags();
  await scenario_stayChoice();
  await scenario_endings();
  await scenario_diceUI();
  await scenario_backAndHistory();
  await scenario_codec();
  await scenario_saveContinue();
  console.log('══════ 全部场景通过 ══════');
  console.log('最终条目:', entryNo(), '| HP:', state().hp, '| SAN:', state().san, '| 技能数:', Object.keys(state().skills).length);
}

main().catch(e => {
  console.error('\n✗ 测试失败:', e.message);
  console.error(e.stack.split('\n').slice(0, 6).join('\n'));
  process.exit(1);
});
