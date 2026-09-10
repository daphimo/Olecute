/* Run with Node; needs liquidjs and playwright in HEADER_VALIDATION_MODULES or node_modules. */
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const dependency = process.env.HEADER_VALIDATION_MODULES
  ? createRequire(path.join(process.env.HEADER_VALIDATION_MODULES, '..', 'package.json')) : require;
const { Liquid } = dependency('liquidjs');
const { chromium } = dependency('playwright');
const root = path.resolve(__dirname, '..');
const engine = new Liquid({ root: path.join(root, 'snippets'), extname: '.liquid' });
engine.registerFilter('asset_url', (name) => '/assets/' + name);
engine.registerFilter('stylesheet_tag', (url) => `<link rel="stylesheet" href="${url}">`);
engine.registerFilter('inline_asset_content', (name) => fs.readFileSync(path.join(root, 'assets', name), 'utf8'));
engine.registerFilter('t', (name) => ({'content.cart_title':'Cart','accessibility.cart':'Cart','content.account_title':'Account'})[name] || name);
const sectionText = fs.readFileSync(path.join(root,'sections/header.liquid'),'utf8');
const schema = JSON.parse(sectionText.match(/{% schema %}([\s\S]*?){% endschema %}/)[1]);
const settings = Object.fromEntries(schema.settings.map((setting)=>[setting.id, setting.default || '']));
const blocks = schema.presets[0].blocks.map((block,i)=>({...block,id:'nav-'+i,settings:{...block.settings,link:'/collections/all'}}));
const routes = {root_url:'/',cart_url:'/cart',account_url:'/account',all_products_collection_url:'/collections/all'};

async function fixture(home) {
  engine.options.globals = {routes, template:{name:home?'index':'product'},shop:{customer_accounts_enabled:true},cart:{item_count:3},settings:{cart_type:'drawer'}};
  const header = await engine.parseAndRender(sectionText.replace(/{% schema %}[\s\S]*?{% endschema %}/,''), {
    section:{id:'test',settings,blocks}, routes, request:{page_type:home?'index':'product'},
    template:{name:home?'index':'product'}, shop:{customer_accounts_enabled:true}, cart:{item_count:3}, settings:{cart_type:'drawer'},
  });
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <link rel="stylesheet" href="/assets/base.css">
    <link rel="stylesheet" href="/assets/smooth-scroll.css">
    <style>:root{--font-body--family:Arial,sans-serif;--font-heading--family:Arial,sans-serif}body{background:#FCF9F4}main{min-height:2600px;background:linear-gradient(135deg,#807f67,#b6a68a 30%,#e0b9ac 60%,#fcf9f4)}main a{display:inline-block;margin-top:400px}</style>
    <script type="importmap">{"imports":{"@theme/scroll-container":"/assets/scroll-container.js","@theme/smooth-scroll":"/assets/smooth-scroll.js","@shopify/events":"/mock-events.js"}}</script>
    </head><body><div class="page-wrapper"><div id="header-group"><div style="height:40px">Existing announcement</div><section class="olecute-header-section">${header}</section></div><main><a href="#end">Background link</a></main></div>
    <theme-drawer id="cart-drawer"></theme-drawer><script>document.querySelector('theme-drawer').open=function(){this.setAttribute('open','')};</script></body></html>`;
}

(async()=>{
  const home = await fixture(true), standard = await fixture(false);
  const server = http.createServer((req,res)=>{
    if(req.url.startsWith('/assets/')) { const file=path.join(root,req.url); res.setHeader('Content-Type',file.endsWith('.css')?'text/css':'text/javascript'); return res.end(fs.readFileSync(file)); }
    if(req.url==='/mock-events.js') {res.setHeader('Content-Type','text/javascript');return res.end('export const StandardEvents={cartLinesUpdate:"cart:lines:update"};');}
    res.setHeader('Content-Type','text/html');res.end(req.url==='/internal'?standard:home);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser = await chromium.launch({headless:true});
  const page = await browser.newPage({viewport:{width:1360,height:900}});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  const url=`http://127.0.0.1:${server.address().port}`;
  const settle=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const scroll=async(y)=>{await page.evaluate(y=>{const el=document.querySelector('olecute-header');el.scroller.scrollTo({top:y,behavior:'instant'});el.schedule();},y);await settle();};
  const vars=()=>page.locator('olecute-header').evaluate(el=>Object.fromEntries(['logo-scale','menu-opacity','nav-opacity','quote-opacity','mobile-quote'].map(key=>[key,Number(el.style.getPropertyValue('--'+key))])));
  try {
    await page.goto(url);await page.waitForFunction(()=>document.querySelector('olecute-header').scroller);await settle();
    const scales=[];
    for(const y of [0,180,350,500,690]) {await scroll(y);scales.push((await vars())['logo-scale']);}
    assert(scales.every((value,i)=>i===0||value<scales[i-1]),'Homepage scale must shrink continuously');
    assert.equal((await vars())['menu-opacity'],1);
    assert.equal((await vars())['nav-opacity'],0);
    assert(await page.locator('[data-landing-nav]').evaluate(el=>el.inert));
    await page.locator('[data-landing-menu] button').click();
    assert(await page.locator('#desktop-menu-test').evaluate(el=>el.open));
    assert.equal(await page.locator('#desktop-menu-test').evaluate(el=>el.getBoundingClientRect().height),900);
    await page.keyboard.press('Tab');
    assert(await page.evaluate(()=>document.activeElement.closest('dialog')!==null));
    await page.keyboard.press('Escape');await settle();
    assert.equal(await page.locator('.page-wrapper').evaluate(()=>window.scrollY),690);
    assert(await page.locator('[data-landing-menu] button').evaluate(el=>el===document.activeElement));
    await page.locator('.olecute-header__desktop [data-header-open="search-test"]').click();
    assert(await page.locator('#search-test').evaluate(el=>el.open));
    await page.keyboard.press('Escape');
    await page.locator('.olecute-header__desktop [data-cart-drawer]').click();
    assert(await page.locator('#cart-drawer').evaluate(el=>el.hasAttribute('open')));
    await page.evaluate(()=>{const event=new Event('cart:lines:update');event.promise=Promise.resolve({cart:{totalQuantity:7}});document.dispatchEvent(event);});
    assert.deepEqual(await page.locator('[data-cart-count]').allTextContents(),['7','7']);
    await page.goto(url+'/internal');await settle();
    assert.equal((await vars())['nav-opacity'],1);await scroll(140);assert.equal((await vars())['quote-opacity'],1);
    for(const width of [320,390,430,749,750,990,1360]) {
      await page.setViewportSize({width,height:900});await settle();await scroll(0);
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No horizontal viewport overflow at '+width);
      if(width<750) {
        assert.equal(await page.getByRole('button',{name:'Open menu',exact:true}).count(),1,'One accessible menu trigger');
        const actions=page.locator('.olecute-header__mobile-left > button, .olecute-header__mobile-icons > a');
        for(const action of await actions.all()) {
          const style=await action.evaluate(el=>{const s=getComputedStyle(el);return {width:s.width,height:s.height,radius:s.borderRadius,background:s.backgroundColor};});
          assert.deepEqual(style,{width:'44px',height:'44px',radius:'50%',background:'rgb(255, 255, 255)'});
        }
        for(const y of [0,60,120,260]) {
          await scroll(y);
          assert(await page.locator('[data-mobile-quote]').evaluate(el=>!el.inert && getComputedStyle(el).opacity==='1' && getComputedStyle(el).transform==='none'),'Quote stays visible throughout scroll');
        }
        const cart=page.locator('.olecute-header__cart-icon');
        const box=await cart.boundingBox(),count=await cart.locator('[data-cart-count]').boundingBox();
        assert(Math.abs(count.x+count.width/2-(box.x+box.width/2))<1,'Count horizontally centered in bag');
        assert(Math.abs(count.y+count.height/2-(box.y+12.5))<1,'Count centered below bag handle');
        const brand=await page.locator('.olecute-header__mobile-brand').boundingBox();
        assert(Math.abs(brand.x+brand.width/2-width/2)<1,'Mobile logo centered');
        await scroll(260);
        await page.locator('.olecute-header__mobile [data-header-open="mobile-menu-test"]').click();
        assert(await page.locator('#mobile-menu-test').evaluate(el=>el.open));
        await page.keyboard.press('Escape');await settle();
        assert.equal(await page.evaluate(()=>document.scrollingElement.scrollTop),260);
        await page.locator('.olecute-header__mobile [data-header-open="search-test"]').click();
        assert(await page.locator('#search-test').evaluate(el=>el.open));await page.keyboard.press('Escape');
      }
    }
    await page.emulateMedia({reducedMotion:'reduce'});await page.goto(url);await settle();
    assert.equal((await vars())['menu-opacity'],1);
    assert.equal(await page.locator('.olecute-header__spinner').evaluate(el=>getComputedStyle(el).animationName),'none');
    await page.emulateMedia({reducedMotion:'no-preference'});await settle();
    await scroll(690);
    await page.locator('[data-landing-menu] button').click();
    await page.evaluate(()=>{const old=document.querySelector('olecute-header');const replacement=old.cloneNode(true);replacement.querySelectorAll('dialog').forEach(dialog=>dialog.removeAttribute('open'));old.replaceWith(replacement);});
    await settle();
    assert.equal(await page.locator('.page-wrapper').evaluate(el=>el.style.overflow),'');
    await page.locator('[data-landing-menu] button').click();
    assert(await page.locator('#desktop-menu-test').evaluate(el=>el.open));
    await page.setViewportSize({width:390,height:844});await settle();
    assert.equal(await page.locator('#desktop-menu-test').evaluate(el=>el.open),false);
    await page.setViewportSize({width:1360,height:900});await settle();
    const output=process.env.HEADER_SCREENSHOTS;
    if(output){fs.mkdirSync(output,{recursive:true});for(const y of [0,200,400,690]){await scroll(y);await page.screenshot({path:path.join(output,`home-${y}.png`)});}await page.setViewportSize({width:390,height:844});await scroll(0);await page.screenshot({path:path.join(output,'mobile.png')});}
    assert.deepEqual(errors,[],'No browser exceptions');
    console.log('PASS: Liquid rendering, continuous timeline, internal transition, 7 viewport sizes, mobile quote/buttons/count, drawers, focus, scroll restoration, cart updates and reduced motion.');
  } finally {await browser.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
