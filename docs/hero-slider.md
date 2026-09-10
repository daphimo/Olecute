# Olecute hero slider

In the Shopify Theme Editor, add **Olecute hero slider**. Add or reorder up to six slide blocks, selecting desktop/mobile images, a destination, and a button label. Missing mobile images fall back to desktop images. A CTA is omitted when its label or destination is empty. Store images remain merchant-selected; the reference screenshot is not embedded as content.

The section fills 100dvh with a cover image, lower-center CTA, and bottom-center pagination. Settings control pagination, arrows, autoplay, the interval (2000–10000ms), and slide/loop mode. One slide stays static without controls; zero slides only shows a placeholder in the editor.

## Shared slider foundation

`snippets/stylesheets.liquid` loads the local production Splide CSS once. `snippets/scripts.liquid` registers the local Splide and theme helper in the import map and loads `theme-slider.js`. Do not add a CDN copy or another vendor installation.

Future sections can use native options through `window.OlecuteSliders.init(element, options)` or import `sliders` from `@theme/theme-slider`. The helper returns the native Splide instance and prevents duplicate mounting. Use `sliders.destroy(element)` during cleanup. Elements marked `data-olecute-slider='{"perPage":3}'` are discovered on initial load and Shopify section load; unload destroys their instances.

The hero uses its own `olecute-hero` custom element and modular image, slide, CTA, and controls snippets. Its progress effect belongs in `hero-slider.js`, not the shared helper. One transform animation follows Splide's autoplay lifecycle; focus, explicit pause, offscreen state, document visibility, reduced motion, and editor block selection stop autoplay. Reconnection creates a fresh instance, and destruction cancels progress and listeners.

## Validation

Run `node tests/hero-slider.cjs` with LiquidJS and Playwright installed. Set `HEADER_VALIDATION_MODULES` to an external tools directory's `node_modules` if needed. Optional `HEADER_SCREENSHOTS` writes desktop/mobile screenshots.

Tests render the actual section and snippets with production Splide, covering responsive image sources, dynamic viewport height, autoplay/progress, controls, keyboard/drag, reduced motion, editor cleanup, multiple sections, and empty/single/no-JavaScript states. Image URLs and Shopify editor events are simulated; verify merchant photography and real Theme Editor changes in a Shopify preview.
