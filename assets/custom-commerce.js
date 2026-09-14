import { lockScroll, unlockScroll } from '@theme/utilities';
import { morphSection } from '@theme/section-renderer';
import { CartLinesUpdateEvent } from '@shopify/events';

export function measurement(value, unit = 'in') {
  if (value && typeof value === 'object') value = value.value ?? value;
  if (Array.isArray(value)) value = value.join('-');
  const text = String(value ?? '').trim();
  if (!/^\d+(?:\.\d+)?(?:\s*[-–—/]\s*\d+(?:\.\d+)?)?$/.test(text)) return '-';
  const values = text.split(/\s*[-–—/]\s*/).map(Number);
  if (values.some(number => !number || !Number.isFinite(number))) return '-';
  return values.map(number => unit === 'cm' ? Math.round(number * 254) / 100 : number).join('-') + (unit === 'cm' ? ' cm' : ' Inch');
}

function startCommerce() {
  const config = document.getElementById('custom-commerce-config');
  if (!config) return;
  const root = config.dataset.root.replace(/\/?$/, '/');
  const quick = document.getElementById('custom-quick-add');
  const toast = document.getElementById('custom-wishlist-toast');
  const key = 'olecute_wishlist_v1';
  const measurementKeys = ['chest','waist','hips','bust','to_fit_waist','pyjama_waist','inseam_length','front_length','across_shoulder'];
  const opened = new Set(), returnFocus = new WeakMap(), cache = new Map();
  let scrollLock, pendingQuick, toastTimer, cartBusy = false, storageOK = true;
  const safeURL = (value, image = false) => {
    try { const url = new URL(value, location.origin); return /https?:/.test(url.protocol) && (url.origin === location.origin || image && /(^|\.)shopify\.com$/.test(url.hostname)) ? url.href : ''; } catch { return ''; }
  };
  function readWishlist() {
    try {
      const stored = JSON.parse(localStorage.getItem(key) || '[]');
      if (!Array.isArray(stored)) return [];
      return [...new Map(stored.filter(item => item && /^\d+$/.test(item.variantId)).map(item => [String(item.variantId), item])).values()].slice(0,200);
    } catch { storageOK = false; return []; }
  }
  let wishlist = readWishlist();
  function syncWishlist(scope = document) {
    scope.querySelectorAll('[data-custom-wishlist]').forEach(button => {
      try { const item = JSON.parse(button.dataset.wishlistItem); const saved = wishlist.some(entry => entry.variantId === String(item.variantId)); button.setAttribute('aria-pressed',String(saved)); button.setAttribute('aria-label',`${saved ? 'Remove' : 'Save'} ${item.title} ${saved ? 'from' : 'to'} wishlist`); } catch { button.disabled = true; }
    });
  }
  function renderWishlist(scope = document) {
    scope.querySelectorAll('[data-custom-wishlist-page]').forEach(page => {
      const grid = page.querySelector('[data-wishlist-grid]'), template = page.querySelector('[data-wishlist-template]');
      grid.replaceChildren();
      for (const item of wishlist) {
        const card = template.content.firstElementChild.cloneNode(true);
        card.dataset.variantId = item.variantId;
        card.querySelectorAll('[data-wishlist-link]').forEach(link => link.href = safeURL(item.url) || root + 'collections/all');
        card.querySelector('[data-wishlist-title]').textContent = String(item.title ?? 'Saved product');
        card.querySelector('[data-wishlist-price]').textContent = String(item.price ?? '');
        card.querySelector('[data-wishlist-size]').textContent = item.size ? `Size ${item.size}` : '';
        const image = card.querySelector('img'), src = safeURL(item.image,true);
        if (src) { image.src = src; image.alt = String(item.title ?? ''); } else image.hidden = true;
        grid.append(card);
      }
      page.querySelector('[data-wishlist-empty]').hidden = wishlist.length > 0;
      page.querySelector('[data-wishlist-storage-error]').hidden = storageOK;
    });
  }
  function saveWishlist(next) {
    try { localStorage.setItem(key,JSON.stringify(next)); wishlist = next; storageOK = true; syncWishlist(); renderWishlist(); return true; }
    catch { storageOK = false; renderWishlist(); return false; }
  }
  function showToast(item) {
    clearTimeout(toastTimer);
    toast.querySelector('[data-toast-title]').textContent = item.title;
    const image = toast.querySelector('[data-toast-image]'), src = safeURL(item.image,true);
    image.hidden = !src; if (src) image.src = src;
    ([...opened].at(-1) || document.body).append(toast);
    toast.hidden = false; toast.showPopover?.();
    toastTimer = setTimeout(hideToast,10000);
  }
  function hideToast() { toast.hidePopover?.(); toast.hidden = true; clearTimeout(toastTimer); document.body.append(toast); }
  function openDialog(dialog, trigger) {
    if (dialog.open) return;
    returnFocus.set(dialog,trigger);
    if (!opened.size) {
      const body = document.body;
      scrollLock = { y:window.scrollY, styles:['position','top','width','padding-right'].map(key => [key,body.style.getPropertyValue(key),body.style.getPropertyPriority(key)]) };
      const gap = innerWidth - document.documentElement.clientWidth;
      const padding = parseFloat(getComputedStyle(body).paddingRight) || 0;
      body.style.position = 'fixed'; body.style.top = `-${scrollLock.y}px`; body.style.width = '100%'; body.style.paddingRight = `${padding + gap}px`;
    }
    opened.add(dialog); lockScroll(dialog); dialog.showModal(); dialog.querySelector('[data-custom-close]').focus();
  }
  function closed(dialog) {
    if (!opened.delete(dialog)) return;
    if (dialog.contains(toast)) hideToast();
    unlockScroll(dialog);
    if (!opened.size && scrollLock) {
      for (const [key,value,priority] of scrollLock.styles) value ? document.body.style.setProperty(key,value,priority) : document.body.style.removeProperty(key);
      window.scrollTo({top:scrollLock.y,behavior:'instant'}); scrollLock = null;
    }
    const target = returnFocus.get(dialog); if (target?.isConnected) target.focus({preventScroll:true});
  }
  function closeQuick() {
    quick.querySelectorAll('dialog[open]').forEach(dialog => { dialog.close(); closed(dialog); });
    quick.close(); closed(quick);
  }
  async function requestJSON(url, options) {
    const response = await fetch(url,options); const data = await response.json();
    if (!response.ok || data.status >= 400) throw new Error(typeof data.description === 'string' ? data.description : 'Unable to update your cart. Please try again.');
    return data;
  }
  async function addToCart(variantId, quantity = 1, source) {
    if (cartBusy) return false;
    if (!/^\d+$/.test(String(variantId)) || !Number.isInteger(Number(quantity)) || Number(quantity) < 1) throw new Error('Choose an available option.');
    cartBusy = true;
    let added = false;
    try {
      const ids = [...new Set([...document.querySelectorAll('cart-items-component[data-section-id]')].map(el => el.dataset.sectionId))].slice(0,5);
      const result = await requestJSON(root+'cart/add.js',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({items:[{id:String(variantId),quantity:Number(quantity)}],sections:ids,sections_url:location.pathname})});
      added = true;
      const cart = await requestJSON(root+'cart.js');
      document.querySelectorAll('[data-cart-count]').forEach(node => node.textContent = String(cart.item_count));
      let sections = result.sections || {};
      if (ids.some(id => !sections[id])) {
        const url = new URL(root+'cart',location.origin);url.searchParams.set('sections',ids.join(','));sections = await requestJSON(url);
      }
      for (const id of ids) { if (!sections[id]) throw new Error('Cart display unavailable.'); await morphSection(id,sections[id],{mode:'hydration',injectStylesheet:true}); }
      if (quick.open) closeQuick();
      const event = new CartLinesUpdateEvent({action:'add',context:'product',lines:[{merchandiseId:String(variantId),quantity:Number(quantity)}],promise:Promise.resolve({cart:CartLinesUpdateEvent.createCartFromAjaxResponse(cart),detail:{sections,customSectionsRendered:true}})});
      document.dispatchEvent(event);
      document.querySelector('theme-drawer#cart-drawer')?.open();
      source?.dispatchEvent(new CustomEvent('custom:cart-success',{bubbles:true,detail:{cart,variantId}}));
      return cart;
    } catch (error) {
      if (added) error = new Error('Added to cart, but the cart display could not refresh. View your cart before trying again.');
      source?.dispatchEvent(new CustomEvent('custom:cart-error',{bubbles:true,detail:{message:error.message,added}}));
      throw error;
    } finally { cartBusy = false; }
  }
  async function submit(button, id, quantity = 1) {
    if (button.disabled || cartBusy) return;
    const scope = button.closest('[data-custom-add-form],.custom-product-card');
    const error = scope?.querySelector('[data-custom-error]');
    if (error) error.textContent = '';
    const label = [...button.childNodes];
    button.textContent = 'Adding...';
    button.disabled = true; button.setAttribute('aria-busy','true');
    try { await addToCart(id,quantity,button); }
    catch (failure) { if (error) error.textContent = failure.message; }
    finally {
      const available = button.closest('custom-product-options')?.selected?.available ?? true;
      button.disabled = !available; button.removeAttribute('aria-busy');
      if (button.matches('.custom-add-button')) button.textContent = available ? 'ADD TO CART' : 'Sold out';
      else button.replaceChildren(...label);
    }
  }
  async function openQuick(button) {
    pendingQuick?.abort(); pendingQuick = new AbortController(); const controller = pendingQuick;
    const url = new URL(button.dataset.customQuickAdd,location.origin);url.searchParams.set('section_id','custom-quick-add');
    button.setAttribute('aria-busy','true');
    try {
      let html = cache.get(url.href);
      if (!html) { const response = await fetch(url,{signal:controller.signal}); if (!response.ok) throw Error('Unable to load options. Please try again.');html = await response.text(); if (cache.size >= 6) cache.delete(cache.keys().next().value);cache.set(url.href,html); }
      if (controller.signal.aborted) return;
      const parsed = new DOMParser().parseFromString(html,'text/html').querySelector('custom-product-options');
      if (!parsed) throw Error('Options unavailable. Please visit the product page.');
      if (quick.open) closeQuick();
      quick.querySelector('[data-custom-quick-content]').replaceChildren(document.importNode(parsed,true));openDialog(quick,button);
    } catch (error) { if (error.name !== 'AbortError') button.closest('article').querySelector('[data-custom-error]').textContent = error.message; }
    finally { button.removeAttribute('aria-busy'); }
  }
  class ProductOptions extends HTMLElement {
    connectedCallback() {
      this.variants = JSON.parse(this.dataset.variants || '[]');
      this.optionNames = JSON.parse(this.dataset.optionNames || '[]');
      this.sizeIndex = this.optionNames.findIndex(name => /size/i.test(name));
      this.unit = 'in'; this.selected = this.variants.find(v=>v.id===this.dataset.selected) || this.variants[0];
      if (this.selected) this.update();
    }
    update() {
      const variant = this.selected;
      this.dataset.selected = variant.id;
      this.querySelectorAll('[data-custom-price]').forEach(el => el.innerHTML = variant.priceHtml);
      this.querySelectorAll('[name=id]').forEach(el => el.value = variant.id);
      this.querySelectorAll('.custom-add-button').forEach(add => { add.disabled = !variant.available || cartBusy;add.textContent = cartBusy ? 'Adding...' : variant.available ? 'ADD TO CART' : 'Sold out'; });
      this.querySelectorAll('[data-custom-option]').forEach(group => {
        const index = Number(group.dataset.customOption);
        group.querySelectorAll('button').forEach(button => {
          const value = button.dataset.customOptionValue;
          button.setAttribute('aria-pressed',String(variant.options[index] === value));
          button.disabled = !this.variants.some(v=>v.available && v.options.every((option,i)=>option === (i===index ? value : variant.options[i])));
        });
      });
      this.querySelectorAll('[data-measure]').forEach(el => el.textContent = measurement(variant[el.dataset.measure],this.unit));
      this.querySelectorAll('[data-custom-unit]').forEach(button => button.setAttribute('aria-pressed',String(button.dataset.customUnit === this.unit)));
      const rows = this.querySelector('[data-custom-chart-rows]');rows?.replaceChildren();
      const variants = this.variants.filter(v=>this.sizeIndex < 0 || v.options.every((value,i)=>i===this.sizeIndex || value===variant.options[i]));
      for (const item of rows ? variants : []) {
        const row = document.createElement('tr');
        for (const value of [this.sizeIndex < 0 ? item.options.join(' / ') : item.options[this.sizeIndex], ...measurementKeys.map(key=>measurement(item[key],this.unit))]) { const cell = document.createElement('td');cell.textContent = value;row.append(cell); }rows.append(row);
      }
      const button = this.querySelector('[data-custom-wishlist]');
      if (button) { const item = JSON.parse(button.dataset.wishlistItem);item.variantId = variant.id;item.price = variant.price;item.image = variant.image || item.image;item.size = this.sizeIndex < 0 ? '' : variant.options[this.sizeIndex];item.url = item.url.split('?')[0]+'?variant='+variant.id;button.dataset.wishlistItem = JSON.stringify(item);syncWishlist(this); }
      this.dispatchEvent(new CustomEvent('custom:variant-change',{bubbles:true,detail:{variant,unit:this.unit}}));
    }
  }
  if (!customElements.get('custom-product-options')) customElements.define('custom-product-options',ProductOptions);
  if (!customElements.get('custom-wishlist-control')) customElements.define('custom-wishlist-control',class extends HTMLElement { connectedCallback() { syncWishlist(this); } });
  document.addEventListener('submit',event => {
    const form = event.target.closest('[data-custom-add-form]');if (!form) return;event.preventDefault();submit(form.querySelector('button[type=submit]'),form.elements.id.value,Number(form.elements.quantity.value));
  });
  document.addEventListener('click',event => {
    const button = event.target.closest('button');if (!button) return;
    if (button.matches('[data-custom-close]')) { const dialog=button.closest('dialog');dialog===quick ? closeQuick() : (dialog.close(),closed(dialog)); }
    if (button.matches('[data-custom-quick-add]')) button.dataset.directVariant ? submit(button,button.dataset.directVariant) : openQuick(button);
    if (button.matches('[data-custom-gallery-step],[data-custom-gallery-index]')) {
      const gallery = button.closest('[data-custom-gallery]'), slides = gallery.querySelectorAll('.custom-product-card__gallery-slide');
      const index = button.hasAttribute('data-custom-gallery-index') ? Number(button.dataset.customGalleryIndex) : (Number(gallery.dataset.index)+Number(button.dataset.customGalleryStep)+slides.length)%slides.length;
      gallery.dataset.index = index;gallery.querySelector('[data-custom-image-track]').style.transform=`translate3d(${-100*index}%,0,0)`;gallery.querySelectorAll('[data-custom-gallery-index]').forEach(dot=>dot.setAttribute('aria-pressed',String(Number(dot.dataset.customGalleryIndex)===index)));
    }
    const options = button.closest('custom-product-options');
    if (options && button.matches('[data-custom-option-value]')) {
      const selected = [...options.selected.options];selected[Number(button.closest('[data-custom-option]').dataset.customOption)] = button.dataset.customOptionValue;
      const variant = options.variants.find(v=>v.available && v.options.every((value,i)=>value===selected[i]));if (variant) { options.selected = variant;options.update(); }
    }
    if (button.matches('[data-custom-unit]')) {
      if (options) { options.unit = button.dataset.customUnit;options.update(); }
      else { const scope = button.closest('[data-custom-measurements]');scope?.querySelectorAll('[data-inches]').forEach(el=>{let value;try{value=JSON.parse(el.dataset.inches);}catch{value=el.dataset.inches;}el.textContent=measurement(value,button.dataset.customUnit);});button.parentElement.querySelectorAll('button').forEach(el=>el.setAttribute('aria-pressed',String(el===button))); }
    }
    if (button.matches('[data-custom-chart-open]')) { const chart = (options || button.closest('[data-custom-size-scope]'))?.querySelector('[data-custom-chart]');if (chart) openDialog(chart,button); }
    if (button.matches('[data-custom-wishlist]')) {
      wishlist = readWishlist();const item = JSON.parse(button.dataset.wishlistItem);item.variantId = String(item.variantId);
      const exists = wishlist.some(entry=>entry.variantId===item.variantId);
      if (saveWishlist(exists ? wishlist.filter(entry=>entry.variantId!==item.variantId) : [...wishlist,item])) { if (!exists) showToast(item); else hideToast(); }
      else { const error = button.closest('custom-product-options')?.querySelector('[data-custom-error]');if (error) error.textContent = 'Wishlist could not be saved. Browser storage is unavailable.'; }
    }
    if (button.matches('[data-custom-wishlist-remove]')) { wishlist = readWishlist();saveWishlist(wishlist.filter(item=>item.variantId!==button.closest('[data-variant-id]').dataset.variantId)); }
    if (button.matches('[data-custom-toast-close]')) hideToast();
  });
  document.addEventListener('close',event => { if (event.target.matches?.('.custom-quick-add,.custom-size-chart')) closed(event.target); },true);
  document.addEventListener('shopify:section:load',event=>{syncWishlist(event.target);renderWishlist();});
  document.addEventListener('shopify:section:unload',()=>{pendingQuick?.abort();if (quick.open) closeQuick();});
  window.addEventListener('storage',event=>{if (event.key===key || event.key===null) {wishlist=readWishlist();syncWishlist();renderWishlist();}});
  window.addEventListener('pageshow',()=>{wishlist=readWishlist();syncWishlist();renderWishlist();});
  syncWishlist();renderWishlist();
  return { addToCart, measurement, syncWishlist, renderWishlist };
}
if (!window.OlecuteCommerce) window.OlecuteCommerce = startCommerce();
export const addToCart = (...args) => window.OlecuteCommerce.addToCart(...args);
