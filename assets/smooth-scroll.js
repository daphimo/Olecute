import { getScrollContainer, getScrollEventTarget, scrollContainerMediaQuery } from '@theme/scroll-container';

const NATIVE_REGION = 'input, textarea, select, option, [contenteditable]:not([contenteditable="false"]), dialog, [role="dialog"], [role="listbox"], [role="menu"], [popover], slideshow-component, [data-native-scroll], [data-lenis-prevent]';
const SCROLL_KEYS = new Set(['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' ']);

/** One storefront controller. Lenis moves the real scrollbar; no transformed page wrapper. */
class SmoothScrollController {
  subscribers = new Set();
  pauses = new Set();
  state = { scroll: 0, velocity: 0, direction: 0, progress: 0, active: false };
  frame = 0;
  clock = 0;
  epoch = 0;

  init() {
    if (this.lifecycle) return this.ready;
    this.lifecycle = new AbortController();
    this.desktop = matchMedia('(min-width: 750px) and (hover: hover) and (pointer: fine)');
    this.reduced = matchMedia('(prefers-reduced-motion: reduce)');
    this.editor = Boolean(window.Shopify?.designMode || document.documentElement.classList.contains('shopify-design-mode'));
    for (const query of [this.desktop, this.reduced, scrollContainerMediaQuery]) this.listen(query, 'change', this.reconcile);
    this.listen(document, 'click', this.onAnchor);
    this.listen(document, 'keydown', this.onKey, { capture: true });
    this.listen(document, 'pointerdown', this.cancelMomentum, { capture: true, passive: true });
    this.listen(document, 'touchstart', this.cancelMomentum, { capture: true, passive: true });
    this.listen(window, 'resize', this.queueResize, { passive: true });
    this.listen(window, 'pagehide', this.onPageHide);
    this.listen(window, 'pageshow', this.onPageShow);
    this.listen(window, 'popstate', this.onPopState);
    this.listen(window, 'hashchange', this.onHashChange);
    this.listen(document, 'visibilitychange', this.onVisibility);
    for (const event of ['shopify:section:load', 'shopify:section:unload', 'shopify:section:reorder']) this.listen(document, event, this.queueResize);
    this.observer = new ResizeObserver(this.queueResize);
    if (document.documentElement.hasAttribute('scroll-lock')) this.stop('theme-overlays');
    this.ready = this.reconcile();
    // Module initialization can finish after pageshow when an asset is slow.
    if (document.readyState === 'complete') this.queueInitialHash();
    return this.ready;
  }

  listen(target, event, callback, options = {}) {
    target.addEventListener(event, callback, { ...options, signal: this.lifecycle.signal });
  }

  get active() { return Boolean(this.engine); }
  get stopped() { return this.pauses.size > 0; }
  getScroll() {
    if (this.stopped && this.pauseScroll !== undefined) return this.pauseScroll;
    return this.scroller?.scrollTop ?? getScrollContainer().scrollTop;
  }
  getVelocity() { return this.state.velocity; }
  on(event, callback) {
    if (event !== 'scroll') throw new TypeError('Supported event: scroll');
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  reconcile = async () => {
    const epoch = ++this.epoch;
    const next = getScrollContainer();
    const changed = this.scroller && this.scroller !== next;
    const previousScroll = this.state.scroll;
    this.removeEngine();
    this.nativeTarget?.removeEventListener('scroll', this.onNativeScroll);
    this.scroller = next;
    this.nativeTarget = getScrollEventTarget();
    this.nativeTarget.addEventListener('scroll', this.onNativeScroll, { passive: true });
    if (changed) next.scrollTo({ top: previousScroll, behavior: 'instant' });
    this.refresh();
    if (!this.desktop.matches || this.reduced.matches || this.editor || this.failed) return;
    try {
      const { default: Lenis } = await import('@theme/lenis');
      if (!this.lifecycle || epoch !== this.epoch) return;
      this.engine = new Lenis({
        wrapper: next === document.scrollingElement ? window : next,
        content: next === document.scrollingElement ? document.documentElement : next,
        smoothWheel: true, syncTouch: false, lerp: .12, wheelMultiplier: 1,
        autoRaf: false, autoResize: false, anchors: false,
        allowNestedScroll: true,
        prevent: (node) => node.matches(NATIVE_REGION),
        virtualScroll: ({ event, deltaX, deltaY }) => {
          // Preserve zoom, horizontal gestures, native widgets, and already-handled events.
          if (event.defaultPrevented || event.ctrlKey || event.shiftKey || Math.abs(deltaX) > Math.abs(deltaY)) return false;
          this.wake();
          return true;
        },
      });
      next.classList.add('olecute-smooth-scroll');
      this.engine.on('scroll', this.publish);
      if (this.stopped) this.engine.stop();
      this.publish();
    } catch (error) {
      this.fail(error);
    }
  };

  removeEngine() {
    this.engine?.destroy();
    this.engine = null;
    this.scroller?.classList.remove('olecute-smooth-scroll');
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.lastFrame = 0;
  }

  fail(error) {
    this.removeEngine();
    this.failed = true;
    this.publish();
    console.warn('[Olecute scroll] Using native scrolling.', error);
  }

  queueResize = () => {
    clearTimeout(this.resizeTimer);
    this.resizeTimer = setTimeout(() => { if (this.lifecycle) this.refresh(); }, 100);
  };

  refresh() {
    if (!this.scroller) return;
    // The desktop wrapper has a fixed height; watch its growing content separately.
    const content = this.scroller === document.scrollingElement ? document.body : this.scroller;
    const observed = new Set([this.scroller, ...[...content.children].filter((child) => child instanceof HTMLElement)]);
    for (const node of this.observed || []) if (!observed.has(node)) this.observer.unobserve(node);
    for (const node of observed) if (!this.observed?.has(node)) this.observer.observe(node);
    this.observed = observed;
    this.limit = Math.max(0, this.scroller.scrollHeight - this.scroller.clientHeight);
    this.headerOffset = (parseFloat(getComputedStyle(document.body).getPropertyValue('--header-height')) || 64) + 8;
    document.documentElement.style.setProperty('--olecute-anchor-offset', `${this.headerOffset}px`);
    this.engine?.reset();
    this.engine?.resize();
    this.publish();
  }

  wake = () => {
    if (!this.lifecycle || this.frame || document.hidden) return;
    this.frame = requestAnimationFrame(this.tick);
  };

  tick = (time) => {
    this.frame = 0;
    try {
      // Cap long gaps after idle/background tabs without changing Lenis's physics.
      this.clock += this.lastFrame ? Math.min(time - this.lastFrame, 32) : 16.67;
      this.lastFrame = time;
      if (this.pendingHash) { this.pendingHash = false; this.positionHash(); }
      this.engine?.raf(this.clock);
      if (!this.engine) this.publish();
      if (this.engine?.isScrolling === 'smooth' && !this.stopped) this.wake();
      else this.lastFrame = 0;
    } catch (error) { this.fail(error); }
  };

  publish = () => {
    const now = performance.now();
    const scroll = this.getScroll();
    const delta = scroll - this.state.scroll;
    const elapsed = Math.max(1, now - (this.lastSample || now - 16.67));
    const idle = this.engine ? !this.engine.isScrolling : delta === 0;
    this.state = Object.freeze({ scroll, velocity: idle ? 0 : delta / elapsed * 1000,
      direction: Math.sign(delta), progress: this.limit ? Math.min(1, Math.max(0, scroll / this.limit)) : 0, active: this.active });
    this.lastSample = now;
    for (const callback of this.subscribers) {
      try { callback(this.state); } catch (error) { console.error('[Olecute scroll] Subscriber failed.', error); }
    }
  };

  onNativeScroll = () => {
    if (this.engine) return;
    this.wake();
    clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(this.publish, 150);
  };

  cancelMomentum = () => {
    this.interacted = true;
    this.engine?.reset();
    this.publish();
  };

  onKey = (event) => { if (SCROLL_KEYS.has(event.key)) this.cancelMomentum(); };

  stop(owner = 'api') {
    if (!this.stopped) this.pauseScroll = this.getScroll();
    this.pauses.add(owner);
    this.engine?.stop();
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.lastFrame = 0;
  }

  start(owner = 'api') {
    this.pauses.delete(owner);
    if (!this.stopped) this.engine?.start();
  }

  targetPosition(target, offset) {
    if (typeof target === 'number') return target + (offset || 0);
    if (typeof target === 'string') {
      if (target === 'top' || target === '#') return 0;
      if (target === 'bottom') return this.limit;
      target = target.startsWith('#') ? document.getElementById(target.slice(1)) : document.querySelector(target);
    }
    if (!(target instanceof HTMLElement)) return null;
    const origin = this.scroller === document.scrollingElement ? 0 : this.scroller.getBoundingClientRect().top;
    const margin = parseFloat(getComputedStyle(target).scrollMarginTop) || 0;
    return target.getBoundingClientRect().top - origin + this.getScroll() + (offset ?? -Math.max(this.headerOffset, margin));
  }

  scrollTo(target, { immediate = false, offset, onComplete } = {}) {
    if (!this.scroller || this.stopped) return false;
    const position = this.targetPosition(target, offset);
    if (position === null || !Number.isFinite(position)) return false;
    if (this.engine) {
      this.engine.scrollTo(position, { immediate, onComplete });
      this.wake();
    } else {
      this.scroller.scrollTo({ top: position, behavior: 'instant' });
      this.publish();
      onComplete?.();
    }
    return true;
  }

  onAnchor = (event) => {
    if (!this.engine || this.stopped || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target.closest('a[href]');
    if (!link || link.hasAttribute('download') || link.target && link.target !== '_self' || link.closest(NATIVE_REGION)) return;
    const url = new URL(link.href, location.href);
    if (url.origin !== location.origin || url.pathname !== location.pathname || url.search !== location.search || !url.hash) return;
    let target;
    try { target = document.getElementById(decodeURIComponent(url.hash.slice(1))); } catch { return; }
    if (!target || !this.scroller.contains(target)) return;
    const position = this.targetPosition(target);
    event.preventDefault();
    if (location.hash !== url.hash) history.pushState({ ...history.state, scrollTop: Math.max(0, Math.min(this.limit, position)) }, '', url.hash);
    this.scrollTo(position, { onComplete: () => {
      if (!target.isConnected) return;
      const hadTabIndex = target.hasAttribute('tabindex');
      if (!hadTabIndex) target.setAttribute('tabindex', '-1');
      target.focus({ preventScroll: true });
      if (!hadTabIndex) target.addEventListener('blur', () => target.removeAttribute('tabindex'), { once: true });
    } });
  };

  queueInitialHash() {
    if (!this.editor && !this.interacted && location.hash && !Number.isFinite(history.state?.scrollTop)) {
      this.pendingHash = true;
      this.wake();
    }
  }

  positionHash() {
    if (this.editor || this.stopped) return;
    try {
      const target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
      if (target && this.scroller.contains(target)) this.scrollTo(target, { immediate: true });
    } catch { /* Malformed hashes keep native browser behavior. */ }
  }

  onHashChange = () => {
    if (this.skipHash) { this.skipHash = false; return; }
    this.engine?.reset();
    this.pendingHash = true;
    this.wake();
  };

  onPopState = () => {
    this.engine?.reset();
    // The existing scroll-container module restores saved history positions first.
    this.skipHash = true;
    clearTimeout(this.hashTimer);
    this.hashTimer = setTimeout(() => { this.skipHash = false; }, 0);
    if (!Number.isFinite(history.state?.scrollTop)) this.pendingHash = true;
    this.wake();
  };

  onPageHide = () => { this.engine?.reset(); cancelAnimationFrame(this.frame); this.frame = 0; this.lastFrame = 0; };
  onPageShow = (event) => { this.queueResize(); if (!event.persisted) this.queueInitialHash(); else this.wake(); };
  onVisibility = () => { if (document.hidden) this.onPageHide(); else this.queueResize(); };

  destroy() {
    ++this.epoch;
    this.removeEngine();
    this.lifecycle?.abort();
    this.lifecycle = null;
    this.nativeTarget?.removeEventListener('scroll', this.onNativeScroll);
    this.observer?.disconnect();
    this.observed = null;
    for (const timer of [this.resizeTimer, this.idleTimer, this.hashTimer]) clearTimeout(timer);
    this.failed = false;
    this.pendingHash = false;
    this.publish();
  }
}

export const smoothScroll = window.OlecuteSmoothScroll ||= new SmoothScrollController();
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => smoothScroll.init(), { once: true });
else smoothScroll.init();
