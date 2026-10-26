// 雪板物理回归测试：在 Node 里用假的渲染器跑 js/game.js，直接驱动 step()。
// 运行：npm test
const test = require('node:test');
const assert = require('node:assert');
const { boot, DT, IDLE, deg } = require('./boot');

const { E, popup } = boot();
const st = E.st;
const run = (sec, inp = {}) => { for (let i = 0; i < sec * 120; i++) E.step(DT, { ...IDLE, ...inp }); };

test('直滑会加速，速度在合理范围', () => {
  E.placeAt(4); run(4);
  const v = st.v.length();
  assert.ok(v > 3 && v < 12, `4 秒后速度 ${v.toFixed(2)} m/s`);
  assert.equal(st.crashed, false);
});

test('立刃进入刻滑并转弯，不摔', () => {
  E.placeAt(60); run(3);
  const yaw0 = st.yaw;
  run(1, { steer: 1, steerSm: 1 });
  assert.equal(st.mode, 'carve');
  assert.ok(Math.abs(deg(st.yaw - yaw0)) > 20, '偏航变化应超过 20°');
  assert.equal(st.crashed, false);
});

test('推坡能把速度刹下来', () => {
  E.placeAt(500); run(4);
  const v0 = st.v.length();
  run(2.5, { brake: true });
  assert.ok(st.v.length() < v0 * 0.6, `刹车前 ${v0.toFixed(1)}，刹车后 ${st.v.length().toFixed(1)}`);
  assert.equal(st.crashed, false);
});

test('Nose Butter 360', () => {
  E.placeAt(60); run(2);
  run(1.3, { lean: 1, steer: 1 });
  run(1);
  assert.match(popup(), /Nose Butter 360/);
});

test('平地 Nollie 360 被识别为 Nollie FS/BS 360', () => {
  E.placeAt(30); run(3);
  run(0.5, { jump: true, lean: 1, steer: 1, steerSm: 1 });
  run(DT, { lean: 1, steer: 1 });
  assert.equal(st.air, true);
  let t = 0;
  while (st.air && t < 3) { run(DT, { steer: Math.abs(st.airYaw) < 2 * Math.PI - 0.6 ? 1 : 0 }); t += DT; }
  assert.equal(st.crashed, false);
  assert.match(popup(), /Nollie (FS|BS) 360/);
});

test('跳台起跳，滞空 1–2.5 秒并安全落地', () => {
  const k = E.KICK[0];
  E.placeAt(k.s - 45, k.p);
  st.p.x = E.pisteX(k.p, k.s - 45) + k.u; st.p.y = E.H(st.p.x, st.p.z);
  let i = 0; while (!st.air && i < 20 * 120) { E.step(DT, IDLE); i++; }
  let air = 0; while (st.air && air < 5) { E.step(DT, IDLE); air += DT; }
  assert.ok(air > 1 && air < 2.5, `滞空 ${air.toFixed(2)} s`);
  assert.equal(st.crashed, false);
});

test('横着板落地会摔', () => {
  E.placeAt(30); run(3);
  run(0.5, { jump: true });
  run(DT);
  st.yaw += Math.PI / 2; // 强行把板转成横的
  let t = 0; while (st.air && t < 3) { run(DT); t += DT; }
  assert.equal(st.crashed, true);
});
