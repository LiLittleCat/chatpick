// Page controls and a scrolling feature walkthrough. No network requests, storage or analytics.
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
  themeButton.querySelector('[data-theme-icon="light"]').hidden = !dark;
  themeButton.querySelector('[data-theme-icon="dark"]').hidden = dark;
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
const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
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
  const steps = [...story.querySelectorAll('.feature-step')];
  const stage = story.querySelector('.feature-stage');
  const scrollbar = story.querySelector('.feature-scrollbar');
  const wideScreen = window.matchMedia('(min-width: 901px) and (min-height: 800px)');
  let frame = 0;
  let active = -1;
  const scenes = steps.map(step => {
    const scene = document.createElement('div');
    scene.className = 'feature-scene';
    const copy = step.querySelector('.feature-copy').cloneNode(true);
    const image = step.querySelector('.feature-shot').cloneNode(true);
    image.querySelector('img').loading = 'eager';
    scene.append(copy, image);
    stage.append(scene);
    return scene;
  });
  function updateStage() {
    frame = 0;
    const midpoint = window.innerHeight / 2;
    const centers = steps.map(step => {
      const rect = step.getBoundingClientRect();
      return rect.top + rect.height / 2;
    });
    const distanceToLast = centers.at(-1) - centers[0];
    const progress = distanceToLast > 0 ? Math.max(0, Math.min(100, (midpoint - centers[0]) / distanceToLast * 100)) : 0;
    scrollbar.value = String(progress);
    let closest = 0;
    let distance = Infinity;
    centers.forEach((center, index) => {
      const candidate = Math.abs(center - midpoint);
      if (candidate < distance) { distance = candidate; closest = index; }
    });
    if (active === closest) return;
    active = closest;
    scrollbar.setAttribute('aria-valuetext', steps[active].querySelector('h3').textContent);
    steps.forEach((step, i) => step.classList.toggle('is-active', i === active));
    scenes.forEach((scene, i) => {
      scene.classList.toggle('is-active', i === active);
      scene.setAttribute('aria-hidden', String(i !== active));
    });
  }
  function queueUpdate() { if (!frame) frame = requestAnimationFrame(updateStage); }
  scrollbar.addEventListener('input', () => {
    const first = steps[0].getBoundingClientRect();
    const last = steps.at(-1).getBoundingClientRect();
    const firstCenter = first.top + first.height / 2;
    const lastCenter = last.top + last.height / 2;
    const top = window.scrollY + firstCenter + Number(scrollbar.value) / 100 * (lastCenter - firstCenter) - window.innerHeight / 2;
    window.scrollTo({ top: Math.max(0, top), behavior: 'instant' });
    queueUpdate();
  });
  const observer = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: .15 }) : null;
  function configureStory() {
    story.classList.add('with-progress');
    const enhanced = wideScreen.matches && !motionPreference.matches;
    story.classList.toggle('enhanced', enhanced);
    story.querySelector('.feature-steps').setAttribute('aria-hidden', String(enhanced));
    stage.setAttribute('aria-hidden', String(!enhanced));
    steps.forEach(step => {
      step.classList.toggle('reveal-ready', !!observer && !motionPreference.matches);
      if (observer) {
        observer.unobserve(step);
        if (!motionPreference.matches && !step.classList.contains('is-visible')) observer.observe(step);
      }
    });
    queueUpdate();
  }
  configureStory();
  wideScreen.addEventListener('change', configureStory);
  motionPreference.addEventListener('change', configureStory);
  window.addEventListener('scroll', queueUpdate, { passive: true });
  window.addEventListener('resize', queueUpdate, { passive: true });
}
