/* 数据完整性校验：条目齐全 / 跳转目标存在 / 检定属性合法 / 特殊处理器已实现 / 可达性 */
const fs = require('fs');
global.window = {};

for (const f of ['js/data1.js', 'js/data2.js', 'js/data3.js', 'js/data4.js']) {
  new Function('window', fs.readFileSync(f, 'utf8'))(window);
}
const E = window.ENTRIES;

const engineSrc = fs.readFileSync('js/engine.js', 'utf8');
const combatSrc = fs.readFileSync('js/combat.js', 'utf8');

let errors = [], warns = [];

// 1. 条目齐全
for (let i = 1; i <= 270; i++) {
  if (!E[i]) errors.push(`缺少条目 ${i}`);
}

// 2. 合法属性/技能名
const ATTRS = ['力量', '体质', '体型', '敏捷', '外貌', '智力', '意志', '教育', '幸运', '理智'];
const SKILLS = ['侦查', '聆听', '图书馆使用', '博物学', '急救', '格斗(斗殴)', '闪避', '潜行', '攀爬',
  '汽车驾驶', '骑术', '追踪', '乔装', '锁匠', '恐吓', '取悦', '说服', '话术', '心理学', '考古学',
  '历史', '估价', '法律', '医学', '科学(植物学)', '科学(生物学)', '科学(药学)',
  '艺术/手艺(摄影)', '艺术/手艺(绘画)', '艺术/手艺(修复)', '外语(拉丁文)', '外语(法语)', '外语(德语)', '母语', '信用评级'];

const validTarget = t => typeof t === 'number' ? (t >= 1 && t <= 270 && !!E[t]) : (t === 'fire' || t === 'club');

// 3. 遍历所有条目检查字段
for (const [id, e] of Object.entries(E)) {
  const num = Number(id);
  const tag = `条目${id}`;
  if (!Array.isArray(e.t) || !e.t.length) warns.push(`${tag}: 无正文`);

  (e.choices || []).forEach((c, i) => {
    if (c.to !== undefined && !validTarget(c.to)) errors.push(`${tag}: 选项"${c.t}"目标 ${c.to} 不存在`);
    if (c.check) {
      if (!SKILLS.includes(c.check.stat) && !ATTRS.includes(c.check.stat)) errors.push(`${tag}: 选项检定属性 ${c.check.stat} 未知`);
      if (c.check.succ === undefined) errors.push(`${tag}: 选项检定无 succ`);
      if (c.check.fail !== 'stay' && c.check.fail === undefined) errors.push(`${tag}: 选项检定无 fail`);
    }
    if (c.to === undefined && !c.check) errors.push(`${tag}: 选项"${c.t}"无目标`);
  });

  if (e.check) {
    const ck = e.check;
    if (!SKILLS.includes(ck.stat) && !ATTRS.includes(ck.stat)) errors.push(`${tag}: 检定属性 ${ck.stat} 未知`);
    if (ck.succ === undefined && !ck.optional && !ck.push && ck.always === undefined) errors.push(`${tag}: 检定无 succ`);
    if (ck.succ !== undefined && !validTarget(ck.succ)) errors.push(`${tag}: 检定 succ ${ck.succ} 不存在`);
    if (ck.fail !== undefined && !validTarget(ck.fail)) errors.push(`${tag}: 检定 fail ${ck.fail} 不存在`);
    if (ck.fumble !== undefined && !validTarget(ck.fumble)) errors.push(`${tag}: 检定 fumble ${ck.fumble} 不存在`);
    if (ck.always !== undefined && !validTarget(ck.always)) errors.push(`${tag}: 检定 always ${ck.always} 不存在`);
    if (ck.after !== undefined && !validTarget(ck.after)) errors.push(`${tag}: 检定 after ${ck.after} 不存在`);
    if (ck.push) {
      if (!validTarget(ck.push.failPush)) errors.push(`${tag}: push.failPush 不存在`);
      if (!validTarget(ck.push.fumbleFirst)) errors.push(`${tag}: push.fumbleFirst 不存在`);
    }
  }

  (e.fx || []).forEach(fx => {
    if (fx.zeroGo !== undefined && !validTarget(fx.zeroGo)) errors.push(`${tag}: zeroGo ${fx.zeroGo} 不存在`);
    if (fx.tick && !SKILLS.includes(fx.tick)) errors.push(`${tag}: tick 技能 ${fx.tick} 未知`);
    if (fx.skill && !SKILLS.includes(fx.skill[0])) errors.push(`${tag}: skill ${fx.skill[0]} 未知`);
    if (fx.item && !['knife', 'book'].includes(fx.item)) errors.push(`${tag}: item ${fx.item} 未知`);
  });

  if (e.special) {
    const re = new RegExp('(^|\\n)\\s{4}(async\\s+)?' + e.special + '\\s*\\(', 'm');
    if (!re.test(engineSrc)) errors.push(`${tag}: special '${e.special}' 未在 engine 中实现`);
    if (e.special === 'combat' && !combatSrc.includes(`${e.combat}:`)) errors.push(`${tag}: combat '${e.combat}' 未配置`);
  }

  if (e.ending && !['death', 'survival', 'pyrrhic', 'transcend', 'mythos'].includes(e.ending.type)) errors.push(`${tag}: ending.type ${e.ending.type} 未知`);
}

// 4. CSS 按钮可见性检查：取消动画的按钮选择器必须显式设置 opacity
const cssSrc = fs.readFileSync('css/style.css', 'utf8');
for (const m of cssSrc.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
  const sel = m[1], body = m[2];
  if (/animation\s*:\s*none/.test(body) && /(choice-btn|roll-btn|title-btn|prof-btn|dice-continue)/.test(sel) && !/opacity\s*:/.test(body)) {
    errors.push(`CSS: 选择器 "${sel.trim().split('\n').join(' ')}" 取消了动画但未设置 opacity，按钮可能不可见`);
  }
}

// 5. 特殊处理器实现核对（engine 中定义了但数据未用 / 数据用了但未定义）
const specialDefs = [...engineSrc.matchAll(/^\s{4}\/\* ([^：]+)：/gm)].map(m => m[1]);
const usedSpecials = new Set(Object.values(E).map(e => e.special).filter(Boolean));

// 特殊处理器的内部跳转目标（人工核对映射）
const SPECIAL_TARGETS = {
  luggage: [23, 38], assignAttrs: [8], derived: [134], hpLuckDex: [261, 59],
  identity: [102, 226, 239, 249, 265], profession: [128], interest: [144],
  cliffPath: [120, 42, 36], fallDamage: [92, 67, 73], fallCheck: [92, 82],
  gash: [92, 79], sleepless: [64], morningAfter: [178, 192], day3morning: [70, 78],
  chaseMan: [172, 87], fleeBear: [161, 167], pyreSpells: [50, 80, 90, 65],
  mpSpend: [198, 65], starSpell: [209, 65], bearMaul: [193, 179, 186],
  combat_bell: null
};
const COMBAT_TARGETS = { bear: [201, 193], carter: [241, 247], craftsman: [268, 2, 12] };

// 5. 可达性（从 1 出发）
const reach = new Set();
const queue = [1];
const seen = new Set(['1']);
const pushTarget = t => {
  const key = String(t);
  if (validTarget(t) && !seen.has(key)) { seen.add(key); queue.push(t); }
};
while (queue.length) {
  const id = queue.shift();
  reach.add(id);
  const e = E[id];
  if (!e) continue;
  (e.choices || []).forEach(c => {
    if (c.to !== undefined && (!c.secret)) pushTarget(c.to);
    if (c.check) { if (c.check.succ !== undefined) pushTarget(c.check.succ); if (c.check.fail !== undefined && c.check.fail !== 'stay') pushTarget(c.check.fail); }
  });
  if (e.check) {
    if (e.check.succ !== undefined) pushTarget(e.check.succ);
    if (e.check.fail !== undefined) pushTarget(e.check.fail);
    if (e.check.fumble !== undefined) pushTarget(e.check.fumble);
    if (e.check.always !== undefined) pushTarget(e.check.always);
    if (e.check.after !== undefined) pushTarget(e.check.after);
    if (e.check.push) { pushTarget(e.check.push.failPush); pushTarget(e.check.push.fumbleFirst); }
  }
  (e.fx || []).forEach(fx => { if (fx.zeroGo !== undefined) pushTarget(fx.zeroGo); });
  if (e.special && SPECIAL_TARGETS[e.special]) SPECIAL_TARGETS[e.special].forEach(pushTarget);
  if (e.special === 'combat' && COMBAT_TARGETS[e.combat]) COMBAT_TARGETS[e.combat].forEach(pushTarget);
  if (e.ending) continue;
}
const unreachable = [];
for (let i = 1; i <= 270; i++) if (E[i] && !reach.has(i)) unreachable.push(i);

console.log('条目总数:', Object.keys(E).length - 2, '(+2 衍生结局)');
console.log('可达条目:', [...reach].filter(x => typeof x === 'number').length);
if (unreachable.length) warns.push('静态不可达（可能经由特殊流程到达）: ' + unreachable.join(', '));
console.log('已用的特殊处理器:', [...usedSpecials].join(', '));
if (errors.length) { console.log('\n===== 错误 ====='); errors.forEach(x => console.log('✗', x)); }
else console.log('\n✓ 无结构错误');
if (warns.length) { console.log('\n===== 提示 ====='); warns.forEach(x => console.log('…', x)); }
process.exit(errors.length ? 1 : 0);
