const WHATSAPP_NUMBER = '31655585299';

function initMobileNav() {
  const toggle = document.getElementById('mobile-toggle');
  const nav = document.getElementById('nav-main');
  if (!toggle || !nav) return;

  toggle.addEventListener('click', () => {
    const open = nav.classList.toggle('is-open');
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Menu sluiten' : 'Menu openen');
  });

  nav.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => {
      nav.classList.remove('is-open');
      toggle.setAttribute('aria-expanded', 'false');
      toggle.setAttribute('aria-label', 'Menu openen');
    });
  });
}

function initHeroSlider() {
  const root = document.querySelector('[data-slider]');
  if (!root) return;

  const slides = [...root.querySelectorAll('.hero-slide')];
  const dotsWrap = document.querySelector('[data-slider-dots]');
  const prev = document.querySelector('[data-slider-prev]');
  const next = document.querySelector('[data-slider-next]');
  let index = 0;
  let timer;

  slides.forEach((_, i) => {
    const dot = document.createElement('button');
    dot.type = 'button';
    dot.setAttribute('aria-label', `Ga naar slide ${i + 1}`);
    if (i === 0) dot.classList.add('is-active');
    dot.addEventListener('click', () => goTo(i));
    dotsWrap?.appendChild(dot);
  });

  const dots = [...(dotsWrap?.querySelectorAll('button') || [])];

  function goTo(nextIndex) {
    slides[index].classList.remove('is-active');
    dots[index]?.classList.remove('is-active');
    index = (nextIndex + slides.length) % slides.length;
    slides[index].classList.add('is-active');
    dots[index]?.classList.add('is-active');
    restart();
  }

  function restart() {
    clearInterval(timer);
    timer = setInterval(() => goTo(index + 1), 5500);
  }

  prev?.addEventListener('click', () => goTo(index - 1));
  next?.addEventListener('click', () => goTo(index + 1));
  restart();
}

function initServiceSelection() {
  const cards = [...document.querySelectorAll('.service-card')];
  const confirmBtn = document.getElementById('whatsapp-confirm');
  const status = document.getElementById('selection-status');
  if (!cards.length || !confirmBtn) return;

  function selectedServices() {
    return cards
      .filter((card) => card.classList.contains('is-selected'))
      .map((card) => card.dataset.service);
  }

  function update() {
    const selected = selectedServices();
    const count = selected.length;
    confirmBtn.disabled = count === 0;

    if (!status) return;
    if (count === 0) {
      status.textContent = 'Selecteer minstens één dienst om door te gaan.';
    } else if (count === 1) {
      status.textContent = '1 dienst geselecteerd — klaar om te bevestigen.';
    } else {
      status.textContent = `${count} diensten geselecteerd — klaar om te bevestigen.`;
    }
  }

  cards.forEach((card) => {
    card.addEventListener('click', () => {
      const selected = card.classList.toggle('is-selected');
      card.setAttribute('aria-pressed', String(selected));
      update();
    });
  });

  confirmBtn.addEventListener('click', () => {
    const selected = selectedServices();
    if (!selected.length) return;

    const list = selected.map((item) => `• ${item}`).join('\n');
    const message =
      `Hoi Toettie Crew! Ik wil graag een afspraak bevestigen voor:\n${list}\n\nKunnen jullie mij helpen met de details?`;
    const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  });

  update();
}

function initReveal() {
  const items = document.querySelectorAll('.reveal');
  if (!items.length) return;

  if (!('IntersectionObserver' in window)) {
    items.forEach((el) => el.classList.add('is-visible'));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15, rootMargin: '0px 0px -40px 0px' }
  );

  items.forEach((el) => observer.observe(el));
}

function initActiveNav() {
  const links = [...document.querySelectorAll('.nav-main .nav-link')];
  const sections = ['diensten', 'zo-werkt-het', 'contact']
    .map((id) => document.getElementById(id))
    .filter(Boolean);

  if (!links.length) return;

  const onScroll = () => {
    const y = window.scrollY + 120;
    let current = 'top';

    sections.forEach((section) => {
      if (section.offsetTop <= y) current = section.id;
    });

    links.forEach((link) => {
      const href = link.getAttribute('href')?.replace('#', '');
      link.classList.toggle('is-active', href === current || (current === 'top' && href === 'top'));
    });
  };

  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

initMobileNav();
initHeroSlider();
initServiceSelection();
initReveal();
initActiveNav();
