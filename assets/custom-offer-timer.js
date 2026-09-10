class CustomOfferTimer extends HTMLElement {
  connectedCallback() {
    this.lifecycle?.abort();
    this.lifecycle = new AbortController();
    this.card = this.querySelector('.custom-offer-timer__card');
    this.ropes = [...this.querySelectorAll('[data-rope]')];
    this.fields = ['days', 'hours', 'minutes', 'seconds'].map(unit => this.querySelector(`[data-timer-${unit}]`));
    this.motion = matchMedia('(min-width: 750px) and (hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)');
    this.current = this.target = 0;
    this.visible = true;
    this.frame = 0;
    const listen = (node, event, fn) => node.addEventListener(event, fn, { signal: this.lifecycle.signal });
    listen(this, 'pointerenter', () => { const rect = this.getBoundingClientRect(); this.pointerBounds = { left: rect.left, width: rect.width }; });
    listen(this, 'pointermove', event => {
      if (event.pointerType !== 'mouse' || !this.canAnimate() || !this.pointerBounds) return;
      this.target = Math.max(-1, Math.min(1, (event.clientX - this.pointerBounds.left) / this.pointerBounds.width * 2 - 1));
      this.startMotion();
    });
    listen(this, 'pointerleave', () => { this.target = 0; this.startMotion(); });
    listen(this.motion, 'change', () => this.resetMotion());
    listen(document, 'visibilitychange', () => {
      this.resetMotion(); clearInterval(this.interval); this.interval = 0;
      if (!document.hidden) this.startCountdown();
    });
    this.resizeObserver = new ResizeObserver(() => this.queueMeasure());
    this.resizeObserver.observe(this); this.resizeObserver.observe(this.card);
    // Observing the containing section list handles editor reorder and sibling size changes.
    this.sectionWrapper = this.closest('.shopify-section') || this;
    if (this.sectionWrapper.parentElement) this.resizeObserver.observe(this.sectionWrapper.parentElement);
    this.intersectionObserver = new IntersectionObserver(entries => {
      this.visible = entries[0].isIntersecting;
      if (!this.visible) this.resetMotion();
    });
    this.intersectionObserver.observe(this);
    this.end = this.parseEnd();
    this.startCountdown();
    this.measure();
  }
  parseEnd() {
    const date = this.dataset.date || '', time = this.dataset.time || '', offset = this.dataset.offset || '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(time) || !/^[+-](0\d|1[0-4]):[0-5]\d$/.test(offset) || (offset.slice(1, 3) === '14' && offset.slice(4) !== '00')) return NaN;
    const calendar = new Date(date + 'T00:00:00Z');
    if (!Number.isFinite(calendar.getTime()) || calendar.toISOString().slice(0, 10) !== date) return NaN;
    return Date.parse(`${date}T${time.length === 5 ? time + ':00' : time}${offset}`);
  }
  startCountdown() {
    clearInterval(this.interval); this.interval = 0;
    this.querySelector('.custom-offer-timer__expired').hidden = true;
    const notice = this.querySelector('[data-timer-notice]');
    if (notice) notice.hidden = Number.isFinite(this.end);
    if (!Number.isFinite(this.end)) return;
    if (this.updateCountdown() && !document.hidden) this.interval = setInterval(() => this.updateCountdown(), 1000);
  }
  updateCountdown() {
    const remaining = Math.max(0, Math.ceil((this.end - Date.now()) / 1000));
    const values = [Math.floor(remaining / 86400), Math.floor(remaining / 3600) % 24, Math.floor(remaining / 60) % 60, remaining % 60];
    this.fields.forEach((field, index) => { const text = String(values[index]).padStart(2, '0'); if (field.textContent !== text) field.textContent = text; });
    if (!remaining) {
      clearInterval(this.interval); this.interval = 0;
      const expired = this.querySelector('.custom-offer-timer__expired');
      expired.hidden = !expired.textContent.trim();
    }
    return remaining > 0;
  }
  canAnimate() { return this.motion.matches && this.dataset.interaction === 'true' && this.visible && !document.hidden; }
  startMotion() { if (!this.frame && this.canAnimate()) this.frame = requestAnimationFrame(this.animate); }
  animate = () => {
    this.frame = 0;
    if (!this.canAnimate()) return;
    this.current += (this.target - this.current) * 0.08;
    if (Math.abs(this.target - this.current) < 0.001) this.current = this.target;
    this.draw();
    if (this.current !== this.target) this.frame = requestAnimationFrame(this.animate);
  };
  resetMotion() {
    cancelAnimationFrame(this.frame); this.frame = 0;
    this.current = this.target = 0; this.draw();
  }
  queueMeasure() {
    clearTimeout(this.measureTimeout);
    this.measureTimeout = setTimeout(() => this.measure(), 32);
  }
  measure() {
    if (!this.isConnected) return;
    const root = this.getBoundingClientRect();
    const previous = this.sectionWrapper.previousElementSibling;
    const anchor = this.dataset.anchor === 'previous' ? previous?.querySelector('[data-tab-collection-anchor]') : null;
    if (anchor !== this.anchor) {
      if (this.anchor) this.resizeObserver.unobserve(this.anchor);
      this.anchor = anchor;
      if (anchor) this.resizeObserver.observe(anchor);
    }
    const anchorRect = anchor?.getBoundingClientRect();
    // Cache untransformed card geometry. draw() uses only arithmetic and style writes.
    this.geometry = { x: this.card.offsetLeft, y: this.card.offsetTop, width: this.card.offsetWidth, height: this.card.offsetHeight, rootWidth: root.width };
    const g = this.geometry, spread = Number(this.dataset.angle) || 0;
    const config = [{ point: 0.12, shift: -1, depth: 0 }, { point: 0.24, shift: -0.55, depth: 3 }, { point: 0.76, shift: 0.55, depth: 0 }, { point: 0.88, shift: 1, depth: 3 }];
    this.anchors = config.map(item => {
      const y = anchorRect ? anchorRect.bottom - root.top - 2 : -12;
      const x = g.x + g.width * item.point + item.shift * Math.tan(spread * Math.PI / 180) * (g.y - y);
      return { ...item, x: anchorRect ? Math.max(anchorRect.left - root.left + 12, Math.min(anchorRect.right - root.left - 12, x)) : x, y };
    });
    this.pointerBounds = { left: root.left, width: root.width };
    this.draw();
  }
  draw() {
    if (!this.geometry) return;
    const g = this.geometry;
    const shift = -this.current * Math.min(g.rootWidth * (Number(this.dataset.strength) || 0) / 100, 24);
    const angle = 1 + this.current * (Number(this.dataset.tilt) || 0);
    const rotation = angle * Math.PI / 180, yaw = 5 * Math.PI / 180;
    this.card.style.transform = `perspective(1000px) translateX(${shift}px) rotate(${angle}deg) rotateY(5deg)`;
    this.anchors.forEach((anchor, index) => {
      const localX = (anchor.point - 0.5) * g.width, localY = -g.height / 2 + anchor.depth;
      const x = localX * Math.cos(yaw), z = -localX * Math.sin(yaw), projection = 1000 / (1000 - z);
      const endX = g.x + g.width / 2 + (x * Math.cos(rotation) - localY * Math.sin(rotation) + shift) * projection;
      const endY = g.y + g.height / 2 + (x * Math.sin(rotation) + localY * Math.cos(rotation)) * projection;
      const dx = endX - anchor.x, dy = endY - anchor.y;
      const rope = this.ropes[index];
      rope.style.left = `${anchor.x}px`; rope.style.top = `${anchor.y}px`;
      rope.style.height = `${Math.hypot(dx, dy)}px`;
      rope.style.transform = `translateX(-50%) rotate(${-Math.atan2(dx, dy) * 180 / Math.PI}deg)`;
    });
  }
  disconnectedCallback() {
    this.lifecycle?.abort(); clearInterval(this.interval); clearTimeout(this.measureTimeout); cancelAnimationFrame(this.frame);
    this.resizeObserver?.disconnect(); this.intersectionObserver?.disconnect();
  }
}
if (!customElements.get('custom-offer-timer')) customElements.define('custom-offer-timer', CustomOfferTimer);
