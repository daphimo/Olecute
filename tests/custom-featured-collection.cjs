const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const dependency = process.env.HEADER_VALIDATION_MODULES ? require('node:module').createRequire(path.join(process.env.HEADER_VALIDATION_MODULES, '..', 'package.json')) : require;
const { Liquid } = dependency('liquidjs'), { chromium } = dependency('playwright');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'sections/custom-featured-collection.liquid'), 'utf8');
const schema = JSON.parse(source.match(/{% schema %}([\s\S]*?){% endschema %}/)[1]);
const defaults = Object.fromEntries(schema.settings.filter(s => s.id).map(s => [s.id, s.default]));
const engine = new Liquid({ root: path.join(root, 'snippets'), extname: '.liquid' });
engine.registerFilter('asset_url', value => value);
engine.registerFilter('stylesheet_tag', () => '');
engine.registerFilter('money', value => '$' + value / 100);
engine.registerFilter('placeholder_svg_tag', () => '<svg viewBox="0 0 300 400"></svg>');
const products = Array.from({ length: 20 }, (_, i) => ({ id: i + 1, title: 'Product ' + i, url: '/products/' + i, variants: [], selected_or_first_available_variant: { price: 139500 }, images: [], tags: [] }));
const collection = { title: 'Selected collection', url: '/collections/selected', products };
const render = (overrides = {}, design_mode = false) => engine.parseAndRender(source.replace(/{% schema %}[\s\S]*?{% endschema %}/, ''), { section: { id: 'test', index: 2, settings: { ...defaults, collection, ...overrides } }, request: { design_mode } });
const css = ['base.css', 'custom-commerce.css', 'custom-featured-collection.css'].map(file => fs.readFileSync(path.join(root, 'assets', file), 'utf8')).join('\n');
(async () => {
  for (const count of [2, 4, 8, 16]) assert.equal(((await render({ products_to_show: count })).match(/<article /g) || []).length, count);
  assert.equal(((await render({ products_to_show: 8, collection: { ...collection, products: products.slice(0, 3) } })).match(/<article /g) || []).length, 3);
  for (const empty of [null, { ...collection, products: [] }]) {
    assert.equal((await render({ collection: empty })).trim(), '');
    assert((await render({ collection: empty }, true)).includes('<p>'));
  }
  assert((await render()).includes('href="/collections/selected"'));
  assert(!(await render({ show_discover_more: false })).includes('__discover'));
  assert(!(await render({ heading: '', show_discover_more: false })).includes('__header'));
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ javaScriptEnabled: false });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    async function display(overrides = {}) {
      await page.setContent('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>' + css + '</style><style>body{--normal-page-width:1200px;--font-body--family:Arial;--custom-ratio:3/4}</style><body class="page-width-normal">' + await render({ products_to_show: 8, ...overrides }) + '</body>');
    }
    for (const width of [750, 900, 1360]) {
      await page.setViewportSize({ width, height: 900 });
      for (const columns of [2, 3, 4, 5, 6]) {
        await display({ desktop_columns: columns });
        assert.equal(await page.locator('.custom-featured-collection__track').evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length), columns);
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      }
    }
    for (const width of [320, 390, 749]) {
      await page.setViewportSize({ width, height: 900 });
      for (const view of ['1', '1.25', '1.5', '2', '2.25', '2.5']) {
        await display({ mobile_products_per_view: view });
        const result = await page.locator('.custom-featured-collection__track').evaluate(el => ({ width: el.clientWidth, item: el.firstElementChild.getBoundingClientRect().width, overflow: el.scrollWidth > el.clientWidth, snap: getComputedStyle(el).scrollSnapType, count: el.children.length }));
        assert(Math.abs(result.item - (result.width - (Number(view) - 1) * 12) / Number(view)) < 1);
        assert(result.overflow); assert.equal(result.snap, 'x mandatory'); assert.equal(result.count, 8);
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        await page.locator('.custom-featured-collection__track').evaluate(el => el.scrollLeft = el.scrollWidth);
        assert(await page.locator('.custom-featured-collection__track').evaluate(el => el.scrollLeft > 0));
      }
    }
    assert.deepEqual(errors, []);
    console.log('PASS: product limits, empty/editor states, links, 5 desktop column settings, 6 mobile widths per view across 6 viewport sizes, native scrolling with JavaScript disabled, and no page overflow.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
