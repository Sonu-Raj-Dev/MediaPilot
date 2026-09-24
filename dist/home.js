import { CATEGORIES, TOOLS, toolsIn, popularTools, searchTools } from './tools-data.js';

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

/* ---------- tool cards, rendered from the catalogue ---------- */

function toolCard(tool, index) {
  return `
    <a class="tool-card reveal" style="--i:${index}" href="${tool.href}" data-tool="${tool.id}">
      <span class="tool-card-icon" aria-hidden="true"><svg viewBox="0 0 24 24">${tool.icon}</svg></span>
      <span class="tool-card-body">
        <strong>${tool.name}</strong>
        <span>${tool.description}</span>
      </span>
      <span class="tool-card-arrow" aria-hidden="true">
        <svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
      </span>
    </a>`;
}

function sectionMarkup(category, tools) {
  const count = `${tools.length} tool${tools.length === 1 ? '' : 's'}`;
  return `
    <section class="tool-group" data-category="${category.id}">
      <header class="tool-group-head reveal">
        <div>
          <h2>${category.label}</h2>
          <p>${category.blurb}</p>
        </div>
        <span class="tool-count">${count}</span>
      </header>
      <div class="tool-grid">${tools.map(toolCard).join('')}</div>
    </section>`;
}

function renderSections(tools) {
  const host = $('#toolSections');
  const markup = CATEGORIES
    .map((category) => [category, tools.filter((tool) => tool.category === category.id)])
    .filter(([, list]) => list.length)
    .map(([category, list]) => sectionMarkup(category, list))
    .join('');
  host.innerHTML = markup;
  $('#noResults').classList.toggle('is-hidden', tools.length > 0);
  revealAll(host);
}

function renderPopular() {
  $('#popularGrid').innerHTML = popularTools()
    .map((tool, index) => `
      <a class="popular-card reveal" style="--i:${index}" href="${tool.href}">
        <span class="popular-icon" aria-hidden="true"><svg viewBox="0 0 24 24">${tool.icon}</svg></span>
        <strong>${tool.short}</strong>
        <svg class="popular-arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
      </a>`)
    .join('');
  revealAll($('#popularGrid'));
}

function renderNavMenus() {
  for (const category of CATEGORIES) {
    const panel = document.querySelector(`[data-menu-panel="${category.id}"]`);
    if (!panel) continue;
    panel.innerHTML = toolsIn(category.id)
      .map((tool) => `
        <a href="${tool.href}">
          <span class="menu-icon" aria-hidden="true"><svg viewBox="0 0 24 24">${tool.icon}</svg></span>
          <span><strong>${tool.name}</strong><small>${tool.description}</small></span>
        </a>`)
      .join('');
  }
}

function renderFooter() {
  const list = (id, category) => {
    const host = $(id);
    if (host) {
      host.innerHTML = toolsIn(category)
        .map((tool) => `<li><a href="${tool.href}">${tool.name}</a></li>`)
        .join('');
    }
  };
  list('#footVideo', 'video');
  list('#footImage', 'image');
}

/* ---------- search + filtering ---------- */

let activeFilter = 'all';

function applySearch() {
  const query = $('#toolSearch').value;
  const matches = searchTools(query, activeFilter);
  renderSections(matches);
  const count = $('#searchCount');
  if (!query.trim() && activeFilter === 'all') {
    count.textContent = '';
  } else {
    count.textContent = `${matches.length} of ${TOOLS.length} tools`;
  }
}

/* ---------- entrance animation ---------- */

// whileInView, without a framework: elements start translated, an observer adds .is-visible,
// and CSS does the rest. Reduced motion skips straight to the visible state.
const observer = 'IntersectionObserver' in window
  ? new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 })
  : null;

function revealAll(scope = document) {
  const targets = scope.querySelectorAll('.reveal:not(.is-visible)');
  if (!observer || reducedMotion.matches) {
    targets.forEach((element) => element.classList.add('is-visible'));
    return;
  }
  targets.forEach((element) => observer.observe(element));
}

/* ---------- navigation ---------- */

function closeMenus() {
  $$('.nav-panel').forEach((panel) => { panel.hidden = true; });
  $$('.nav-trigger').forEach((trigger) => trigger.setAttribute('aria-expanded', 'false'));
}

function initNav() {
  $$('.nav-trigger').forEach((trigger) => {
    const panel = document.querySelector(`[data-menu-panel="${trigger.dataset.menu}"]`);
    trigger.addEventListener('click', (event) => {
      event.stopPropagation();
      const wasClosed = panel.hidden;
      closeMenus();
      panel.hidden = !wasClosed;
      trigger.setAttribute('aria-expanded', String(wasClosed));
    });
    trigger.parentElement.addEventListener('mouseleave', () => {
      panel.hidden = true;
      trigger.setAttribute('aria-expanded', 'false');
    });
  });
  document.addEventListener('click', closeMenus);

  const burger = $('#navBurger');
  const links = $('#navLinks');
  burger.addEventListener('click', (event) => {
    event.stopPropagation();
    const open = links.classList.toggle('is-open');
    burger.setAttribute('aria-expanded', String(open));
    burger.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  });

  // The bar gains a border and stronger blur once the page has moved.
  const nav = $('#siteNav');
  const onScroll = () => nav.classList.toggle('is-scrolled', window.scrollY > 8);
  document.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

/* ---------- theme ---------- */

function initTheme() {
  const toggle = $('#themeToggle');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)');
  const isDark = () => (document.documentElement.dataset.theme || (prefersDark.matches ? 'dark' : 'light')) === 'dark';

  const sync = () => {
    toggle.setAttribute('aria-pressed', String(isDark()));
    toggle.setAttribute('aria-label', isDark() ? 'Switch to light theme' : 'Switch to dark theme');
  };

  toggle.addEventListener('click', () => {
    const next = isDark() ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem('mediapilot-theme', next);
    } catch { /* private mode: the choice just will not persist */ }
    sync();
  });
  prefersDark.addEventListener('change', sync);
  sync();
}

/* ---------- language dialog ---------- */

function initLanguage() {
  const modal = $('#languageModal');
  const open = () => { modal.classList.remove('is-hidden'); $('#languageSearch').focus(); };
  const close = () => modal.classList.add('is-hidden');
  $('#languageButton').addEventListener('click', open);
  $('#languageClose').addEventListener('click', close);
  modal.querySelector('[data-language-close]').addEventListener('click', close);
  $('#languageSearch').addEventListener('input', (event) => {
    const term = event.target.value.trim().toLowerCase();
    let shown = 0;
    modal.querySelectorAll('.language-option').forEach((option) => {
      const match = option.textContent.toLowerCase().includes(term);
      option.hidden = !match;
      if (match) shown++;
    });
    $('#languageEmpty').classList.toggle('is-hidden', shown > 0);
  });
  return close;
}

/* ---------- boot ---------- */

renderNavMenus();
renderPopular();
renderFooter();
renderSections(TOOLS);
initNav();
initTheme();
const closeLanguage = initLanguage();

$('#toolSearch').addEventListener('input', applySearch);
$('#clearSearch').addEventListener('click', () => {
  $('#toolSearch').value = '';
  applySearch();
  $('#toolSearch').focus();
});

$$('.chip').forEach((chip) => {
  chip.addEventListener('click', () => {
    activeFilter = chip.dataset.filter;
    $$('.chip').forEach((other) => {
      const on = other === chip;
      other.classList.toggle('is-active', on);
      other.setAttribute('aria-selected', String(on));
    });
    applySearch();
  });
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    closeMenus();
    closeLanguage();
    $('#navLinks').classList.remove('is-open');
    $('#navBurger').setAttribute('aria-expanded', 'false');
    return;
  }
  // "/" jumps to search, the way most tool sites behave — but not while typing somewhere else.
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '');
  if (event.key === '/' && !typing) {
    event.preventDefault();
    $('#toolSearch').focus();
  }
});

revealAll();
