(() => {
  const MOBILE_QUERY = '(max-width: 749px)';

  const initFooter = (footer) => {
    if (!footer || footer.dataset.rsFooterInitialized === 'true') return;

    footer.dataset.rsFooterInitialized = 'true';

    const detailsItems = Array.from(
      footer.querySelectorAll('.rs-footer__details')
    );

    if (!detailsItems.length) return;

    const mediaQuery = window.matchMedia(MOBILE_QUERY);
    let previousMobileState = null;

    const setMode = () => {
      const isMobile = mediaQuery.matches;
      const enteringMobile = previousMobileState !== true && isMobile;

      detailsItems.forEach((details) => {
        const summary = details.querySelector(':scope > .rs-footer__summary');
        if (!summary) return;

        if (isMobile) {
          summary.removeAttribute('aria-disabled');
          summary.removeAttribute('tabindex');

          // Only reset to the Theme Editor default when first entering mobile.
          // After that, every accordion keeps the state chosen by the user.
          if (enteringMobile) {
            details.open = details.dataset.mobileOpenDefault === 'true';
          }
        } else {
          // Desktop is intentionally static: every block stays visible.
          details.open = true;
          summary.setAttribute('aria-disabled', 'true');
          summary.setAttribute('tabindex', '-1');
        }
      });

      previousMobileState = isMobile;
    };

    detailsItems.forEach((details) => {
      const summary = details.querySelector(':scope > .rs-footer__summary');
      if (!summary) return;

      summary.addEventListener('click', (event) => {
        if (!mediaQuery.matches) {
          event.preventDefault();
        }
      });
    });

    setMode();

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', setMode);
    } else if (typeof mediaQuery.addListener === 'function') {
      mediaQuery.addListener(setMode);
    }
  };

  const initAllFooters = (root = document) => {
    if (root.matches?.('.rs-footer')) {
      initFooter(root);
    }

    root.querySelectorAll?.('.rs-footer').forEach(initFooter);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => initAllFooters());
  } else {
    initAllFooters();
  }

  document.addEventListener('shopify:section:load', (event) => {
    initAllFooters(event.target);
  });
})();
