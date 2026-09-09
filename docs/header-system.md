# Olecute header

`sections/header.liquid` composes the header and owns its Theme Editor schema. Components live in `snippets/header-*`. Styles live in `assets/header.css`; behavior lives in `assets/olecute-header.js`. The existing `assets/header.js` and legacy snippets are retained for compatibility but are not loaded by the new section.

## Merchant setup

In **Header → Olecute header**, edit the wordmark, quote, homepage animation distance, rotating icon link, and wishlist URL. Navigation items are section blocks with a label, URL, and optional pink indicator. Eight blocks are supported; narrow desktop navigation scrolls horizontally. The starter labels are editable block data. Only Shop All has a preconfigured destination; assign the remaining collection URLs. An unset URL renders an unlinked item. No wishlist app is assumed.

The existing announcement section is preserved. The header starts below announcements and stays at the viewport top after they scroll away. The homepage wordmark overlays existing hero content; no hero content is added by this system.

## Timelines and integration

- Desktop starts at the theme's 750px breakpoint. Homepage progress runs over the configurable scroll distance, default 650px. The wordmark shrinks continuously; pills and quote depart from 35–76% progress; the menu enters from 52–90%; the background settles from 78–100%.
- Internal pages fade navigation into the quote over 100px of scrolling.
- Mobile uses an independent centered composition, with a dedicated menu control alongside search. Its quote remains visible while the logo compacts over 120px while a stable 64px layout slot prevents content jumps.
- Reduced motion uses a static compact homepage, static internal/mobile layout, and no rotating ring or drawer entrance animation.
- Scroll updates subscribe to the global `@theme/smooth-scroll` controller, which uses the existing `@theme/scroll-container` module and its desktop container at 990px. Font/layout measurements occur on initialization, resize, and font readiness, not inside scroll frames. See `smooth-scroll.md` for the shared API.
- Cart links retain Shopify routes and use the existing cart drawer when available. Counts start with `cart.item_count`, update from Shopify's existing standard cart event, and refresh on back/forward cache restoration. Account links use Shopify's account route.
- Menu and search dialogs intentionally contain only a close control and empty content container. The existing predictive-search implementation remains available for future integration. No search results or mega-menu content is added.
- Native modal dialogs make the background inert. Tab containment, Escape, focus restoration, scroll locking, and section teardown are handled by the header element.

Brand tokens are centralized in `snippets/brand-colors.liquid`. Its default scope avoids replacing the theme's global color names. Pass `scope` when reusing the palette in another section. Change the special icon geometry/gradient in `header-special-icon.liquid`; its stops use these tokens.

## Validation

Run `shopify theme check` and `node --check assets/olecute-header.js`.

`tests/header-system.cjs` renders the actual header Liquid using LiquidJS and exercises it with Playwright. Install `liquidjs` and `playwright` in a development tools directory, and set `HEADER_VALIDATION_MODULES` to that directory's `node_modules`, or install them locally. Run `node tests/header-system.cjs`. Optional `HEADER_SCREENSHOTS` sets the screenshot output directory.

The browser fixture uses real theme base CSS and scroll-container behavior with mock Shopify cart events/drawer API. It covers continuous logo scaling, internal transition, 320/390/430/749/750/990/1360px widths, drawer focus and scroll restoration, mobile search/menu, cart counts, reduced motion, breakpoint changes while open, and section replacement. A connected Shopify preview is still needed to verify real cart/network behavior and the final composition over store imagery and fonts.
