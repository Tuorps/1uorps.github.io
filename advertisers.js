"use strict";
(() => {
  document.getElementById('year').textContent = new Date().getFullYear();
  const form = document.getElementById('advertiserForm');
  const plan = document.getElementById('adPlan');
  const method = document.getElementById('contactMethod');
  const contact = document.getElementById('contactValue');
  const label = document.getElementById('contactLabel');
  const status = document.getElementById('formStatus');
  const submit = form.querySelector('[type="submit"]');
  let submitting = false;

  function updateContact() {
    contact.setCustomValidity('');
    const email = method.value === 'email';
    contact.type = email ? 'email' : 'text';
    contact.autocomplete = email ? 'email' : 'off';
    contact.placeholder = email ? 'you@example.com' : '@your_telegram_username';
    contact.maxLength = email ? 254 : 64;
    label.textContent = email ? 'Your email address' : 'Your Telegram username';
  }
  method.addEventListener('change', updateContact);
  contact.addEventListener('input', () => contact.setCustomValidity(''));
  updateContact();

  for (const link of document.querySelectorAll('[data-ad-plan]')) {
    link.addEventListener('click', () => {
      plan.value = link.dataset.adPlan;
      status.textContent = '';
    });
  }

  form.addEventListener('submit', event => {
    if (submitting) { event.preventDefault(); return; }
    status.textContent = '';
    contact.value = contact.value.trim();
    contact.setCustomValidity('');
    if (method.value === 'telegram' && !/^@?[a-zA-Z][a-zA-Z0-9_]{4,31}$/.test(contact.value)) {
      contact.setCustomValidity('Enter a Telegram username, such as @your_username.');
    }
    if (!form.reportValidity()) { event.preventDefault(); return; }
    if (form.dataset.receiverConfigured !== 'true' || !form.action.startsWith('https://')) {
      event.preventDefault();
      status.textContent = 'The inquiry form is being set up. Please try again shortly.';
      return;
    }
    // Normal HTTPS form POST: the notification address lives only in the service settings.
    // No visitor contact details are placed in a query string or stored in this browser.
    submitting = true;
    submit.disabled = true;
    submit.setAttribute('aria-busy', 'true');
    status.textContent = 'Sending your inquiry…';
  });
  window.addEventListener('pageshow', () => {
    submitting = false;
    submit.disabled = false;
    submit.removeAttribute('aria-busy');
    status.textContent = '';
  });
})();
