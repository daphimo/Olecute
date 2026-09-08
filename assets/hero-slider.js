import { sliders } from '@theme/theme-slider';

/** Hero-only presentation and autoplay progress; Splide owns navigation and timing. */
class OlecuteHero extends HTMLElement {
  connectedCallback() {
    this.slides = [...this.querySelectorAll('.olecute-hero__slide:not(.splide__slide--clone)')];
    if (this.slides.length < 2) return;
    this.lifecycle = new AbortController();
    this.reduced = matchMedia('(prefers-reduced-motion: reduce)');
    this.autoplay = this.dataset.autoplay === 'true';
    this.inView = true;
    this.userPaused = false;
    this.selected = false;
    this.listen(this.reduced, 'change', this.syncAutoplay);
    this.listen(document, 'visibilitychange', this.syncAutoplay);
    this.listen(document, 'shopify:block:select', this.selectBlock);
    this.listen(document, 'shopify:block:deselect', this.deselectBlock);
    this.listen(this, 'focusout', () => queueMicrotask(this.syncAutoplay));
    const toggle = this.querySelector('.splide__toggle');
    if (toggle) this.listen(toggle, 'click', () => {
      // Splide's toggle expresses explicit user intent, independently of focus pauses.
      this.userPaused = toggle.classList.contains('is-active');
    }, { capture: true });

    this.slider = sliders.init(this, {
      type: this.dataset.type === 'slide' ? 'slide' : 'loop',
      rewind: this.dataset.type === 'slide',
      perPage: 1, perMove: 1, gap: 0,
      speed: 750, rewindSpeed: 750,
      easing: 'cubic-bezier(.22,.61,.36,1)',
      autoplay: this.autoplay,
      interval: Number(this.dataset.interval) || 5000,
      pagination: this.dataset.pagination === 'true',
      arrows: this.dataset.navigation === 'true',
      pauseOnHover: false, pauseOnFocus: true, resetProgress: true,
      drag: true, dragMinThreshold: { mouse: 0, touch: 10 },
      waitForTransition: true,
      i18n: { play: 'Play slideshow', pause: 'Pause slideshow' },
    }, (instance) => {
      this.slider = instance;
      instance.on('pagination:mounted', this.mountPagination);
      instance.on('pagination:updated', this.updatePagination);
      instance.on('autoplay:play', () => {
        if (this.isBlocked()) instance.Components.Autoplay.pause();
        else this.resetProgress();
      });
      instance.on('autoplay:pause', () => this.progressAnimation?.pause());
      instance.on('autoplay:playing', (rate) => {
        // Rewind emits exactly zero. No DOM work on ordinary autoplay frames.
        if (rate === 0) this.resetProgress();
      });
      instance.on('destroy', () => {
        this.cancelProgress();
        this.observer?.disconnect();
        this.lifecycle?.abort();
      });
    });
    if (!this.slider) { this.lifecycle.abort(); return; }
    this.syncAutoplay();
    this.observer = new IntersectionObserver(([entry]) => {
      this.inView = entry.isIntersecting;
      this.syncAutoplay();
    }, { threshold: 0 });
    this.observer.observe(this);
  }

  listen(target, event, callback, options = {}) {
    target.addEventListener(event, callback, { ...options, signal: this.lifecycle.signal });
  }

  mountPagination = (data, current) => {
    this.cancelProgress();
    data.items.forEach(({ button }) => {
      const track = document.createElement('span');
      track.className = 'olecute-hero__dot';
      track.setAttribute('aria-hidden', 'true');
      const fill = document.createElement('span');
      fill.className = 'olecute-hero__fill';
      track.append(fill);
      button.replaceChildren(track);
    });
    this.activeFill = current?.button.querySelector('.olecute-hero__fill');
    this.resetProgress();
  };

  updatePagination = (data, previous, current) => {
    this.activeFill = current?.button.querySelector('.olecute-hero__fill');
    this.resetProgress();
  };

  cancelProgress() {
    this.progressAnimation?.cancel();
    this.progressAnimation = null;
  }

  resetProgress() {
    this.cancelProgress();
    this.dataset.progress = String(this.autoplay && !this.reduced.matches);
    if (!this.activeFill || !this.autoplay || this.reduced.matches) return;
    this.progressAnimation = this.activeFill.animate([
      { transform: 'scaleX(0)' }, { transform: 'scaleX(1)' },
    ], { duration: this.slider.options.interval, easing: 'linear', fill: 'forwards' });
    if (this.slider.Components.Autoplay.isPaused()) this.progressAnimation.pause();
  }

  isBlocked() { return this.reduced.matches || document.hidden || !this.inView || this.selected || this.userPaused; }

  syncAutoplay = () => {
    if (!this.isConnected || !this.slider || this.lifecycle?.signal.aborted) return;
    this.dataset.progress = String(this.autoplay && !this.reduced.matches);
    if (!this.autoplay) return;
    if (this.isBlocked()) {
      this.slider.Components.Autoplay.pause();
      if (this.reduced.matches) this.cancelProgress();
    } else if (!this.contains(document.activeElement)) {
      this.slider.Components.Autoplay.play();
    }
  };

  selectBlock = (event) => {
    const index = this.slides.findIndex((slide) => slide.dataset.blockId === event.detail?.blockId);
    if (index < 0) return;
    this.selected = true;
    this.syncAutoplay();
    this.slider.go(index);
  };

  deselectBlock = (event) => {
    if (!this.slides.some((slide) => slide.dataset.blockId === event.detail?.blockId)) return;
    this.selected = false;
    this.syncAutoplay();
  };

  disconnectedCallback() {
    this.lifecycle?.abort();
    this.observer?.disconnect();
    this.cancelProgress();
    sliders.destroy(this);
    this.slider = null;
  }
}

if (!customElements.get('olecute-hero')) customElements.define('olecute-hero', OlecuteHero);
