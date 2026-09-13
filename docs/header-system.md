# Olecute header

`sections/header.liquid` composes the header and owns its Theme Editor schema. Components live in `snippets/header-*`. Styles live in `assets/header.css`; behavior lives in `assets/olecute-header.js`. The existing `assets/header.js` and legacy snippets are retained for compatibility but are not loaded by the new section.

## Merchant setup

In **Header → Olecute header**, select the Logo image and edit the wordmark, desktop quote, homepage animation distance, rotating icon link, and wishlist URL. Animation type applies only to the desktop homepage: All logo scales the image, All text keeps the original shrinking wordmark, and Text to logo (default) crossfades the wordmark into the image over the final 16% of the scroll animation. Mobile, internal pages, and the menu masthead always use the image; an unset image falls back to the wordmark. Navigation items are section blocks with a label, URL, and optional pink indicator. Eight blocks are supported; narrow desktop navigation scrolls horizontally. The starter labels are editable block data. Only Shop All has a preconfigured destination; assign the remaining collection URLs. An unset URL renders an unlinked item. No wishlist app is assumed.

The existing announcement section is preserved. The header starts below announcements and stays at the viewport top after they scroll away. The homepage wordmark overlays existing hero content; no hero content is added by this system.

## Timelines and integration

- Desktop starts at the theme's 750px breakpoint. Homepage progress runs over the configurable scroll distance, default 650px. The wordmark shrinks continuously; pills and quote depart from 35–76% progress; the menu enters from 52–90%; the background settles from 78–100%.
- Internal pages fade navigation into the quote over 100px of scrolling.
- Mobile has separate menu and search buttons. Search opens and focuses the same search dialog as desktop; legacy search controls route to it too. A bounded three-column grid centers the image between the controls without extending the mobile header beyond the viewport. The mobile quote is removed and the image stays static in a 64px header slot.
- Reduced motion uses a static compact homepage, static internal/mobile layout, and no rotating ring or drawer entrance animation.
- Scroll updates subscribe directly to native window scroll events, with the document as the scroll container at every width. Font/layout measurements occur on initialization, resize, and font readiness, not inside scroll frames. See `smooth-scroll.md` for the shared API.
- Cart links retain Shopify routes and use the existing cart drawer when available. Counts start with `cart.item_count`, update from Shopify's existing standard cart event, and refresh on back/forward cache restoration. Account links use Shopify's account route.
- The existing menu dialogs render featured section blocks and the selected Main navigation menu. Mobile parents expand with a Shop All link and preserve nested children. Desktop includes three configurable images with gradient edges and support/policy columns. Configure utility URLs, support details, images, and the Policy menu in Header settings; unconfigured destinations remain omitted.
- Mobile menu search and desktop search share the header lifecycle and Shopify predictive endpoint, requesting the header-predictive-search section. Empty queries show no suggestions; requests debounce 250ms, abort on changes/close, reject stale responses, and cap product-only cards at six. Search errors and empty matches retain the full search link.
- Native modal dialogs make the background inert. Tab containment, Escape, focus restoration, scroll locking, and section teardown are handled by the header element.

Brand tokens are centralized in `snippets/brand-colors.liquid`. Its default scope avoids replacing the theme's global color names. Pass `scope` when reusing the palette in another section. Change the special icon geometry/gradient in `header-special-icon.liquid`; its stops use these tokens.

## Validation

Run `shopify theme check` and `node --check assets/olecute-header.js`.

`tests/header-system.cjs` renders the actual header Liquid using LiquidJS and exercises it with Playwright. Install `liquidjs` and `playwright` in a development tools directory, and set `HEADER_VALIDATION_MODULES` to that directory's `node_modules`, or install them locally. Run `node tests/header-system.cjs`. Optional `HEADER_SCREENSHOTS` sets the screenshot output directory.

The browser fixture uses real theme base CSS and scroll-container behavior with mock Shopify cart events/drawer API. It covers continuous logo scaling, internal transition, 320/390/430/749/750/990/1360px widths, drawer focus and scroll restoration, the separate mobile menu/search triggers, logo bounds, all three animation modes, the reversible text/image crossfade, missing-image fallback, and long-wordmark overflow protection, cart counts, reduced motion, breakpoint changes while open, and section replacement. A connected Shopify preview is still needed to verify real cart/network behavior and the final composition over store imagery and fonts.
