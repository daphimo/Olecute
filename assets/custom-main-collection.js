import { lockScroll, unlockScroll, isClickedOutside } from '@theme/utilities';

class CustomMainCollection extends HTMLElement {
  connectedCallback() {
    this.controller = new AbortController();
    this.version = 0;
    this.loaded = new Set();
    const signal = this.controller.signal;
    this.addEventListener('click', this.onClick, { signal });
    this.addEventListener('submit', this.onSubmit, { signal });
    this.addEventListener('change', this.onChange, { signal });
    window.addEventListener('popstate', this.onPopState, { signal });
    this.mount();
  }

  disconnectedCallback() {
    this.version++;
    this.request?.abort();
    this.controller.abort();
    this.observer?.disconnect();
    this.toolbarObserver?.disconnect();
    this.closeFilters(false);
  }

  mount() {
    this.dialog = document.createElement('dialog');
    this.dialog.id = `CollectionDrawer-${this.dataset.sectionId}`;
    this.dialog.className = 'custom-main-collection__drawer';
    this.dialog.setAttribute('aria-label', 'Filters');
    const header = document.createElement('div');
    header.className = 'custom-main-collection__drawer-heading';
    const title = document.createElement('h2');
    title.textContent = 'Filters';
    const close = document.createElement('button');
    close.type = 'button';
    close.dataset.filterClose = '';
    close.setAttribute('aria-label', 'Close filters');
    close.textContent = '\u00d7';
    header.append(title, close);
    this.dialog.append(header, this.querySelector('[data-filter-panel]'));
    this.append(this.dialog);
    this.dialog.addEventListener('cancel', event => { event.preventDefault(); this.closeFilters(); });
    const dialog = this.dialog;
    this.dialog.addEventListener('close', () => { unlockScroll(dialog); if (this.dialog === dialog) this.querySelector('[data-filter-open]')?.setAttribute('aria-expanded', 'false'); });
    const trigger = this.querySelector('[data-filter-open]');
    if (trigger) trigger.hidden = false;
    this.loaded.clear();
    this.observeMobileToolbar();
    this.observeNext();
  }

  observeMobileToolbar() {
    this.toolbarObserver?.disconnect();
    this.classList.add('is-mobile-toolbar-visible');
    if (!('IntersectionObserver' in window)) {
      return;
    }
    this.toolbarObserver = new IntersectionObserver(([entry]) => {
      this.classList.toggle('is-mobile-toolbar-visible', entry.isIntersecting);
    });
    this.toolbarObserver.observe(this);
  }

  openFilters() {
    if (this.dialog.open) return;
    this.dialog.showModal();
    lockScroll(this.dialog);
    this.classList.add('is-filter-open');
    this.querySelector('[data-filter-open]')?.setAttribute('aria-expanded', 'true');
    this.dialog.querySelector('button').focus({ preventScroll: true });
  }

  closeFilters(restore = true) {
    if (!this.dialog) return;
    const wasOpen = this.dialog.open;
    this.dialog.close();
    unlockScroll(this.dialog);
    this.classList.remove('is-filter-open');
    const trigger = this.querySelector('[data-filter-open]');
    trigger?.setAttribute('aria-expanded', 'false');
    if (restore && wasOpen) trigger?.focus({ preventScroll: true });
  }

  onClick = event => {
    if (event.target.closest('[data-filter-open]')) return this.openFilters();
    if (event.target.closest('[data-filter-close]') || event.target === this.dialog && isClickedOutside(event, this.dialog)) return this.closeFilters();
    if (event.target.closest('[data-collection-retry]') && this.retry) return this.load(...this.retry);
    const link = event.target.closest('[data-collection-nav], [data-collection-clear], [data-collection-pagination] a');
    if (!link || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    const url = new URL(link.href);
    if (link.hasAttribute('data-collection-clear')) {
      const current = new URL(location.href);
      for (const key of [...current.searchParams.keys()]) if (key.startsWith('filter.') || key === 'page') current.searchParams.delete(key);
      url.search = current.search;
    }
    this.load(url.href, link.hasAttribute('data-collection-next'));
  };

  onChange = event => {
    if (event.target.matches('[data-collection-sort]')) this.querySelector('[data-collection-filters]').requestSubmit();
    if (event.target.matches('[data-price-min], [data-price-max]')) this.validatePrice();
  };

  validatePrice() {
    const min = this.querySelector('[data-price-min]');
    const max = this.querySelector('[data-price-max]');
    if (!min || !max) return true;
    const valid = !min.value || !max.value || Number(min.value) <= Number(max.value);
    max.setCustomValidity(valid ? '' : 'Maximum price must be at least the minimum price.');
    return valid;
  }

  onSubmit = event => {
    if (!event.target.matches('[data-collection-filters]')) return;
    event.preventDefault();
    if (!this.validatePrice() || !event.target.reportValidity()) return;
    const url = new URL(location.href);
    for (const key of [...url.searchParams.keys()]) if (key.startsWith('filter.') || key === 'sort_by' || key === 'page' || key === 'section_id') url.searchParams.delete(key);
    for (const [key, value] of new FormData(event.target)) if (String(value).trim()) url.searchParams.append(key, value);
    this.load(url.href);
  };

  onPopState = () => this.load(location.href, false, false);

  observeNext() {
    this.observer?.disconnect();
    const next = this.querySelector('[data-collection-next]');
    if (this.dataset.loading !== 'infinite' || !next || !('IntersectionObserver' in window)) return;
    this.observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting) && !this.busy && !this.retry) this.load(next.href, true);
    }, { rootMargin: '600px 0px' });
    this.observer.observe(next);
  }

  async load(href, append = false, push = true) {
    const url = new URL(href, location.origin);
    if (url.origin !== location.origin) return;
    if (append && (this.busy || this.loaded.has(url.href))) return;
    this.request?.abort();
    const version = ++this.version;
    this.request = new AbortController();
    const restoreFilterFocus = !append && this.dialog.open;
    if (restoreFilterFocus) this.closeFilters();
    this.busy = true;
    this.retry = null;
    this.observer?.disconnect();
    this.setAttribute('aria-busy', 'true');
    this.querySelector('[data-collection-loader]').hidden = !append;
    this.querySelector('[data-collection-retry]').hidden = true;
    this.querySelector('[data-collection-status]').textContent = append ? 'Loading more products...' : 'Updating products...';
    const requestURL = new URL(url);
    requestURL.searchParams.set('section_id', this.dataset.sectionId);
    try {
      const response = await fetch(requestURL, { signal: this.request.signal });
      if (!response.ok) throw new Error('Request failed');
      const html = await response.text();
      if (version !== this.version || !this.isConnected) return;
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const incoming = [...doc.querySelectorAll('custom-main-collection')].find(node => node.dataset.sectionId === this.dataset.sectionId);
      const required = ['collection-grid', 'collection-pagination', 'filter-panel', 'collection-filters', 'collection-loader', 'collection-status', 'collection-retry', 'result-count'];
      if (!incoming || required.some(key => !incoming.querySelector(`[data-${key}]`))) throw new Error('Invalid section');
      if (append) {
        const grid = this.querySelector('[data-collection-grid]');
        const ids = new Set([...grid.children].map(node => node.dataset.productId));
        for (const card of incoming.querySelector('[data-collection-grid]').children) {
          if (!ids.has(card.dataset.productId)) { ids.add(card.dataset.productId); grid.append(card.cloneNode(true)); }
        }
        this.querySelector('[data-collection-pagination]').replaceChildren(...incoming.querySelector('[data-collection-pagination]').childNodes);
        this.loaded.add(url.href);
      } else {
        this.closeFilters(false);
        this.replaceChildren(...incoming.childNodes);
        this.mount();
        if (push && url.href !== location.href) history.pushState({ collection: this.dataset.sectionId }, '', url);
        const target = restoreFilterFocus ? this.querySelector('[data-filter-open]') : this.querySelector('[data-collection-results]');
        target?.focus({ preventScroll: true });
      }
      window.OlecuteCommerce?.syncWishlist?.(this);
      this.querySelector('[data-collection-status]').textContent = append ? 'More products loaded.' : `${this.querySelector('[data-result-count]').textContent.trim()}.`;
    } catch (error) {
      if (version !== this.version || error.name === 'AbortError') return;
      this.retry = [href, append, push];
      this.querySelector('[data-collection-status]').textContent = 'Products could not be loaded. Please try again.';
      this.querySelector('[data-collection-retry]').hidden = false;
    } finally {
      if (version === this.version && this.isConnected) {
        this.busy = false;
        this.removeAttribute('aria-busy');
        this.querySelector('[data-collection-loader]').hidden = true;
        if (!this.retry) this.observeNext();
      }
    }
  }
}
if (!customElements.get('custom-main-collection')) customElements.define('custom-main-collection', CustomMainCollection);
