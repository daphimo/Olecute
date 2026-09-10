class CustomTabbedCollection extends HTMLElement {
  connectedCallback() {
    this.lifecycle?.abort();
    this.lifecycle = new AbortController();
    const listen = (node, event, fn, options = {}) => node.addEventListener(event, fn, { ...options, signal: this.lifecycle.signal });
    this.tabs = [...this.querySelectorAll('[data-tab]')];
    this.panels = [...this.querySelectorAll('[data-panel]')];
    this.querySelector('.custom-tabbed-collection__tabs').setAttribute('role', 'tablist');
    this.tabs.forEach(tab => {
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-controls', tab.hash.slice(1));
      listen(tab, 'click', event => { event.preventDefault(); this.activate(tab); });
      listen(tab, 'keydown', event => {
        const index = this.tabs.indexOf(tab), rtl = getComputedStyle(this).direction === 'rtl';
        let next;
        if (event.key === 'ArrowRight') next = index + (rtl ? -1 : 1);
        if (event.key === 'ArrowLeft') next = index + (rtl ? 1 : -1);
        if (event.key === 'Home') next = 0;
        if (event.key === 'End') next = this.tabs.length - 1;
        if (event.key === ' ') { event.preventDefault(); this.activate(tab); }
        if (next !== undefined) { event.preventDefault(); const target = this.tabs[(next + this.tabs.length) % this.tabs.length]; this.activate(target); target.focus(); }
      });
    });
    this.panels.forEach(panel => panel.setAttribute('role', 'tabpanel'));
    this.activate(this.tabs[0]);
    listen(this, 'shopify:block:select', event => { const tab = this.tabs.find(item => item.dataset.tab === event.detail?.blockId); if (tab) this.activate(tab); });
    this.querySelectorAll('.custom-tabbed-collection__track').forEach(track => {
      let gesture = null, suppressUntil = 0;
      listen(track, 'dragstart', event => event.preventDefault());
      listen(track, 'pointerdown', event => {
        if (event.pointerType !== 'mouse' || event.button !== 0) return;
        suppressUntil = 0;
        gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, left: track.scrollLeft, dragging: false };
      });
      listen(track, 'pointermove', event => {
        if (!gesture || gesture.id !== event.pointerId) return;
        const dx = event.clientX - gesture.x;
        if (!gesture.dragging && Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(event.clientY - gesture.y)) {
          gesture.dragging = true; track.setPointerCapture(event.pointerId); track.classList.add('is-dragging');
        }
        if (gesture.dragging) { event.preventDefault(); track.scrollLeft = gesture.left - dx; }
      });
      const finish = event => {
        if (!gesture || gesture.id !== event.pointerId) return;
        if (gesture.dragging) suppressUntil = performance.now() + 400;
        gesture = null; track.classList.remove('is-dragging');
        if (track.hasPointerCapture(event.pointerId)) track.releasePointerCapture(event.pointerId);
      };
      listen(track, 'pointerup', finish); listen(track, 'pointercancel', finish); listen(track, 'lostpointercapture', finish);
      listen(track, 'pointerleave', event => { if (!gesture?.dragging) finish(event); });
      listen(track, 'click', event => { if (performance.now() < suppressUntil) { event.preventDefault(); event.stopPropagation(); suppressUntil = 0; } }, { capture: true });
    });
  }
  activate(tab) {
    if (!tab) return;
    this.tabs.forEach(item => { item.setAttribute('aria-selected', String(item === tab)); item.tabIndex = item === tab ? 0 : -1; });
    this.panels.forEach(panel => { panel.hidden = panel.dataset.panel !== tab.dataset.tab; });
  }
  disconnectedCallback() { this.lifecycle?.abort(); }
}
if (!customElements.get('custom-tabbed-collection')) customElements.define('custom-tabbed-collection', CustomTabbedCollection);
