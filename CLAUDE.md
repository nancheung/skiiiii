# CLAUDE.md

刃线 Edgeline：单板滑雪物理模拟网页游戏。纯静态站点，Three.js r128（cdnjs UMD 全局 `THREE`），无构建步骤。

## 结构

- `index.html` — 页面骨架与 HUD、触屏控件、开始 / 结束卡片
- `css/style.css` — HUD 样式（设计 token 在 `:root`）
- `js/game.js` — 全部逻辑：雪道几何 `H(x,z)`、渲染、骑手骨骼、雪板物理、输入、HUD
- `tests/physics.test.js` — 用假渲染器在 Node 里驱动 `step()` 的回归测试

## 约定

- 物理用固定步长 `STEP = 1/120` 秒；`step(dt, inp)` 只改 `st`，不碰渲染。渲染在 `updateVisual()` 里读 `st`。
- 坐标：下坡为 `-z`，`s = -z`。`f(yaw) = (sin yaw, 0, cos yaw)`。脚尖方向 `T = F × n`。立刃角正值为前刃。
- 板局部坐标：X 指板头，Y 为板面法线，Z 指脚尖一侧。骑手面朝 +Z，默认 regular 站姿（左脚在前）。
- 输入 `steer` 为正表示「往屏幕左边」。
- 改物理参数（`EMAX`、`RSC`、摩擦系数、起跳力度、跳台形状 `KH`）后必须跑 `npm test`，并在测试里补上新动作的场景。
- `window.__edgeline` 暴露给测试用，不要删。

## 命令

```bash
npm install
npm test
npm run dev   # http://localhost:8080
```
