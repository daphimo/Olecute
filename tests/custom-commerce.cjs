const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const dependency=process.env.HEADER_VALIDATION_MODULES?require('node:module').createRequire(path.join(process.env.HEADER_VALIDATION_MODULES,'..','package.json')):require;
const {Liquid}=dependency('liquidjs'),{chromium}=dependency('playwright');
const root=path.resolve(__dirname,'..'),engine=new Liquid({root:path.join(root,'snippets'),extname:'.liquid'});
const escape=value=>String(value??'').replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;');
engine.registerFilter('json',value=>JSON.stringify(value??null));
engine.registerFilter('money',value=>'$'+(Number(value)/100).toFixed(2));
engine.registerFilter('asset_url',name=>'/assets/'+name);
engine.registerFilter('stylesheet_tag',url=>`<link rel="stylesheet" href="${url}">`);
engine.registerFilter('placeholder_svg_tag',()=>'<svg viewBox="0 0 300 400"></svg>');
engine.registerFilter('image_url',(image,...args)=>`/image/${image.id}?width=${Object.fromEntries(args).width}`);
engine.registerFilter('image_tag',(url,...args)=>{const o=Object.fromEntries(args);return `<img src="${url}" width="540" height="720" srcset="${(o.widths||'480').split(',').map(w=>url.replace(/width=\d+/,`width=${w.trim()}`)+' '+w.trim()+'w').join(',')}" sizes="${o.sizes}" loading="${o.loading}" decoding="async" class="${o.class||''}" alt="Collection image">`;});
const settingGroup=JSON.parse(fs.readFileSync(path.join(root,'config/settings_schema.json'),'utf8')).find(g=>g.name==='Custom Product Card');
const settings=Object.fromEntries(settingGroup.settings.map(s=>[s.id,s.default]));
engine.options.globals = {settings};
const routes={root_url:'/',cart_add_url:'/cart/add',all_products_collection_url:'/collections/all'};
function variant(id,color,size,available=true){return {id,available,options:[color,size],price:1400+id,compare_at_price:id%2?0:2400,metafields:{custom:{chest:{value:id%2?'32':'30 – 32'},high_waist:{value:'26/28'},hip:{value:null}}}};}
const variants=[variant(200,'Red','Small'),variant(201,'Red','Medium'),variant(202,'Red','Large',false),variant(203,'Blue','Small',false),variant(204,'Blue','Medium')];
const product={id:20,title:'Linen <Summer> Dress',handle:'linen',url:'/products/linen',available:true,variants,selected_or_first_available_variant:variants[0],options:['Color','Size'],options_with_values:[{name:'Color',values:['Red','Blue']},{name:'Size',values:['Small','Medium','Large']}],images:[{id:'one'},{id:'two'},{id:'three'}],featured_image:{id:'one'},tags:['NEW'],metafields:{custom:{highlights:{type:'list.single_line_text_field',value:['Cotton','Relaxed fit']}}}};
const single={...product,id:21,title:'Single piece',url:'/products/single',images:[{id:'one'}],tags:[],variants:[{...variants[0],id:300}],selected_or_first_available_variant:{...variants[0],id:300}};
engine.options.globals.routes = routes;
async function render(name,vars={}){return engine.renderFile(name,{settings,routes,...vars});}
const imports={'@theme/utilities':'/assets/utilities.js','@theme/section-renderer':'/assets/section-renderer.js','@theme/morph':'/mock-morph.js','@shopify/events':'/mock-events.js','@theme/component':'/mock-component.js','@theme/theme-drawer':'/mock-drawer.js'};
(async()=>{
  const runtime=await render('custom-commerce'),cards=await render('custom-product-card',{product})+await render('custom-product-card',{product:single});
  const quick=await render('custom-quick-add',{product});
  const wishlist=await engine.parseAndRender(fs.readFileSync(path.join(root,'sections/custom-wishlist.liquid'),'utf8').replace(/{% schema %}[\s\S]*?{% endschema %}/,''),{settings,routes});
  assert(cards.includes('New In'));assert(cards.includes('33% off'));assert(!cards.includes('undefined'));assert.equal((cards.match(/data-custom-gallery-step=/g)||[]).length,2);
  const noHighlights=await render('custom-product-highlights',{product:{metafields:{}}});assert(!noHighlights.includes('custom-highlights'));
  const textHighlights=await render('custom-product-highlights',{product:{metafields:{custom:{highlights:{type:'single_line_text_field',value:'Cotton'}}}}});assert(textHighlights.includes('Cotton'));
  const schemaText=fs.readFileSync(path.join(root,'config/settings_schema.json'),'utf8');JSON.parse(schemaText);
  let adds=0,fail=false,delay=0,count=0,quickRequests=0,refreshFailure=false;
  const html=`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/assets/base.css"><style>body{--font-body--family:Arial,sans-serif;background:#FCF9F4}.fixture-grid{display:grid;grid-template-columns:repeat(2,minmax(0,320px));gap:20px;padding:12px}.spacer{height:1600px}</style><script type="importmap">${JSON.stringify({imports})}</script></head><body><span data-cart-count>0</span><div class="fixture-grid">${cards}</div>${wishlist}<div class="spacer"></div><div id="shopify-section-cart-drawer-section"><theme-drawer id="cart-drawer"><dialog><cart-drawer-component auto-open><cart-items-component data-section-id="cart-drawer-section"><div class="cart-drawer__content">Cart</div></cart-items-component></cart-drawer-component></dialog></theme-drawer></div>${runtime}<script type="module" src="/assets/cart-drawer.js"></script><script>const drawer=document.querySelector('theme-drawer');drawer.open=function(){window.openedAt=performance.now();window.opens=(window.opens||0)+1;this.setAttribute('open','')};Object.defineProperty(drawer,'isOpen',{get(){return this.hasAttribute('open')}});</script></body></html>`;
  const server=http.createServer(async(req,res)=>{
    const url=new URL(req.url,'http://local');
    if(url.pathname==='/mock-component.js')return res.end('export class Component extends HTMLElement { connectedCallback(){} disconnectedCallback(){} }');
    if(url.pathname==='/mock-drawer.js')return res.end('export class DrawerOpenEvent { static eventName="theme-drawer:open" }');
    if(url.pathname==='/mock-morph.js'){res.setHeader('Content-Type','text/javascript');return res.end('export const MORPH_OPTIONS={};export function morph(existing,next){window.morphedAt=performance.now(); existing.querySelector("cart-items-component").innerHTML=next.querySelector("cart-items-component").innerHTML;}');}
    if(url.pathname==='/mock-events.js'){res.setHeader('Content-Type','text/javascript');return res.end('export const StandardEvents={cartLinesUpdate:"cart:lines:update"};export class CartLinesUpdateEvent extends Event{constructor(p){super(StandardEvents.cartLinesUpdate,{bubbles:true});Object.assign(this,p)}static createCartFromAjaxResponse(c){return {totalQuantity:c.item_count}}}');}
    if(url.pathname.startsWith('/assets/')){res.setHeader('Content-Type',url.pathname.endsWith('.css')?'text/css':'text/javascript');return res.end(fs.readFileSync(path.join(root,url.pathname)));}
    if(url.pathname.startsWith('/image/')){res.setHeader('Content-Type','image/svg+xml');return res.end('<svg xmlns="http://www.w3.org/2000/svg" width="540" height="720"><rect width="540" height="720" fill="#e8e4e1"/><path d="M200 100h140l80 450H120Z" fill="#79534e"/></svg>');}
    if(url.searchParams.get('section_id')){quickRequests++;res.setHeader('Content-Type','text/html');return res.end(quick);}
    if(url.pathname==='/cart/add.js'){
      adds++;let text='';for await(const chunk of req)text+=chunk;const data=JSON.parse(text);assert(data.items[0].id);await new Promise(r=>setTimeout(r,delay));res.setHeader('Content-Type','application/json');
      if(fail){res.statusCode=422;return res.end(JSON.stringify({description:'This option is sold out.'}));}count+=data.items[0].quantity;
      return res.end(JSON.stringify({items:data.items,sections:refreshFailure?{}:{'cart-drawer-section':`<div id="shopify-section-cart-drawer-section"><cart-items-component>Updated cart ${count}</cart-items-component></div>`}}));
    }
    if(url.pathname==='/cart.js'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({item_count:count}));}
    if(url.pathname==='/cart'&&url.searchParams.has('sections')){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({'cart-drawer-section':null}));}
    res.setHeader('Content-Type',url.pathname.startsWith('/mock-')?'text/javascript':'text/html');res.end(html);
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}`;
  const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1360,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  try{
    await page.goto(url);await page.waitForFunction(()=>window.OlecuteCommerce);const card=page.locator('.custom-product-card').first();await page.mouse.move(1000,700);await page.waitForTimeout(200);
    await page.evaluate(()=>{const event=new Event('cart:lines:update');event.action='add';event.promise=new Promise(resolve=>window.resolvePending=resolve);document.dispatchEvent(event);});
    assert.equal(await page.evaluate(()=>window.opens||0),0,'Existing nonempty drawer waits for a pending legacy add');
    await page.evaluate(()=>resolvePending({detail:{didError:true}}));await page.waitForTimeout(60);assert.equal(await page.evaluate(()=>window.opens||0),0,'Legacy failure never opens drawer');
    assert.equal(await card.locator('.custom-gallery-arrow').first().evaluate(el=>getComputedStyle(el).opacity),'0');await card.hover();await page.waitForTimeout(180);assert.equal(await card.locator('.custom-gallery-arrow').first().evaluate(el=>getComputedStyle(el).opacity),'1');
    await card.locator('[data-custom-gallery-step="1"]').click();assert.equal(await card.locator('[data-custom-gallery]').getAttribute('data-index'),'1');assert((await card.locator('[data-custom-image] img').getAttribute('src')).includes('two'));
    for(const [ratio,height] of [['4 / 3','auto'],['1','auto'],['3 / 4','auto'],['3 / 4','280px']]){await card.evaluate((el,v)=>{el.style.setProperty('--custom-ratio',v[0]);el.style.setProperty('--custom-image-height',v[1]);},[ratio,height]);const box=await card.locator('.custom-product-card__media').boundingBox();if(height!=='auto')assert.equal(box.height,280);else assert(Math.abs(box.width/box.height-(ratio==='1'?1:ratio==='4 / 3'?4/3:3/4))<.01);}
    await page.evaluate(()=>document.querySelector('.custom-product-card').removeAttribute('style'));
    await card.locator('[data-custom-quick-add]').click();await page.locator('#custom-quick-add').waitFor({state:'visible'});const options=page.locator('custom-product-options'),dialog=page.locator('#custom-quick-add');
    assert.equal(quickRequests,1);assert(await dialog.evaluate(el=>el.matches(':modal')));assert.equal(await page.evaluate(()=>document.body.style.position),'fixed');
    assert.equal(await options.locator('[data-measure=chest]').textContent(),'30-32 Inch');assert.equal(await options.locator('[data-measure=hip]').textContent(),'-');
    await options.locator('.custom-measurement-tools [data-custom-unit=cm]').click();assert.equal(await options.locator('[data-measure=chest]').textContent(),'76.2-81.28 cm');
    await options.locator('[data-custom-option-value=Medium]').click();assert.equal(await options.locator('[name=id]').inputValue(),'201');assert.equal(await options.locator('[data-measure=chest]').textContent(),'81.28 cm');assert.equal(await options.locator('[data-custom-price] s').count(),0);
    await options.locator('[data-custom-option-value=Blue]').click();assert.equal(await options.locator('[name=id]').inputValue(),'204');assert(await options.locator('[data-custom-option-value=Small]').isDisabled());
    await options.locator('[data-custom-chart-open]').click();const chart=options.locator('dialog');assert(await chart.isVisible());assert.equal(await chart.locator('tbody tr').count(),2);
    const chartBox=await chart.boundingBox(),quickBox=await dialog.boundingBox();assert(chartBox.x+chartBox.width<quickBox.x,'Chart sits left of desktop quick add');
    await chart.locator('[data-custom-unit=in]').click();assert.equal(await chart.locator('tbody td').nth(1).textContent(),'32 Inch');await page.keyboard.press('Escape');assert.equal(await options.locator('[name=id]').inputValue(),'204');
    await options.locator('[data-custom-wishlist]').click();assert.equal(await options.locator('[data-custom-wishlist]').getAttribute('aria-pressed'),'true');assert.equal(await page.locator('#custom-wishlist-toast').isVisible(),true);assert.equal(await page.evaluate(()=>JSON.parse(localStorage.olecute_wishlist_v1)[0].size),'Medium');
    await options.locator('[data-custom-wishlist]').click();assert.equal(await page.evaluate(()=>JSON.parse(localStorage.olecute_wishlist_v1).length),0);await options.locator('[data-custom-wishlist]').click();
    await page.keyboard.press('Escape');await page.waitForTimeout(80);assert.equal(await page.evaluate(()=>document.body.style.position),'');assert(await card.locator('[data-custom-quick-add]').evaluate(el=>el===document.activeElement));
    await page.reload();await page.waitForFunction(()=>window.OlecuteCommerce);assert.equal(await page.locator('[data-custom-wishlist-card]').count(),1);assert.equal(await page.locator('[data-wishlist-size]').textContent(),'Size Medium');
    delay=250;const direct=page.locator('[data-direct-variant]');await direct.click();assert.equal(await page.evaluate(()=>window.opens||0),0,'Drawer cannot open before add response');await page.waitForFunction(()=>window.opens>0);assert.equal(adds,1);assert.equal(await page.locator('[data-cart-count]').textContent(),'1');assert(await page.evaluate(()=>openedAt>=morphedAt),'Drawer opens after section rendering');
    await page.evaluate(()=>document.querySelector('theme-drawer').removeAttribute('open'));const opens=await page.evaluate(()=>window.opens);fail=true;await direct.click();await page.getByRole('alert').filter({hasText:'sold out'}).waitFor();assert.equal(await page.evaluate(()=>window.opens),opens);fail=false;
    await card.locator('[data-custom-quick-add]').click();await dialog.waitFor({state:'visible'});const before=quickRequests;await options.locator('[data-custom-option-value=Medium]').click();assert.equal(quickRequests,before,'Variants require no requests');
    const beforeAdd=adds;await options.locator('.custom-add-button').evaluate(button=>{button.click();button.click();});await page.waitForFunction(()=>!document.querySelector('#custom-quick-add').open);assert.equal(adds,beforeAdd+1,'Double click adds once');
    await page.locator('[data-custom-wishlist-remove]').click();assert.equal(await page.locator('[data-custom-wishlist-card]').count(),0);assert(await page.locator('[data-wishlist-empty]').isVisible());
    await page.route('**/cart/add.js',route=>route.abort());const networkOpens=await page.evaluate(()=>window.opens);await direct.click();await page.locator('.custom-product-card').nth(1).locator('[data-custom-error]').filter({hasText:'fetch'}).waitFor();assert.equal(await page.evaluate(()=>window.opens),networkOpens);await page.unroute('**/cart/add.js');
    refreshFailure=true;await direct.click();await page.locator('.custom-product-card').nth(1).locator('[data-custom-error]').filter({hasText:'Added to cart, but'}).waitFor();assert.equal(await page.evaluate(()=>window.opens),networkOpens,'Failed refresh never shows stale cart');refreshFailure=false;
    for(const width of [320,390,749,900,1360]){
      await page.setViewportSize({width,height:844});await card.locator('[data-custom-quick-add]').click();await dialog.waitFor({state:'visible'});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));const box=await dialog.boundingBox();assert(box.x>=0&&box.x+box.width<=width);await options.locator('[data-custom-chart-open]').click();const cb=await chart.boundingBox();assert(cb.x>=0&&cb.x+cb.width<=width);await page.keyboard.press('Escape');await page.keyboard.press('Escape');
    }
    const result=await page.evaluate(()=>['30','30-32',' 30 – 32 ','30/32',null,'','garbage',0,{value:32}].map(v=>OlecuteCommerce.measurement(v,'cm')));assert.deepEqual(result,['76.2 cm','76.2-81.28 cm','76.2-81.28 cm','76.2-81.28 cm','-','-','-','-','81.28 cm']);
    await card.locator('[data-custom-quick-add]').click();await dialog.waitFor({state:'visible'});await options.locator('[data-custom-wishlist]').click();await page.locator('#custom-wishlist-toast').waitFor({state:'hidden',timeout:11000});
    await options.locator('[data-custom-wishlist]').click();assert(await page.locator('#custom-wishlist-toast').isHidden(),'Removing does not show an added toast');
    await page.evaluate(()=>{window.originalSetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(){throw Error('Storage unavailable')};});await options.locator('[data-custom-wishlist]').click();assert.equal(await options.locator('[data-custom-wishlist]').getAttribute('aria-pressed'),'false');assert(await options.locator('[data-custom-error]').textContent());await page.evaluate(()=>Storage.prototype.setItem=originalSetItem);await page.keyboard.press('Escape');
    await page.evaluate(()=>document.dispatchEvent(new CustomEvent('shopify:section:load',{bubbles:true})));await card.locator('[data-custom-quick-add]').click();await dialog.waitFor({state:'visible'});await page.evaluate(()=>document.dispatchEvent(new CustomEvent('shopify:section:unload',{bubbles:true})));assert.equal(await dialog.isVisible(),false);
    await page.evaluate(()=>window.scrollTo({top:400,behavior:'instant'}));await card.locator('[data-custom-quick-add]').evaluate(button=>button.click());await dialog.waitFor({state:'visible'});assert.equal(await page.evaluate(()=>document.body.style.top),'-400px');await page.keyboard.press('Escape');await page.waitForTimeout(80);assert.equal(await page.evaluate(()=>window.scrollY),400);await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));
    if(process.env.HEADER_SCREENSHOTS){fs.mkdirSync(process.env.HEADER_SCREENSHOTS,{recursive:true});for(const width of [390,1360]){await page.setViewportSize({width,height:844});await card.locator('[data-custom-quick-add]').click();await dialog.waitFor({state:'visible'});await options.locator('[data-custom-chart-open]').click();await page.screenshot({path:path.join(process.env.HEADER_SCREENSHOTS,`commerce-${width}.png`)});await page.keyboard.press('Escape');await page.keyboard.press('Escape');}}
    assert.deepEqual(errors,[]);console.log('PASS: Liquid cards/metafields, galleries/ratios, multi-option variants, units/chart, wishlist persistence/removal, cart success/failure/order/double clicks, modal focus/locks, editor reloads and 5 viewport widths.');
  }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
