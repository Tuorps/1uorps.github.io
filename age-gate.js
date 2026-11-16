"use strict";
(() => {
  const key = 'tuorps-age-confirmed-session-v1';
  const gate = document.getElementById('ageGate');
  const site = document.getElementById('siteContent');
  const enter = document.getElementById('ageEnter');
  let opened = false;

  function openSite() {
    if (opened) return;
    opened = true;
    gate.hidden = true;
    site.hidden = false;
    site.removeAttribute('inert');
    document.body.classList.remove('age-check');

    // Do not load the renderer, gallery data or pictures before confirmation.
    const script = document.createElement('script');
    const pageScript = site.dataset.pageScript || 'script.js';
    script.src = pageScript === 'advertisers.js' ? 'advertisers.js' : 'script.js';
    script.addEventListener('error', () => {
      const status = document.getElementById('pageStatus') || document.getElementById('preview-sections');
      if (status) { status.hidden = false; status.textContent = 'The page could not be loaded. Please refresh and try again.'; }
    });
    document.head.appendChild(script);

    const heading = document.getElementById('introTitle') || document.getElementById('advertiserTitle');
    heading.setAttribute('tabindex', '-1');
    heading.focus({ preventScroll: true });
  }

  enter.addEventListener('click', () => {
    // If storage is blocked, confirmation still works for this page visit.
    try { sessionStorage.setItem(key, '1'); } catch {}
    openSite();
  });

  gate.addEventListener('keydown', event => {
    if (event.key !== 'Tab') return;
    const leave = gate.querySelector('.age-leave');
    if (event.shiftKey && document.activeElement === enter) { event.preventDefault(); leave.focus(); }
    else if (!event.shiftKey && document.activeElement === leave) { event.preventDefault(); enter.focus(); }
  });

  let confirmed = false;
  try { confirmed = sessionStorage.getItem(key) === '1'; } catch {}
  if (confirmed) openSite();
  else enter.focus({ preventScroll: true });
})();
