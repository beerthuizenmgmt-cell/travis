const WA = 'https://wa.me/31655585299';

function hydrateLazyImages() {
  document.querySelectorAll('img[data-src]').forEach((img) => {
    if (!img.getAttribute('src') || img.getAttribute('src')?.startsWith('data:')) {
      img.setAttribute('src', img.getAttribute('data-src'));
    }
    const srcset = img.getAttribute('data-srcset');
    if (srcset) img.setAttribute('srcset', srcset);
    img.classList.remove('lazyload');
    img.classList.add('lazyloaded');
  });
}

function enhanceWhatsAppLinks() {
  document.querySelectorAll(`a[href*="wa.me/31655585299"]`).forEach((a) => {
    a.setAttribute('target', '_blank');
    a.setAttribute('rel', 'noopener noreferrer');
  });
}

function addFloatingWhatsApp() {
  if (document.querySelector('.tc-whatsapp-float')) return;
  const a = document.createElement('a');
  a.className = 'tc-whatsapp-float';
  a.href = WA;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.setAttribute('aria-label', 'WhatsApp Toettie Crew');
  a.innerHTML = `
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 3.5A11.8 11.8 0 0 0 12.05 0C5.5 0 .2 5.3.2 11.85c0 2.1.55 4.1 1.6 5.9L0 24l6.4-1.7a11.8 11.8 0 0 0 5.65 1.45h.01c6.55 0 11.85-5.3 11.85-11.85 0-3.16-1.23-6.14-3.46-8.4ZM12.06 21.5h-.01a9.8 9.8 0 0 1-5-1.37l-.36-.21-3.8 1 1.01-3.7-.24-.38a9.8 9.8 0 0 1-1.5-5.22C2.16 6.4 6.6 1.95 12.06 1.95c2.62 0 5.08 1.02 6.93 2.88a9.74 9.74 0 0 1 2.87 6.92c0 5.46-4.44 9.9-9.8 9.9Zm5.37-7.35c-.29-.15-1.73-.85-2-.95-.27-.1-.46-.15-.66.15-.19.29-.76.95-.93 1.15-.17.2-.34.22-.63.07-.29-.15-1.22-.45-2.33-1.43-.86-.77-1.44-1.72-1.61-2.01-.17-.29-.02-.45.13-.6.13-.13.29-.34.44-.51.15-.17.19-.29.29-.49.1-.2.05-.37-.02-.52-.07-.15-.66-1.59-.9-2.18-.24-.58-.48-.5-.66-.51h-.56c-.2 0-.51.07-.78.37-.27.29-1.02.99-1.02 2.42s1.05 2.81 1.19 3c.15.2 2.06 3.15 5 4.42.7.3 1.25.48 1.68.62.7.22 1.34.19 1.85.12.56-.08 1.73-.71 1.97-1.39.24-.68.24-1.27.17-1.39-.07-.12-.26-.2-.55-.35Z"/></svg>
    <span>WhatsApp</span>
  `;
  document.body.appendChild(a);
}

function pointHomeLinksLocally() {
  // home links already localized
}

hydrateLazyImages();
enhanceWhatsAppLinks();
addFloatingWhatsApp();
pointHomeLinksLocally();

// Re-run after Elementor/lazy scripts settle
window.addEventListener('load', () => {
  hydrateLazyImages();
  enhanceWhatsAppLinks();
});


function initServiceSelection() {
  const cards = [...document.querySelectorAll('.tc-service')];
  const confirmBtn = document.getElementById('tc-whatsapp-confirm');
  const status = document.getElementById('tc-selection-status');
  if (!cards.length || !confirmBtn) return;

  function selected() {
    return cards
      .filter((c) => c.classList.contains('is-selected'))
      .map((c) => c.dataset.service);
  }

  function update() {
    const items = selected();
    confirmBtn.disabled = items.length === 0;
    if (!status) return;
    if (!items.length) status.textContent = 'Selecteer minstens één dienst om door te gaan.';
    else if (items.length === 1) status.textContent = '1 dienst geselecteerd — klaar om te bevestigen.';
    else status.textContent = `${items.length} diensten geselecteerd — klaar om te bevestigen.`;
  }

  cards.forEach((card) => {
    card.addEventListener('click', () => {
      const on = card.classList.toggle('is-selected');
      card.setAttribute('aria-pressed', String(on));
      update();
    });
  });

  confirmBtn.addEventListener('click', () => {
    const items = selected();
    if (!items.length) return;
    const list = items.map((i) => `• ${i}`).join('\n');
    const message = `Hoi Toettie Crew! Ik wil graag een afspraak bevestigen voor:\n${list}\n\nKunnen jullie mij helpen met de details?`;
    window.open(`${WA}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
  });

  update();
}

initServiceSelection();
