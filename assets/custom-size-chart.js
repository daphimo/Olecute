(() => {
  if (window.OlecuteSizeChart) return;
  window.OlecuteSizeChart = true;
  const state = { trigger: null, scrollY: 0, locked: false, bodyStyle: '' };
  const round = value => Number((value * 2.54).toFixed(2)).toString();
  const rows = dialog => [...dialog.querySelectorAll('[data-size-chart-rows] tr')].map(row => ({
    element: row,
    size: row.dataset.size,
    bust: Number(row.dataset.bust),
    waist: Number(row.dataset.waist)
  }));
  const close = dialog => {
    if (!dialog?.open) return;
    dialog.close();
  };
  const lockPage = () => {
    if (state.locked) return;
    state.scrollY = window.scrollY;
    state.bodyStyle = document.body.getAttribute('style') || '';
    document.body.style.position = 'fixed';
    document.body.style.top = `-${state.scrollY}px`;
    document.body.style.width = '100%';
    document.body.style.overflow = 'hidden';
    state.locked = true;
  };
  const unlockPage = () => {
    if (!state.locked) return;
    if (state.bodyStyle) document.body.setAttribute('style', state.bodyStyle);
    else document.body.removeAttribute('style');
    window.scrollTo({ top: state.scrollY, behavior: 'instant' });
    state.locked = false;
  };
  const open = trigger => {
    const dialogs = [...document.querySelectorAll('[data-size-chart-dialog]')];
    const dialog = dialogs.find(item => !item.closest('[hidden]')) || dialogs[0];
    if (!dialog) return;
    state.trigger = trigger;
    dialog.showModal();
    lockPage();
    dialog.querySelector('[data-size-chart-close]')?.focus({ preventScroll: true });
  };
  const setPressed = (group, selected) => group.querySelectorAll('[data-unit]').forEach(button => button.setAttribute('aria-pressed', String(button === selected)));
  const changeCalculatorUnit = (dialog, button) => {
    const group = button.closest('[data-calculator-units]');
    const previous = group.querySelector('[aria-pressed=true]')?.dataset.unit || 'in';
    const next = button.dataset.unit;
    if (previous === next) return;
    dialog.querySelectorAll('[data-size-chart-form] input').forEach(input => {
      const value = Number(input.value);
      if (Number.isFinite(value) && value > 0) input.value = previous === 'in' ? round(value) : Number((value / 2.54).toFixed(2)).toString();
    });
    setPressed(group, button);
    dialog.querySelectorAll('[data-calculator-unit-label]').forEach(label => { label.textContent = next; });
  };
  const changeTableUnit = (dialog, button) => {
    const unit = button.dataset.unit;
    setPressed(button.closest('[data-table-units]'), button);
    dialog.querySelectorAll('[data-inches]').forEach(cell => {
      const value = Number(cell.dataset.inches);
      cell.textContent = Number.isFinite(value) && value > 0 ? (unit === 'cm' ? round(value) : Number(value).toString()) : '—';
    });
    dialog.querySelectorAll('[data-table-unit-label]').forEach(label => { label.textContent = unit === 'cm' ? 'cm' : 'inches'; });
  };
  const submit = form => {
    const dialog = form.closest('[data-size-chart-dialog]');
    const error = form.querySelector('[data-size-chart-error]');
    const result = form.querySelector('[data-size-chart-result]');
    const bustInput = form.elements.bust;
    const waistInput = form.elements.waist;
    const bust = Number(bustInput.value);
    const waist = waistInput.value === '' ? null : Number(waistInput.value);
    error.textContent = '';
    bustInput.removeAttribute('aria-invalid');
    waistInput.removeAttribute('aria-invalid');
    result.hidden = true;
    if (!Number.isFinite(bust) || bust <= 0) {
      error.textContent = 'Enter a positive bust measurement.';
      bustInput.setAttribute('aria-invalid', 'true');
      bustInput.focus();
      return;
    }
    if (waist !== null && (!Number.isFinite(waist) || waist <= 0)) {
      error.textContent = 'Enter a positive waist measurement or leave it blank.';
      waistInput.setAttribute('aria-invalid', 'true');
      waistInput.focus();
      return;
    }
    const unit = form.querySelector('[data-calculator-units] [aria-pressed=true]')?.dataset.unit || 'in';
    const bustInches = unit === 'cm' ? bust / 2.54 : bust;
    const waistInches = waist === null ? null : unit === 'cm' ? waist / 2.54 : waist;
    const sizes = rows(dialog).filter(item => Number.isFinite(item.bust) && item.bust > 0);
    if (!sizes.length) {
      result.innerHTML = '<strong>Recommendation unavailable</strong><br>No valid bust measurements are configured for this chart.';
      result.hidden = false;
      return;
    }
    let index = sizes.findIndex(item => item.bust >= bustInches);
    const aboveRange = index === -1;
    if (aboveRange) index = sizes.length - 1;
    const choice = sizes[index];
    const next = sizes[index + 1];
    let message = `<strong>Recommended: ${choice.size}</strong><br>`;
    if (aboveRange) message += `Your measurement is above this chart's range. ${choice.size} is the largest listed size, so please review its measurements before ordering.`;
    else {
      message += `<strong>${choice.size}</strong> is the closest recommendation based on your bust measurement.`;
      if (next) message += ` Want a roomier feel? Try ${next.size}.`;
    }
    if (waistInches !== null && Number.isFinite(choice.waist) && choice.waist > 0 && waistInches > choice.waist) message += '<br><span>Your waist measurement is above this size entry; review the waist column before choosing.</span>';
    message += '<br><small>This is a guide based on the configured body measurements, not a guarantee of fit.</small>';
    result.innerHTML = message;
    result.hidden = false;
  };
  document.addEventListener('click', event => {
    const opener = event.target.closest('[data-size-chart-open]');
    if (opener) { open(opener); return; }
    const dialog = event.target.closest('[data-size-chart-dialog]');
    if (!dialog) return;
    if (event.target.closest('[data-size-chart-close]')) { close(dialog); return; }
    const calculatorUnit = event.target.closest('[data-calculator-units] [data-unit]');
    if (calculatorUnit) { changeCalculatorUnit(dialog, calculatorUnit); return; }
    const tableUnit = event.target.closest('[data-table-units] [data-unit]');
    if (tableUnit) changeTableUnit(dialog, tableUnit);
  });
  document.addEventListener('submit', event => {
    const form = event.target.closest('[data-size-chart-form]');
    if (!form) return;
    event.preventDefault();
    submit(form);
  });
  document.addEventListener('click', event => {
    if (event.target.matches('[data-size-chart-dialog]')) close(event.target);
  });
  document.addEventListener('close', event => {
    if (!event.target.matches?.('[data-size-chart-dialog]')) return;
    unlockPage();
    if (state.trigger?.isConnected) state.trigger.focus({ preventScroll: true });
    state.trigger = null;
  }, true);
})();
