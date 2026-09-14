import { lockScroll, unlockScroll } from '@theme/utilities';

class HeaderVideoStories extends HTMLElement {
  connectedCallback() {
    this.controller = new AbortController();
    this.dialog = this.querySelector('dialog');
    this.slides = [...this.querySelectorAll('[data-story-slide]')];
    this.progress = [...this.querySelectorAll('[data-story-progress]')];
    this.index = 0;
    const options = { signal: this.controller.signal };
    document.addEventListener('click', this.onDocumentClick, { ...options, capture: true });
    this.addEventListener('click', this.onClick, options);
    this.dialog.addEventListener('cancel', event => { event.preventDefault(); this.close(); }, options);
    this.dialog.addEventListener('click', event => { if (event.target === this.dialog) this.close(); }, options);
    this.slides.forEach(slide => {
      const video = slide.querySelector('video');
      if (!video) return;
      video.muted = true;
      video.defaultMuted = true;
      video.controls = false;
      video.addEventListener('timeupdate', this.updateProgress, options);
      video.addEventListener('ended', () => this.index < this.slides.length - 1 ? this.show(this.index + 1) : this.pause(), options);
      video.addEventListener('volumechange', () => { if (!video.muted || video.volume !== 0) { video.muted = true; video.volume = 0; } }, options);
    });
  }

  disconnectedCallback() {
    if (this.dialog?.open) unlockScroll(this.dialog);
    this.controller?.abort();
  }

  onDocumentClick = event => {
    const trigger = event.target.closest('[data-story-open]');
    if (!trigger) return;
    event.preventDefault();
    this.returnFocus = trigger;
    this.index = 0;
    lockScroll(this.dialog);
    this.dialog.showModal();
    this.show(0);
    this.querySelector('[data-story-pause]').focus({ preventScroll: true });
  };

  onClick = event => {
    if (event.target.closest('[data-story-close]')) this.close();
    if (event.target.closest('[data-story-next]')) this.show(this.index + 1);
    if (event.target.closest('[data-story-prev]')) this.show(this.index - 1);
    if (event.target.closest('[data-story-pause]')) this.togglePause();
  };

  get video() { return this.slides[this.index]?.querySelector('video'); }

  show(index) {
    if (index < 0 || index >= this.slides.length) return;
    this.slides.forEach((slide, position) => {
      const video = slide.querySelector('video');
      slide.hidden = position !== index;
      if (position !== index && video) { video.pause(); video.currentTime = 0; }
    });
    this.index = index;
    const video = this.video;
    if (video) { video.muted = true; video.volume = 0; video.play().catch(() => this.pause()); }
    this.querySelector('[data-story-prev]').hidden = index === 0;
    this.querySelector('[data-story-next]').hidden = index === this.slides.length - 1;
    this.querySelector('[data-story-count]').textContent = `${index + 1} / ${this.slides.length}`;
    this.setPaused(false);
    this.updateProgress();
  }

  updateProgress = () => {
    const duration = this.video?.duration;
    const current = duration && Number.isFinite(duration) ? this.video.currentTime / duration * 100 : 0;
    this.progress.forEach((bar, position) => bar.style.width = `${position < this.index ? 100 : position === this.index ? current : 0}%`);
  };

  togglePause() {
    if (!this.video) return;
    if (this.video.paused) { this.video.play().catch(() => {}); this.setPaused(false); }
    else { this.video.pause(); this.setPaused(true); }
  }

  pause() { this.video?.pause(); this.setPaused(true); }

  setPaused(paused) {
    const button = this.querySelector('[data-story-pause]');
    button.setAttribute('aria-pressed', String(paused));
    button.setAttribute('aria-label', paused ? 'Play video' : 'Pause video');
    button.querySelector('[data-pause-icon]').hidden = paused;
    button.querySelector('[data-play-icon]').hidden = !paused;
  }

  close() {
    if (!this.dialog.open) return;
    this.pause();
    this.dialog.close();
    unlockScroll(this.dialog);
    this.returnFocus?.focus({ preventScroll: true });
  }
}

if (!customElements.get('header-video-stories')) customElements.define('header-video-stories', HeaderVideoStories);
