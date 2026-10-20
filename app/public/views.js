const panels = new Map([...document.querySelectorAll('[data-view]')].map(panel => [panel.dataset.view, panel]));
const labels = { home: '首页', create: '创作', works: '作品', review: '审核', history: '历史' };
const positions = new Map();
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const mobile = matchMedia('(max-width: 760px)');
const sidebar = document.getElementById('sidebar');
const stage = document.getElementById('main-content');
const toggle = document.getElementById('menu-toggle');
const backdrop = document.getElementById('menu-backdrop');
let activeView, menuOpen = false;

export function scrollBehavior() { return reducedMotion.matches ? 'instant' : 'smooth'; }

function closeMenu(restoreFocus = true) {
  const wasOpen = menuOpen;
  menuOpen = false;
  document.body.classList.remove('menu-open');
  toggle.setAttribute('aria-expanded', 'false');
  backdrop.hidden = true;
  sidebar.removeAttribute('role');
  sidebar.removeAttribute('aria-modal');
  sidebar.inert = mobile.matches;
  stage.inert = false;
  if (wasOpen && restoreFocus) toggle.focus({ preventScroll: true });
}

function openMenu() {
  if (!mobile.matches) return;
  menuOpen = true;
  sidebar.inert = false;
  sidebar.setAttribute('role', 'dialog');
  sidebar.setAttribute('aria-modal', 'true');
  stage.inert = true;
  backdrop.hidden = false;
  document.body.classList.add('menu-open');
  toggle.setAttribute('aria-expanded', 'true');
  requestAnimationFrame(() => {
    if (menuOpen) sidebar.querySelector('[aria-current="page"]').focus({ preventScroll: true });
  });
}

// Panels stay mounted: editing, selection and pending saves survive navigation.
export function showView(name, { reset = false, history = 'push', focus = true, animate = true } = {}) {
  const next = panels.get(name);
  if (!next) return;
  const previous = panels.get(activeView);
  const changed = activeView !== name;
  closeMenu(false);
  if (changed) {
    if (previous) positions.set(activeView, previous.scrollTop);
    for (const panel of panels.values()) {
      if (panel === next) continue;
      panel.hidden = true;
      panel.inert = true;
      panel.classList.remove('is-entering');
    }
    next.inert = false;
    next.classList.toggle('is-entering', animate && !reducedMotion.matches);
    next.hidden = false;
    next.scrollTop = reset ? 0 : positions.get(name) || 0;
    activeView = name;
  } else if (reset) next.scrollTo({ top: 0, behavior: 'instant' });
  for (const link of document.querySelectorAll('.view-nav [data-view-link]')) {
    if (link.dataset.viewLink === name) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  document.title = `${labels[name]} · PC STUDIO`;
  const hash = `#/${name}`;
  if (history !== 'none' && location.hash !== hash) {
    window.history[history === 'replace' ? 'replaceState' : 'pushState'](null, '', hash);
  }
  if (focus) next.focus({ preventScroll: true });
}

function route() {
  const key = location.hash.replace(/^#\/?/, '');
  const aliases = { output: 'works', workspace: 'works', collection: 'home', '': 'home' };
  const name = panels.has(key) ? key : aliases[key] || 'home';
  // Old bookmarks resolve to views; no native cross-feature scroll is needed.
  showView(name, { history: 'replace', focus: false, animate: Boolean(activeView) });
}

document.addEventListener('click', event => {
  const link = event.target.closest('a[data-view-link]');
  if (!link || event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  showView(link.dataset.viewLink);
});
toggle.addEventListener('click', () => menuOpen ? closeMenu() : openMenu());
document.getElementById('menu-close').addEventListener('click', () => closeMenu());
backdrop.addEventListener('click', () => closeMenu());
document.addEventListener('keydown', event => {
  if (!menuOpen) return;
  if (event.key === 'Escape') { event.preventDefault(); closeMenu(); }
  if (event.key !== 'Tab') return;
  const stops = [...sidebar.querySelectorAll('a[href], button:not(:disabled)')].filter(node => node.getClientRects().length);
  const first = stops[0], last = stops.at(-1);
  if (event.shiftKey && (document.activeElement === first || !sidebar.contains(document.activeElement))) {
    event.preventDefault(); last.focus();
  } else if (!event.shiftKey && (document.activeElement === last || !sidebar.contains(document.activeElement))) {
    event.preventDefault(); first.focus();
  }
});
mobile.addEventListener('change', () => closeMenu(menuOpen && mobile.matches));
reducedMotion.addEventListener('change', () => {
  if (reducedMotion.matches) for (const panel of panels.values()) panel.classList.remove('is-entering');
});
document.getElementById('explore-products').addEventListener('click', () => {
  document.getElementById('collection').scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
});
document.querySelector('.skip-link').addEventListener('click', event => {
  event.preventDefault();
  panels.get(activeView).focus({ preventScroll: true });
});
window.history.scrollRestoration = 'manual';
window.addEventListener('popstate', route);
window.addEventListener('hashchange', route);
route();
