// Vertical wheel behavior from the supplied 0.2.28 reference; native input otherwise.
function createReferenceScroll() {
  const platform = navigator.userAgentData?.platform || navigator.platform || '';
  const multiplier = /Win|Linux/.test(platform) ? 0.84 : 0.4;
  const firefox = navigator.userAgent.includes('Firefox');
  const desktop = matchMedia('(min-width: 750px) and (hover: hover) and (pointer: fine)');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const owners = new Set();
  const native = 'input, textarea, select, [contenteditable]:not([contenteditable="false"]), dialog, [role="dialog"], [role="listbox"], [role="menu"], [popover], slideshow-component, .splide, [data-native-scroll], [data-lenis-prevent]';
  let lifecycle, observer, frame = 0, enabled = false;
  let current, target, written, from, started, limit = 0;

  function cancel() {
    cancelAnimationFrame(frame);
    frame = 0;
    current = target = written = window.scrollY;
  }
  function resize() {
    limit = Math.max(0, document.documentElement.scrollHeight - innerHeight);
    if (frame && target > limit) cancel();
  }
  function tick(time) {
    if (Math.abs(window.scrollY - written) > 1) { cancel(); return; }
    const progress = Math.min(1, Math.max(0, time - started) / 1200);
    const eased = Math.min(1, 1.001 - Math.pow(2, -10 * progress));
    current = from + (target - from) * eased;
    written = Math.round(current);
    window.scrollTo({ top: written, behavior: 'instant' });
    frame = eased === 1 ? 0 : requestAnimationFrame(tick);
  }
  function wheel(event) {
    if (event.defaultPrevented || !event.cancelable || event.ctrlKey || event.metaKey || event.shiftKey || event.buttons === 4 || document.hidden || owners.size) return;
    const delta = -(event.wheelDeltaY || -event.deltaY) * (firefox && event.deltaMode === 1 ? 50 : 1) * multiplier;
    if (!delta || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
    for (const node of event.composedPath()) {
      if (node === document.body || node === document.documentElement) break;
      if (!(node instanceof Element)) continue;
      if (node.matches(native)) { cancel(); return; }
      if (node.scrollHeight > node.clientHeight) {
        const style = getComputedStyle(node);
        if (/(auto|scroll|overlay)/.test(style.overflowY) && (style.overscrollBehaviorY !== 'auto' || (delta < 0 ? node.scrollTop > 0 : node.scrollTop + node.clientHeight < node.scrollHeight - 1))) { cancel(); return; }
      }
    }
    if (document.documentElement.hasAttribute('scroll-lock') || /hidden|clip/.test(getComputedStyle(document.documentElement).overflowY) || getComputedStyle(document.body).position === 'fixed') { cancel(); return; }
    resize();
    if (!frame) cancel();
    const next = Math.max(0, Math.min(limit, target + delta));
    if (next === target && !frame) return;
    event.preventDefault();
    target = next;
    from = current;
    started = performance.now();
    if (!frame) frame = requestAnimationFrame(tick);
  }
  function configure() {
    cancel();
    window.removeEventListener('wheel', wheel);
    enabled = desktop.matches && !reduced.matches && !window.Shopify?.designMode;
    if (enabled) window.addEventListener('wheel', wheel, { passive: false, signal: lifecycle.signal });
  }
  function init() {
    if (lifecycle) return;
    lifecycle = new AbortController();
    const listen = (node, type, handler, options = {}) => node.addEventListener(type, handler, { ...options, signal: lifecycle.signal });
    listen(desktop, 'change', configure);
    listen(reduced, 'change', configure);
    listen(window, 'resize', resize, { passive: true });
    listen(window, 'pagehide', cancel);
    listen(window, 'pageshow', cancel);
    listen(document, 'visibilitychange', cancel);
    listen(document, 'pointerdown', cancel, { capture: true, passive: true });
    listen(document, 'touchstart', cancel, { capture: true, passive: true });
    // Cancel momentum only; keyboard defaults are never prevented or virtualized.
    listen(document, 'keydown', cancel, { capture: true });
    observer = new ResizeObserver(resize);
    observer.observe(document.body);
    resize();
    configure();
  }
  return {
    init,
    stop(owner) { owners.add(owner); cancel(); },
    start(owner) { owners.delete(owner); cancel(); },
    destroy() { cancel(); lifecycle?.abort(); observer?.disconnect(); lifecycle = null; enabled = false; },
    get active() { return enabled; },
    get stopped() { return owners.size > 0; },
    get frame() { return frame; },
  };
}

export const referenceScroll = window.OlecuteReferenceScroll ||= createReferenceScroll();
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', referenceScroll.init, { once: true });
else referenceScroll.init();
