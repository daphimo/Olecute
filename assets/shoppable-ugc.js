import { sliders } from '@theme/theme-slider';

class ShoppableUgc extends HTMLElement {
  connectedCallback() {
    if (this.lifecycle) return;
    this.lifecycle = new AbortController();
    this.reduced = matchMedia('(prefers-reduced-motion: reduce)');
    this.root = this.querySelector('.shoppable-ugc__slider');
    this.dialog = this.querySelector('[data-reel-dialog]');
    this.reelRoot = this.querySelector('[data-reel-slider]');
    this.cards = [...this.querySelectorAll('.shoppable-ugc__card')];
    this.progress = this.querySelector('[data-ugc-progress]');
    this.listen(this, 'click', this.onClick);
    this.listen(document, 'visibilitychange', this.syncPlayback);
    this.listen(document, 'shopify:block:select', this.onBlockSelect);
    this.listen(this.reduced, 'change', this.syncPlayback);
    if (this.dialog) {
      this.listen(this.dialog, 'cancel', this.onCancel);
      this.listen(this.dialog, 'click', this.onDialogClick);
      this.listen(this.dialog, 'close', this.releaseDialog);
    }
    this.initSlider();
    this.observeCards();
  }

  listen(target, event, callback, options = {}) {
    target.addEventListener(event, callback, { ...options, signal: this.lifecycle.signal });
  }

  initSlider() {
    if (!this.root || !this.cards.length) return;
    const loop = this.dataset.slideType === 'loop';
    this.slider = sliders.init(this.root, {
      type: loop ? 'loop' : 'slide',
      rewind: false,
      clones: loop ? undefined : 0,
      perPage: Number(this.dataset.desktop) || 3.5,
      perMove: 1,
      gap: 'var(--ugc-gap)',
      speed: 600,
      easing: 'cubic-bezier(.22,.61,.36,1)',
      arrows: !!this.querySelector('.shoppable-ugc__arrows'),
      pagination: false,
      drag: true,
      trimSpace: true,
      omitEnd: !loop,
      autoplay: this.dataset.autoplaySlides === 'true' && !this.reduced.matches,
      interval: Number(this.dataset.interval) || 5000,
      pauseOnHover: true,
      pauseOnFocus: true,
      breakpoints: { 749: { perPage: Number(this.dataset.mobile) || 1.25, gap: 'var(--ugc-mobile-gap)', arrows: false } },
    }, (instance) => {
      instance.on('mounted moved resized refresh', this.updateProgress);
      instance.on('move', () => this.cards.forEach((card) => card.querySelector('video')?.pause()));
    });
    this.updateProgress();
  }

  updateProgress = () => {
    if (!this.slider || !this.progress) return;
    const loop = this.slider.options.type === 'loop';
    const end = this.slider.Components.Controller.getEnd();
    const value = loop ? (this.slider.index + 1) / this.slider.length : (end > 0 ? (this.slider.index + 1) / (end + 1) : 1);
    const bounded = Math.min(1, Math.max(0, value));
    this.style.setProperty('--ugc-progress', String(bounded));
    this.progress.parentElement?.setAttribute('aria-valuenow', String(Math.round(bounded * 100)));
  };

  observeCards() {
    this.observer?.disconnect();
    if (!this.cards.length || !('IntersectionObserver' in window)) return;
    this.observer = new IntersectionObserver((entries) => entries.forEach(({ target, isIntersecting }) => {
      const video = target.querySelector('video');
      if (!video) return;
      if (isIntersecting && this.dataset.autoplayVideos === 'true' && !this.dialog?.open && !document.hidden && !this.reduced.matches) video.play().catch(() => {});
      else video.pause();
    }), { threshold: .3 });
    this.cards.forEach((card) => this.observer.observe(card));
  }

  syncPlayback = () => {
    this.cards.forEach((card) => {
      const video = card.querySelector('video');
      if (!video) return;
      if (document.hidden || this.dialog?.open || this.reduced.matches) video.pause();
    });
    if (this.reduced.matches) this.slider?.Components.Autoplay?.pause();
  };

  onClick = (event) => {
    const open = event.target.closest('[data-reel-open]');
    if (open) { this.openReel(Number(open.dataset.reelIndex) || 0, open); return; }
    const play = event.target.closest('.shoppable-ugc__play');
    if (play) {
      const video = play.closest('.shoppable-ugc__card')?.querySelector('video');
      if (!video) return;
      if (video.paused) video.play().catch(() => {}); else video.pause();
      this.updatePlayButton(play, video.paused);
    }
  };

  updatePlayButton(button, paused) {
    button.setAttribute('aria-label', paused ? 'Play video' : 'Pause video');
    button.querySelector('[data-play]').hidden = !paused;
    button.querySelector('[data-pause]').hidden = paused;
  }

  openReel(index, opener) {
    if (!this.dialog || !this.reelRoot) return;
    this.opener = opener;
    this.bodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    this.cards.forEach((card) => card.querySelector('video')?.pause());
    this.dialog.showModal();
    if (!this.reelSlider) {
      this.reelSlider = sliders.init(this.reelRoot, {
        type: 'slide', direction: 'ttb', height: '100dvh', perPage: 1, perMove: 1,
        arrows: false, pagination: false, drag: true, wheel: true, wheelMinThreshold: 30,
        wheelSleep: 450, releaseWheel: true, keyboard: 'focused',
        noDrag: '.shoppable-ugc__reel-top *, .shoppable-ugc__reel-actions *, .shoppable-ugc__product *',
      }, (instance) => {
        instance.on('move', this.pauseReels);
        instance.on('mounted moved', this.playActiveReel);
      });
    }
    this.reelSlider?.go(index);
    this.playActiveReel();
    this.dialog.querySelector('.shoppable-ugc__reel-slide.is-active [data-reel-close], [data-reel-close]')?.focus({ preventScroll: true });
  }

  pauseReels = () => this.dialog?.querySelectorAll('.shoppable-ugc__reel-video').forEach((video) => video.pause());

  playActiveReel = () => {
    if (!this.dialog?.open || !this.reelSlider) return;
    this.dialog.querySelectorAll('.shoppable-ugc__reel-video').forEach((video, index) => {
      if (index !== this.reelSlider.index) { video.pause(); return; }
      video.muted = true;
      this.syncSoundButton(video);
      video.play().catch(() => {});
    });
  };

  onDialogClick = (event) => {
    if (event.target === this.dialog || event.target.closest('[data-reel-close]')) { this.dialog.close(); return; }
    const sound = event.target.closest('[data-reel-sound]');
    if (!sound) return;
    const video = sound.closest('.shoppable-ugc__reel-player')?.querySelector('video');
    if (!video) return;
    video.muted = !video.muted;
    this.syncSoundButton(video);
  };

  syncSoundButton(video) {
    const button = video.closest('.shoppable-ugc__reel-player')?.querySelector('[data-reel-sound]');
    if (!button) return;
    button.setAttribute('aria-pressed', String(video.muted));
    button.setAttribute('aria-label', video.muted ? 'Unmute video' : 'Mute video');
  }

  onCancel = (event) => { event.preventDefault(); this.dialog.close(); };

  releaseDialog = () => {
    this.pauseReels();
    document.body.style.overflow = this.bodyOverflow || '';
    this.opener?.focus({ preventScroll: true });
    this.opener = null;
    this.observeCards();
  };

  onBlockSelect = (event) => {
    const slides = [...this.querySelectorAll('.shoppable-ugc__slide:not(.splide__slide--clone)')];
    const index = slides.findIndex((slide) => slide.dataset.blockId === event.detail?.blockId);
    if (index >= 0) this.slider?.go(index);
  };

  disconnectedCallback() {
    if (this.dialog?.open) this.dialog.close();
    this.pauseReels();
    this.observer?.disconnect();
    this.lifecycle?.abort();
    this.lifecycle = null;
    if (this.root) sliders.destroy(this.root);
    if (this.reelRoot) sliders.destroy(this.reelRoot);
    document.body.style.overflow = this.bodyOverflow || '';
  }
}

if (!customElements.get('shoppable-ugc')) customElements.define('shoppable-ugc', ShoppableUgc);
