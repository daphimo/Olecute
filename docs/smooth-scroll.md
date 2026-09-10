# Reference wheel scrolling

`assets/smooth-scroll.js` is a dependency-free vertical-only adaptation of the user-supplied 0.2.28 bundle. The previous WheelScroll class, 85ms exponential interpolation, OlecuteSmoothScroll namespace, custom programmatic-scroll API, and subscriber set are removed. The existing asset request is reused; no vendor bundle or additional request is added.

Each accepted wheel event accumulates a clamped target and restarts a 1.2-second tween from the current unrounded animated position. Easing is exactly `Math.min(1, 1.001 - Math.pow(2, -10 * t))`. The loop ends when easing reaches one. Resuming from idle uses a fresh timestamp, avoiding a stale RAF delta. Writes use the real window scrollbar and explicitly instant behavior to avoid double-easing through CSS.

## Input normalization

The supplied bundle prefers `wheelDeltaY` when nonzero, otherwise `-deltaY`; the resulting sign is reversed for document scrolling. Firefox line-mode deltas are multiplied by 50. Platform detection prefers `navigator.userAgentData.platform`, then `navigator.platform`. Windows/Linux use 0.84; other platforms use 0.4. The configured mouse multiplier is 1. No generic line/page conversion or arbitrary acceleration is added. Tests explicitly cover legacy wheelDeltaY precedence, which can change the distance of large Chromium wheel events.

Only wheel input is virtualized. Touch remains native: no touchmove handler or touch momentum is installed, so the reference's touch multiplier of 2 is unused. Keyboard events only cancel outstanding wheel motion; their defaults remain native. Horizontal gestures, zoom, middle-button scrolling, forms, dialogs, carousels, `[data-native-scroll]`, and `[data-lenis-prevent]` bypass the engine. Nested overflow regions retain native scrolling while they can consume input, and overscroll containment is respected.

## Shopify integration

The document remains the scroll container at every width. Header animation subscribes directly to native window scroll events, independently of the engine. Shared overlay utilities and header drawers use `referenceScroll.stop(owner)` / `start(owner)` to cancel/pause input; components still own their CSS scroll locks.

`window.OlecuteReferenceScroll` is the singleton, with the module export `referenceScroll`. `init()` is idempotent, including repeated script evaluation. `destroy()` cancels RAF and removes listeners/observation. No section lifecycle handler creates an engine. ResizeObserver watches body geometry and wheel input refreshes bounds. Reduced motion, screens below 750px, touch-only devices, and Theme Editor use native scrolling.

Seven persistent global listeners handle resize, pagehide/pageshow, visibility, pointerdown, touchstart, and keydown; wheel is an eighth only when enabled. Two media-query listeners and one body ResizeObserver handle preferences/layout. A one-time DOMContentLoaded listener is used only when needed. There are no timers or idle RAF loops.

## Verification and limits

Run `node tests/reference-scroll.cjs` for deterministic curve/normalization checks at simulated 60–165Hz. Run `tests/smooth-scroll.cjs`, `tests/header-system.cjs`, and `tests/hero-slider.cjs` with Playwright/LiquidJS available through `HEADER_VALIDATION_MODULES`.

The bundle contains library defaults but no reference site's initialization or live URL. This implementation matches the supplied defaults and normalization, not unknown site overrides. Native scroll interruption, accessibility, nested scrolling, and demand-driven scheduling are deliberate Shopify safeguards. Actual Safari/Firefox hardware and live storefront integrations still require manual verification. No production build or minifier is configured in this theme.
