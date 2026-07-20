// Yakka - Interactive Website TypeScript
// Main application logic for the Yakka landing page

// ===== Interfaces =====
interface CarouselState {
  currentIndex: number;
  totalSlides: number;
  autoPlayInterval: ReturnType<typeof setInterval> | null;
  isAutoPlaying: boolean;
}

// ===== DOM Elements =====
const navbar: HTMLElement | null = document.getElementById('navbar');
const hamburger: HTMLElement | null = document.getElementById('hamburger');
const mobileNav: HTMLElement | null = document.getElementById('mobile-nav');
const testimonialSlides: HTMLElement | null = document.getElementById('testimonial-slides');
const prevBtn: HTMLElement | null = document.getElementById('prev-testimonial');
const nextBtn: HTMLElement | null = document.getElementById('next-testimonial');
const dotsContainer: HTMLElement | null = document.getElementById('testimonial-dots');

// ===== Navbar Scroll Effect =====
function initNavbarScroll(): void {
  window.addEventListener('scroll', () => {
    const currentScrollY: number = window.scrollY;

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
function initMobileNav(): void {
  if (!hamburger || !mobileNav) return;

  hamburger.addEventListener('click', () => {
    const isActive: boolean = hamburger.classList.contains('active');

    hamburger.classList.toggle('active');
    mobileNav.classList.toggle('active');

    // Update ARIA attributes
    hamburger.setAttribute('aria-expanded', String(!isActive));
    mobileNav.setAttribute('aria-hidden', String(isActive));

    // Prevent body scroll when menu is open
    document.body.style.overflow = !isActive ? 'hidden' : '';
  });

  // Close mobile nav when a link is clicked
  const mobileLinks: NodeListOf<HTMLAnchorElement> = mobileNav.querySelectorAll('a');
  mobileLinks.forEach((link: HTMLAnchorElement) => {
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
function initSmoothScroll(): void {
  const links: NodeListOf<HTMLAnchorElement> = document.querySelectorAll('a[href^="#"]');

  links.forEach((link: HTMLAnchorElement) => {
    link.addEventListener('click', (e: Event) => {
      e.preventDefault();
      const targetId: string = link.getAttribute('href') || '';
      const targetElement: HTMLElement | null = document.querySelector(targetId);

      if (targetElement) {
        const navHeight: number = navbar ? navbar.offsetHeight : 0;
        const targetPosition: number = targetElement.offsetTop - navHeight;

        window.scrollTo({
          top: targetPosition,
          behavior: 'smooth'
        });
      }
    });
  });
}

// ===== Scroll Animations (Intersection Observer) =====
function initScrollAnimations(): void {
  const animatedElements: NodeListOf<HTMLElement> = document.querySelectorAll('.animate-on-scroll');

  const observerOptions: IntersectionObserverInit = {
    root: null,
    rootMargin: '0px 0px -80px 0px',
    threshold: 0.1
  };

  const observer: IntersectionObserver = new IntersectionObserver(
    (entries: IntersectionObserverEntry[]) => {
      entries.forEach((entry: IntersectionObserverEntry) => {
        if (entry.isIntersecting) {
          (entry.target as HTMLElement).classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    },
    observerOptions
  );

  animatedElements.forEach((element: HTMLElement) => {
    observer.observe(element);
  });
}

// ===== Testimonial Carousel =====
function initTestimonialCarousel(): void {
  if (!testimonialSlides || !prevBtn || !nextBtn || !dotsContainer) return;

  const slides: NodeListOf<HTMLElement> = testimonialSlides.querySelectorAll('.testimonial-slide');
  const dots: NodeListOf<HTMLElement> = dotsContainer.querySelectorAll('.testimonial-dot');

  const state: CarouselState = {
    currentIndex: 0,
    totalSlides: slides.length,
    autoPlayInterval: null,
    isAutoPlaying: true
  };

  function updateCarousel(): void {
    if (!testimonialSlides) return;

    // Move slides
    const offset: number = -state.currentIndex * 100;
    testimonialSlides.style.transform = `translateX(${offset}%)`;

    // Update dots
    dots.forEach((dot: HTMLElement, index: number) => {
      dot.classList.toggle('active', index === state.currentIndex);
    });
  }

  function goToSlide(index: number): void {
    state.currentIndex = ((index % state.totalSlides) + state.totalSlides) % state.totalSlides;
    updateCarousel();
  }

  function nextSlide(): void {
    goToSlide(state.currentIndex + 1);
  }

  function prevSlide(): void {
    goToSlide(state.currentIndex - 1);
  }

  function startAutoPlay(): void {
    if (state.autoPlayInterval) clearInterval(state.autoPlayInterval);
    state.autoPlayInterval = setInterval(() => {
      nextSlide();
    }, 5000);
    state.isAutoPlaying = true;
  }

  function stopAutoPlay(): void {
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

  dots.forEach((dot: HTMLElement) => {
    dot.addEventListener('click', () => {
      const index: number = parseInt(dot.getAttribute('data-index') || '0', 10);
      goToSlide(index);
      stopAutoPlay();
      startAutoPlay();
    });
  });

  // Start auto-play
  startAutoPlay();
}

// ===== How It Works Tabs =====
function initFlowTabs(): void {
  const tabs: NodeListOf<HTMLElement> = document.querySelectorAll('.flow-tab');
  const contents: NodeListOf<HTMLElement> = document.querySelectorAll('.flow-content');

  tabs.forEach((tab: HTMLElement) => {
    tab.addEventListener('click', () => {
      const targetTab: string = tab.getAttribute('data-tab') || '';

      // Update active tab
      tabs.forEach((t: HTMLElement) => t.classList.remove('active'));
      tab.classList.add('active');

      // Update active content
      contents.forEach((content: HTMLElement) => {
        content.classList.remove('active');
        if (content.id === `flow-${targetTab}`) {
          content.classList.add('active');
        }
      });
    });
  });
}

// ===== Feature Cards Interaction =====
function initFeatureCards(): void {
  const cards: NodeListOf<HTMLElement> = document.querySelectorAll('.feature-card');

  cards.forEach((card: HTMLElement) => {
    card.addEventListener('mouseenter', () => {
      // Remove active from all cards
      cards.forEach((c: HTMLElement) => c.classList.remove('active'));
      card.classList.add('active');
    });

    card.addEventListener('mouseleave', () => {
      card.classList.remove('active');
    });

    // Touch support for mobile
    card.addEventListener('click', () => {
      const isActive: boolean = card.classList.contains('active');
      cards.forEach((c: HTMLElement) => c.classList.remove('active'));
      if (!isActive) {
        card.classList.add('active');
      }
    });
  });
}

// ===== Initialize All =====
function init(): void {
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
