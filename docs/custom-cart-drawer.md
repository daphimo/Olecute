# Custom cart drawer

The existing cart drawer uses `overlay` and `no-persist` on `theme-drawer`: it stays modal at every width, leaves the page width unchanged, closes on backdrop click or Escape, and restores focus and scrolling. Other drawer types retain their existing behavior.

Configure **Theme settings ? Custom drawer content** for cart/empty headings, button labels, promotional text, delivery and returns copy, and an empty-cart collection (up to eight product images). Shop Now reuses **Cart ? Empty cart button link**. Product cards link to their product; Discover More links to the selected collection. No collection is chosen automatically.

The filled drawer reuses the cart-products quantity/remove components and Section Rendering API hydration. The checkout submit button targets the existing cart form and displays Shopify's current cart total. The empty checkout is disabled. Currency formatting comes from the store money filter. Delivery, tax, return and promotion copy is left for the merchant to configure.

Validation: `node tests/cart-drawer.cjs` with LiquidJS/Playwright in `HEADER_VALIDATION_MODULES`. It renders both states and exercises the real theme-drawer component at four widths (modal semantics, page dimensions, backdrop and Escape, focus and scroll lock, collection cap, and checkout amount/form). Cart API mutations and real payment checkout require a connected store preview.
