// 骑手外观测试：性别 / 雪服颜色只改模型外观，不影响物理。
// 运行：npm test
const test = require('node:test');
const assert = require('node:assert');
const { boot, DT, IDLE } = require('./boot');

const { E } = boot();
const hex = m => '#' + m.color.getHexString();
const C = k => E.RIDER_COLORS.find(c => c.key === k);

test('默认是男 / 红色雪服，没有马尾', () => {
  assert.deepEqual({ ...E.rider }, { gender: 'm', color: 'red' });
  assert.equal(hex(E.rig.mats.mJ), C('red').jacket);
  assert.equal(hex(E.rig.mats.mP), C('red').pants);
  assert.equal(E.rig.P.hair.visible, false);
});

test('切到女 / 蓝：换配色、显示马尾、肩变窄', () => {
  const sh0 = E.rig.shW;
  E.setRider({ gender: 'f', color: 'blue' });
  assert.equal(hex(E.rig.mats.mJ), C('blue').jacket);
  assert.equal(hex(E.rig.mats.mP), C('blue').pants);
  assert.equal(E.rig.P.hair.visible, true);
  assert.ok(E.rig.shW < sh0);
  E.setRider({ gender: 'm' });
  assert.equal(E.rig.P.hair.visible, false);
  assert.equal(E.rig.shW, sh0);
  assert.equal(E.rider.color, 'blue', '只改性别时颜色保持不变');
});

test('非法值不改变当前设置', () => {
  E.setRider({ gender: 'f', color: 'pink' });
  E.setRider({ gender: 'x', color: 'nope' });
  assert.deepEqual({ ...E.rider }, { gender: 'f', color: 'pink' });
  E.setRider(null);
  assert.deepEqual({ ...E.rider }, { gender: 'f', color: 'pink' });
});

test('外观不影响物理', () => {
  const run = () => {
    E.placeAt(60);
    for (let i = 0; i < 360; i++) E.step(DT, { ...IDLE, steer: i > 120 ? 1 : 0, steerSm: i > 120 ? 1 : 0 });
    return [E.st.p.x, E.st.p.z, E.st.v.length(), E.st.yaw];
  };
  E.setRider({ gender: 'm', color: 'red' });
  const a = run();
  E.setRider({ gender: 'f', color: 'black' });
  const b = run();
  assert.deepEqual(b, a);
});
