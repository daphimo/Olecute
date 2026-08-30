class CustomFooter extends HTMLElement {
  connectedCallback() {
    if (this.isConnectedAndReady) return;
    this.isConnectedAndReady = true;
    this.mobileQuery = window.matchMedia('(max-width: 749px)');
    this.onClick = this.onClick.bind(this);
    this.onViewportChange = this.onViewportChange.bind(this);
    this.addEventListener('click', this.onClick);
    this.mobileQuery.addEventListener('change', this.onViewportChange);
    this.syncAccessibility();
  }

  disconnectedCallback() {
    this.removeEventListener('click', this.onClick);
    this.mobileQuery?.removeEventListener('change', this.onViewportChange);
    this.isConnectedAndReady = false;
  }

  onClick(event) {
    const button = event.target.closest('.custom-footer__menu-toggle');
    if (!button || !this.mobileQuery.matches) return;
    const menu = button.closest('.custom-footer__menu');
    const expanded = !menu.classList.contains('is-open');
    menu.classList.toggle('is-open', expanded);
    button.setAttribute('aria-expanded', String(expanded));
    this.setPanelState(menu, expanded);
  }

  onViewportChange() {
    this.syncAccessibility();
  }

  syncAccessibility() {
    this.querySelectorAll('.custom-footer__menu').forEach((menu) => {
      const button = menu.querySelector('.custom-footer__menu-toggle');
      if (this.mobileQuery.matches) {
        const expanded = menu.classList.contains('is-open');
        button.setAttribute('aria-expanded', String(expanded));
        this.setPanelState(menu, expanded);
      } else {
        button.setAttribute('aria-expanded', 'true');
        this.setPanelState(menu, true);
      }
    });
  }

  setPanelState(menu, expanded) {
    const panel = menu.querySelector('.custom-footer__menu-content');
    panel.toggleAttribute('inert', !expanded);
    panel.setAttribute('aria-hidden', String(!expanded));
  }
}

if (!customElements.get('custom-footer')) customElements.define('custom-footer', CustomFooter);
