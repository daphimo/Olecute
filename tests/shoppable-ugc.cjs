const fs = require('node:fs');
const assert = require('node:assert/strict');

const liquid = fs.readFileSync('sections/shoppable-ugc.liquid', 'utf8');
const css = fs.readFileSync('assets/shoppable-ugc.css', 'utf8');
const js = fs.readFileSync('assets/shoppable-ugc.js', 'utf8');
const templateText = fs.readFileSync('templates/index.json', 'utf8').replace(/^\/\*[\s\S]*?\*\//, '');
const template = JSON.parse(templateText);
const schema = JSON.parse(liquid.match(/{% schema %}([\s\S]*?){% endschema %}/)[1]);

assert.equal(template.order.at(-1), 'shoppable_ugc_home', 'Shoppable UGC is the last homepage section');
assert.equal(template.sections.shoppable_ugc_home.type, 'shoppable-ugc');
assert.equal(new Set(schema.settings.map((setting) => setting.id).filter(Boolean)).size, schema.settings.filter((setting) => setting.id).length);
for (const value of ["import { sliders }", "type: loop ? 'loop' : 'slide'", 'showModal()', 'shopify:block:select', 'IntersectionObserver']) assert(js.includes(value), `Missing behavior: ${value}`);
for (const value of ["render 'brand-colors'", "render 'custom-wishlist-button'", "render 'icon'", 'shop.metaobjects.shopable_video_popup.values', 'block_order']) {
  if (value === 'block_order') assert(templateText.includes(value));
  else assert(liquid.includes(value) || fs.readFileSync('snippets/shoppable-ugc-product-stripe.liquid', 'utf8').includes(value), `Missing integration: ${value}`);
}
for (const value of ['var(--color-primary)', 'var(--color-accent-pink)', 'var(--color-accent-yellow)', 'object-fit: cover', '@media (max-width: 749px)']) assert(css.includes(value), `Missing style: ${value}`);
for (const id of ['popup_logo', 'popup_logo_monochrome', 'popup_logo_opacity', 'popup_logo_size']) assert(schema.settings.some((setting) => setting.id === id), `Missing popup logo setting: ${id}`);
for (const value of ['section.settings.popup_logo', '--ugc-logo-size', '--ugc-logo-opacity', 'shoppable-ugc__logo--monochrome']) assert(liquid.includes(value) || css.includes(value), `Missing popup logo integration: ${value}`);

console.log('PASS: Shoppable UGC schema, brand, commerce, slider, reel, editor, and homepage integrations');
