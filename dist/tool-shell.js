import{CATEGORIES as p,menuMarkup as v}from"./tools-data.js";const n=e=>document.querySelector(e),r=e=>Array.from(document.querySelectorAll(e)),h=location.pathname.replace(/\/+$/,"");function m(){return`
    <div class="nav-inner">
      <a class="nav-brand" href="/" aria-label="MediaPilot home">
        <span class="brand-mark" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
        <span class="brand-word">MediaPilot</span>
      </a>
      <nav class="nav-links" id="navLinks" aria-label="Main">
        ${p.map(a=>`
    <div class="nav-item">
      <button class="nav-trigger" type="button" data-menu="${a.id}" aria-expanded="false" aria-controls="menu-${a.id}">${a.label}<svg class="chev" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button>
      <div class="nav-panel" id="menu-${a.id}" data-menu-panel="${a.id}" hidden>${v(a.id,h)}</div>
    </div>`).join("")}
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
    </div>`}function g(){return`
    <div class="shell foot-grid">
      <div class="foot-brand">
        <a class="nav-brand" href="/" aria-label="MediaPilot home">
          <span class="brand-mark" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
          <span class="brand-word">MediaPilot</span>
        </a>
        <p>Simple media tools that run on your device.</p>
      </div>
      <nav class="foot-col" aria-label="Resources">
        <h3>Resources</h3>
        <ul><li><a href="/#all-tools">All tools</a></li><li><a href="/#how-it-works">How it works</a></li><li><a href="/#why">Why MediaPilot</a></li><li><a href="/privacy">Privacy</a></li><li><a href="/terms">Terms</a></li></ul>
      </nav>
    </div>
    <div class="shell foot-base"><span>\xA9 2026 MediaPilot</span><span>Processed locally. Never uploaded.</span></div>`}function b(){const e=n(".global-header"),a=document.createElement("header");a.className="site-nav",a.id="siteNav",a.innerHTML=m(),e?e.replaceWith(a):document.body.prepend(a);const s=document.createElement("footer");s.className="site-foot",s.innerHTML=g();const i=n(".site-footer");i?i.replaceWith(s):document.body.append(s)}function d(){r(".nav-panel").forEach(e=>{e.hidden=!0}),r(".nav-trigger").forEach(e=>e.setAttribute("aria-expanded","false"))}function f(){r(".nav-trigger").forEach(t=>{const o=document.querySelector(`[data-menu-panel="${t.dataset.menu}"]`);t.addEventListener("click",u=>{u.stopPropagation();const c=o.hidden;d(),o.hidden=!c,t.setAttribute("aria-expanded",String(c))});let l;t.parentElement.addEventListener("mouseleave",()=>{l=setTimeout(()=>{o.hidden=!0,t.setAttribute("aria-expanded","false")},400)}),t.parentElement.addEventListener("mouseenter",()=>clearTimeout(l))}),document.addEventListener("click",d);const e=n("#navBurger"),a=n("#navLinks");e.addEventListener("click",t=>{t.stopPropagation();const o=a.classList.toggle("is-open");e.setAttribute("aria-expanded",String(o)),e.setAttribute("aria-label",o?"Close menu":"Open menu")});const s=n("#siteNav"),i=()=>s.classList.toggle("is-scrolled",window.scrollY>8);document.addEventListener("scroll",i,{passive:!0}),i()}function k(){const e=n("#themeToggle"),a=window.matchMedia("(prefers-color-scheme: dark)"),s=()=>(document.documentElement.dataset.theme||(a.matches?"dark":"light"))==="dark",i=()=>{e.setAttribute("aria-pressed",String(s())),e.setAttribute("aria-label",s()?"Switch to light theme":"Switch to dark theme")};e.addEventListener("click",()=>{const t=s()?"light":"dark";document.documentElement.dataset.theme=t;try{localStorage.setItem("mediapilot-theme",t)}catch{}i()}),a.addEventListener("change",i),i()}function L(){const e=n("#languageModal");if(!e)return()=>{};const a=()=>e.classList.add("is-hidden");return n("#languageButton").addEventListener("click",()=>{e.classList.remove("is-hidden"),n("#languageSearch")?.focus()}),n("#languageClose")?.addEventListener("click",a),e.querySelector("[data-language-close]")?.addEventListener("click",a),n("#languageSearch")?.addEventListener("input",s=>{const i=s.target.value.trim().toLowerCase();let t=0;e.querySelectorAll(".language-option").forEach(o=>{const l=o.textContent.toLowerCase().includes(i);o.hidden=!l,l&&t++}),n("#languageEmpty")?.classList.toggle("is-hidden",t>0)}),a}b(),f(),k();const E=L();document.addEventListener("keydown",e=>{e.key==="Escape"&&(d(),E(),n("#navLinks")?.classList.remove("is-open"),n("#navBurger")?.setAttribute("aria-expanded","false"))});
