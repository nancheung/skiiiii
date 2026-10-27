// 难度与推坡：轻松 / 硬核的差别（守刃、卡刃、平衡晃动、落地太重），以及「按住推坡、松手回正、用当前刃推」。
// 运行：npm test
const test = require('node:test');
const assert = require('node:assert');
const { boot, DT, IDLE, deg } = require('./boot');

const { E } = boot();
const st = E.st;
const run = (sec, inp = {}) => { for (let i = 0; i < sec * 120 && !st.crashed; i++) E.step(DT, { ...IDLE, ...inp }); };
const crashes = () => E.fx.filter(e => e.type === 'crash').map(e => e.reason);
const slipDeg = () => deg(Math.atan2(Math.abs(st.vl), Math.abs(st.vf) + 0.05));
const fresh = (s, p = 2) => { E.fx.length = 0; E.placeAt(s, p); };
const modes = fn => { for (const m of ['easy', 'hard']) { E.setDifficulty(m, false); fn(m); } E.setDifficulty('easy', false); };

test('默认是轻松模式', () => {
  assert.equal(E.diff.key, 'easy');
});

test('推坡用当前的刃：后刃刻滑时推坡用后刃，前刃刻滑时用前刃，都能刹下来', () => modes(m => {
  for (const dir of [1, -1]) {
    fresh(1000); run(3); run(0.6, { steer: dir, steerSm: dir });
    const side = Math.sign(st.edge), v0 = st.v.length();
    run(1.2, { brake: true });
    assert.deepEqual(crashes(), [], `${m} 拨 ${dir}`);
    assert.equal(Math.sign(st.edge), side, `${m} 拨 ${dir}：推坡换了刃`);
    assert.equal(Math.sign(st.vl), -side, `${m} 拨 ${dir}：推坡的刃不是上坡刃`);
    assert.ok(slipDeg() > 60, `${m} 拨 ${dir}：板没横过来（侧滑角 ${slipDeg().toFixed(0)}°）`);
    assert.ok(st.v.length() < v0 * 0.8, `${m} 拨 ${dir}：速度 ${v0.toFixed(1)} → ${st.v.length().toFixed(1)}`);
  }
}));

test('松开推坡：板转回行进方向，接着往下滑，不摔', () => modes(m => {
  for (const dir of [1, -1]) {
    fresh(1000); run(3); run(0.6, { steer: dir, steerSm: dir }); run(1, { brake: true });
    const v0 = st.v.length();
    let back = -1;
    for (let t = 0; t < 2.5 && !st.crashed; t += DT) { run(DT); if (back < 0 && slipDeg() < 12) back = t; }
    assert.deepEqual(crashes(), [], `${m} 拨 ${dir}`);
    assert.ok(back >= 0 && back < 1.5, `${m} 拨 ${dir}：${back < 0 ? '没回正' : back.toFixed(2) + ' s 才回正'}`);
    assert.ok(slipDeg() < 12, `${m} 拨 ${dir}：回正后侧滑角还有 ${slipDeg().toFixed(0)}°`);
    assert.ok(st.v.length() > v0, `${m} 拨 ${dir}：速度 ${v0.toFixed(1)} → ${st.v.length().toFixed(1)}，没有接着滑`);
  }
}));

test('推坡刹停后松手：板转到滚落线方向，重新滑起来', () => modes(m => {
  fresh(4); run(3); run(1.5, { brake: true });
  assert.ok(st.v.length() < 0.5, `${m}：没刹停（${st.v.length().toFixed(1)} m/s）`);
  run(4);
  assert.deepEqual(crashes(), [], m);
  assert.ok(st.v.length() > 4 && slipDeg() < 10, `${m}：松手 4 s 后速度 ${st.v.length().toFixed(1)}，侧滑角 ${slipDeg().toFixed(0)}°`);
}));

test('落地太重：轻松只算落地不稳，硬核会摔', () => {
  const slam = () => {
    fresh(1000); run(2); run(0.4, { jump: true }); run(DT);
    while (st.air && st.airT < 0.35) run(DT);
    st.v.y = -22;
    let t = 0; while (st.air && t < 3) { run(DT); t += DT; }
    return E.fx.find(e => e.type === 'land');
  };
  E.setDifficulty('easy', false);
  const easy = slam();
  assert.deepEqual(crashes(), []);
  assert.ok(easy && easy.sketchy && easy.impact > 14, '轻松：应该是一次不稳的落地');
  E.setDifficulty('hard', false);
  slam();
  assert.match(crashes().join(), /落地太重/);
  E.setDifficulty('easy', false);
});

test('硬核不自动守刃：板偏 30° 时往下坡刃拨会卡刃（轻松模式下同样操作不摔）', () => {
  const caught = {};
  modes(m => {
    caught[m] = 0;
    for (const off of [30, -30]) for (const s of [1, -1]) {
      fresh(1000); run(3);
      st.yaw += off * Math.PI / 180; run(DT);
      run(1, { steer: s, steerSm: s });
      if (crashes().some(r => /卡刃/.test(r))) caught[m]++;
    }
  });
  assert.equal(caught.easy, 0);
  assert.ok(caught.hard >= 2, `硬核只卡刃 ${caught.hard} 次`);
});

test('平衡：压雪道上平板直滑，硬核会左右晃但不摔，轻松不晃', () => modes(m => {
  let maxE = 0;
  for (const s of [900, 1100, 1300]) {
    fresh(s); for (let i = 0; i < 4 * 120 && !st.crashed; i++) { E.step(DT, IDLE); maxE = Math.max(maxE, Math.abs(deg(st.edge))); }
    assert.deepEqual(crashes(), [], `${m} s=${s}`);
  }
  if (m === 'hard') assert.ok(maxE > 3, `硬核最大刃角只有 ${maxE.toFixed(1)}°`);
  else assert.ok(maxE < 0.5, `轻松最大刃角 ${maxE.toFixed(1)}°`);
}));

test('蘑菇道：平板直冲整段，硬核会卡刃摔倒，轻松能冲过去', () => {
  const caught = {};
  modes(m => {
    caught[m] = 0;
    for (let k = 0; k < 5; k++) {
      fresh(E.MOG0 + 5 + k * 3, 1);
      for (let t = 0; t < 60 && !st.crashed && st.s < E.MOG1; t += DT) E.step(DT, IDLE);
      if (crashes().some(r => /卡刃/.test(r))) caught[m]++;
    }
  });
  assert.equal(caught.easy, 0, `轻松卡刃 ${caught.easy} 次`);
  assert.ok(caught.hard >= 4, `硬核只卡刃 ${caught.hard}/5 次`);
});

test('硬核：推坡照样能安全通过蘑菇道和陡坡', () => {
  E.setDifficulty('hard', false);
  fresh(E.MOG0 + 100, 1); run(1); run(6, { brake: true });
  assert.deepEqual(crashes(), [], '蘑菇道');
  fresh(1900, 1); run(2); run(3, { brake: true });
  assert.deepEqual(crashes(), [], '陡坡');
  E.setDifficulty('easy', false);
});

test('硬核：左右交替刻滑 12 秒不摔', () => {
  E.setDifficulty('hard', false);
  fresh(1000); let sm = 0;
  for (let i = 0; i < 12 * 120 && !st.crashed; i++) { const s = Math.floor(i / 180) % 2 ? 1 : -1; sm += (s - sm) * Math.min(1, DT * 7); E.step(DT, { ...IDLE, steer: s, steerSm: sm }); }
  assert.deepEqual(crashes(), []);
  E.setDifficulty('easy', false);
});

test('最佳分按模式分开记', () => {
  const store = new Map([['edgeline-best', '1200'], ['edgeline-best-hard', '300']]);
  const ls = global.localStorage;
  global.localStorage = { getItem: k => store.has(k) ? store.get(k) : null, setItem: (k, v) => store.set(k, String(v)) };
  E.setDifficulty('hard');
  assert.equal(E.score.best, 300);
  assert.equal(store.get('edgeline-diff'), 'hard');
  E.setDifficulty('easy');
  assert.equal(E.score.best, 1200);
  E.setDifficulty('nope');
  assert.equal(E.diff.key, 'easy', '非法值不改变难度');
  global.localStorage = ls;
});

/* ---------- 搓雪与搓雪转弯（月牙弯） ---------- */
// 行进方向相对滚落线（-z）的角度，正为 +x 一侧
const heading = () => deg(Math.atan2(st.v.x, -st.v.z));
// 按住 Shift 做小回转：每个弯做完整（行进方向过了滚落线另一侧 H°）再换方向，像玩家那样
const shortTurns = (sec, H) => {
  let vmax = 0, turns = 0, dir = 1;
  for (let i = 0; i < sec * 120 && !st.crashed; i++) {
    if (st.v.length() > 1 && dir * heading() < -H) { dir = -dir; turns++; }
    E.step(DT, { ...IDLE, brake: true, steer: dir, steerSm: dir });
    vmax = Math.max(vmax, st.v.length());
  }
  return { vmax, turns };
};

test('轻按 Shift 是搓雪：板只横过一部分，减点速不刹停；按久了变成推坡', () => modes(m => {
  fresh(1000); run(4); run(0.6); const free = st.v.length();
  fresh(1000); run(4); const v0 = st.v.length();
  let maxSlip = 0; for (let i = 0; i < 36; i++) { run(DT, { brake: true }); maxSlip = Math.max(maxSlip, slipDeg()); }
  run(0.3);
  assert.deepEqual(crashes(), [], m);
  assert.ok(maxSlip > 25 && maxSlip < 60, `${m}：轻按时侧滑角最大 ${maxSlip.toFixed(0)}°`);
  assert.ok(st.v.length() < free - 0.5 && st.v.length() > v0 * 0.7, `${m}：轻按后 ${st.v.length().toFixed(1)}，不按 ${free.toFixed(1)}，按前 ${v0.toFixed(1)}`);
  fresh(1000); run(4); run(2, { brake: true });
  assert.ok(slipDeg() > 75, `${m}：按住 2 s 侧滑角只有 ${slipDeg().toFixed(0)}°`);
  assert.ok(st.v.length() < v0 * 0.6, `${m}：按住 2 s 速度 ${v0.toFixed(1)} → ${st.v.length().toFixed(1)}`);
}));

test('搓雪转弯是月牙弯：上半弧搓雪减速，过了滚落线接着走刃，不会刹停', () => modes(m => {
  for (const dir of [1, -1]) {
    fresh(1000); run(3); run(1.6, { steer: dir, steerSm: dir }); // 刻滑到横穿
    const v0 = st.v.length(), h0 = heading();
    let scrubSlip = 0, carveAfter = false, vmin = v0;
    for (let i = 0; i < 3 * 120 && !st.crashed; i++) {
      run(DT, { brake: true, steer: -dir, steerSm: -dir });
      if (st.scrub === 'turn') scrubSlip = Math.max(scrubSlip, slipDeg());
      else if (scrubSlip > 0 && st.mode === 'carve') carveAfter = true;
      vmin = Math.min(vmin, st.v.length());
    }
    const tag = `${m} 拨 ${dir} → ${-dir}`;
    assert.deepEqual(crashes(), [], tag);
    assert.ok(scrubSlip > 20, `${tag}：上半弧侧滑角最大只有 ${scrubSlip.toFixed(0)}°`);
    assert.ok(carveAfter, `${tag}：过了滚落线没有接上走刃`);
    assert.ok(vmin > v0 * 0.35 && st.v.length() > v0 * 0.5, `${tag}：速度 ${v0.toFixed(1)} → 最低 ${vmin.toFixed(1)} → ${st.v.length().toFixed(1)}`);
    assert.ok(Math.abs(heading() - h0) > 120, `${tag}：航向只转了 ${Math.abs(heading() - h0).toFixed(0)}°`);
  }
}));

test('陡坡搓雪小回转：把弯做完整就能稳住速度，弯做一半会越滑越快', () => modes(m => {
  fresh(1900, 1); run(2); const s0 = st.s;
  const r = shortTurns(12, 100);
  assert.deepEqual(crashes(), [], m);
  assert.ok(r.vmax < 11, `${m}：最高 ${r.vmax.toFixed(1)} m/s`);
  assert.ok(st.s - s0 > 25, `${m}：12 s 只往下走了 ${(st.s - s0).toFixed(0)} m`);
  assert.ok(r.turns >= 4, `${m}：只做了 ${r.turns} 个弯`);
  fresh(1900, 1); run(2); const half = shortTurns(12, 45);
  assert.ok(half.vmax > r.vmax + 6, `${m}：弯做一半 ${half.vmax.toFixed(1)} 应该比做完整 ${r.vmax.toFixed(1)} 快得多`);
  fresh(1900, 1); run(2); let straight = 0; for (let i = 0; i < 12 * 120 && !st.crashed; i++) { E.step(DT, IDLE); straight = Math.max(straight, st.v.length()); }
  assert.ok(r.vmax < straight * 0.4, `${m}：直冲 ${straight.toFixed(1)}，小回转 ${r.vmax.toFixed(1)}`);
}));

test('蘑菇道搓雪小回转：被鼓包颠起来也不摔，速度稳在低速，一直往下走', () => modes(m => {
  fresh(E.MOG0 + 100, 1); run(1); const s0 = st.s;
  const r = shortTurns(10, 100);
  assert.deepEqual(crashes(), [], m);
  assert.ok(r.vmax < 9, `${m}：最高 ${r.vmax.toFixed(1)} m/s`);
  assert.ok(st.s - s0 > 20, `${m}：10 s 只往下走了 ${(st.s - s0).toFixed(0)} m`);
}));

test('推坡中拨方向：转成搓雪转弯，换到新刃，硬核也不卡刃', () => modes(m => {
  for (const dir of [1, -1]) {
    fresh(1000); run(4); run(0.5, { brake: true });
    run(1.5, { brake: true, steer: dir, steerSm: dir });
    assert.deepEqual(crashes(), [], `${m} 拨 ${dir}`);
    assert.ok(st.v.length() > 1, `${m} 拨 ${dir}：停住了`);
  }
}));
