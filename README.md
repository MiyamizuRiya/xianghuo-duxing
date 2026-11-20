# 向火独行 · 网页版

《克苏鲁的呼唤》第七版官方单人冒险 *Alone Against the Flames* 的网页游戏化改编。
270 个条目全部收录，支持角色创建、掷骰动画、战斗、理智系统、存档与角色码分享。

## 游玩

- 直接打开 `index.html`，或部署任意静态托管（GitHub Pages / Netlify）
- 单文件版 `向火独行.html`（图片与样式全部内联，可单独分享）
- 存档保存在浏览器 localStorage；角色卡可导出为角色码，在任意设备导入续玩

## 项目结构

```
index.html          页面结构（多文件版入口）
css/style.css       视觉样式
js/data1-4.js       270 条剧情数据
js/dice.js          掷骰动画与音效
js/combat.js        战斗系统（黑熊/车夫/工匠）
js/engine.js        游戏引擎（状态/检定/存档/回退/角色码）
assets/img/         模组插图
向火独行.html       单文件发行版（构建产物）
发布/               部署目录
```

## 修改与构建

1. 修改剧情改 `js/data*.js`；改机制改 `js/engine.js`；改外观改 `css/style.css`
2. `node _validate.js` 校验数据完整性；`node _runtime_test.js` 运行全部自动化场景
3. `python _build_single.py` 重新生成单文件版
4. `cp 向火独行.html 发布/index.html` 更新部署目录

修改 `index.html` 中的 `?v=N` 版本号可强制浏览器刷新缓存。

## 版权

原作：Gavin Inglis / Chaosium《Call of Cthulhu》7 版快速开始规则单人冒险（官网免费发布）
汉化：七宫涟（纯美苹果园）。本改编仅供个人学习与朋友间分享。
