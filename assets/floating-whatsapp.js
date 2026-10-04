class FloatingWhatsApp extends HTMLElement {
  connectedCallback() {
    const link = this.querySelector('.floating-whatsapp__link');
    const number = (this.dataset.whatsappNumber || '').replace(/\D/g, '');
    const message = (this.dataset.whatsappMessage || '').trim();

    if (!link || !number) {
      this.hidden = true;
      return;
    }

    const url = new URL(`https://wa.me/${number}`);
    if (message) url.searchParams.set('text', message);
    link.href = url.toString();

    requestAnimationFrame(() => this.classList.add('is-ready'));
  }
}

if (!customElements.get('floating-whatsapp')) {
  customElements.define('floating-whatsapp', FloatingWhatsApp);
}
