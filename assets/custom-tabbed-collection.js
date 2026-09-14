class CustomTabbedCollection extends HTMLElement {
  connectedCallback() {
    this.lifecycle?.abort();
    this.lifecycle = new AbortController();
    this.tabs = [...this.querySelectorAll('[data-tab]')];
    this.panels = [...this.querySelectorAll('[data-panel]')];
    const options = { signal: this.lifecycle.signal };
    this.tabs.forEach((tab, index) => {
      tab.addEventListener('click', () => this.activate(tab), options);
      tab.addEventListener('keydown', event => {
        let next = null;
        if (event.key === 'ArrowRight') next = index + 1;
        if (event.key === 'ArrowLeft') next = index - 1;
        if (event.key === 'Home') next = 0;
        if (event.key === 'End') next = this.tabs.length - 1;
        if (next === null) return;
        event.preventDefault();
        const target = this.tabs[(next + this.tabs.length) % this.tabs.length];
        this.activate(target);
        target.focus();
      }, options);
    });
    const selected = this.tabs.find(tab => tab.getAttribute('aria-selected') === 'true') || this.tabs[0];
    this.activate(selected);
    this.addEventListener('shopify:block:select', event => {
      const tab = this.tabs.find(item => item.dataset.tab === event.detail?.blockId);
      if (tab) this.activate(tab);
    }, options);
  }
  activate(tab) {
    if (!tab) return;
    this.tabs.forEach(item => {
      const active = item === tab;
      item.setAttribute('aria-selected', String(active));
      item.tabIndex = active ? 0 : -1;
    });
    this.panels.forEach(panel => panel.hidden = panel.dataset.panel !== tab.dataset.tab);
  }
  disconnectedCallback() { this.lifecycle?.abort(); }
}
if (!customElements.get('custom-tabbed-collection')) customElements.define('custom-tabbed-collection', CustomTabbedCollection);
