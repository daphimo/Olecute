# Editorial collections and hanging offer timer

## Theme Editor setup

1. Add **Custom Tabbed Collection**. Add, remove, or reorder up to eight collection tab blocks. Choose a collection for each; a blank tab label falls back to its collection title. Each tab independently sets its product limit and optional Discover More card.
2. Set the heading, image ratio/radius, desktop/mobile products per view, gaps, and spacing. Products use their featured image only. Products without an image are skipped; missing collections show an editor-only notice. The Discover More card links to the block's collection.
3. Add **Custom Offer Timer** immediately below the tabbed collection. The default anchor mode connects its ropes to the preceding collection surface. Use **Standalone** when placing it elsewhere. Hanging distance and vertical offset control the space occupied by the ropes; bottom spacing controls space after the card.
4. Enter an end date (`YYYY-MM-DD`), 24-hour time, and UTC offset. The offset is explicit and fixed: for example, `+05:30` means Indian Standard Time for every visitor. For locations using daylight saving, enter the offset applicable on the deadline date. Invalid or missing deadlines display dashes and an editor-only notice. Expired deadlines stop at zero and display the optional expired message.
5. Set promotion copy, countdown labels, card appearance, rope appearance, mobile rope count, and interaction strengths. No discount, product, collection URL, or deadline is built into the section.

## Behavior and implementation

The editorial section intentionally does not render `custom-product-card`. It uses one responsive featured image per product and a real product link. Native CSS horizontal scrolling works on desktop and touch. Mouse dragging starts after eight pixels and suppresses its resulting click; ordinary clicks remain links. Tabs support Left/Right, Home/End, Enter/Space, and editor block selection. Without JavaScript all panels remain available through anchor links.

The timer has one responsive countdown tree and one interval per active deadline. It does not announce every tick. Animation runs only while settling after desktop mouse interaction and stops offscreen, in a hidden document, on touch, or for reduced motion. Its four rope endpoints are projected from the same transform as the card. Geometry is cached on resize; frames only do arithmetic and write styles. Scoped custom elements initialize on insertion and clean up observers, listeners, timers, and animation frames on removal, including Theme Editor replacement. Document visibility handling is lifecycle-scoped and removed on disconnect.

Both sections render the existing `brand-colors` snippet with component scopes and load only their local CSS/JavaScript. There are no external assets or dependencies. Place them together in the editor to establish the composition; this change does not insert or publish homepage content automatically.

## Validation

Run `node tests/custom-editorial-sections.cjs` with LiquidJS and Playwright installed. If dependencies are outside the theme, set `HEADER_VALIDATION_MODULES` to that `node_modules` directory. Optional `HEADER_SCREENSHOTS` saves desktop/mobile fixture screenshots; fixture images are synthetic and are not storefront assets.

The suite exercises block/product counts, empty collections, Discover More sizing, instance isolation, keyboard navigation, mouse drag versus click, native touch swipe, all mobile products-per-view values, six viewport widths, rope connections, timezone parsing, expiry, reduced motion, settled animation, replacement, and interval cleanup. Run `shopify theme check` for schema and Liquid validation.
