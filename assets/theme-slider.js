import '@theme/splide';

const instances = new WeakMap();

/** Shared Splide installation. Options and the returned instance remain native Splide APIs. */
export const sliders = window.OlecuteSliders ||= {
  init(element, options = {}, configure) {
    if (!(element instanceof HTMLElement)) return null;
    if (instances.has(element)) return instances.get(element);
    const instance = new window.Splide(element, {
      keyboard: 'focused',
      ...options,
      reducedMotion: { speed: 0, rewindSpeed: 0, autoplay: 'pause', ...options.reducedMotion },
    });
    instances.set(element, instance);
    instance.on('destroy', () => instances.delete(element));
    try {
      configure?.(instance); // Subscribe before mount so sections receive initial lifecycle events.
      instance.mount();
      return instance;
    } catch (error) {
      instance.destroy(true);
      instances.delete(element);
      console.warn('[Olecute slider] Keeping static content.', error);
      return null;
    }
  },
  get(element) { return instances.get(element); },
  destroy(element) { instances.get(element)?.destroy(true); },
  destroyWithin(root) {
    this.destroy(root);
    root.querySelectorAll?.('.splide').forEach((element) => this.destroy(element));
  },
  scan(root = document) {
    const elements = [...root.querySelectorAll('[data-olecute-slider]')];
    if (root.matches?.('[data-olecute-slider]')) elements.unshift(root);
    elements.forEach((element) => {
      try { this.init(element, JSON.parse(element.dataset.olecuteSlider || '{}')); }
      catch (error) { console.warn('[Olecute slider] Invalid options.', error); }
    });
  },
};

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => sliders.scan(), { once: true });
else sliders.scan();
document.addEventListener('shopify:section:load', (event) => sliders.scan(event.target));
document.addEventListener('shopify:section:unload', (event) => sliders.destroyWithin(event.target));
