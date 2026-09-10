const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../assets/smooth-scroll.js'), 'utf8').split('export const')[0];
function fixture(platform, userAgent = 'Chrome') {
  let now = 0, next = 0;
  const listeners = new Map(), frames = new Map();
  const eventTarget = { addEventListener(type, fn) { listeners.set(type, fn); }, removeEventListener(type) { listeners.delete(type); } };
  const window = { ...eventTarget, scrollY: 0, scrollTo({top}) { this.scrollY = top; } };
  const body = {}, root = { scrollHeight: 10000, hasAttribute: () => false };
  const context = vm.createContext({ window, document: { ...eventTarget, body, documentElement: root, hidden: false }, navigator: { platform, userAgent }, innerHeight: 900, Element: class {}, AbortController,
    matchMedia: query => ({ ...eventTarget, matches: !query.includes('reduce') }), getComputedStyle: () => ({overflowY:'visible',position:'static'}),
    ResizeObserver: class { observe() {} disconnect() {} }, performance: { now: () => now },
    requestAnimationFrame(fn) { frames.set(++next, fn); return next; }, cancelAnimationFrame(id) { frames.delete(id); } });
  vm.runInContext(source + ';window.controller=createReferenceScroll();window.controller.init();', context);
  return { window, frames,
    wheel(deltaY, options = {}) { const e={deltaY,deltaX:0,cancelable:true,composedPath:()=>[body],preventDefault(){this.defaultPrevented=true;},...options};listeners.get('wheel')(e);return e; },
    at(time) { now=time;const callbacks=[...frames.values()];frames.clear();callbacks.forEach(fn=>fn(time)); },
  };
}
for (const [platform, agent, delta, extra, expected] of [
  ['Win32','Chrome',400,{},336], ['Linux','Chrome',400,{},336], ['MacIntel','Safari',400,{},160],
  ['Win32','Firefox',3,{deltaMode:1},126], ['MacIntel','Firefox',3,{deltaMode:1},60],
  ['Win32','Chrome',400,{wheelDeltaY:-120},100.8], ['Win32','Chrome',3,{deltaMode:1},2.52],
]) {
  const f=fixture(platform,agent);assert(f.wheel(delta,extra).defaultPrevented);
  for (const time of [100,300,600,900,1200]) {
    f.at(time);const eased=Math.min(1,1.001-Math.pow(2,-10*time/1200));
    assert.equal(f.window.scrollY,Math.round(expected*eased),`${platform}/${agent} at ${time}ms`);
  }
  assert.equal(f.frames.size,0,'No permanent RAF');
}
for(const hz of [60,90,120,144,165]) {
  const f=fixture('Win32');f.wheel(600);
  for(let t=1000/hz;t<500;t+=1000/hz)f.at(t);
  f.at(500);assert.equal(f.window.scrollY,Math.round(504*Math.min(1,1.001-2**(-10*500/1200))));
}
const f=fixture('Win32');f.wheel(600);f.at(300);const current=504*Math.min(1,1.001-2**(-2.5));
f.wheel(-100);f.at(600);
assert.equal(f.window.scrollY,Math.round(current+(420-current)*Math.min(1,1.001-2**(-2.5))),'Input restarts tween from animated position');
f.window.scrollTo({top:800});f.at(650);assert.equal(f.window.scrollY,800);assert.equal(f.frames.size,0);
assert(!f.wheel(120,{ctrlKey:true}).defaultPrevented,'Zoom stays native');
console.log('PASS: reference easing/tween restart, Windows/Linux/Mac, Firefox line mode, legacy wheelDeltaY precedence, 60–165Hz, idle RAF and external scroll cancellation.');
