class CustomBrandDifference extends HTMLElement {
  connectedCallback() {
    this.items = [...this.querySelectorAll('[data-difference-item]')];
    this.abortController = new AbortController();
    const { signal } = this.abortController;

    this.addEventListener('click', (event) => {
      const button = event.target.closest('[data-difference-trigger]');
      if (!button) return;
      const item = button.closest('[data-difference-item]');
      this.toggle(item, !item.classList.contains('is-active'));
    }, { signal });

    this.items.forEach((item) => {
      item.addEventListener('pointerenter', (event) => {
        if (event.pointerType === 'mouse' && matchMedia('(min-width: 750px)').matches) this.open(item);
      }, { signal });
      item.addEventListener('focusin', () => this.open(item), { signal });
    });

    this.querySelector('[data-difference-items]')?.addEventListener('pointerleave', (event) => {
      if (event.pointerType === 'mouse' && matchMedia('(min-width: 750px)').matches) this.closeAll();
    }, { signal });
  }

  disconnectedCallback() {
    this.abortController?.abort();
    this.items?.forEach((item) => clearTimeout(item.hideTimer));
  }

  open(item) {
    this.items.forEach((other) => this.setState(other, other === item));
  }

  toggle(item, expanded) {
    if (expanded) this.open(item);
    else this.setState(item, false);
  }

  closeAll() {
    this.items.forEach((item) => this.setState(item, false));
  }

  setState(item, expanded) {
    const trigger = item.querySelector('[data-difference-trigger]');
    const panel = item.querySelector('[data-difference-panel]');
    clearTimeout(item.hideTimer);
    trigger?.setAttribute('aria-expanded', String(expanded));
    if (expanded) {
      panel.hidden = false;
      requestAnimationFrame(() => item.classList.add('is-active'));
    } else {
      item.classList.remove('is-active');
      item.hideTimer = setTimeout(() => { panel.hidden = true; }, 360);
    }
  }
}

if (!customElements.get('custom-brand-difference')) {
  customElements.define('custom-brand-difference', CustomBrandDifference);
}
