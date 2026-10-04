// Page controls and the feature carousel. No network requests, storage or analytics.
const systemTheme = window.matchMedia('(prefers-color-scheme: dark)');
const themeButton = document.querySelector('.theme-toggle');
const requestedTheme = new URL(window.location.href).searchParams.get('theme');
const requestedLanguage = new URL(window.location.href).searchParams.get('lang');
let themeChosen = requestedTheme === 'light' || requestedTheme === 'dark';
function setTheme(dark) {
  const theme = dark ? 'dark' : 'light';
  document.documentElement.dataset.theme = theme;
  // Carry an explicit choice across language pages without browser storage.
  document.querySelectorAll('.language, .brand').forEach(link => {
    const url = new URL(link.href);
    if (themeChosen) url.searchParams.set('theme', theme);
    else url.searchParams.delete('theme');
    if (link.classList.contains('brand') && (requestedLanguage === 'en' || requestedLanguage === 'zh-CN')) url.searchParams.set('lang', requestedLanguage);
    link.setAttribute('href', `${url.pathname}${url.search}${url.hash}`);
  });
  if (!themeButton) return;
  const label = dark ? themeButton.dataset.lightLabel : themeButton.dataset.darkLabel;
  themeButton.setAttribute('aria-label', label);
  themeButton.setAttribute('title', label);
  themeButton.setAttribute('aria-pressed', String(dark));
  document.querySelector('meta[name="theme-color"]').content = dark ? '#141715' : '#fafbfa';
}
setTheme(themeChosen ? requestedTheme === 'dark' : systemTheme.matches);
themeButton?.addEventListener('click', () => {
  themeChosen = true;
  setTheme(document.documentElement.dataset.theme !== 'dark');
  const url = new URL(window.location.href);
  url.searchParams.set('theme', document.documentElement.dataset.theme);
  window.history.replaceState(window.history.state, '', url);
});
systemTheme.addEventListener('change', event => {
  if (!themeChosen) setTheme(event.matches);
});

const marquee = document.querySelector('.provider-marquee');
if (marquee) {
  const logoViewport = marquee.querySelector('.provider-viewport');
  marquee.querySelectorAll('.provider-group:not([aria-hidden]) a').forEach(link => {
    link.addEventListener('focus', () => {
      if (link.matches(':focus-visible')) link.scrollIntoView({ behavior: 'instant', block: 'nearest', inline: 'nearest' });
    });
  });
  marquee.addEventListener('focusout', event => {
    if (!marquee.contains(event.relatedTarget)) logoViewport.scrollLeft = 0;
  });

}

const story = document.querySelector('.feature-story');
if (story) {
  const viewport = story.querySelector('.feature-viewport');
  const steps = [...story.querySelectorAll('.feature-step')];
  const markers = [...story.querySelectorAll('.feature-marker')];
  const playback = story.querySelector('.feature-playback');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const duration = 6000;
  let active = 0;
  let elapsed = 0;
  let frame = 0;
  let previousTime = 0;
  let visible = false;
  let hovered = story.matches(':hover');
  let focused = story.contains(document.activeElement);
  let paused = reducedMotion.matches;
  let wheelDelta = 0;
  let wheelDirection = 0;
  let wheelLocked = false;
  let wheelTimeout;
  let swipeStart;

  function renderProgress() {
    markers.forEach((marker, i) => marker.style.setProperty('--progress', String(i < active ? 1 : i === active ? elapsed / duration : 0)));
  }
  function show(index) {
    active = Math.max(0, Math.min(steps.length - 1, index));
    elapsed = 0;
    steps.forEach((step, i) => {
      step.classList.toggle('is-active', i === active);
      step.setAttribute('aria-hidden', String(i !== active));
      step.inert = i !== active;
    });
    markers.forEach((marker, i) => {
      if (i === active) marker.setAttribute('aria-current', 'true');
      else marker.removeAttribute('aria-current');
    });
    renderProgress();
  }
  function canPlay() { return visible && !paused && !hovered && !focused && !document.hidden; }
  function tick(time) {
    frame = 0;
    if (!canPlay()) { previousTime = 0; return; }
    if (previousTime) elapsed += time - previousTime;
    previousTime = time;
    if (elapsed >= duration) show((active + 1) % steps.length);
    renderProgress();
    frame = requestAnimationFrame(tick);
  }
  function syncPlayback() {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    previousTime = 0;
    const label = paused ? playback.dataset.playLabel : playback.dataset.pauseLabel;
    playback.setAttribute('aria-label', label);
    playback.setAttribute('title', label);
    playback.querySelector('[data-playback-icon="play"]').hidden = !paused;
    playback.querySelector('[data-playback-icon="pause"]').hidden = paused;
    if (canPlay()) frame = requestAnimationFrame(tick);
  }
  markers.forEach((marker, i) => marker.addEventListener('click', () => show(i)));
  playback.addEventListener('click', () => { paused = !paused; syncPlayback(); });
  story.addEventListener('pointerenter', event => { if (event.pointerType !== 'touch') { hovered = true; syncPlayback(); } });
  story.addEventListener('pointerleave', () => { hovered = false; syncPlayback(); });
  story.addEventListener('focusin', () => { focused = true; syncPlayback(); });
  story.addEventListener('focusout', event => { if (!story.contains(event.relatedTarget)) { focused = false; syncPlayback(); } });
  document.addEventListener('visibilitychange', syncPlayback);
  reducedMotion.addEventListener('change', () => { paused = reducedMotion.matches; syncPlayback(); });
  story.addEventListener('keydown', event => {
    const directions = { ArrowDown: 1, ArrowRight: 1, PageDown: 1, ArrowUp: -1, ArrowLeft: -1, PageUp: -1 };
    if (event.key in directions) { event.preventDefault(); show(active + directions[event.key]); }
    else if (event.key === 'Home' || event.key === 'End') { event.preventDefault(); show(event.key === 'Home' ? 0 : steps.length - 1); }
  });
  story.addEventListener('wheel', event => {
    if (event.ctrlKey || Math.abs(event.deltaX) > Math.abs(event.deltaY) || !event.deltaY) return;
    const direction = Math.sign(event.deltaY);
    if (wheelLocked && direction === wheelDirection) {
      event.preventDefault();
      return;
    }
    if (direction !== wheelDirection) {
      wheelDelta = 0;
      wheelLocked = false;
      clearTimeout(wheelTimeout);
    }
    wheelDirection = direction;
    // Release outward scrolling at either end after the transition's short cooldown.
    if (direction < 0 && active === 0 || direction > 0 && active === steps.length - 1) {
      wheelDelta = 0;
      return;
    }
    event.preventDefault();
    wheelDelta += event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? viewport.clientHeight : 1);
    if (Math.abs(wheelDelta) >= 40) {
      show(active + direction);
      wheelLocked = true;
      wheelDelta = 0;
      // Incoming wheel events must not extend this lock indefinitely.
      wheelTimeout = setTimeout(() => { wheelLocked = false; }, 320);
    }
  }, { passive: false });
  viewport.addEventListener('pointerdown', event => { if (event.pointerType === 'touch') swipeStart = { x: event.clientX, y: event.clientY }; });
  viewport.addEventListener('pointerup', event => {
    if (!swipeStart) return;
    const dx = event.clientX - swipeStart.x;
    const dy = event.clientY - swipeStart.y;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) show(active + (dx < 0 ? 1 : -1));
    swipeStart = undefined;
  });
  viewport.addEventListener('pointercancel', () => { swipeStart = undefined; });
  story.classList.add('carousel');
  show(0);
  syncPlayback();
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(entries => {
      visible = entries[0].isIntersecting && entries[0].intersectionRatio >= .35;
      syncPlayback();
    }, { threshold: [0, .35] }).observe(story);
  }
}
