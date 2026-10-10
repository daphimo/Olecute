const fs = require('node:fs');
const assert = require('node:assert/strict');

const liquid = fs.readFileSync('sections/premium-testimonials.liquid', 'utf8');
const css = fs.readFileSync('assets/premium-testimonials.css', 'utf8');
const js = fs.readFileSync('assets/premium-testimonials.js', 'utf8');
const schema = JSON.parse(liquid.match(/{% schema %}([\s\S]*?){% endschema %}/)[1]);
const settingIds = schema.settings.map((setting) => setting.id).filter(Boolean);
const blockIds = schema.blocks[0].settings.map((setting) => setting.id).filter(Boolean);

assert.equal(new Set(settingIds).size, settingIds.length, 'Section setting IDs are unique');
assert.equal(new Set(blockIds).size, blockIds.length, 'Block setting IDs are unique');

for (const requirement of ["type: 'slide'", 'rewind: false', 'clones: 0', 'pagination: false', 'showModal()', 'getEnd()', 'shopify:block:select']) {
  assert(js.includes(requirement), `Missing JavaScript behavior: ${requirement}`);
}
for (const requirement of ['object-fit: cover', 'object-fit: contain', '::backdrop', '@media (max-width: 749px)']) {
  assert(css.includes(requirement), `Missing CSS behavior: ${requirement}`);
}
for (const requirement of ["render 'brand-colors'", "render 'icon'", 'block.shopify_attributes', 'data-review-template']) {
  assert(liquid.includes(requirement), `Missing Liquid integration: ${requirement}`);
}
assert.equal(
  (liquid.match(/video_tag:[^\n]*autoplay: true, loop: true, muted: true/g) || []).length,
  2,
  'Card and popup videos autoplay, loop, and stay muted'
);

console.log('PASS: testimonial schema and slider, modal, media, icon, and Theme Editor invariants');
