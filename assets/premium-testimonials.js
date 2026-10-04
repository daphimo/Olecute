import { sliders } from '@theme/theme-slider';

class OlecuteTestimonials extends HTMLElement {
  connectedCallback() {
    if (this.lifecycle) return;
    this.lifecycle = new AbortController();
    this.sliderElement = this.querySelector('.olecute-testimonials__slider');
    this.dialog = this.querySelector('[data-review-dialog]');
    this.modalContent = this.querySelector('[data-modal-content]');
    this.progress = this.querySelector('[data-progress]');
    this.listen(this, 'click', this.onClick);
    this.listen(document, 'shopify:block:select', this.onBlockSelect);
    if (this.dialog) {
      this.listen(this.dialog, 'cancel', this.onCancel);
      this.listen(this.dialog, 'click', this.onBackdropClick);
      this.listen(this.dialog, 'close', this.releaseModal);
    }
    this.initSlider();
  }

  listen(target, event, callback, options = {}) {
    target.addEventListener(event, callback, { ...options, signal: this.lifecycle.signal });
  }

  initSlider() {
    if (!this.sliderElement || this.querySelectorAll('.splide__slide').length < 2) return;
    const desktop = Number(this.dataset.desktop) || 4;
    const tablet = Number(this.dataset.tablet) || 2;
    const mobile = Number(this.dataset.mobile) || 1.1;
    const gap = `${Number(this.dataset.gap) || 16}px`;
    const mobileGap = `${Number(this.dataset.mobileGap) || 12}px`;
    this.slider = sliders.init(this.sliderElement, {
      type: 'slide',
      rewind: false,
      clones: 0,
      perPage: desktop,
      perMove: 1,
      gap,
      speed: 600,
      easing: 'cubic-bezier(.22,.61,.36,1)',
      arrows: !!this.querySelector('.splide__arrows'),
      pagination: false,
      drag: true,
      trimSpace: true,
      omitEnd: true,
      autoplay: this.dataset.autoplay === 'true',
      interval: Number(this.dataset.interval) || 6000,
      pauseOnHover: true,
      pauseOnFocus: true,
      breakpoints: {
        989: { perPage: tablet, gap },
        749: { perPage: mobile, gap: mobileGap, arrows: false },
      },
    }, (instance) => {
      instance.on('mounted moved resized refresh', this.updateProgress);
      instance.on('destroy', () => { this.slider = null; });
    });
    this.updateProgress();
  }

  updateProgress = () => {
    if (!this.slider || !this.progress) return;
    const end = this.slider.Components.Controller.getEnd();
    const value = end > 0 ? (this.slider.index + 1) / (end + 1) : 1;
    this.style.setProperty('--reviews-progress', String(Math.min(1, Math.max(0, value))));
  };

  onClick = (event) => {
    if (event.target.closest('[data-review-close]')) {
      this.dialog?.close();
      return;
    }
    const card = event.target.closest('[data-review-open]');
    if (!card || card.hasAttribute('data-popup-disabled')) return;
    this.openModal(card.dataset.reviewOpen, card);
  };

  openModal(blockId, trigger) {
    const template = [...this.querySelectorAll('[data-review-template]')]
      .find((item) => item.dataset.reviewTemplate === blockId);
    if (!template || !this.dialog || !this.modalContent) return;
    this.returnFocus = trigger;
    this.modalContent.replaceChildren(template.content.cloneNode(true));
    this.lockScroll();
    this.dialog.showModal();
    this.querySelector('[data-review-close]')?.focus({ preventScroll: true });
  }

  onCancel = (event) => {
    event.preventDefault();
    this.dialog.close();
  };

  onBackdropClick = (event) => {
    if (event.target === this.dialog) this.dialog.close();
  };

  lockScroll() {
    if (this.scrollLock) return;
    const scrollbar = window.innerWidth - document.documentElement.clientWidth;
    this.scrollLock = {
      overflow: document.body.style.overflow,
      paddingRight: document.body.style.paddingRight,
    };
    document.body.style.overflow = 'hidden';
    if (scrollbar > 0) document.body.style.paddingRight = `${scrollbar}px`;
  }

  releaseModal = () => {
    this.modalContent?.querySelectorAll('video').forEach((video) => video.pause());
    this.modalContent?.replaceChildren();
    if (this.scrollLock) {
      document.body.style.overflow = this.scrollLock.overflow;
      document.body.style.paddingRight = this.scrollLock.paddingRight;
      this.scrollLock = null;
    }
    if (this.returnFocus?.isConnected) this.returnFocus.focus({ preventScroll: true });
    this.returnFocus = null;
  };

  onBlockSelect = (event) => {
    const slides = [...this.querySelectorAll('.olecute-testimonials__slide')];
    const index = slides.findIndex((slide) => slide.dataset.blockId === event.detail?.blockId);
    if (index >= 0) this.slider?.go(index);
  };

  disconnectedCallback() {
    if (this.dialog?.open) this.dialog.close();
    this.releaseModal();
    this.lifecycle?.abort();
    this.lifecycle = null;
    if (this.sliderElement) sliders.destroy(this.sliderElement);
    this.slider = null;
  }
}

if (!customElements.get('olecute-testimonials')) customElements.define('olecute-testimonials', OlecuteTestimonials);
