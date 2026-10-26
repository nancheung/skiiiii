// 各种地形上的物理表现：蘑菇道、粉雪、陡坡、刻滑大道、大跳台、撞树、终点，以及给音频用的事件队列。
const test = require('node:test');
const assert = require('node:assert');
const { boot, DT, IDLE } = require('./boot');

const heard = [];
const { E, popup } = boot({ audio: { unlock() {}, update() {}, toggleMute() {}, set() {}, state: {}, event: e => heard.push(e) } });
const st = E.st;
const crashes = () => E.fx.filter(e => e.type === 'crash').map(e => e.reason);
// 沿雪道中线走：xc 偏右就往左拨，带一点速度阻尼
const follow = (p, extra = {}) => () => {
  const xc = st.p.x - E.laneAt(p, st.s), vx = st.v.x + E.laneD(p, st.s) * st.v.z;
  const s = Math.max(-1, Math.min(1, 0.15 * xc + 0.35 * vx));
  return { ...IDLE, steer: s, steerSm: s, ...extra };
};
function ride(sec, inp) {
  let airs = 0, was = false, vmax = 0;
  for (let i = 0; i < sec * 120 && !st.crashed && !st.done; i++) {
    E.step(DT, typeof inp === 'function' ? inp() : { ...IDLE, ...inp });
    if (st.air && !was) airs++; was = st.air; vmax = Math.max(vmax, st.v.length());
  }
  return { airs, vmax };
}
const reset = (s, p) => { E.fx.length = 0; E.placeAt(s, p); };

test('蘑菇道：直冲会被鼓包颠起来好几次，速度被压住', () => {
  reset(E.MOG0 + 10, 1);
  const r = ride(8, follow(1));
  assert.deepEqual(crashes(), []);
  assert.ok(r.airs >= 3, `只离地 ${r.airs} 次`);
  assert.ok(r.vmax < 16, `蘑菇道上最高速度 ${r.vmax.toFixed(1)} m/s`);
});

test('蘑菇道：推坡 6 秒不摔，速度保持在很低', () => {
  reset(E.MOG0 + 100, 1); ride(1, IDLE);
  const r = ride(6, { brake: true });
  assert.deepEqual(crashes(), []);
  assert.ok(r.vmax < 7, `推坡时最高速度 ${r.vmax.toFixed(1)} m/s`);
});

test('粉雪：25° 的粉雪比 18° 的压雪道还慢，压板尾掉速少，高速压板头会扎头摔倒', () => {
  const speed = (p, s, lean) => { reset(s, p); ride(8, follow(p, { lean })); return { v: st.v.length(), crashed: st.crashed }; };
  const groomed = speed(1, 1500 - 400, 0); // B 道 1100 m 附近 17–18°，作为参照之一
  const neutral = speed(0, 950, 0), back = speed(0, 950, -1), nose = speed(0, 950, 1);
  assert.equal(neutral.crashed, false); assert.equal(back.crashed, false);
  // 粉雪坡 25° 比 B 道 18° 陡得多，但还是更慢
  assert.ok(neutral.v < groomed.v, `粉雪 ${neutral.v.toFixed(1)} vs 压雪道 ${groomed.v.toFixed(1)}`);
  assert.ok(back.v > neutral.v + 1, `压板尾 ${back.v.toFixed(1)} vs 中立 ${neutral.v.toFixed(1)}`);
  assert.equal(nose.crashed, true);
  assert.match(crashes()[0] || '', /板头扎进粉雪/);
});

test('陡坡：直冲比缓坡快得多，推坡能刹到一半以下', () => {
  const [s0] = E.PISTES[1].zones.find(z => z[2] === 'steep');
  reset(s0 + 40, 1); ride(3, follow(1));
  const vSteep = st.v.length();
  reset(60, 2); ride(3, IDLE);
  const vGentle = st.v.length();
  assert.ok(vSteep > vGentle * 1.5, `陡坡 ${vSteep.toFixed(1)} vs 缓坡 ${vGentle.toFixed(1)}`);
  reset(s0 + 40, 1); ride(3, follow(1));
  const v0 = st.v.length(); ride(3, { brake: true });
  assert.deepEqual(crashes(), []);
  assert.ok(st.v.length() < v0 * 0.5, `刹车前 ${v0.toFixed(1)}，刹车后 ${st.v.length().toFixed(1)}`);
});

test('刻滑大道：左右交替大刃角刻滑 12 秒不摔，打出 Deep Carve', () => {
  reset(1000, 2); ride(2, IDLE);
  let dir = 1, deep = false;
  for (let i = 0; i < 12 * 120 && !st.crashed; i++) {
    const head = Math.atan2(st.v.x, -st.v.z); // 相对滚落线的行进方向，往 -x 偏为负
    if (dir > 0 && head < -0.55) dir = -1; else if (dir < 0 && head > 0.55) dir = 1;
    E.step(DT, { ...IDLE, steer: dir, steerSm: dir });
    if (/Deep Carve/.test(popup())) deep = true;
  }
  assert.deepEqual(crashes(), []);
  assert.ok(deep, '没有打出 Deep Carve');
  assert.ok(E.surfaceAt(st.p.x, st.p.z).k === 2, '刻滑时滑出了刻滑大道');
});

test('大跳台：从助滑区直冲，滞空 2–3.6 秒，安全落地', () => {
  const k = E.BIG;
  for (const start of [k.s - 250, k.s - 100]) {
    reset(start, k.p);
    while (!st.air && st.s < k.s + 5) ride(DT, follow(k.p));
    assert.ok(Math.abs(st.s - k.s) < 2, `起跳位置 ${st.s.toFixed(1)}，应在唇口 ${k.s}`);
    let air = 0; while (st.air && air < 6) { E.step(DT, IDLE); air += DT; }
    assert.ok(air > 2 && air < 3.6, `从 ${start} m 出发，滞空 ${air.toFixed(2)} s`);
    assert.equal(st.crashed, false, `落地冲击 ${st.lastImpact.toFixed(1)} m/s`);
  }
});

test('冲进树林撞树会摔', () => {
  let tree = null;
  for (const list of E.treeGrid.values()) { tree = list.find(t => t[3] === 'tree' && -t[1] > 1000 && -t[1] < 2500); if (tree) break; }
  reset(1500, 2);
  st.p.set(tree[0], 0, tree[1] + 6); st.p.y = E.H(st.p.x, st.p.z); st.v.set(0, 0, -8); st.yaw = Math.PI;
  ride(2, IDLE);
  assert.ok(crashes().includes('撞到树了'), `摔倒原因：${crashes().join('、') || '没摔'}`);
});

test('滑到山脚终点会结束这一趟，并产生 finish 事件', () => {
  reset(E.FINISH - 120, 2); st.v.set(0, 0, -10);
  ride(30, IDLE);
  assert.equal(st.done, true);
  assert.ok(E.fx.some(e => e.type === 'finish'));
  st.done = false;
});

test('起跳、落地、摔倒、进入新区段都会进入事件队列并交给音频', () => {
  heard.length = 0;
  const seg = (fn) => { E.drainFx(e => heard.push(e)); E.placeAt(...fn.at); fn.go(); E.drainFx(e => heard.push(e)); };
  seg({ at: [30, 2], go: () => { ride(2, IDLE); ride(0.4, { jump: true }); ride(2, IDLE); } });                  // 起跳 + 落地
  seg({ at: [30, 2], go: () => { ride(2, IDLE); ride(0.4, { jump: true }); ride(DT, IDLE); st.yaw += Math.PI / 2; ride(3, IDLE); } }); // 横板落地摔倒
  seg({ at: [600, 3], go: () => ride(10, follow(3)) });                                                             // 从主干道进入公园
  const types = new Set(heard.map(e => e.type));
  for (const t of ['pop', 'land', 'crash', 'zone']) assert.ok(types.has(t), `没有 ${t} 事件`);
  assert.equal(E.fx.length, 0);
});
