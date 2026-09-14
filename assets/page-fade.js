const root = document.documentElement;

function restorePage() {
  root.classList.remove('page-is-leaving');
}

window.addEventListener('pageshow', restorePage);

document.addEventListener('click', (event) => {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

  const link = event.target.closest('a[href]');
  if (!link || link.target === '_blank' || link.hasAttribute('download') || link.hasAttribute('data-no-page-fade')) return;

  const url = new URL(link.href, location.href);
  if (!/^https?:$/.test(url.protocol) || url.origin !== location.origin) return;
  if (url.pathname === location.pathname && url.search === location.search && url.hash) return;

  event.preventDefault();
  root.classList.add('page-is-leaving');
  window.setTimeout(() => location.assign(url.href), 180);
});
