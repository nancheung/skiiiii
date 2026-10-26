# CLAUDE.md

刃线 Edgeline：单板滑雪物理模拟网页游戏。纯静态站点，Three.js r128（cdnjs UMD 全局 `THREE`），无构建步骤。

## 结构

- `index.html` — 页面骨架与 HUD、小地图、触屏控件、开始 / 结束卡片（含雪道选择、音频开关）
- `css/style.css` — HUD 样式（设计 token 在 `:root`）
- `js/game.js` — 全部游戏逻辑：雪山与雪道几何（`PISTES`、`Hbase`、`H(x,z)`、`surfaceAt`）、渲染、骑手骨骼、雪板物理、输入、HUD
- `js/audio.js` — Web Audio 合成 BGM 与音效，暴露 `window.EdgelineAudio`；没有 `AudioContext` 时是空操作
- `audio/` — 可选的替换音频，`manifest.json` 登记文件（说明见 `audio/README.md`）
- `tests/boot.js` — 测试启动器：假渲染器 / 假 DOM 下加载 `game.js`
- `tests/*.test.js` — `physics`（基本动作）、`mountain`（地形）、`terrain-physics`（各地形上的物理、事件）

## 约定

- 物理用固定步长 `STEP = 1/120` 秒；`step(dt, inp)` 只改 `st`，不碰渲染。渲染在 `updateVisual()` 里读 `st`。
- 坐标：下坡为 `-z`，`s = -z`。终点在 `s = FINISH`（3600）。雪道 `i` 的中线 `laneAt(i, s)`，半宽 `halfAt(i, s)`。`f(yaw) = (sin yaw, 0, cos yaw)`。脚尖方向 `T = F × n`。立刃角正值为前刃。
- 板局部坐标：X 指板头，Y 为板面法线，Z 指脚尖一侧。骑手面朝 +Z，默认 regular 站姿（左脚在前）。
- 输入 `steer` 为正表示「往屏幕左边」。
- 改物理参数（`EMAX`、`RSC`、摩擦系数、起跳力度、粉雪 `PW_*`、卡刃 / 自动守刃 `GUARD_*` `CATCH_*` `SIDE_SLIP` `LAND_LAT`）或地形（`PISTES` 的 `knots`/`zones`、`KICK`、蘑菇 `MOG*`）后必须跑 `npm test`，并在测试里补上新动作 / 新地形的场景。
- 地形特征（蘑菇、跳台）只能往 `Hbase` 上加高度（≥0），远处网格用 `Hbase` 采样，细网格盖在上面。
- `step()` 不直接调音频或改界面：往 `fx` 队列里 `emit({type,...})`，由帧循环 `drainFx` 分发给 `EdgelineAudio.event` 和横幅。
- r128 的 `InstancedMesh` 不会按实例算包围球：要么分块手动设 `geometry.boundingSphere`，要么 `frustumCulled = false`。
- `window.__edgeline` 暴露给测试用，不要删。

## 命令

```bash
npm install
npm test
npm run dev   # http://localhost:8080
```
