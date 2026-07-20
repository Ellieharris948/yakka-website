// Yakka - Interactive Website JavaScript
// Compiled from app.ts - Main application logic for the Yakka landing page

// ===== DOM Elements =====
const navbar = document.getElementById('navbar');
const hamburger = document.getElementById('hamburger');
const mobileNav = document.getElementById('mobile-nav');
const testimonialSlides = document.getElementById('testimonial-slides');
const prevBtn = document.getElementById('prev-testimonial');
const nextBtn = document.getElementById('next-testimonial');
const dotsContainer = document.getElementById('testimonial-dots');

// ===== Navbar Scroll Effect =====
function initNavbarScroll() {
  window.addEventListener('scroll', () => {
    const currentScrollY = window.scrollY;

    if (navbar) {
      if (currentScrollY > 50) {
        navbar.classList.add('scrolled');
      } else {
        navbar.classList.remove('scrolled');
      }
    }
  });
}

// ===== Mobile Navigation Toggle =====
function initMobileNav() {
  if (!hamburger || !mobileNav) return;

  hamburger.addEventListener('click', () => {
    const isActive = hamburger.classList.contains('active');

    hamburger.classList.toggle('active');
    mobileNav.classList.toggle('active');

    // Update ARIA attributes
    hamburger.setAttribute('aria-expanded', String(!isActive));
    mobileNav.setAttribute('aria-hidden', String(isActive));

    // Prevent body scroll when menu is open
    document.body.style.overflow = !isActive ? 'hidden' : '';
  });

  // Close mobile nav when a link is clicked
  const mobileLinks = mobileNav.querySelectorAll('a');
  mobileLinks.forEach((link) => {
    link.addEventListener('click', () => {
      hamburger.classList.remove('active');
      mobileNav.classList.remove('active');
      hamburger.setAttribute('aria-expanded', 'false');
      mobileNav.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
    });
  });
}

// ===== Smooth Scrolling =====
function initSmoothScroll() {
  const links = document.querySelectorAll('a[href^="#"]');

  links.forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const targetId = link.getAttribute('href') || '';
      const targetElement = document.querySelector(targetId);

      if (targetElement) {
        const navHeight = navbar ? navbar.offsetHeight : 0;
        const targetPosition = targetElement.offsetTop - navHeight;

        window.scrollTo({
          top: targetPosition,
          behavior: 'smooth'
        });
      }
    });
  });
}

// ===== Scroll Animations (Intersection Observer) =====
function initScrollAnimations() {
  const animatedElements = document.querySelectorAll('.animate-on-scroll');

  const observerOptions = {
    root: null,
    rootMargin: '0px 0px -80px 0px',
    threshold: 0.1
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  }, observerOptions);

  animatedElements.forEach((element) => {
    observer.observe(element);
  });
}

// ===== Testimonial Carousel =====
function initTestimonialCarousel() {
  if (!testimonialSlides || !prevBtn || !nextBtn || !dotsContainer) return;

  const slides = testimonialSlides.querySelectorAll('.testimonial-slide');
  const dots = dotsContainer.querySelectorAll('.testimonial-dot');

  const state = {
    currentIndex: 0,
    totalSlides: slides.length,
    autoPlayInterval: null,
    isAutoPlaying: true
  };

  function updateCarousel() {
    if (!testimonialSlides) return;

    // Move slides
    const offset = -state.currentIndex * 100;
    testimonialSlides.style.transform = `translateX(${offset}%)`;

    // Update dots
    dots.forEach((dot, index) => {
      dot.classList.toggle('active', index === state.currentIndex);
    });
  }

  function goToSlide(index) {
    state.currentIndex = ((index % state.totalSlides) + state.totalSlides) % state.totalSlides;
    updateCarousel();
  }

  function nextSlide() {
    goToSlide(state.currentIndex + 1);
  }

  function prevSlide() {
    goToSlide(state.currentIndex - 1);
  }

  function startAutoPlay() {
    if (state.autoPlayInterval) clearInterval(state.autoPlayInterval);
    state.autoPlayInterval = setInterval(() => {
      nextSlide();
    }, 5000);
    state.isAutoPlaying = true;
  }

  function stopAutoPlay() {
    if (state.autoPlayInterval) {
      clearInterval(state.autoPlayInterval);
      state.autoPlayInterval = null;
    }
    state.isAutoPlaying = false;
  }

  // Event listeners
  nextBtn.addEventListener('click', () => {
    nextSlide();
    stopAutoPlay();
    startAutoPlay();
  });

  prevBtn.addEventListener('click', () => {
    prevSlide();
    stopAutoPlay();
    startAutoPlay();
  });

  dots.forEach((dot) => {
    dot.addEventListener('click', () => {
      const index = parseInt(dot.getAttribute('data-index') || '0', 10);
      goToSlide(index);
      stopAutoPlay();
      startAutoPlay();
    });
  });

  // Start auto-play
  startAutoPlay();
}

// ===== How It Works Tabs =====
function initFlowTabs() {
  const tabs = document.querySelectorAll('.flow-tab');
  const contents = document.querySelectorAll('.flow-content');

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const targetTab = tab.getAttribute('data-tab') || '';

      // Update active tab
      tabs.forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');

      // Update active content
      contents.forEach((content) => {
        content.classList.remove('active');
        if (content.id === `flow-${targetTab}`) {
          content.classList.add('active');
        }
      });
    });
  });
}

// ===== Feature Cards Interaction =====
function initFeatureCards() {
  const cards = document.querySelectorAll('.feature-card');

  cards.forEach((card) => {
    card.addEventListener('mouseenter', () => {
      // Remove active from all cards
      cards.forEach((c) => c.classList.remove('active'));
      card.classList.add('active');
    });

    card.addEventListener('mouseleave', () => {
      card.classList.remove('active');
    });

    // Touch support for mobile
    card.addEventListener('click', () => {
      const isActive = card.classList.contains('active');
      cards.forEach((c) => c.classList.remove('active'));
      if (!isActive) {
        card.classList.add('active');
      }
    });
  });
}

// ===== Initialize All =====
function init() {
  initNavbarScroll();
  initMobileNav();
  initSmoothScroll();
  initScrollAnimations();
  initTestimonialCarousel();
  initFlowTabs();
  initFeatureCards();
}

// Run when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
