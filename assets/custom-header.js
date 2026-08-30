class CustomHeader extends HTMLElement {
  connectedCallback() {
    this.drawer = this.querySelector('[data-menu-drawer]');
    this.overlay = this.querySelector('[data-menu-overlay]');
    this.pages = [...this.querySelectorAll('[data-menu-page]')];
    this.activePage = 'root';
    this.trigger = null;
    this.onClick = this.onClick.bind(this);
    this.onKeydown = this.onKeydown.bind(this);
    this.addEventListener('click', this.onClick);
    document.addEventListener('keydown', this.onKeydown);
  }

  disconnectedCallback() {
    this.removeEventListener('click', this.onClick);
    document.removeEventListener('keydown', this.onKeydown);
  }

  onClick(event) {
    const open = event.target.closest('[data-menu-open]');
    const target = event.target.closest('[data-menu-target]');
    const back = event.target.closest('[data-menu-back]');
    const close = event.target.closest('[data-menu-close]');
    if (open) return this.open(open.dataset.menuOpen || 'root', open);
    if (target) return this.showPage(target.dataset.menuTarget, true);
    if (back) {
      const page = back.closest('[data-menu-page]');
      return this.showPage(page.dataset.menuParent || 'root', false);
    }
    if (close) this.close();
  }

  onKeydown(event) {
    if (event.key === 'Escape' && this.hasAttribute('menu-open')) this.close();
    if (event.key !== 'Tab' || !this.hasAttribute('menu-open')) return;
    const focusable = [...this.drawer.querySelectorAll('button:not([hidden]), a[href]')]
      .filter((element) => element.offsetParent !== null);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  open(page, trigger) {
    this.trigger = trigger;
    this.setAttribute('menu-open', '');
    this.drawer.setAttribute('aria-hidden', 'false');
    trigger.setAttribute('aria-expanded', 'true');
    document.documentElement.classList.add('custom-menu-is-open');
    this.showPage(page, true);
    requestAnimationFrame(() => this.drawer.querySelector('[data-menu-close]').focus());
  }

  close() {
    this.removeAttribute('menu-open');
    this.drawer.setAttribute('aria-hidden', 'true');
    this.trigger?.setAttribute('aria-expanded', 'false');
    document.documentElement.classList.remove('custom-menu-is-open');
    this.trigger?.focus();
    this.trigger = null;
  }

  showPage(id, forward) {
    const next = this.pages.find((page) => page.dataset.menuPage === id);
    if (!next) return;
    this.pages.forEach((page) => {
      const active = page === next;
      page.classList.toggle('is-active', active);
      page.toggleAttribute('inert', !active);
      page.setAttribute('aria-hidden', String(!active));
    });
    this.activePage = id;
    this.drawer.dataset.nested = String(id !== 'root');
    this.drawer.dataset.direction = forward ? 'forward' : 'back';
    if (this.hasAttribute('menu-open') && id !== 'root') next.querySelector('button, a')?.focus();
  }
}

if (!customElements.get('custom-header')) customElements.define('custom-header', CustomHeader);
