# Custom product cards, quick add, and wishlist

## Merchant setup

1. In Theme Editor, add **Custom product cards** and select a collection. This is opt-in; existing theme product cards and main-product layouts are preserved.
2. Open **Theme settings → Custom Product Card** to configure image ratio/custom height, image radius, badge visibility/colors, sale-price color, title size/line count, quick-add visibility/radius, and size-chart disclaimer. Badges stay white; highlight choices come from the shared brand palette.
3. Create a Shopify page, assign the **wishlist** template, and select that page in **Wishlist page**. The theme contains the template but cannot create the Admin page from local files. The default link is the locale-aware `pages/wishlist` path.
4. Configure `custom.highlights` on products as a list of text or a text value. Variant measurements belong to `custom.chest`, `custom.high_waist`, and `custom.hip`; enter inches. Text ranges, numeric values, lists, and objects with a numeric `value` are handled by the shared converter. Unrecognized/missing/zero values display a dash.

No screenshot products, images, sizes, prices, shipping promises, or return policies are embedded. Set policies and merchant photography in Shopify; the supplied references determine component composition.

## Reuse

### Featured collection section

In Theme Editor, add **Custom Featured Collection** (its settings panel is named **Custom Featured Products** to fit Shopify's 25-character limit), then choose a collection. It reuses the existing card snippet and global commerce runtime. Product count and desktop columns are independent; mobile uses native horizontal scrolling with configurable products per view and no section JavaScript. Desktop/mobile gaps and top/bottom padding are separate settings. Discover More links to the selected collection and can be renamed or hidden. Empty collections show an editor message and render nothing on the storefront.

Validate the section with `node tests/custom-featured-collection.cjs`, using the same `HEADER_VALIDATION_MODULES` dependency path as the commerce tests when required.

Render a card with `{% render 'custom-product-card', product: product %}`. Pass `eager: true` only for a genuinely above-fold first card. Galleries use no slider library: the first responsive image is rendered normally and alternate images remain in inert templates until requested. Quick-add details are fetched from the locale-aware product URL through the `custom-quick-add` section once per product, with a six-entry in-memory cache. Variant clicks never refetch data.

`custom-product-price`, `custom-product-highlights`, `custom-size-switcher`, `custom-variant-selector`, `custom-size-chart`, `custom-add-to-cart`, and `custom-wishlist-button` are shared components. Prices are formatted by Liquid money filters. `custom-product-data` emits only the variant fields needed for these controls, escaped as a JSON data attribute.

For an independent product-options layout:

```liquid
<custom-product-options class="custom-commerce" {% render 'custom-product-data', product: product %}>
  <div data-custom-price>{% render 'custom-product-price', product: product %}</div>
  {% render 'custom-variant-selector', product: product, selected_variant: product.selected_or_first_available_variant %}
  {% render 'custom-add-to-cart', variant: product.selected_or_first_available_variant, quantity: 1 %}
  {% render 'custom-wishlist-button', product: product %}
</custom-product-options>
```

Add measurement nodes using `data-measure="chest"`, `high_waist`, or `hip`. Add the shared size switch and chart inside the same controller; a button with `data-custom-chart-open` opens that chart. The controller supports any subset of these components. A standalone chart can be placed in `data-custom-size-scope` beside its trigger. Its `data-inches` cells use the same conversion utility.

Size is discovered from the option name, not a fixed position. All options are rendered; selections retain other option values and unavailable combinations are disabled. The chart shows all size rows for the currently selected non-size options, including unavailable sizes and missing measurements. Without a size-named option it shows full option combinations.

`custom:variant-change` bubbles with `{ variant, unit }`. `window.OlecuteCommerce.addToCart(variantId, quantity, sourceElement)` returns a promise and emits `custom:cart-success` / `custom:cart-error` from the optional source. The underlying function is also exported by `custom-commerce.js`. Quantity defaults to one. Shopify validates inventory and pricing; client data is presentation only.

## Cart transaction

The flow is add confirmation → fetch authoritative cart/count → await section refresh → close quick add → emit the existing Shopify cart event → open the existing drawer. No alternate drawer is created. A global transaction guard prevents overlapping custom submissions. Buttons show `Adding...` and are disabled until completion.

The existing drawer's premature opening branch was removed. It now waits for its event promise before opening, including standard theme product-form submissions. Custom additions render the cart sections before publishing the event; the `customSectionsRendered` detail flag prevents cart-items components from performing that same refresh again.

An unsuccessful add never opens the drawer. If Shopify confirms the add but the subsequent refresh fails, the UI reports that the product was added and advises checking the cart before retrying. It does not show stale drawer contents or silently retry an add.

## Wishlist and lifecycle

Storage key: `olecute_wishlist_v1`. Entries are keyed by variant ID and retain product ID/handle, selected variant, title, product URL, transformed image URL, formatted price, and size. Wishlist cards clone `custom-wishlist-card` with textContent and validated links, not stored HTML. They do not fetch product data. Prices are snapshots, clearly labeled as such on the page.

Bookmark state survives navigation and reloads. Storage events synchronize tabs; custom-element connection handles newly rendered bookmark controls. Failed storage writes report an error without changing the saved state. Added feedback uses a dismissible 10-second toast in the native top layer, including while a modal is open. There is no wishlist counter.

There is one custom quick-add dialog. Native modal dialogs provide focus containment and background isolation. Closing the chart restores the quick-add context. Scroll locking uses existing owner-based utilities with body-position restoration to retain mobile scroll position and scrollbar spacing. Section unload cancels pending quick-add requests and closes the popup; section load hydrates wishlist output. Module/global guards prevent duplicate delegates.

## Validation

Run `node tests/custom-commerce.cjs` with LiquidJS/Playwright installed or supplied through `HEADER_VALIDATION_MODULES`. Optional `HEADER_SCREENSHOTS` writes desktop/mobile renders.

The suite renders actual Liquid snippets and production commerce JS/CSS. Shopify network responses, component base, standard events, and the low-level DOM morph are mocked; the actual section-rendering adapter and cart-drawer success gating execute. Coverage includes price/badges, gallery ratios, multi-option variants, measurements, modal positioning/focus/locks, cart success/error/refresh failure/double clicks, wishlist persistence/removal/storage errors/toast timeout, and Theme Editor events.

Live Shopify Theme Editor, real variant metafield definitions, actual cart section hydration, selling-plan products, and products beyond Liquid's variant exposure limit still need store-level verification. The UI uses native fallback product links and server-authoritative add errors; this is not a replacement for subscription selectors or advanced product configurators.

Validation completed: commerce browser suite at 320/390/749/900/1360px and header regression suite passed. Shopify theme check reported zero errors and 26 warnings in unrelated existing files; none were in the new commerce files. The shared commerce script is approximately 18.1 KB source / 5.4 KB gzip, and CSS is 10.7 KB source / 2.6 KB gzip. No third-party package was added.
