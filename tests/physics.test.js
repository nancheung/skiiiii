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

/* ---------- 卡刃：只有横滑时下坡刃真的压进雪里、或者板横着高速落地才摔 ---------- */
const crashes = () => E.fx.filter(e => e.type === 'crash').map(e => e.reason);
const slipDeg = () => deg(Math.atan2(Math.abs(st.vl), Math.abs(st.vf) + 0.05));
const fresh = (s, p = 2) => { E.fx.length = 0; E.placeAt(s, p); };

test('刻平花：刻滑 → 平花 45°/135°/180° → 同向或反向接刻滑，不卡刃并很快回到刻滑', () => {
  for (const dur of [0.2, 0.5, 0.7]) for (const dir of [1, -1]) {
    fresh(1000); run(2); run(1.2, { steer: 1, steerSm: 1 });
    run(dur, { lean: 1, steer: 1 });
    let back = -1;
    for (let t = 0; t < 1.5 && !st.crashed; t += DT) { run(DT, { steer: dir, steerSm: dir }); if (back < 0 && st.mode === 'carve' && slipDeg() < 10) back = t; }
    assert.deepEqual(crashes(), [], `平花 ${dur}s 后拨 ${dir}`);
    assert.ok(back >= 0 && back < 0.8, `平花 ${dur}s 后拨 ${dir}：${back < 0 ? '没回到刻滑' : back.toFixed(2) + ' s 才回到刻滑'}`);
  }
});

test('刻平花：平花约 90° 板横过来，不管往哪边拨都不卡刃（推坡或接刻滑）', () => {
  for (const dir of [1, -1]) {
    fresh(1000); run(2); run(1.2, { steer: 1, steerSm: 1 }); run(0.35, { lean: 1, steer: 1 });
    run(1.5, { steer: dir, steerSm: dir });
    assert.deepEqual(crashes(), [], `拨 ${dir}`);
  }
});

test('角度差一点：板偏 30° 时不管往哪边拨，都顺势咬住上坡刃刻过去', () => {
  let upCarve = 0;
  for (const off of [30, -30]) for (const s of [1, -1]) {
    fresh(1000); run(3);
    st.yaw += off * Math.PI / 180; run(DT);
    const up = st.vl > 0 ? -1 : 1; // 上坡刃（滑动方向反侧）的符号
    let seen = false;
    for (let t = 0; t < 1 && !st.crashed; t += DT) { run(DT, { steer: s, steerSm: s }); if (st.mode === 'carve' && Math.sign(st.edge) === up && slipDeg() > 8) seen = true; }
    assert.deepEqual(crashes(), [], `偏 ${off}° 拨 ${s}`);
    assert.ok(slipDeg() < 10, `偏 ${off}° 拨 ${s}：侧滑角还有 ${slipDeg().toFixed(0)}°`);
    if (seen) upCarve++;
  }
  assert.ok(upCarve >= 2, `只有 ${upCarve} 次是用上坡刃顺势刻过去的`);
});

test('横穿时往下坡方向转：先守住上坡刃，再换刃完成转弯，不卡刃', () => {
  fresh(1000); run(2);
  run(1.6, { steer: 1, steerSm: 1 });   // 转到横穿
  const yaw0 = st.yaw;
  run(2.5, { steer: -1, steerSm: -1 });  // 往下坡方向转
  assert.deepEqual(crashes(), []);
  assert.equal(st.mode, 'carve');
  assert.ok(Math.abs(deg(st.yaw - yaw0)) > 60, `只转了 ${deg(st.yaw - yaw0).toFixed(0)}°`);
});

test('高速推坡时松开 Shift 往反方向拨：守住上坡刃，不卡刃', () => {
  for (const dir of [1, -1]) {
    fresh(1000); run(5);
    run(0.5, { brake: true, steer: dir });
    const v0 = st.v.length();
    let wrong = 0;
    for (let t = 0; t < 1; t += DT) { run(DT, { steer: -dir, steerSm: -dir }); if (Math.abs(st.vl) > 3 && Math.sign(st.edge) === Math.sign(st.vl) && Math.abs(st.edge) > 0.2) wrong++; }
    assert.deepEqual(crashes(), [], `拨 ${-dir}`);
    assert.equal(wrong, 0, '横滑时下坡刃立起来了');
    assert.ok(st.v.length() < v0 + 3, `速度从 ${v0.toFixed(1)} 涨到 ${st.v.length().toFixed(1)}`);
  }
});

test('横着滑时松开所有按键：上坡刃推坡减速，不摔', () => {
  fresh(1000); run(4);
  st.yaw += Math.PI / 2; // 板转成横的
  const v0 = st.v.length();
  run(2.5);
  assert.deepEqual(crashes(), []);
  assert.ok(st.v.length() < v0 * 0.6, `速度 ${v0.toFixed(1)} → ${st.v.length().toFixed(1)}`);
});

test('真实卡刃：高速横滑时滑动那侧的刃大角度压进雪里会摔', () => {
  fresh(1000); run(4);
  st.yaw += Math.PI / 2; run(DT);
  st.edge = Math.sign(st.vl) * 30 * Math.PI / 180;
  run(DT, { brake: true }); // 推坡分支不会被自动守刃改写
  assert.match(crashes().join(), /卡刃/);
});

test('横着落地：侧向速度小只算落地不稳，侧向速度大会卡刃', () => {
  const landWith = (offDeg, speed) => {
    fresh(30); run(2); st.v.multiplyScalar(speed / Math.max(st.v.length(), 0.1));
    run(0.5, { jump: true }); run(DT);
    st.yaw += offDeg * Math.PI / 180;
    let t = 0; while (st.air && t < 3) { run(DT); t += DT; }
    return { crashed: st.crashed, reasons: crashes() };
  };
  const slow = landWith(50, 4);
  assert.equal(slow.crashed, false, `慢速 50° 落地：${slow.reasons.join()}`);
  assert.match(popup(), /Ollie|Hop|Air/);
  const fast = landWith(50, 14);
  assert.equal(fast.crashed, true);
  assert.match(fast.reasons.join(), /卡刃：板横着落地/);
});

test('随机操作回归：地面上几乎不会卡刃', () => {
  let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  let caught = 0;
  for (let trial = 0; trial < 80; trial++) {
    fresh(850 + rnd() * 600);
    const v0 = 5 + rnd() * 20, s = st.s, dy = E.H(st.p.x, -(s + 1)) - E.H(st.p.x, -s), l = Math.hypot(1, dy);
    st.v.set(0, dy / l * v0, -v0 / l); // 沿坡面方向的初速度
    let seg = 0, cur = {}, sm = 0;
    for (let i = 0; i < 6 * 120 && !st.crashed; i++) {
      if (seg <= 0) { seg = 0.2 + rnd() * 1.3; const r = rnd(); cur = { steer: r < 0.4 ? 1 : r < 0.8 ? -1 : 0, brake: rnd() < 0.15, lean: rnd() < 0.1 ? (rnd() < 0.5 ? 1 : -1) : 0 }; }
      seg -= DT; sm += (cur.steer - sm) * Math.min(1, DT * 7);
      E.step(DT, { ...IDLE, steer: cur.steer, steerSm: sm, brake: cur.brake, lean: cur.lean });
    }
    if (crashes().some(r => /下坡刃压进/.test(r))) caught++;
  }
  assert.ok(caught <= 3, `80 趟里地面卡刃 ${caught} 趟`);
});
