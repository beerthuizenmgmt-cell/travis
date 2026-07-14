// Platform tabs
document.querySelectorAll('.platform-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    const target = tab.dataset.tab;
    document.querySelectorAll('.platform-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.platform-panel').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(target)?.classList.add('active');
  });
});

// Case studies carousel
const track = document.querySelector('.carousel-track');
const prevBtn = document.querySelector('.carousel-btn.prev');
const nextBtn = document.querySelector('.carousel-btn.next');

if (track && prevBtn && nextBtn) {
  const scrollAmount = 300;
  prevBtn.addEventListener('click', () => {
    track.scrollBy({ left: -scrollAmount, behavior: 'smooth' });
  });
  nextBtn.addEventListener('click', () => {
    track.scrollBy({ left: scrollAmount, behavior: 'smooth' });
  });

  // Auto-scroll carousel
  let autoScroll = setInterval(() => {
    if (track.scrollLeft + track.clientWidth >= track.scrollWidth - 10) {
      track.scrollTo({ left: 0, behavior: 'smooth' });
    } else {
      track.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    }
  }, 4000);

  track.addEventListener('mouseenter', () => clearInterval(autoScroll));
  track.addEventListener('mouseleave', () => {
    autoScroll = setInterval(() => {
      if (track.scrollLeft + track.clientWidth >= track.scrollWidth - 10) {
        track.scrollTo({ left: 0, behavior: 'smooth' });
      } else {
        track.scrollBy({ left: scrollAmount, behavior: 'smooth' });
      }
    }, 4000);
  });
}

// Cookie banner
const cookieBanner = document.getElementById('cookieBanner');
const cookieAccept = document.getElementById('cookieAccept');
const cookieReject = document.getElementById('cookieReject');

function hideCookieBanner() {
  cookieBanner?.classList.add('hidden');
  localStorage.setItem('cookiesAccepted', 'true');
}

if (localStorage.getItem('cookiesAccepted')) {
  cookieBanner?.classList.add('hidden');
}

cookieAccept?.addEventListener('click', hideCookieBanner);
cookieReject?.addEventListener('click', hideCookieBanner);

// Mobile menu toggle
const mobileBtn = document.querySelector('.mobile-menu-btn');
const navMain = document.querySelector('.nav-main');

mobileBtn?.addEventListener('click', () => {
  navMain?.classList.toggle('mobile-open');
  mobileBtn.classList.toggle('active');
});

// Header scroll effect
const header = document.querySelector('.header');
let lastScroll = 0;

window.addEventListener('scroll', () => {
  const currentScroll = window.pageYOffset;
  if (currentScroll > 100) {
    header?.classList.add('scrolled');
  } else {
    header?.classList.remove('scrolled');
  }
  lastScroll = currentScroll;
});

// FAQ - only one open at a time
document.querySelectorAll('.faq-item').forEach(item => {
  item.addEventListener('toggle', () => {
    if (item.open) {
      document.querySelectorAll('.faq-item').forEach(other => {
        if (other !== item) other.open = false;
      });
    }
  });
});
