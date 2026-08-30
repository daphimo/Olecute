(() => {
  const selector = '[data-custom-splide]';
  const instances = new WeakMap();

  function optionsFor(element) {
    try {
      return JSON.parse(element.dataset.splideOptions || '{}');
    } catch (error) {
      console.warn('Invalid Splide configuration.', error);
      return {};
    }
  }

  function decoratePagination(splide, element) {
    const pagination = splide.Components.Pagination;
    if (!pagination?.items) return;
    const circle = element.dataset.paginationType === 'circle';
    pagination.items.forEach(({ button }, index) => {
      button.setAttribute('aria-label', `Go to slide ${index + 1}`);
      button.innerHTML = circle
        ? '<span class="custom-splide__dot"></span><svg class="custom-splide__ring" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle></svg>'
        : '<span class="custom-splide__bar"><span></span></span>';
    });
    updateTestimonialsProgress(splide, element);
  }

  function updateTestimonialsProgress(splide, element) {
    if (!element.classList.contains('custom-testimonials')) return;
    const items = splide.Components.Pagination?.items || [];
    const activeIndex = items.findIndex(({ button }) => button.classList.contains('is-active'));
    const progress = items.length ? ((Math.max(activeIndex, 0) + 1) / items.length) * 100 : 0;
    element.style.setProperty('--custom-testimonials-progress', `${progress}%`);
  }

  function restartProgress(element, autoplay) {
    const active = element.querySelector('.splide__pagination__page.is-active');
    element.querySelectorAll('.custom-splide__progressing').forEach((item) => item.classList.remove('custom-splide__progressing'));
    if (!active) return;
    void active.offsetWidth;
    if (autoplay) active.classList.add('custom-splide__progressing');
  }

  function initialize(root = document) {
    root.querySelectorAll(selector).forEach((element) => {
      if (instances.has(element) || element.dataset.splideInitialized === 'true' || !window.Splide) return;
      const options = optionsFor(element);
      const splide = new window.Splide(element, options);
      splide.on('pagination:mounted pagination:updated', () => decoratePagination(splide, element));
      splide.on('mounted moved', () => {
        restartProgress(element, Boolean(options.autoplay));
        updateTestimonialsProgress(splide, element);
      });
      splide.on('autoplay:play', () => {
        element.classList.remove('custom-splide--paused');
        if (!element.querySelector('.custom-splide__progressing')) restartProgress(element, true);
      });
      splide.on('autoplay:pause', () => element.classList.add('custom-splide--paused'));
      splide.mount();
      element.dataset.splideInitialized = 'true';
      instances.set(element, splide);
    });
  }

  function destroy(root) {
    root.querySelectorAll(selector).forEach((element) => {
      instances.get(element)?.destroy(true);
      instances.delete(element);
      delete element.dataset.splideInitialized;
    });
  }

  const ready = () => initialize(document);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready, { once: true });
  else ready();

  document.addEventListener('shopify:section:load', (event) => initialize(event.target));
  document.addEventListener('shopify:section:unload', (event) => destroy(event.target));
  window.CustomSplide = { initialize, destroy };
})();
