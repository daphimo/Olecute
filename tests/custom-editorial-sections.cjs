const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict');
const dependency = process.env.HEADER_VALIDATION_MODULES ? require('node:module').createRequire(path.join(process.env.HEADER_VALIDATION_MODULES, '..', 'package.json')) : require;
const { Liquid } = dependency('liquidjs'), { chromium } = dependency('playwright');
const root = path.resolve(__dirname, '..'), engine = new Liquid({ root: path.join(root, 'snippets'), extname: '.liquid' });
const sources = Object.fromEntries(['custom-tabbed-collection', 'custom-offer-timer'].map(name => [name, fs.readFileSync(path.join(root, 'sections', name + '.liquid'), 'utf8')]));
const schemas = Object.fromEntries(Object.entries(sources).map(([name, source]) => [name, JSON.parse(source.match(/{% schema %}([\s\S]*?){% endschema %}/)[1])]));
const defaults = schema => Object.fromEntries(schema.settings.filter(setting => setting.id).map(setting => [setting.id, setting.default]));
engine.registerFilter('asset_url', name => '/assets/' + name);
engine.registerFilter('stylesheet_tag', url => `<link rel="stylesheet" href="${url}">`);
engine.registerFilter('image_url', image => '/image/' + image.id);
engine.registerFilter('image_tag', (url, ...args) => { const attrs = Object.fromEntries(args); return `<img src="${url}" width="480" height="640" loading="${attrs.loading}" decoding="${attrs.decoding}" alt="${attrs.alt}" draggable="false">`; });
const products = Array.from({ length: 20 }, (_, i) => ({ id: i, title: 'Editorial product ' + i, url: '/products/' + i, featured_image: { id: i, alt: 'Editorial fashion ' + i } }));
function blocks(count, productCount = 10) { return Array.from({ length: count }, (_, i) => ({ id: 'block' + i, settings: { ...defaults(schemas['custom-tabbed-collection'].blocks[0]), label: 'Collection ' + (i + 1), collection: { title: 'Collection ' + i, url: '/collections/' + i, products: products.slice(0, productCount) } } })); }
async function render(name, id, overrides = {}, sectionBlocks = [], editor = false) {
  return `<div class="shopify-section" id="shopify-section-${id}">` + await engine.parseAndRender(sources[name].replace(/{% schema %}[\s\S]*?{% endschema %}/, ''), { section: { id, settings: { ...defaults(schemas[name]), ...overrides }, blocks: sectionBlocks }, request: { design_mode: editor } }) + '</div>';
}
(async () => {
  for (const count of [1, 2, 4, 8]) assert.equal(((await render('custom-tabbed-collection', 'test', {}, blocks(count))).match(/data-tab=/g) || []).length, count);
  for (const count of [3, 10, 20]) {
    const data = blocks(1, count); data[0].settings.products_to_show = 20;
    const html = await render('custom-tabbed-collection', 'test', {}, data);
    assert.equal((html.match(/<img /g) || []).length, count);
    assert.equal((html.match(/class="custom-tabbed-collection__item custom-tabbed-collection__discover"/g) || []).length, 1);
  }
  const limited = blocks(1, 20); limited[0].settings.products_to_show = 4; limited[0].settings.show_discover = false;
  const limitedHtml = await render('custom-tabbed-collection', 'test', {}, limited);
  assert.equal((limitedHtml.match(/<img /g) || []).length, 4); assert(!limitedHtml.includes('__discover'));
  for (const collection of [null, { title: 'Empty', url: '/collections/empty', products: [] }]) {
    const data = blocks(1); data[0].settings.collection = collection;
    assert(!(await render('custom-tabbed-collection', 'test', {}, data)).includes('<img '));
    assert((await render('custom-tabbed-collection', 'test', {}, data, true)).includes('Choose a collection'));
  }
  const tabs = await render('custom-tabbed-collection', 'tabs', {}, blocks(4));
  const timer = await render('custom-offer-timer', 'timer', { end_date: '2030-01-02', end_time: '12:00', timezone_offset: '+05:30', promotion_text: 'Seasonal favourites', expired_message: 'Offer ended' }, [], true);
  const extraTabs = await render('custom-tabbed-collection', 'tabs2', {}, blocks(2, 3));
  const extraTimer = await render('custom-offer-timer', 'timer2', { end_date: '2020-01-01', end_time: '00:00', timezone_offset: '+00:00', expired_message: 'Finished' });
  const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/assets/base.css"><style>body{--normal-page-width:1280px;--font-paragraph--family:Arial,sans-serif;--font-h2--family:Arial,sans-serif;background:#FCF9F4}</style><body class="page-width-normal"><main>${tabs}${timer}${extraTabs}${extraTimer}</main></body>`;
  const server = http.createServer((req, res) => {
    if (req.url.startsWith('/assets/')) { const file = path.join(root, req.url.split('?')[0]); res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : 'text/css'); res.end(fs.readFileSync(file)); }
    else if (req.url.startsWith('/image/')) { res.setHeader('Content-Type', 'image/svg+xml'); res.end('<svg xmlns="http://www.w3.org/2000/svg" width="480" height="640"><rect width="480" height="640" fill="#e7e0e5"/><ellipse cx="240" cy="160" rx="65" ry="85" fill="#675e6d"/><path d="M165 240L100 610H380L315 240Z" fill="#32166f"/></svg>'); }
    else { res.setHeader('Content-Type', 'text/html'); res.end(html); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1366, height: 1000 } });
    await page.addInitScript(() => {
      window.mockNow = Date.parse('2030-01-01T06:30:00Z'); Date.now = () => window.mockNow;
      const originalInterval = window.setInterval, originalClear = window.clearInterval, originalRAF = window.requestAnimationFrame;
      window.activeIntervals = new Set(); window.frameCalls = 0;
      window.setInterval = (...args) => { const id = originalInterval(...args); activeIntervals.add(id); return id; };
      window.clearInterval = id => { activeIntervals.delete(id); originalClear(id); };
      window.requestAnimationFrame = fn => { window.frameCalls++; return originalRAF(fn); };
    });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.waitForFunction(() => document.querySelector('custom-offer-timer').geometry);
    const first = page.locator('#CustomTabbedCollection-tabs'), offer = page.locator('#CustomOfferTimer-timer');
    assert.equal(await first.locator('[role=tab]').count(), 4);
    await first.locator('[role=tab]').nth(1).click(); assert.equal(await first.locator('[data-panel]:visible').getAttribute('data-panel'), 'block1');
    assert.equal(await page.locator('#CustomTabbedCollection-tabs2 [data-panel]:visible').getAttribute('data-panel'), 'block0');
    await page.keyboard.press('ArrowRight'); assert.equal(await first.locator('[data-panel]:visible').getAttribute('data-panel'), 'block2');
    await page.keyboard.press('Home'); assert.equal(await first.locator('[data-panel]:visible').getAttribute('data-panel'), 'block0');
    await page.keyboard.press('End'); assert.equal(await first.locator('[data-panel]:visible').getAttribute('data-panel'), 'block3');
    await first.locator('custom-tabbed-collection').evaluate(el => el.dispatchEvent(new CustomEvent('shopify:block:select', { detail: { blockId: 'block0' } })));
    assert.equal(await first.locator('[data-panel]:visible').getAttribute('data-panel'), 'block0');
    assert.equal(await offer.locator('[data-timer-days]').textContent(), '01');
    assert.equal(await offer.locator('[data-timer-hours]').textContent(), '00');
    assert.equal(await page.locator('#CustomOfferTimer-timer2 [data-timer-days]').textContent(), '00');
    assert(await page.locator('#CustomOfferTimer-timer2 .custom-offer-timer__expired').isVisible());
    assert.equal(await page.evaluate(() => activeIntervals.size), 1);
    assert(await page.evaluate(() => { const ids = [...document.querySelectorAll('[id]')].map(el => el.id); return new Set(ids).size === ids.length; }));
    const track = first.locator('[data-panel]:visible .custom-tabbed-collection__track');
    const box = await track.boundingBox();
    const cardSize = await track.locator('a').first().boundingBox(), discoverSize = await track.locator('a').last().boundingBox();
    assert.equal(cardSize.width, discoverSize.width); assert.equal(cardSize.height, discoverSize.height);
    await page.evaluate(() => { window.clickPrevented = null; document.addEventListener('click', event => { if (event.target.closest('.custom-tabbed-collection__item')) { window.clickPrevented = event.defaultPrevented; event.preventDefault(); } }, { capture: false }); });
    await track.locator('a').first().click(); assert.equal(await page.evaluate(() => window.clickPrevented), false, 'Normal click remains navigable');
    await page.mouse.move(box.x + box.width * .7, box.y + 80); await page.mouse.down(); await page.mouse.move(box.x + 50, box.y + 80, { steps: 12 }); await page.mouse.up();
    await page.waitForTimeout(150); assert(await track.evaluate(el => el.scrollLeft > 50));
    assert(!page.url().includes('/products/'), 'Drag does not navigate');
    async function connections() {
      return offer.evaluate(el => {
        const g = el.geometry;
        return el.anchors.map((anchor, i) => {
          const marker = document.createElement('i'); marker.style.cssText = `position:absolute;left:${anchor.point * 100}%;top:${anchor.depth}px;width:0;height:0;`;
          el.card.append(marker); const cardPoint = marker.getBoundingClientRect(); marker.remove();
          const end = document.createElement('i'); end.style.cssText = 'position:absolute;left:50%;top:100%;width:0;height:0;'; el.ropes[i].append(end); const ropePoint = end.getBoundingClientRect(); end.remove();
          return Math.hypot(cardPoint.x - ropePoint.x, cardPoint.y - ropePoint.y);
        });
      });
    }
    for (const width of [320, 390, 749, 750, 900, 1366]) {
      await page.setViewportSize({ width, height: 1000 }); await page.waitForTimeout(100);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'No overflow at ' + width);
      const sizing = await track.evaluate(el => ({ width: el.clientWidth, card: el.firstElementChild.getBoundingClientRect().width }));
      const view = width < 750 ? 1.25 : 5, gap = width < 750 ? 12 : 14;
      assert(Math.abs(sizing.card - (sizing.width - (view - 1) * gap) / view) < 1, 'Responsive products per view at ' + width);
      assert.equal(await offer.evaluate(el => el.card.offsetTop), width < 750 ? 90 : 160, 'Responsive hanging distance');
      assert((await connections()).every(distance => distance < 3), 'Ropes attach at ' + width);
      const anchor = await first.locator('[data-tab-collection-anchor]').boundingBox();
      assert(await offer.evaluate((el, bottom) => Math.abs(el.getBoundingClientRect().top + el.anchors[0].y - bottom) < 3, anchor.y + anchor.height), 'Ropes start at collection');
    }
    await page.setViewportSize({ width: 1366, height: 1000 }); await offer.scrollIntoViewIfNeeded(); await page.waitForTimeout(100);
    const timerBox = await offer.boundingBox();
    await page.mouse.move(timerBox.x + 50, timerBox.y + 50); await page.waitForTimeout(600);
    assert(await offer.evaluate(el => el.current < -.5)); assert((await connections()).every(distance => distance < 3));
    await page.mouse.move(timerBox.x + timerBox.width - 50, timerBox.y + 50); await page.waitForTimeout(600);
    assert(await offer.evaluate(el => el.current > .5)); assert((await connections()).every(distance => distance < 3));
    await page.mouse.move(0, 0); await page.waitForTimeout(1600); assert.equal(await offer.evaluate(el => el.current), 0);
    const settled = await page.evaluate(() => frameCalls); await page.waitForTimeout(150); assert.equal(await page.evaluate(() => frameCalls), settled, 'No idle animation loop');
    await page.emulateMedia({ reducedMotion: 'reduce' }); await page.mouse.move(timerBox.x + 50, timerBox.y + 50); await page.waitForTimeout(150); assert.equal(await offer.evaluate(el => el.current), 0);
    assert.equal(await offer.evaluate(el => { el.dataset.date = '2030-02-30'; return Number.isNaN(el.parseEnd()); }), true);
    await page.evaluate(() => window.mockNow = Date.parse('2030-01-02T06:30:01Z')); await page.waitForTimeout(1100);
    assert.equal(await offer.locator('[data-timer-seconds]').textContent(), '00'); assert(await offer.locator('.custom-offer-timer__expired').isVisible());
    assert.equal(await page.evaluate(() => activeIntervals.size), 0);
    await offer.evaluate(el => { el.dataset.date = '2031-01-01'; const replacement = el.cloneNode(true); el.replaceWith(replacement); });
    await page.waitForTimeout(100); assert.equal(await page.evaluate(() => activeIntervals.size), 1, 'Editor replacement initializes once');
    if (process.env.HEADER_SCREENSHOTS) {
      fs.mkdirSync(process.env.HEADER_SCREENSHOTS, { recursive: true });
      for (const width of [390, 1366]) { await page.setViewportSize({ width, height: 1000 }); await page.evaluate(() => scrollTo(0, 0)); await page.waitForTimeout(150); await page.screenshot({ path: path.join(process.env.HEADER_SCREENSHOTS, `editorial-${width}.png`) }); }
    }
    await page.evaluate(() => document.querySelector('main').replaceChildren()); await page.waitForTimeout(100);
    assert.equal(await page.evaluate(() => activeIntervals.size), 0, 'Unmount clears intervals');
    const touch = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await touch.goto(`http://127.0.0.1:${server.address().port}`);
    await touch.waitForFunction(() => document.querySelector('custom-offer-timer').geometry);
    const touchTrack = touch.locator('#CustomTabbedCollection-tabs [data-panel]:visible .custom-tabbed-collection__track');
    const touchBox = await touchTrack.boundingBox(), cdp = await touch.context().newCDPSession(touch);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: touchBox.x + touchBox.width - 20, y: touchBox.y + 100 }] });
    for (let step = 1; step <= 8; step++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: touchBox.x + touchBox.width - 20 - step * 28, y: touchBox.y + 100 }] });
      await touch.waitForTimeout(16);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await touch.waitForTimeout(350);
    assert(await touchTrack.evaluate(el => el.scrollLeft > 100), 'Native touch swipe moves the track');
    assert.equal(await touch.locator('custom-offer-timer').first().evaluate(el => el.canAnimate()), false, 'Touch does not animate timer');
    for (const view of [1, 1.15, 1.25, 1.5, 1.75, 2]) {
      await touch.locator('#CustomTabbedCollection-tabs').evaluate((el, value) => el.style.setProperty('--tabs-mobile-view', value), String(view));
      const sizes = await touchTrack.evaluate(el => ({ width: el.clientWidth, card: el.firstElementChild.getBoundingClientRect().width }));
      assert(Math.abs(sizes.card - (sizes.width - (view - 1) * 12) / view) < 1);
    }
    await touch.close();
    assert.deepEqual(errors, []);
    console.log('PASS: dynamic tabs/limits/empty collections, keyboard/editor selection, multiple instances, click/drag/native touch swipe, all mobile widths per view, timezone/expiry, rope attachments at 6 viewports, left/right/settling/reduced motion, editor replacement and cleanup.');
  } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
