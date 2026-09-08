# Global storefront scrolling

`assets/smooth-scroll.js` owns one global controller, exposed as `window.OlecuteSmoothScroll` and the `smoothScroll` export from `@theme/smooth-scroll`. It is loaded by the existing global script snippet on storefront templates. It dynamically imports a local, pinned Lenis asset; no runtime CDN, package manager, or build step is required.

## Behavior

- Custom wheel inertia requires the existing desktop breakpoint (750px), a fine primary pointer, and hover support. Touch remains native (`syncTouch: false`), including hybrid devices' touch gestures. Small screens, touch-only devices, reduced-motion preferences, and Shopify Theme Editor use native scrolling.
- Lenis uses `lerp: 0.12` and `wheelMultiplier: 1`. Its built-in normalization handles wheel delta modes. One input responds promptly, then decelerates over roughly 0.8 seconds; repeated input accumulates. No page transforms, scrollbar replacement, or global scroll snapping are added.
- The controller uses the existing scroll-container module: desktop at 990px scrolls `.page-wrapper`; below that, the document scrolls. Breakpoint changes transfer the current position.
- A single demand-driven RAF advances the engine while moving and sleeps at rest. Subscribers receive updates from that same frame. The header subscribes to this stream; its existing visual timeline is unchanged.
- Inputs, editable regions, dialogs, popovers, menu/listbox roles, slideshows, nested scrollable elements, horizontal gestures, and browser zoom remain native. Add `data-native-scroll` or `data-lenis-prevent` to a custom component that must opt out.
- Plain same-page anchors use the engine, update browser history, clear the compact header by 8px, and move focus to the target when settled. Modified clicks, downloads, other browsing targets, external links, and different query strings retain native behavior. Initial hashes and existing history restoration use immediate placement rather than an entrance animation.
- Content ResizeObservers refresh cached limits outside animation frames. Shopify section events request a refresh without creating a new engine.
- Vendor-load or initialization failures leave native scrolling available. Reduced-motion changes destroy/recreate the engine as needed. Native CSS scroll locks remain the responsibility of overlay components.

## API

```js
const scroll = window.OlecuteSmoothScroll;
await scroll.init(); // Idempotent; global initialization normally handles this.

const unsubscribe = scroll.on('scroll', ({ scroll, velocity, direction, progress, active }) => {
  // scroll: actual visible vertical position in px
  // velocity: sampled px/second; direction: -1, 0, 1; progress: 0..1
  // active: whether custom wheel inertia is enabled
});

scroll.scrollTo('#collection'); // Defaults to the cached sticky-header offset.
scroll.scrollTo(800, { immediate: true });
scroll.getScroll();
scroll.getVelocity();

scroll.stop('my-overlay'); // Cancels momentum; preserves the reported position.
// Apply the component's own native scroll lock and open its modal here.
// Restore its native scroll position and release the native lock before start().
scroll.start('my-overlay');

unsubscribe();
scroll.destroy(); // Removes engine/listeners/RAF; native scrolling remains available.
```

`stop`/`start` use owner tokens: releasing one owner cannot release another owner's pause. Calls without a token use `'api'`. These methods control the inertia engine; they do not replace an overlay's native scroll lock, which is still necessary for keyboard and touch scrolling. Subscriptions and outstanding pause owners survive `destroy`/`init`, allowing existing components to keep their handles.

The existing `utilities.js` scroll-lock ownership system pauses the controller with the `'theme-overlays'` token. The Olecute header's full-screen drawers use the header element as their token. The existing desktop cart sidebar remains a non-modal sidebar with its original page-scrolling behavior. Its narrow-screen modal mode uses the shared lock. Global `scrollTo` calls through `scroll-container.js` also delegate to this engine when active.

## Vendored dependency

- [Lenis official release v1.3.25](https://github.com/darkroomengineering/lenis/releases/tag/v1.3.25), MIT, darkroom.engineering.
- Registry package: `https://registry.npmjs.org/lenis/1.3.25`.
- Verified tarball integrity: `sha512-mOKxayErlaONK8fm4LN3XNd99Qu4plTpn9h9qf8wxzjGrJDzuD84FYzZ81HCd6ZsWp++VWVwOzL286Pf2s2u4A==`.
- `assets/lenis-v1.3.25.js` is the published `dist/lenis.mjs`, with its MIT notice prepended and the unused source-map directive removed. Its library code is unchanged.
- `assets/smooth-scroll.css` supplies only the applicable scroll-behavior and opt-out rules. Upstream root-height, stopped-overflow, iframe-pointer, and auto-toggle rules are omitted because the existing theme owns these behaviors. In particular, the 990px fixed-height scroll container must be preserved.

## Validation

Run `node --check assets/smooth-scroll.js`, `shopify theme check`, `node tests/smooth-scroll.cjs`, and `node tests/header-system.cjs`. Browser tests require Playwright; the header suite also needs LiquidJS. Both accept the `HEADER_VALIDATION_MODULES` path described in `header-system.md`.

The scroll suite uses real Lenis, theme scroll-container behavior, base CSS, and shared utility locks. It tests wheel deceleration, repeated/reversed input, idle RAF shutdown, nested/horizontal scrolling, form events, anchors/back/forward/initial hashes, modal background locking, reduced motion, container changes, dynamic content limits, singleton lifecycle, Theme Editor, missing-vendor fallback, touch-only capability emulation, and JavaScript-disabled scrolling. The header suite checks the existing animation/drawers against the new global controller.

These are local browser fixtures. Real mouse/trackpad feel, iOS Safari/Android touch physics, and a connected Shopify storefront/cart should still receive device and store preview testing before publishing.
