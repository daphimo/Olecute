/* Browser integration fixture; requires Playwright (same dependency setup as header-system.cjs). */
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const dependency = process.env.HEADER_VALIDATION_MODULES
  ? createRequire(path.join(process.env.HEADER_VALIDATION_MODULES, '..', 'package.json')) : require;
const { chromium } = dependency('playwright');
const root = path.resolve(__dirname, '..');
const imports = { '@theme/scroll-container':'/assets/scroll-container.js', '@theme/smooth-scroll':'/assets/smooth-scroll.js', '@theme/lenis':'/assets/lenis-v1.3.25.js' };
function fixture(editor) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <link rel="stylesheet" href="/assets/base.css"><link rel="stylesheet" href="/assets/smooth-scroll.css">
    <style>body{--header-height:64px;background:white;color:black}header{position:fixed;top:0;height:64px;background:white;z-index:3;width:100%}main{min-height:6000px;padding-top:100px}#target{margin-top:1000px}#nested{height:120px;width:250px;overflow:auto;background:#eee}#nested div{height:900px}dialog{height:80vh;width:80vw}dialog div{height:2000px}.horizontal{width:240px;overflow:auto}.horizontal div{width:1400px;height:70px}input,select,textarea{display:block}button{min-height:30px}</style>
    <script type="importmap">${JSON.stringify({imports})}</script>
    ${editor?'<script>window.Shopify={designMode:true}</script>':''}
    <script src="/assets/smooth-scroll.js" type="module"></script>
    </head><body><div class="page-wrapper"><header><a id="anchor" href="#target">Target</a> <a id="external" href="/products/example#target">Product</a> <button id="open">Open modal</button></header>
    <main id="MainContent"><div id="nested"><div>Nested scroll</div></div><div class="horizontal"><div>Horizontal slider</div></div><input type="number" value="2"><textarea>Native form control</textarea><select><option>Native select</option></select><section id="target" tabindex="-1">Anchor target</section><a href="#MainContent">Top</a></main><footer>Footer</footer></div>
    <dialog id="overlay"><button id="close">Close</button><div>Independent modal content</div></dialog>
    <script type="module">import {lockScroll,unlockScroll} from '/assets/utilities.js';
    const dialog=document.querySelector('dialog');document.querySelector('#open').onclick=()=>{lockScroll(dialog);dialog.showModal()};
    document.querySelector('#close').onclick=()=>{dialog.close();unlockScroll(dialog)};
    dialog.addEventListener('cancel',()=>unlockScroll(dialog));
    window.testLocks={lockScroll,unlockScroll};</script></body></html>`;
}
(async()=>{
  const server=http.createServer((req,res)=>{
    if(req.url.startsWith('/assets/')) {res.setHeader('Content-Type',req.url.endsWith('.css')?'text/css':'text/javascript');return res.end(fs.readFileSync(path.join(root,req.url)));}
    res.setHeader('Content-Type','text/html; charset=utf-8');res.end(fixture(req.url.includes('editor')));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1360,height:900}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const url=`http://127.0.0.1:${server.address().port}`;
  const wait=ms=>page.waitForTimeout(ms);
  const position=()=>page.evaluate(()=>OlecuteSmoothScroll.getScroll());
  const jump=async y=>{await page.evaluate(y=>OlecuteSmoothScroll.scrollTo(y,{immediate:true}),y);await wait(50);};
  try {
    await page.goto(url);await page.waitForFunction(()=>window.OlecuteSmoothScroll?.active);await wait(180);
    await page.mouse.move(900,400);await page.mouse.wheel(0,400);
    const samples=[];for(let i=0;i<16;i++){await wait(50);samples.push(await position());}
    assert(samples[0]>0&&samples[0]<350,'Wheel begins promptly without jumping to its destination');
    assert(samples[3]>samples[0]+20,'Movement continues after a single wheel event');
    assert(Math.abs(samples.at(-1)-400)<2,'Inertia settles on intended distance');
    assert(samples[1]-samples[0]>samples[5]-samples[4],'Movement decelerates');
    await wait(150);assert.equal(await page.evaluate(()=>OlecuteSmoothScroll.frame),0,'No idle animation loop');
    await page.mouse.wheel(0,350);await page.mouse.wheel(0,350);await wait(80);await page.mouse.wheel(0,-700);await wait(750);
    assert(Math.abs(await position()-400)<3,'Rapid input and reversal accumulate correctly');
    await jump(0);await page.hover('#nested');await page.mouse.wheel(0,260);await wait(300);
    assert.equal(await position(),0,'Nested scroller does not move the page');
    assert(await page.locator('#nested').evaluate(el=>el.scrollTop)>0);
    await page.hover('.horizontal');await page.mouse.wheel(200,0);await wait(200);
    assert.equal(await position(),0);assert(await page.locator('.horizontal').evaluate(el=>el.scrollLeft)>0);
    const canceled=await page.locator('textarea').evaluate(el=>{const e=new WheelEvent('wheel',{deltaY:120,bubbles:true,cancelable:true});el.dispatchEvent(e);return e.defaultPrevented;});
    assert.equal(canceled,false,'Form wheel events stay native');
    await page.locator('#anchor').click();await page.waitForFunction(()=>!OlecuteSmoothScroll.engine.isScrolling);
    assert.equal(new URL(page.url()).hash,'#target');
    assert(Math.abs((await page.locator('#target').boundingBox()).y-72)<2,'Anchor clears sticky header');
    assert(await page.locator('#target').evaluate(el=>el===document.activeElement),'Anchor target receives focus');
    await page.goBack();await wait(180);assert(await position()<2,'Back restores pre-anchor position');
    await page.goForward();await wait(180);assert(Math.abs((await page.locator('#target').boundingBox()).y-72)<2,'Forward restores anchor position');
    await page.goto(url+'/#target');await page.waitForFunction(()=>window.OlecuteSmoothScroll?.active);await wait(250);
    assert(Math.abs((await page.locator('#target').boundingBox()).y-72)<2,'Initial hash clears sticky header');
    await jump(300);await page.mouse.move(900,400);await page.mouse.wheel(0,500);await wait(50);
    await page.locator('#open').click();const locked=await position();await wait(350);assert.equal(await position(),locked,'Modal cancels outstanding momentum');
    await page.locator('#overlay').hover();await page.mouse.wheel(0,200);await wait(150);assert.equal(await position(),locked);
    assert(await page.locator('#overlay').evaluate(el=>el.scrollTop)>0,'Modal scroll remains native');
    await page.keyboard.press('Escape');await wait(60);assert.equal(await position(),locked,'Close preserves position');
    await page.evaluate(()=>{OlecuteSmoothScroll.stop('one');OlecuteSmoothScroll.stop('two');OlecuteSmoothScroll.start('one')});
    assert(await page.evaluate(()=>OlecuteSmoothScroll.stopped),'One owner cannot release another lock');
    await page.evaluate(()=>OlecuteSmoothScroll.start('two'));
    await page.emulateMedia({reducedMotion:'reduce'});await wait(100);assert.equal(await page.evaluate(()=>OlecuteSmoothScroll.active),false);
    const reducedStart=await position();await page.mouse.move(900,400);await page.mouse.wheel(0,180);await wait(150);assert(await position()>reducedStart,'Reduced-motion mode still scrolls natively');
    await page.emulateMedia({reducedMotion:'no-preference'});await page.waitForFunction(()=>OlecuteSmoothScroll.active);
    await jump(420);await page.setViewportSize({width:850,height:900});await wait(200);assert(Math.abs(await position()-420)<2,'Scroll position survives container breakpoint');
    await page.mouse.move(700,400);await page.mouse.wheel(0,180);await wait(900);assert(Math.abs(await position()-600)<2,'Root viewport receives inertia at desktop width below 990px: '+await position());
    await page.setViewportSize({width:390,height:844});await wait(200);assert.equal(await page.evaluate(()=>OlecuteSmoothScroll.active),false);
    await page.setViewportSize({width:1360,height:900});await page.waitForFunction(()=>OlecuteSmoothScroll.active);
    const before=await page.evaluate(()=>{window.originalController=OlecuteSmoothScroll;window.originalEngine=OlecuteSmoothScroll.engine;OlecuteSmoothScroll.init();document.dispatchEvent(new CustomEvent('shopify:section:load'));return OlecuteSmoothScroll.subscribers.size;});
    await wait(180);assert(await page.evaluate(()=>originalController===OlecuteSmoothScroll&&originalEngine===OlecuteSmoothScroll.engine),'Section reload does not create a second engine');
    assert.equal(await page.evaluate(()=>OlecuteSmoothScroll.subscribers.size),before);
    await page.evaluate(()=>{document.querySelector('main').style.minHeight='9000px'});await wait(250);await page.evaluate(()=>OlecuteSmoothScroll.scrollTo('bottom',{immediate:true}));
    assert(await position()>7500,'Dynamic content refreshes scroll limits');
    await page.evaluate(()=>OlecuteSmoothScroll.destroy());const nativeStart=await position();await page.mouse.move(900,400);await page.mouse.wheel(0,-200);await wait(150);assert(await position()<nativeStart,'Destroy restores native scrolling');
    await page.evaluate(()=>OlecuteSmoothScroll.init());await page.waitForFunction(()=>OlecuteSmoothScroll.active);
    await page.goto(url+'/editor');await wait(250);assert.equal(await page.evaluate(()=>OlecuteSmoothScroll.active),false,'Theme Editor stays native');
    await page.route('**/lenis-v1.3.25.js',route=>route.abort());await page.goto(url+'/failure');await wait(250);
    assert.equal(await page.evaluate(()=>OlecuteSmoothScroll.active),false);await page.mouse.move(900,400);await page.mouse.wheel(0,220);await wait(180);assert(await position()>0,'Missing vendor leaves native scroll working');
    await page.unroute('**/lenis-v1.3.25.js');
    const touch=await browser.newContext({viewport:{width:1024,height:768},isMobile:true,hasTouch:true});const touchPage=await touch.newPage();await touchPage.goto(url);await touchPage.waitForTimeout(200);
    assert.equal(await touchPage.evaluate(()=>OlecuteSmoothScroll.active),false,'Large touch-only devices stay native');await touch.close();
    const noJS=await browser.newContext({javaScriptEnabled:false,viewport:{width:1360,height:900}});const fallback=await noJS.newPage();await fallback.goto(url);await fallback.mouse.move(900,400);await fallback.mouse.wheel(0,240);await fallback.waitForTimeout(180);
    assert(await fallback.locator('.page-wrapper').evaluate(el=>el.scrollTop)>0,'JavaScript-disabled storefront still scrolls');await noJS.close();
    assert.deepEqual(errors,[]);
    console.log('PASS: wheel inertia/deceleration, reversal, idle RAF, nested/horizontal/forms, anchors/history/hash, modal locks, reduced motion, breakpoints, editor, dynamic limits, singleton/destroy, vendor failure, touch and no-JS fallback.');
    console.log('Single wheel samples (50ms): '+samples.join(', '));
  } finally {await browser.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
