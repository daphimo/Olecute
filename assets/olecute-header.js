import { getScrollContainer, scrollContainerMediaQuery } from '@theme/scroll-container';
import { StandardEvents } from '@shopify/events';
import { referenceScroll } from '@theme/smooth-scroll';

const clamp = (value) => Math.min(1, Math.max(0, value));
const phase = (progress, start, end) => {
  const value = clamp((progress - start) / (end - start));
  return value * value * (3 - 2 * value);
};

/** Independent section lifecycle, including Theme Editor replacement. */
class OlecuteHeader extends HTMLElement {
  connectedCallback() {
    this.controller = new AbortController();
    this.mobile = matchMedia('(max-width: 749px)');
    this.reduced = matchMedia('(prefers-reduced-motion: reduce)');
    this.home = this.dataset.home === 'true';
    this.parts = Object.fromEntries(['wordmark', 'landing-nav', 'landing-quote', 'landing-menu', 'standard-nav', 'standard-quote', 'mobile-quote'].map((key) => [key, this.querySelector(`[data-${key}]`)]));
    this.counts = [...this.querySelectorAll('[data-cart-count]')];
    this.dialogs = [...this.querySelectorAll('[data-header-dialog]')];
    this.triggers = [...this.querySelectorAll('[data-header-open]')];
    this.listen(this, 'click', this.onClick);
    this.listen(window, 'resize', this.measure);
    this.listen(window, 'pageshow', this.onPageShow);
    this.listen(this.mobile, 'change', this.onBreakpoint);
    this.listen(scrollContainerMediaQuery, 'change', this.onBreakpoint);
    this.listen(this.reduced, 'change', this.schedule);
    this.listen(document, StandardEvents.cartLinesUpdate, this.onCartUpdate);
    this.listen(document, 'theme-drawer:open', this.closeDrawer);
    for (const dialog of this.dialogs) {
      this.listen(dialog, 'cancel', (event) => { event.preventDefault(); this.closeDrawer(); });
      this.listen(dialog, 'close', () => { if (this.activeDialog === dialog && !dialog.open) this.releaseDrawer(); });
      this.listen(dialog, 'keydown', (event) => {
        if (event.key !== 'Tab') return;
        const controls = [...dialog.querySelectorAll('a[href], button, input, select, textarea, [tabindex]')]
          .filter((node) => !node.disabled && node.tabIndex >= 0 && !node.closest('[inert]') && node.getClientRects().length);
        const first = controls[0], last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      });
    }
    this.bindScroll();
    this.measure();
    this.observer = new ResizeObserver(this.measure);
    this.observer.observe(this.parentElement);
    const group = this.closest('#header-group');
    if (group) this.observer.observe(group);
    document.fonts.ready.then(() => { if (this.isConnected) this.measure(); });
  }

  listen(target, name, callback) {
    target.addEventListener(name, callback, { signal: this.controller.signal });
  }

  disconnectedCallback() {
    this.closeDrawer();
    this.controller.abort();
    this.unsubscribeScroll?.();
    this.observer?.disconnect();
    cancelAnimationFrame(this.frame);
    this.frame = 0;
  }

  bindScroll() {
    this.unsubscribeScroll?.();
    this.scroller = getScrollContainer();
    const onScroll = () => {
      cancelAnimationFrame(this.frame);
      this.frame = 0;
      this.renderScroll();
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    this.unsubscribeScroll = () => window.removeEventListener('scroll', onScroll);
  }

  onBreakpoint = () => { this.closeDrawer(); this.bindScroll(); this.measure(); };

  measure = () => {
    if (this.activeDialog) return;
    this.offset = this.parentElement.getBoundingClientRect().top + this.scroller.scrollTop;
    const logo = this.parts.wordmark?.firstElementChild;
    if (logo && !this.mobile.matches) {
      // Read untransformed typography on resize; never measure in the scroll loop.
      logo.style.fontSize = '100px';
      const natural = logo.offsetWidth || 1;
      const width = this.clientWidth - (this.clientWidth <= 1100 ? 32 : 40);
      this.baseSize = width / natural * 98;
      logo.style.fontSize = '';
      this.style.setProperty('--logo-base', `${this.baseSize}px`);
      this.compactScale = 30 / this.baseSize;
      this.compactX = (this.parts['landing-menu']?.offsetWidth || 70) + 12;
    }
    const group = this.closest('#header-group');
    document.body.style.setProperty('--header-height', '64px');
    document.body.style.setProperty('--header-group-height', `${group?.offsetHeight || 0}px`);
    document.body.style.setProperty('--transparent-header-offset-boolean', '0');
    this.schedule();
  };

  schedule = () => {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => { this.frame = 0; this.renderScroll(); });
  };

  set(values) {
    for (const [key, value] of Object.entries(values)) this.style.setProperty(`--${key}`, String(value));
  }

  visibility(element, visible) { if (element) element.inert = !visible; }

  renderScroll() {
    const scroll = this.lock ? this.lock.y : this.scroller.scrollTop;
    const y = Math.max(0, scroll - this.offset);
    this.style.transform = `translateY(${Math.max(0, this.offset - scroll)}px)`;
    if (this.mobile.matches) {
      const p = this.reduced.matches ? 0 : phase(y / 120, 0, 1);
      this.set({ surface: 1, 'mobile-y': `${-3 * p}px`, 'mobile-scale': 1 - .08 * p });
      return;
    }
    if (this.home) {
      const p = this.reduced.matches ? 1 : clamp(y / Number(this.dataset.distance || 650));
      const shrink = 1 - Math.pow(1 - p, 2);
      let departure = phase(p, .35, .76);
      if (this.parts['landing-nav']?.contains(document.activeElement)) departure = Math.min(departure, .5);
      const menu = phase(p, .52, .9);
      this.set({
        surface: phase(p, .78, 1),
        'logo-scale': 1 + ((this.compactScale || .15) - 1) * shrink,
        'logo-x': `${(this.compactX || 80) * shrink}px`, 'logo-y': `${78 - 57 * shrink}px`,
        'logo-color': `${phase(p, .5, .85) * 100}%`,
        'nav-opacity': 1 - departure, 'nav-y': `${-50 * departure}px`,
        'quote-opacity': 1 - departure, 'quote-y': `${-45 * departure}px`,
        'menu-opacity': menu, 'menu-x': `${-100 * (1 - menu)}px`,
      });
      this.visibility(this.parts['landing-nav'], departure < .99);
      this.visibility(this.parts['landing-quote'], departure < .99);
      this.visibility(this.parts['landing-menu'], menu > .1);
    } else {
      let p = this.reduced.matches ? 0 : phase(y / 100, 0, 1);
      if (this.parts['standard-nav']?.contains(document.activeElement)) p = Math.min(p, .5);
      this.set({ surface: 1, 'nav-opacity': 1 - p, 'nav-y': `${-22 * p}px`, 'quote-opacity': p, 'quote-y': `${16 * (1 - p)}px` });
      this.visibility(this.parts['standard-nav'], p < .99);
      this.visibility(this.parts['standard-quote'], p > .01);
    }
  }

  onClick = (event) => {
    const trigger = event.target.closest('[data-header-open]');
    if (trigger) {
      const dialog = this.dialogs.find((item) => item.id === trigger.dataset.headerOpen);
      if (dialog) this.openDrawer(dialog, trigger);
    }
    if (event.target.closest('[data-header-close]')) this.closeDrawer();
    const cart = event.target.closest('[data-cart-drawer]');
    if (cart && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey && event.button === 0) {
      const drawer = document.getElementById('cart-drawer');
      if (typeof drawer?.open === 'function') { event.preventDefault(); this.closeDrawer(); drawer.open(); }
    }
  };

  openDrawer(dialog, trigger) {
    this.closeDrawer();
    document.querySelectorAll('theme-drawer[open]').forEach((drawer) => drawer.close?.());
    const search = document.getElementById('search-modal');
    if (search?.querySelector('dialog[open]')) search.closeDialog?.();
    this.returnFocus = trigger;
    this.activeDialog = dialog;
    this.lockScroll();
    trigger.setAttribute('aria-expanded', 'true');
    // Native modal traps focus and makes background content inert.
    dialog.showModal();
    dialog.querySelector('[data-header-close]').focus({ preventScroll: true });
  }

  closeDrawer = () => {
    if (!this.activeDialog) return;
    this.activeDialog.close();
    this.releaseDrawer();
  };

  releaseDrawer() {
    this.activeDialog = null;
    this.triggers.forEach((trigger) => trigger.setAttribute('aria-expanded', 'false'));
    this.unlockScroll();
    if (this.returnFocus?.isConnected) this.returnFocus.focus({ preventScroll: true });
    this.returnFocus = null;
    this.schedule();
  }

  lockScroll() {
    referenceScroll.stop(this);
    const node = this.scroller;
    const root = node === document.scrollingElement;
    const target = root ? document.body : node;
    const properties = ['overflow', 'position', 'top', 'width', 'padding-right'];
    this.lock = { node, target, x: node.scrollLeft, y: node.scrollTop, styles: properties.map((key) => [key, target.style.getPropertyValue(key), target.style.getPropertyPriority(key)]) };
    const gutter = root ? innerWidth - document.documentElement.clientWidth : node.offsetWidth - node.clientWidth;
    const padding = parseFloat(getComputedStyle(target).paddingRight) || 0;
    target.style.setProperty('padding-right', `${padding + gutter}px`);
    target.style.setProperty('overflow', 'hidden');
    if (root) {
      target.style.setProperty('position', 'fixed');
      target.style.setProperty('top', `${-this.lock.y}px`);
      target.style.setProperty('width', '100%');
    }
  }

  unlockScroll() {
    if (!this.lock) return;
    const { node, target, styles, x, y } = this.lock;
    for (const [key, value, priority] of styles) {
      if (value) target.style.setProperty(key, value, priority);
      else target.style.removeProperty(key);
    }
    node.scrollTo({ left: x, top: y, behavior: 'instant' });
    this.lock = null;
    referenceScroll.start(this);
  }

  updateCart(count) {
    if (Number.isFinite(count)) this.counts.forEach((node) => { node.textContent = String(count); });
  }

  onCartUpdate = (event) => {
    event.promise?.then(({ cart, detail }) => {
      if (this.isConnected && !detail?.didError) this.updateCart(cart?.totalQuantity ?? detail?.itemCount);
    }).catch(() => { /* Cart errors are owned by the theme. */ });
  };

  onPageShow = (event) => {
    this.measure();
    if (event.persisted) {
      fetch(this.dataset.cartUrl, { signal: this.controller.signal })
        .then((response) => response.ok ? response.json() : null)
        .then((cart) => this.updateCart(cart?.item_count)).catch(() => {});
    }
  };
}

if (!customElements.get('olecute-header')) customElements.define('olecute-header', OlecuteHeader);
