// 雪山地形测试：雪道走向、坡度、宽度、汇合高度，以及每条雪道能不能顺着滑下去。
const test = require('node:test');
const assert = require('node:assert');
const { boot, DT, IDLE } = require('./boot');

const { E } = boot();
const st = E.st;
const N = E.PISTES.length;
// 沿雪道中线、顺坡方向的坡度（°），用不含蘑菇和跳台的山体高度
const slope = (i, s) => { const e = 0.5, x = E.laneAt(i, s); return Math.atan((E.Hbase(x, -(s - e)) - E.Hbase(x, -(s + e))) / (2 * e)) * 180 / Math.PI; };
const zoneRange = (i, type) => E.PISTES[i].zones.find(z => z[2] === type);

test('每条雪道从山顶到山脚：高度有限、单调向下，中线上就是这条雪道', () => {
  for (let i = 0; i < N; i++) {
    let prev = Infinity;
    for (let s = 0; s <= E.FINISH; s += 2) {
      const x = E.laneAt(i, s), h = E.H(x, -s);
      assert.ok(Number.isFinite(h), `${E.PISTES[i].key} 在 ${s} m 处高度不是有限数`);
      const hb = E.Hbase(x, -s);
      assert.ok(hb < prev + 0.5, `${E.PISTES[i].key} 在 ${s} m 处往上坡走了`);
      prev = hb;
      if (s > 820 && s < 3100) assert.equal(E.surfaceAt(x, -s).k, i, `${E.PISTES[i].key} 在 ${s} m 处中线不属于这条雪道`);
    }
  }
});

test('四条雪道在 3100 m 汇合处一样高，山顶到终点落差 900–1300 m', () => {
  const hs = E.PISTES.map((P, i) => E.Hbase(E.laneAt(i, 3100), -3100));
  assert.ok(Math.max(...hs) - Math.min(...hs) < 0.5, `汇合处高差 ${hs.map(h => h.toFixed(1)).join(' / ')}`);
  const drop = E.H(E.laneAt(0, 0), 0) - E.H(E.laneAt(0, E.FINISH), -E.FINISH);
  assert.ok(drop > 900 && drop < 1300, `总落差 ${drop.toFixed(0)} m`);
});

test('各雪道的坡度和宽度符合设计', () => {
  const maxSlope = (i, a, b) => { let m = 0; for (let s = a; s < b; s += 2) m = Math.max(m, slope(i, s)); return m; };
  const minSlope = (i, a, b) => { let m = 90; for (let s = a; s < b; s += 2) m = Math.min(m, slope(i, s)); return m; };
  const [s0, s1] = zoneRange(1, 'steep');
  const steep = maxSlope(1, s0, s1);
  assert.ok(steep > 33 && steep < 42, `陡坡最大坡度 ${steep.toFixed(1)}°`);
  const cMin = minSlope(2, 900, 2900), cMax = maxSlope(2, 900, 2900);
  assert.ok(cMin > 14 && cMax < 22, `刻滑大道坡度 ${cMin.toFixed(1)}°–${cMax.toFixed(1)}°`);
  assert.ok(E.halfAt(2, 1500) * 2 >= 80, '刻滑大道宽度不足 80 m');
  const [p0, p1] = zoneRange(0, 'powder');
  assert.ok(E.halfAt(0, (p0 + p1) / 2) * 2 >= 120, '粉雪碗宽度不足 120 m');
  const pMax = maxSlope(0, p0 + 30, p1 - 30);
  assert.ok(pMax > 23 && pMax < 30, `粉雪坡最大坡度 ${pMax.toFixed(1)}°`);
});

test('雪面类型：粉雪区是粉雪，压雪道有压雪，蘑菇区有鼓包，雪道外是野雪', () => {
  const [p0, p1] = zoneRange(0, 'powder');
  let sf = E.surfaceAt(E.laneAt(0, (p0 + p1) / 2), -(p0 + p1) / 2);
  assert.equal(sf.zone, 'powder'); assert.ok(sf.powder > 0.95);
  sf = E.surfaceAt(E.laneAt(2, 1500), -1500);
  assert.equal(sf.zone, 'carve'); assert.ok(sf.groom > 0.95 && sf.powder === 0);
  const ms = (E.MOG0 + E.MOG1) / 2, mx = E.laneAt(1, ms);
  let lo = Infinity, hi = -Infinity;
  for (let u = -10; u <= 10; u += 0.25) { const d = E.H(mx + u, -ms) - E.Hbase(mx + u, -ms); lo = Math.min(lo, d); hi = Math.max(hi, d); }
  assert.ok(hi - lo > 0.5 && lo >= 0, `蘑菇起伏 ${lo.toFixed(2)}–${hi.toFixed(2)} m`);
  sf = E.surfaceAt((E.laneAt(1, 1500) + E.laneAt(2, 1500)) / 2, -1500);
  assert.equal(sf.zone, 'off');
});

test('每条雪道从起点直滑 20 秒，仍然在本雪道上', () => {
  for (let i = 0; i < N; i++) {
    E.placeAt(820, i);
    for (let t = 0; t < 20 * 120 && !st.crashed; t++) E.step(DT, IDLE);
    const sf = E.surfaceAt(st.p.x, st.p.z);
    assert.equal(st.crashed, false, `${E.PISTES[i].key} 直滑时摔了`);
    assert.equal(sf.k, i, `${E.PISTES[i].key} 滑到了 ${E.PISTES[sf.k].key}`);
    assert.ok(sf.d < 3, `${E.PISTES[i].key} 滑出雪道边缘 ${sf.d.toFixed(1)} m`); // 不转弯会慢慢漂到边上，但护坡会把人挡回来
  }
});

test('雪道上没有树，林带里有树', () => {
  let onPiste = 0, total = 0;
  for (const list of E.treeGrid.values()) for (const [x, z, , kind] of list) {
    if (kind !== 'tree') continue;
    total++;
    const sf = E.surfaceAt(x, z);
    if (sf.d < 0 && !(sf.k === 0 && sf.zone === 'powder')) onPiste++; // 粉雪碗里的树岛除外
  }
  assert.ok(total > 3000, `树太少：${total}`);
  assert.ok(onPiste === 0, `${onPiste} 棵树长在雪道上`);
});
