/* Real Liquid markup + production Splide + Chromium. See docs/hero-slider.md for dependencies. */
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const dependency = process.env.HEADER_VALIDATION_MODULES ? createRequire(path.join(process.env.HEADER_VALIDATION_MODULES, '..', 'package.json')) : require;
const { Liquid } = dependency('liquidjs');
const { chromium } = dependency('playwright');
const root = path.resolve(__dirname, '..');
const engine = new Liquid({ root: path.join(root, 'snippets'), extname: '.liquid' });
engine.registerFilter('asset_url', name => '/assets/' + name);
engine.registerFilter('stylesheet_tag', url => `<link rel="stylesheet" href="${url}">`);
engine.registerFilter('inline_asset_content', name => fs.readFileSync(path.join(root, 'assets', name), 'utf8'));
engine.registerFilter('placeholder_svg_tag', (_, className) => `<svg class="${className}" viewBox="0 0 1600 1000" aria-hidden="true"><rect width="1600" height="1000"/></svg>`);
engine.registerFilter('image_url', (img, width) => `/image/${img.id}?width=${width[1]}`);
engine.registerFilter('image_tag', (src, ...entries) => {
  const options = Object.fromEntries(entries);
  const widths = options.widths.split(',').map(Number);
  return `<img src="${src}" width="2000" height="1400" alt="Collection image" srcset="${widths.map(w=>src.replace(/width=\d+/, 'width='+w)+' '+w+'w').join(', ')}" sizes="${options.sizes}" class="${options.class}" loading="${options.loading}" fetchpriority="${options.fetchpriority}">`;
});
const sectionText = fs.readFileSync(path.join(root, 'sections/hero-slider.liquid'), 'utf8');
const schema = JSON.parse(sectionText.match(/{% schema %}([\s\S]*?){% endschema %}/)[1]);
const defaultSettings = Object.fromEntries(schema.settings.map(setting=>[setting.id,setting.default]));
const imports = {'@theme/splide':'/assets/splide.min.js','@theme/theme-slider':'/assets/theme-slider.js','@theme/scroll-container':'/assets/scroll-container.js','@theme/lenis':'/assets/lenis-v1.3.25.js','@theme/smooth-scroll':'/assets/smooth-scroll.js'};
async function markup(count, settings, id='hero', editor=false) {
  const blocks = Array.from({length:count},(_,i)=>({id:id+'-slide-'+i,settings:{image:{id:'desktop-'+i},mobile_image:i===1?null:{id:'mobile-'+i},link:'/collections/'+i,button_label:i===2?'':'Collection '+(i+1)}}));
  return engine.parseAndRender(sectionText.replace(/{% schema %}[\s\S]*?{% endschema %}/,''),{section:{id,settings:{...defaultSettings,autoplay_speed:2000,...settings},blocks},request:{design_mode:editor}});
}
async function fixture(name) {
  const count=name.includes('empty')?0:name.includes('single')?1:3;
  const settings={show_navigation:true};
  if(name.includes('manual'))settings.autoplay=false;
  if(name.includes('controls-off')){settings.autoplay=false;settings.show_navigation=false;settings.show_pagination=false;}
  if(name.includes('slide-type'))settings.slide_type='slide';
  const hero=await markup(count,settings,'hero',name.includes('editor'));
  const second=name.includes('double')?await markup(3,{autoplay:false},'second'):'';
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <link rel="stylesheet" href="/assets/base.css"><link rel="stylesheet" href="/assets/smooth-scroll.css"><link rel="stylesheet" href="/assets/splide.min.css">
    <style>:root{--font-body--family:Arial,sans-serif}body{background:white}.after{height:1800px}</style>
    <script type="importmap">${JSON.stringify({imports})}</script><script type="module" src="/assets/theme-slider.js"></script><script type="module" src="/assets/smooth-scroll.js"></script>
    </head><body><div class="page-wrapper"><main><section class="shopify-section olecute-hero-section">${hero}</section>${second}<div class="after"><button id="outside">Outside slider</button></div></main></div></body></html>`;
}
(async()=>{
  const fixtures={};for(const name of ['/', '/single','/empty','/editor-empty','/manual','/controls-off','/slide-type','/double']) fixtures[name]=await fixture(name);
  const server=http.createServer((req,res)=>{
    if(req.url.startsWith('/assets/')){res.setHeader('Content-Type',req.url.endsWith('.css')?'text/css':'text/javascript');return res.end(fs.readFileSync(path.join(root,req.url)));}
    if(req.url.startsWith('/image/')) {res.setHeader('Content-Type','image/svg+xml');return res.end(`<svg xmlns="http://www.w3.org/2000/svg" width="2000" height="1400" viewBox="0 0 2000 1400"><defs><linearGradient id="g"><stop stop-color="${req.url.includes('mobile')?'#b7b3cc':'#a79883'}"/><stop offset="1" stop-color="#cfb5a9"/></linearGradient></defs><rect width="2000" height="1400" fill="url(#g)"/></svg>`);}
    res.setHeader('Content-Type','text/html; charset=utf-8');res.end(fixtures[req.url]||fixtures['/']);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1360,height:900}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const url=`http://127.0.0.1:${server.address().port}`;
  const wait=ms=>page.waitForTimeout(ms);
  const hero=()=>page.locator('olecute-hero').first();
  const mounted=()=>page.waitForFunction(()=>document.querySelector('olecute-hero')?.slider?.Components?.Autoplay);
  const active=()=>hero().locator('.splide__pagination__page.is-active');
  try {
    await page.goto(url);await mounted();await wait(150);
    assert.equal(await hero().evaluate(el=>el.slider.length),3);
    assert.equal(await active().count(),1);
    assert.equal((await hero().boundingBox()).height,900);
    assert.equal((await hero().boundingBox()).width,1360);
    assert.equal(await hero().evaluate(el=>OlecuteSliders.init(el)===el.slider),true,'Shared helper prevents duplicate initialization');
    const first=hero().locator('.olecute-hero__slide:not(.splide__slide--clone) img').first();
    assert.equal(await first.getAttribute('loading'),'eager');assert.equal(await first.getAttribute('fetchpriority'),'high');
    assert.equal(await hero().locator('.olecute-hero__slide:not(.splide__slide--clone) img').nth(1).getAttribute('loading'),'lazy');
    assert.equal(await first.evaluate(el=>getComputedStyle(el).objectFit),'cover');
    assert.equal(await hero().evaluate(el=>el.progressAnimation.effect.getTiming().duration),2000);
    const time=await hero().evaluate(el=>el.progressAnimation.currentTime);await wait(160);assert(await hero().evaluate(el=>el.progressAnimation.currentTime)>time);
    await page.waitForFunction(()=>document.querySelector('olecute-hero').slider.index===1);
    await page.waitForFunction(()=>document.querySelector('olecute-hero').slider.state.is(Splide.STATES.IDLE));
    assert.equal(await active().count(),1);
    assert.equal(await hero().evaluate(el=>[...el.querySelectorAll('.olecute-hero__fill')].reduce((n,fill)=>n+fill.getAnimations().length,0)),1,'Only one progress animation survives a slide change');
    await hero().locator('.splide__arrow--next').click();await wait(820);assert.equal(await hero().evaluate(el=>el.slider.index),2);
    assert.equal(await hero().locator('.olecute-hero__slide:not(.splide__slide--clone)').nth(2).locator('a').count(),0,'Empty label omits CTA');
    assert(await hero().evaluate(el=>el.slider.Components.Autoplay.isPaused()),'Focus pauses autoplay');
    await active().focus();await page.keyboard.press('ArrowRight');await wait(820);assert.equal(await hero().evaluate(el=>el.slider.index),0,'Pagination keyboard navigation wraps');
    await hero().locator('.splide__toggle').click();await page.locator('body').click({position:{x:600,y:450}});await wait(100);
    assert(await hero().evaluate(el=>el.slider.Components.Autoplay.isPaused()),'Explicit pause survives blur');
    await hero().locator('.splide__toggle').click();await wait(100);assert.equal(await hero().evaluate(el=>el.slider.Components.Autoplay.isPaused()),false);
    await page.emulateMedia({reducedMotion:'reduce'});await wait(100);assert(await hero().evaluate(el=>el.slider.Components.Autoplay.isPaused()));
    assert.equal(await hero().evaluate(el=>el.progressAnimation),null);
    await hero().locator('.splide__arrow--next').click();assert.equal(await hero().evaluate(el=>el.slider.index),1,'Manual navigation remains available with reduced motion');
    await page.emulateMedia({reducedMotion:'no-preference'});
    await page.goto(url+'/manual');await mounted();await wait(100);
    assert.equal(await hero().evaluate(el=>el.slider.Components.Autoplay.isPaused()),true);
    assert.equal(await hero().evaluate(el=>el.progressAnimation),null);
    console.log('Static fill:',await active().locator('.olecute-hero__fill').evaluate(el=>({transform:getComputedStyle(el).transform,width:getComputedStyle(el).width,classes:el.closest('olecute-hero').className,sheets:[...document.styleSheets].map(s=>s.href)})));
    assert.equal(await active().locator('.olecute-hero__fill').evaluate(el=>getComputedStyle(el).transform),'matrix(1, 0, 0, 1, 0, 0)');
    for(const width of [320,390,749,750,990,1360]) {
      await page.setViewportSize({width,height:800});await wait(160);
      assert.equal((await hero().boundingBox()).height,800,'100dvh follows viewport');
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No horizontal page overflow');
      const image=hero().locator('.olecute-hero__slide:not(.splide__slide--clone) img').first();
      await image.evaluate(img=>img.decode());
      assert((await image.evaluate(img=>img.currentSrc)).includes(width<750?'mobile-0':'desktop-0'),'Responsive image source changes at theme breakpoint');
    }
    await page.setViewportSize({width:390,height:844});await wait(160);
    await hero().locator('.splide__arrow--next').click();await wait(820);
    assert((await hero().locator('.olecute-hero__slide:not(.splide__slide--clone) img').nth(1).evaluate(img=>img.currentSrc)).includes('desktop-1'),'Missing mobile image falls back to desktop');
    await page.goto(url+'/controls-off');await mounted();assert.equal(await hero().locator('.splide__arrow, .splide__pagination__page, .splide__toggle').count(),0);
    await page.mouse.move(320,400);await page.mouse.down();await page.mouse.move(60,400,{steps:12});await page.mouse.up();await wait(850);
    assert.notEqual(await hero().evaluate(el=>el.slider.index),0,'Drag navigates with controls hidden');
    await page.goto(url+'/single');await wait(150);assert.equal(await hero().evaluate(el=>Boolean(el.slider)),false);assert.equal(await hero().locator('.splide__slide--clone,.splide__pagination,.splide__arrows,.splide__toggle').count(),0);
    await page.goto(url+'/empty');await wait(100);assert.equal(await page.locator('olecute-hero').count(),0);assert.equal(await page.locator('.olecute-hero--empty').count(),0);
    await page.goto(url+'/editor-empty');assert.equal(await page.locator('.olecute-hero--empty').count(),1);
    await page.goto(url+'/slide-type');await mounted();assert.equal(await hero().locator('.splide__slide--clone').count(),0);assert.equal(await hero().evaluate(el=>el.slider.options.rewind),true);
    await page.goto(url+'/double');await mounted();assert.equal(await page.locator('olecute-hero.is-initialized').count(),2);
    assert(await page.evaluate(()=>document.querySelectorAll('olecute-hero')[0].slider!==document.querySelectorAll('olecute-hero')[1].slider));
    await page.evaluate(()=>document.dispatchEvent(new CustomEvent('shopify:block:select',{detail:{blockId:'hero-slide-2'}})));await wait(820);
    assert.equal(await hero().evaluate(el=>el.slider.index),2);assert(await hero().evaluate(el=>el.slider.Components.Autoplay.isPaused()));
    await page.evaluate(()=>{const old=document.querySelector('olecute-hero');window.oldHero=old;window.oldProgress=old.progressAnimation;window.oldSlider=old.slider;const section=old.closest('section');section.dispatchEvent(new CustomEvent('shopify:section:unload',{bubbles:true}));const replacement=old.cloneNode(true);old.replaceWith(replacement);});
    await mounted();await wait(100);
    assert(await page.evaluate(()=>oldSlider.state.is(Splide.STATES.DESTROYED)));
    assert.equal(await page.evaluate(()=>oldProgress?.playState),'idle','Old progress animation is canceled');
    assert.equal(await active().count(),1);
    const screenshotDir=process.env.HEADER_SCREENSHOTS;
    if(screenshotDir){fs.mkdirSync(screenshotDir,{recursive:true});await page.goto(url+'/manual');await mounted();await page.setViewportSize({width:1360,height:900});await wait(180);await page.screenshot({path:path.join(screenshotDir,'hero-desktop.png')});await page.setViewportSize({width:390,height:844});await wait(180);await page.screenshot({path:path.join(screenshotDir,'hero-mobile.png')});}
    const noJS=await browser.newContext({javaScriptEnabled:false,viewport:{width:1360,height:900}});const fallback=await noJS.newPage();await fallback.goto(url+'/manual');assert(await fallback.locator('.olecute-hero__slide').first().isVisible());assert(await fallback.locator('.olecute-hero__button').first().isVisible());assert.equal(await fallback.locator('.splide__arrow--next').isVisible(),false);await noJS.close();
    assert.deepEqual(errors,[],'No browser exceptions');
    console.log('PASS: production Splide, Liquid rendering, autoplay/progress/pause, manual/keyboard/drag, reduced motion, 6 viewport sizes, responsive images, empty/single, editor cleanup, multiple heroes and no-JS fallback.');
  } finally {await browser.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
