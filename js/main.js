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
    });
  });

  nav.querySelectorAll('.nav-dropdown > .nav-link').forEach((btn) => {
    btn.addEventListener('click', (event) => {
      if (window.matchMedia('(max-width: 820px)').matches) {
        event.preventDefault();
        const parent = btn.parentElement;
        parent?.classList.toggle('is-open');
        btn.setAttribute('aria-expanded', String(parent?.classList.contains('is-open')));
      }
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
    dot.setAttribute('aria-label', `Go to slide ${i + 1}`);
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
    timer = setInterval(() => goTo(index + 1), 5000);
  }

  prev?.addEventListener('click', () => goTo(index - 1));
  next?.addEventListener('click', () => goTo(index + 1));
  restart();
}

initMobileNav();
initHeroSlider();
