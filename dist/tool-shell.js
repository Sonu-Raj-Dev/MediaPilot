// Shared chrome for every tool page: the same navbar, theme toggle and language dialog the home
// page uses. It only touches the header and footer it renders itself — the tool's own markup and
// element ids are never read or modified here, so no tool logic depends on this file loading.
import { CATEGORIES, toolsIn } from './tools-data.js';

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

const here = location.pathname.replace(/\/+$/, '');

function navMarkup() {
  const groups = CATEGORIES.map((category) => `
    <div class="nav-item">
      <button class="nav-trigger" type="button" data-menu="${category.id}" aria-expanded="false" aria-controls="menu-${category.id}">${category.label}<svg class="chev" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button>
      <div class="nav-panel" id="menu-${category.id}" data-menu-panel="${category.id}" hidden>
        ${toolsIn(category.id).map((tool) => `
          <a href="${tool.href}"${tool.href === here ? ' aria-current="page"' : ''}>
            <span class="menu-icon" aria-hidden="true"><svg viewBox="0 0 24 24">${tool.icon}</svg></span>
            <span><strong>${tool.name}</strong><small>${tool.description}</small></span>
          </a>`).join('')}
      </div>
    </div>`).join('');

  return `
    <div class="nav-inner">
      <a class="nav-brand" href="/" aria-label="MediaPilot home">
        <span class="brand-mark" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
        <span class="brand-word">MediaPilot</span>
      </a>
      <nav class="nav-links" id="navLinks" aria-label="Main">
        ${groups}
        <a class="nav-link" href="/#all-tools">Tools</a>
      </nav>
      <div class="nav-actions">
        <button class="nav-icon-button" id="languageButton" type="button" aria-haspopup="dialog" aria-expanded="false" aria-label="Change language">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3.6 9h16.8M3.6 15h16.8"/><path d="M12 3a15 15 0 0 1 0 18a15 15 0 0 1 0-18Z"/></svg>
          <span id="currentLanguage">EN</span>
        </button>
        <button class="nav-icon-button" id="themeToggle" type="button" aria-label="Switch to dark theme" aria-pressed="false">
          <svg class="icon-sun" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"/></svg>
          <svg class="icon-moon" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/></svg>
        </button>
        <button class="nav-burger" id="navBurger" type="button" aria-expanded="false" aria-controls="navLinks" aria-label="Open menu">
          <span></span><span></span><span></span>
        </button>
      </div>
    </div>`;
}

function footerMarkup() {
  const column = (category) => `
    <nav class="foot-col" aria-label="${category.label} tools">
      <h3>${category.label} Tools</h3>
      <ul>${toolsIn(category.id).map((tool) => `<li><a href="${tool.href}">${tool.name}</a></li>`).join('')}</ul>
    </nav>`;

  return `
    <div class="shell foot-grid">
      <div class="foot-brand">
        <a class="nav-brand" href="/" aria-label="MediaPilot home">
          <span class="brand-mark" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
          <span class="brand-word">MediaPilot</span>
        </a>
        <p>Simple media tools that run on your device.</p>
      </div>
      ${CATEGORIES.map(column).join('')}
      <nav class="foot-col" aria-label="Resources">
        <h3>Resources</h3>
        <ul><li><a href="/#how-it-works">How it works</a></li><li><a href="/#why">Why MediaPilot</a></li><li><a href="/#">Privacy</a></li><li><a href="/#">Terms</a></li></ul>
      </nav>
    </div>
    <div class="shell foot-base"><span>© 2026 MediaPilot</span><span>Processed locally. Never uploaded.</span></div>`;
}

function mountChrome() {
  const legacyHeader = $('.global-header');
  const header = document.createElement('header');
  header.className = 'site-nav';
  header.id = 'siteNav';
  header.innerHTML = navMarkup();
  if (legacyHeader) legacyHeader.replaceWith(header);
  else document.body.prepend(header);

  const footer = document.createElement('footer');
  footer.className = 'site-foot';
  footer.innerHTML = footerMarkup();
  const legacyFooter = $('.site-footer');
  if (legacyFooter) legacyFooter.replaceWith(footer);
  else document.body.append(footer);
}

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

  const nav = $('#siteNav');
  const onScroll = () => nav.classList.toggle('is-scrolled', window.scrollY > 8);
  document.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

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

function initLanguage() {
  const modal = $('#languageModal');
  if (!modal) return () => {};
  const close = () => modal.classList.add('is-hidden');
  $('#languageButton').addEventListener('click', () => {
    modal.classList.remove('is-hidden');
    $('#languageSearch')?.focus();
  });
  $('#languageClose')?.addEventListener('click', close);
  modal.querySelector('[data-language-close]')?.addEventListener('click', close);
  $('#languageSearch')?.addEventListener('input', (event) => {
    const term = event.target.value.trim().toLowerCase();
    let shown = 0;
    modal.querySelectorAll('.language-option').forEach((option) => {
      const match = option.textContent.toLowerCase().includes(term);
      option.hidden = !match;
      if (match) shown++;
    });
    $('#languageEmpty')?.classList.toggle('is-hidden', shown > 0);
  });
  return close;
}

mountChrome();
initNav();
initTheme();
const closeLanguage = initLanguage();

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  closeMenus();
  closeLanguage();
  $('#navLinks')?.classList.remove('is-open');
  $('#navBurger')?.setAttribute('aria-expanded', 'false');
});
