// 测试用启动器：在 Node 里用假的渲染器和 DOM 跑 js/game.js，返回 window.__edgeline。
// 每个 *.test.js 在独立进程里运行，各自调用一次 boot()。
const fs = require('fs');
const path = require('path');
const THREE = require('three');

function boot({ audio } = {}) {
  class FakeRenderer {
    constructor() { this.shadowMap = {}; this.capabilities = { getMaxAnisotropy: () => 1 }; }
    setPixelRatio() {} setClearColor() {} setSize() {} render() {} getPixelRatio() { return 1; }
  }
  THREE.WebGLRenderer = FakeRenderer;
  const cache = {};
  // 2D context：除 createImageData / measureText 外的方法全部是空操作
  const ctx2d = new Proxy({ createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }), measureText: () => ({ width: 0 }) },
    { get: (t, k) => (k in t ? t[k] : () => {}), set: () => true });
  const el = () => ({
    style: { setProperty() {} }, classList: { add() {}, remove() {}, toggle() {} }, dataset: {},
    addEventListener() {}, setAttribute() {}, setPointerCapture() {}, focus() {}, offsetWidth: 1, textContent: '', hidden: false, checked: true,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }),
    getContext: () => ctx2d,
  });
  Object.assign(global, {
    THREE, window: global, devicePixelRatio: 1, innerWidth: 800, innerHeight: 600,
    document: { getElementById: id => cache[id] || (cache[id] = el()), querySelector: el, querySelectorAll: () => [], createElement: el, body: el(), addEventListener() {} },
    addEventListener() {}, requestAnimationFrame() {}, matchMedia: () => ({ matches: false }),
    localStorage: { getItem: () => null, setItem() {} },
  });
  if (audio) global.EdgelineAudio = audio;
  // eslint-disable-next-line no-eval
  (0, eval)(fs.readFileSync(path.join(__dirname, '..', 'js', 'game.js'), 'utf8'));
  return { E: global.__edgeline, popup: () => cache.tName ? cache.tName.textContent : '' };
}

const DT = 1 / 120;
const IDLE = { steer: 0, steerSm: 0, lean: 0, jump: false, brake: false, grab: false };
const deg = r => r * 180 / Math.PI;
module.exports = { boot, DT, IDLE, deg };
