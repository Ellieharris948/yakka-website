'use strict';
// The homepage is a static design implementation. Real app routes belong in
// these settings once supplied; never pretend a signup or message was sent.
const YAKKA_LINKS = { download: '/app/', login: '/app/', contact: '' };
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const menuButton = $('.menu-toggle');
const mobileMenu = $('#mobile-menu');
function closeMenu() {
  menuButton.setAttribute('aria-expanded', 'false');
  menuButton.setAttribute('aria-label', 'Open menu');
  mobileMenu.hidden = true;
}
menuButton.addEventListener('click', () => {
  const open = menuButton.getAttribute('aria-expanded') !== 'true';
  menuButton.setAttribute('aria-expanded', String(open));
  menuButton.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  mobileMenu.hidden = !open;
});
$$('a,button', mobileMenu).forEach(el => el.addEventListener('click', closeMenu));
document.addEventListener('keydown', event => { if (event.key === 'Escape') closeMenu(); });
window.matchMedia('(min-width: 761px)').addEventListener('change', e => { if (e.matches) closeMenu(); });

const slides = [
  ['Secure <em>payments</em><br>for tradies and<br>customers.', 'Money held securely until the job is done right. No more chasing payments. No more risk. Just trust.'],
  ['No chasing.<br>Always <em>get paid</em><br>for the work you do.', 'The customer pays before the job starts. Yakka holds the money safely. You get paid once the work is done.'],
  ['No paying and praying.<br>Your money stays<br><em>protected.</em>', 'Yakka holds your payment safely until the work’s finished. It’s released once you confirm you’re happy.']
];
let slide = 0;
let paused = reducedMotion.matches;
let carouselTimer;
const hero = $('.hero');
function showSlide(index) {
  slide = (index + slides.length) % slides.length;
  $('#hero-message').innerHTML = `<h1>${slides[slide][0]}</h1><p>${slides[slide][1]}</p>`;
  $$('.hero-dots button').forEach((button, i) => button.setAttribute('aria-pressed', String(i === slide)));
  const copy = $('.hero-copy');
  copy.classList.remove('changing');
  requestAnimationFrame(() => copy.classList.add('changing'));
}
function restartCarousel() {
  clearInterval(carouselTimer);
  if (!paused && !document.hidden) carouselTimer = setInterval(() => {
    if (!hero.matches(':hover') && !hero.contains(document.activeElement)) showSlide(slide + 1);
  }, 7000);
}
$('.hero-arrow.previous').addEventListener('click', () => { showSlide(slide - 1); restartCarousel(); });
$('.hero-arrow.next').addEventListener('click', () => { showSlide(slide + 1); restartCarousel(); });
$$('.hero-dots button').forEach((button, i) => button.addEventListener('click', () => { showSlide(i); restartCarousel(); }));
function updatePause() {
  $('.hero-pause').textContent = paused ? '▷' : 'Ⅱ';
  $('.hero-pause').setAttribute('aria-label', paused ? 'Play slideshow' : 'Pause slideshow');
  restartCarousel();
}
$('.hero-pause').addEventListener('click', () => { paused = !paused; updatePause(); });
reducedMotion.addEventListener('change', e => { if (e.matches) { paused = true; updatePause(); } });
document.addEventListener('visibilitychange', restartCarousel);
updatePause();

function setProblem(audience) {
  $$('[data-problem]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.problem === audience)));
  const tradie = audience === 'tradie';
  $('#problem-heading').innerHTML = tradie ? 'Too many tradies finish the<br>job and never get paid.' : 'Too many customers pay up.<br>And get let down.';
  $('#problem-stats').innerHTML = tradie
    ? '<div class="stat"><strong>81%</strong><p>of UK tradespeople are <em>owed money</em><br>for work they’ve already completed.</p></div><div class="stat"><strong>4 in 10</strong><p><em>write off unpaid work</em> entirely,<br>accepting the loss and moving on.</p></div>'
    : '<div class="stat"><strong>14 minutes</strong><p>How often a customer falls victim<br>to a <em>rogue tradesperson.</em></p></div><div class="stat"><strong>1 in 4</strong><p>homeowners have had a bad experience<br>with a <em>rogue tradesperson.</em></p></div>';
  $('#problem-note').hidden = tradie;
  $('#problem-note').textContent = tradie ? '' : '£1.4bn is lost to rogue tradespeople across the UK every year.';
}
$$('[data-problem]').forEach(button => button.addEventListener('click', () => setProblem(button.dataset.problem)));
$$('[data-solution]').forEach(button => {
  const show = (open) => {
    $$('[data-solution]').forEach(other => {
      const expanded = other === button && open;
      other.setAttribute('aria-expanded', String(expanded));
      $('#' + other.getAttribute('aria-controls')).hidden = !expanded;
    });
  };
  button.addEventListener('click', () => show(button.getAttribute('aria-expanded') !== 'true'));
});

const phoneStages = [
  ['Quote ready', 'JOB TOTAL', 'Clear costs. No surprises.', 'Every task agreed.<br>Every payment protected.', 'Send quote'],
  ['Payment secured', 'HELD SECURELY', 'Protected in a ring-fenced account.', 'Payment received.<br>Safe to get started.', 'View payment'],
  ['Work in progress', 'PAYMENT PROTECTED', 'Ready when the work is done.', 'Money secured.<br>Time to get to work.', 'View job progress'],
  ['Ready for review', 'PAYMENT PROTECTED', 'Your customer has been notified.', 'Work finished.<br>Photos added to the job.', 'View completed work'],
  ['Job confirmed', 'READY TO RELEASE', 'The customer is happy with the work.', 'Job checked.<br>Completion confirmed.', 'Confirm & release'],
  ['Payment released', 'JOB COMPLETED', 'Payment is on its way.', 'Job done. Money released.<br>No chasing, just trust.', 'View payment details']
];
function paintPhone(phone, index) {
  const stage = phoneStages[index];
  $('.job-status', phone).textContent = stage[0];
  $('.phone-amount small', phone).textContent = stage[1];
  $('.amount-note', phone).textContent = stage[2];
  $('.phone-message p', phone).innerHTML = stage[3];
  $('.phone-action', phone).innerHTML = `${stage[4]} <span>→</span>`;
}
function setStep(index) {
  $$('.step').forEach((step, i) => {
    step.classList.toggle('active', i === index);
    step.setAttribute('aria-pressed', String(i === index));
  });
  paintPhone($('.journey .phone'), index);
  $('.current-step').textContent = String(index + 1).padStart(2, '0');
}
$$('[data-step]').forEach(button => button.addEventListener('click', () => setStep(Number(button.dataset.step))));
// At desktop sizes, the sticky phone follows the part of the journey being read.
let stepLockUntil = 0;
$$('[data-step]').forEach(button => button.addEventListener('click', () => { stepLockUntil = Date.now() + 1400; }));
if ('IntersectionObserver' in window) {
  const observer = new IntersectionObserver(entries => {
    if (window.innerWidth <= 760 || Date.now() < stepLockUntil) return;
    const visible = entries.filter(entry => entry.isIntersecting);
    if (visible.length) setStep(Number(visible[visible.length - 1].target.dataset.step));
  }, { rootMargin: '-32% 0px -48% 0px', threshold: 0 });
  $$('.step').forEach(step => observer.observe(step));
}
$$('[data-rail]').forEach(button => button.addEventListener('click', () => {
  const rail = $('.feature-rail');
  rail.scrollBy({ left: Number(button.dataset.rail) * (rail.firstElementChild.getBoundingClientRect().width + 27), behavior: reducedMotion.matches ? 'instant' : 'smooth' });
}));
const benefits = {
  tradie: ['Paid within 24 hours.<br>No chasing, ever.', 'No subscription, fee applied only<br>on money released to you.', 'Protected from<br>unfair claims.', 'Get paid in stages<br>on longer jobs.', 'Every job and invoice<br>tracked.', 'Win more jobs with<br>complete client trust.'],
  customer: ['Money held in a<br>protected account.', 'Only pay when the<br>job’s done right.', 'No hidden costs.<br>Every task agreed.', 'Evidence-based support<br>if something’s wrong.', 'Every tradie<br>identity-verified.', 'Just a 2%<br>protection fee.']
};
function setBenefits(audience) {
  $$('[data-benefits]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.benefits === audience)));
  $$('.benefit-pill span').forEach((span, i) => { span.innerHTML = benefits[audience][i]; });
  $('#benefits-learn').innerHTML = `Learn more about Yakka for ${audience === 'tradie' ? 'tradies' : 'customers'} <span>→</span>`;
  $('#benefits-learn').dataset.dialog = audience;
  paintPhone($('.benefit-phone .phone'), audience === 'tradie' ? 5 : 1);
}
setBenefits('tradie');
$$('[data-benefits]').forEach(button => button.addEventListener('click', () => setBenefits(button.dataset.benefits)));
$$('[data-audience-link]').forEach(link => link.addEventListener('click', () => { setBenefits(link.dataset.audienceLink); setProblem(link.dataset.audienceLink); }));

const dialogContent = {
  download: ['Get the Yakka app', '<p>The app download links will be available here soon.</p><p>In the meantime, explore how Yakka protects both sides of the job in the interactive walkthrough.</p><p><a href="#how-it-works" data-close-dialog>See how it works →</a></p>'],
  login: ['Log in to Yakka', '<p>The web login link isn’t available yet. If you already have the Yakka app, open it to sign in and manage your jobs.</p>'],
  contact: ['Let’s talk', '<p>Yakka’s contact details will be available here soon.</p><p>For answers about payments, job progress and disputes, take a look at our frequently asked questions.</p><p><a href="#help" data-close-dialog>Read the FAQs →</a></p>'],
  tradie: ['Your work. Your payment. Protected.', '<p>The customer’s money is secured before you start work. Agree every task and price, keep your progress in one place, and get paid when the job is confirmed complete.</p><p>There’s no monthly subscription. The tradie fee applies to money released to you. You can also request payment for materials or agree milestone payments on longer jobs.</p>'],
  customer: ['Confidence from start to finish.', '<p>Agree a clear job breakdown before paying. Your money is held in a protected account while your tradie gets to work.</p><p>Review the finished job before confirming completion. If something isn’t right, raise a dispute with photos and evidence. Only the disputed part stays held during review.</p>'],
  secure: ['Secure payments', '<p>Your customer’s payment is held in a dedicated, ring-fenced account, separate from Yakka’s own funds. Both sides can see that the money is secured before work begins.</p><p>Payment is released when the work is confirmed complete, with an automatic release after 7 days if the customer doesn’t respond, subject to any open dispute.</p>'],
  breakdowns: ['Every task, agreed upfront.', '<p>Each task has a description and price. The job breakdown acts as a digital quote and a record of what both parties agreed before work started.</p><p>A clear breakdown also makes it easier to resolve questions about individual parts of the job.</p>'],
  disputes: ['A fair review, backed by evidence.', '<p>If part of the job is disputed, both parties can provide photos and supporting information. Only the disputed line stays held; the rest can be released as normal.</p><p>Yakka reviews the evidence through a structured process, with decisions within 5 working days.</p>'],
  milestones: ['Know where the job stands.', '<p>Follow the job from quote and secured payment through work in progress, completion and release. Both parties see clear status updates in the app.</p><p>For longer jobs, agree milestones to keep progress and payments easy to follow.</p>'],
  verified: ['Know who you’re working with.', '<p>Tradies complete identity verification through Stripe Identity. Registered businesses are checked against Companies House.</p><p>Job details and before-and-after photos provide a shared record throughout the work.</p>'],
  partial: ['Materials first? We’ve got a process.', '<p>Tradies can request part of the payment for materials before work begins, or agree staged payments on longer jobs.</p><p>The customer reviews the request in the app, so both sides know what is being released and what remains protected.</p>']
};
const dialog = $('#info-dialog');
let dialogTrigger;
document.addEventListener('click', event => {
  const trigger = event.target.closest('[data-dialog]');
  if (!trigger) return;
  const kind = trigger.dataset.dialog;
  if (YAKKA_LINKS[kind]) { window.location.href = YAKKA_LINKS[kind]; return; }
  const content = dialogContent[kind];
  if (!content) return;
  dialogTrigger = trigger;
  $('#dialog-title').textContent = content[0];
  $('#dialog-body').innerHTML = content[1];
  dialog.showModal();
});
$('.dialog-close').addEventListener('click', () => dialog.close());
$('.dialog-done').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', event => {
  if (event.target.closest('[data-close-dialog]')) dialog.close();
  if (event.target === dialog) {
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
  }
});
dialog.addEventListener('close', () => { if (dialogTrigger) dialogTrigger.focus({ preventScroll: true }); });
const floatExpanded = $('.app-float-expanded');
const floatReopen = $('.float-reopen');
$('.float-close').addEventListener('click', () => { floatExpanded.hidden = true; floatReopen.hidden = false; floatReopen.focus({ preventScroll: true }); });
floatReopen.addEventListener('click', () => { floatReopen.hidden = true; floatExpanded.hidden = false; $('.float-close').focus({ preventScroll: true }); });
if (window.matchMedia('(max-width: 760px)').matches) {
  floatExpanded.hidden = true;
  floatReopen.hidden = false;
}
