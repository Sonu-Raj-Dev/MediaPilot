// Generative hero background: a slow, living "media network" drawn on one 2D canvas behind the
// hero artwork. Seven systems share one requestAnimationFrame loop:
//   glows (radial light) → waves (deforming curves) → network (drifting nodes + links)
//   → packets (data travelling along curves) → particles (tiny media fragments)
// Tool zones are read from the artwork's DOM (video/image/PDF/convert icons and the card), so
// nodes are drawn toward the tools and data visibly flows tools → card → out to results.
// ponytail: Canvas 2D, not WebGL; at <100 elements it holds 60fps everywhere. Move to WebGL only
// if the element counts ever need to grow ~10x.

const canvas = document.querySelector('.hero-canvas');
const hero = canvas?.closest('.hero');
const ctx = canvas?.getContext('2d');

if (ctx && hero) start();

function start() {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const BLUE = [91, 134, 255], PURPLE = [139, 107, 255], CYAN = [56, 189, 248];
  const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
  const rand = (a, b) => a + Math.random() * (b - a);
  const TAU = Math.PI * 2;

  let W = 0, H = 0, dpr = 1, tier = 'desktop', dark = false;
  let particles = [], nodes = [], packets = [], zones = [], card = null, exits = [];
  let waveGradient = null, running = false, visible = true, last = 0, t = 0, linkTimer = 0;
  // Pointer: target in px (relative to the hero) and a smoothed copy; -1..1 for parallax.
  const pointer = { tx: 0, ty: 0, x: 0, y: 0, active: 0, activeTarget: 0 };

  function readTheme() {
    // The page colour token is a hex value (#fff / #0f1115); dark means a low-luminance page.
    const hex = getComputedStyle(hero).getPropertyValue('--bg').trim().replace('#', '');
    const full = hex.length === 3 ? hex.replace(/./g, '$&$&') : hex.padEnd(6, 'f');
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
    dark = r * 0.299 + g * 0.587 + b * 0.114 < 128;
  }

  function readZones() {
    const box = hero.getBoundingClientRect();
    const zoneOf = (selector, kind) => {
      const el = hero.querySelector(selector);
      const r = el?.getBoundingClientRect();
      if (!r || !r.width) return null; // hidden on phones
      return { kind, x: r.left - box.left + r.width / 2, y: r.top - box.top + r.height / 2, r: Math.max(r.width, r.height) * 0.9, w: r.width, h: r.height, cool: rand(0, 2) };
    };
    const fresh = ['.hs-play', '.hs-image', '.hs-pdf', '.hs-convert'].map((s) => zoneOf(s, 'tool')).filter(Boolean);
    const freshCard = zoneOf('.hero-panel', 'card');
    // Update in place so packets holding a reference keep following the moved target.
    if (zones.length === fresh.length) zones.forEach((z, i) => Object.assign(z, fresh[i], { cool: z.cool }));
    else zones = fresh;
    if (card && freshCard) Object.assign(card, freshCard); else card = freshCard;
    if (card) {
      exits = [
        { x: card.x + card.w * 0.75, y: card.y + card.h * 0.9 },
        { x: card.x - card.w * 0.6, y: card.y + card.h * 0.75 },
        { x: card.x + card.w * 0.9, y: card.y - card.h * 0.1 },
      ];
    }
  }

  function resize() {
    const rect = hero.getBoundingClientRect();
    W = rect.width; H = rect.height;
    tier = W > 1040 ? 'desktop' : W > 640 ? 'tablet' : 'mobile';
    dpr = Math.min(devicePixelRatio || 1, tier === 'mobile' ? 1.25 : 1.5);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    readTheme();
    readZones();
    const counts = { desktop: [64, 24], tablet: [32, 14], mobile: [14, 8] }[tier];
    // On the two-column layout the copy sits on the left, so the network lives on the art side.
    const minX = tier === 'desktop' ? W * 0.32 : 0;
    particles = Array.from({ length: counts[0] }, () => makeParticle(rand(0, W), rand(0, H)));
    nodes = Array.from({ length: counts[1] }, () => ({
      x: rand(minX, W), y: rand(H * 0.05, H * 0.95), vx: rand(-0.1, 0.1), vy: rand(-0.1, 0.1),
      seed: rand(0, 100), charge: 0, minX,
    }));
    packets = [];
    waveGradient = ctx.createLinearGradient(0, 0, W, 0);
    waveGradient.addColorStop(0, rgba(BLUE, 0));
    waveGradient.addColorStop(0.35, rgba(BLUE, 1));
    waveGradient.addColorStop(0.7, rgba(PURPLE, 1));
    waveGradient.addColorStop(1, rgba(CYAN, 0.6));
    if (!running) draw(0); // keep a correct still frame when paused or reduced motion
  }

  function makeParticle(x, y) {
    const z = Math.random(); // depth: far particles are smaller, fainter, slower, move less
    return {
      x, y, z, size: 1.2 + z * 2.8, alpha: 0.18 + z * 0.36, speed: 0.08 + z * 0.22,
      rot: rand(0, TAU), spin: rand(-0.004, 0.004), shape: Math.random() < 0.6 ? 0 : 1,
      color: [BLUE, PURPLE, CYAN][Math.floor(Math.random() * 3)],
    };
  }

  // A smooth, slowly changing flow field: every moving thing samples it, so motion is organic
  // and coherent instead of random jitter.
  const flow = (x, y) => Math.sin(x * 0.0021 + t * 0.07) + Math.cos(y * 0.0032 - t * 0.05) + Math.sin((x + y) * 0.0011 + t * 0.03);

  function pushFromPointer(p, radius, strength) {
    if (!pointer.active) return;
    const dx = p.x - pointer.x, dy = p.y - pointer.y, d2 = dx * dx + dy * dy;
    if (d2 > radius * radius || d2 < 1) return;
    const d = Math.sqrt(d2), f = (1 - d / radius) * strength * pointer.active;
    p.vx += (dx / d) * f; p.vy += (dy / d) * f;
  }

  function sendPacket(from, to, color, bendSign = Math.random() < 0.5 ? -1 : 1) {
    if (packets.length >= (tier === 'desktop' ? 22 : 10)) return;
    packets.push({ from, to, color, bend: bendSign * rand(0.15, 0.3), p: 0, dur: rand(2.6, 4.2) });
  }

  // Point on the curve from a → b, bowed sideways by `bend` (fraction of the length).
  function curvePoint(a, b, bend, u) {
    const mx = (a.x + b.x) / 2 - (b.y - a.y) * bend, my = (a.y + b.y) / 2 + (b.x - a.x) * bend;
    const v = 1 - u;
    return [v * v * a.x + 2 * v * u * mx + u * u * b.x, v * v * a.y + 2 * v * u * my + u * u * b.y];
  }

  function update(dt) {
    t += dt;
    const k = 1 - Math.pow(1 - 0.03, dt * 60); // the 0.03-per-frame ease, frame-rate independent
    pointer.x += (pointer.tx - pointer.x) * k;
    pointer.y += (pointer.ty - pointer.y) * k;
    pointer.active += (pointer.activeTarget - pointer.active) * k;
    const step = dt * 60;

    for (const p of particles) {
      const a = flow(p.x, p.y) * Math.PI;
      p.vx = (p.vx || 0) * 0.94 + Math.cos(a) * p.speed * 0.06;
      p.vy = (p.vy || 0) * 0.94 + (Math.sin(a) * 0.6 - 0.25) * p.speed * 0.06;
      pushFromPointer(p, 150, 0.03);
      p.x += p.vx * step; p.y += p.vy * step; p.rot += p.spin * step;
      if (p.x < -10) p.x = W + 10; else if (p.x > W + 10) p.x = -10;
      if (p.y < -10) p.y = H + 10; else if (p.y > H + 10) p.y = -10;
    }

    for (const n of nodes) {
      const a = flow(n.x + n.seed * 40, n.y) * Math.PI;
      n.vx = n.vx * 0.97 + Math.cos(a) * 0.012;
      n.vy = n.vy * 0.97 + Math.sin(a) * 0.009;
      // Tool zones pull nearby uncharged nodes in; touching one charges the node (brighter, linked)
      // and fires a data packet from that tool toward the processing card.
      for (const z of zones) {
        const dx = z.x - n.x, dy = z.y - n.y, d = Math.hypot(dx, dy);
        if (n.charge <= 0 && d < z.r * 2.4) { n.vx += (dx / d) * 0.006; n.vy += (dy / d) * 0.006; }
        if (d < z.r && n.charge <= 0) {
          n.charge = 1; n.zone = z;
          if (card && z.cool <= 0) { sendPacket(z, card, BLUE); z.cool = rand(2.5, 4); }
        }
      }
      pushFromPointer(n, 180, 0.012);
      const speed = Math.hypot(n.vx, n.vy);
      if (speed > 0.45) { n.vx *= 0.45 / speed; n.vy *= 0.45 / speed; }
      n.x += n.vx * step; n.y += n.vy * step;
      if (n.charge > 0) n.charge = Math.max(0, n.charge - dt / 4);
      // Soft walls: nodes turn back instead of popping out of existence.
      if (n.x < n.minX + 20) n.vx += 0.01; if (n.x > W - 20) n.vx -= 0.01;
      if (n.y < 20) n.vy += 0.01; if (n.y > H - 20) n.vy -= 0.01;
    }
    for (const z of zones) z.cool -= dt;

    // Data along the living network: now and then a strong link carries a packet, and the card
    // emits finished "results" outward.
    linkTimer -= dt;
    if (linkTimer <= 0) {
      linkTimer = rand(0.7, 1.4);
      const a = nodes[Math.floor(Math.random() * nodes.length)];
      const b = nearest(a);
      if (b && Math.hypot(a.x - b.x, a.y - b.y) < linkDistance()) sendPacket(a, b, PURPLE);
      if (card && exits.length && Math.random() < 0.45) sendPacket(card, exits[Math.floor(Math.random() * exits.length)], CYAN);
    }
    packets = packets.filter((p) => (p.p += dt / p.dur) < 1);
  }

  const linkDistance = () => (tier === 'mobile' ? 120 : 190);
  function nearest(a) {
    let best = null, bd = Infinity;
    for (const b of nodes) {
      if (b === a) continue;
      const d = (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    // Parallax planes, from far to near. Offsets are px at full pointer deflection.
    const nx = pointer.active * ((pointer.x / W) * 2 - 1), ny = pointer.active * ((pointer.y / H) * 2 - 1);
    const plane = (px) => ctx.setTransform(dpr, 0, 0, dpr, nx * px * dpr, ny * px * dpr);
    const light = dark ? 0.85 : 1; // additive light on dark pages already reads brighter

    // Radial energy: three huge soft lights on slow Lissajous paths, leaning toward the pointer.
    plane(1.5);
    ctx.globalCompositeOperation = dark ? 'lighter' : 'source-over';
    const glows = [
      [BLUE, 0.62 + 0.12 * Math.sin(t * 0.05), 0.35 + 0.15 * Math.cos(t * 0.04), 0.42, dark ? 0.16 : 0.1],
      [PURPLE, 0.8 + 0.1 * Math.cos(t * 0.035), 0.65 + 0.12 * Math.sin(t * 0.045), 0.38, dark ? 0.14 : 0.09],
      [CYAN, 0.45 + 0.1 * Math.sin(t * 0.03 + 2), 0.75 + 0.1 * Math.cos(t * 0.05), 0.3, dark ? 0.1 : 0.06],
    ];
    for (const [c, gx, gy, gr, a] of glows) {
      const x = gx * W + (pointer.x - gx * W) * 0.08 * pointer.active, y = gy * H + (pointer.y - gy * H) * 0.08 * pointer.active;
      const r = gr * Math.max(W, H);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, rgba(c, a)); g.addColorStop(1, rgba(c, 0));
      ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    ctx.globalCompositeOperation = 'source-over';
    if (reduced.matches) return; // reduced motion: glow only

    // Organic waves: sums of sines, each deforming at its own speed, bulging gently at the pointer.
    plane(3);
    ctx.strokeStyle = waveGradient;
    for (let i = 0; i < (tier === 'mobile' ? 2 : 3); i++) {
      const base = H * (0.55 + i * 0.13), amp = H * (0.05 + i * 0.015), speed = 0.12 + i * 0.05;
      ctx.beginPath();
      for (let s = 0; s <= 40; s++) {
        const x = (s / 40) * W;
        let y = base + Math.sin(x * 0.004 + t * speed + i) * amp + Math.sin(x * 0.0093 - t * speed * 0.7 + i * 2) * amp * 0.45;
        y -= Math.exp(-((x - pointer.x) ** 2) / 30000) * 24 * pointer.active; // lift near the pointer
        s ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.globalAlpha = (0.07 + i * 0.015) * light; ctx.lineWidth = 9; ctx.stroke(); // soft halo
      ctx.globalAlpha = (0.22 - i * 0.03) * light; ctx.lineWidth = 1.3; ctx.stroke(); // bright core
    }
    ctx.globalAlpha = 1;

    // Network: curved links whose strength (and glow) rises as nodes close in, fading as they part.
    plane(5);
    const D = linkDistance();
    ctx.lineCap = 'round';
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j], d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d > D) continue;
        const s = (1 - d / D) ** 2;
        const bend = 0.12 * Math.sin(t * 0.2 + a.seed + b.seed);
        const mx = (a.x + b.x) / 2 - (b.y - a.y) * bend, my = (a.y + b.y) / 2 + (b.x - a.x) * bend;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.quadraticCurveTo(mx, my, b.x, b.y);
        ctx.strokeStyle = rgba(s > 0.5 ? PURPLE : BLUE, (0.08 + s * 0.42) * light);
        ctx.lineWidth = 0.8 + s * 1.2; ctx.stroke();
      }
      // A charged node keeps a fading link to the tool it touched.
      if (a.charge > 0 && a.zone) {
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(a.zone.x, a.zone.y);
        ctx.strokeStyle = rgba(CYAN, a.charge * 0.35 * light); ctx.lineWidth = 1; ctx.stroke();
      }
    }
    for (const n of nodes) {
      const glow = 0.25 + n.charge * 0.5;
      ctx.fillStyle = rgba(BLUE, glow * 0.35 * light);
      ctx.beginPath(); ctx.arc(n.x, n.y, 5 + n.charge * 4, 0, TAU); ctx.fill();
      ctx.fillStyle = rgba(n.charge > 0 ? CYAN : BLUE, (0.6 + n.charge * 0.4) * light);
      ctx.beginPath(); ctx.arc(n.x, n.y, 1.8 + n.charge, 0, TAU); ctx.fill();
    }

    // Data packets: a glowing head with a short trail along their curve.
    plane(8);
    for (const p of packets) {
      const fade = Math.min(1, p.p * 6, (1 - p.p) * 6);
      for (let k = 4; k >= 0; k--) {
        const u = Math.max(0, p.p - k * 0.018);
        const [x, y] = curvePoint(p.from, p.to, p.bend, u * u * (3 - 2 * u));
        ctx.fillStyle = rgba(p.color, fade * (k ? 0.12 * (5 - k) / 5 : 0.85) * light);
        ctx.beginPath(); ctx.arc(x, y, k ? 2 : 2.6, 0, TAU); ctx.fill();
      }
    }

    // Particles: small rotated squares and dashes, fragments of media in transit, not stars.
    for (const p of particles) {
      plane(2 + p.z * 10);
      ctx.save();
      ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      ctx.fillStyle = rgba(p.color, p.alpha * light);
      if (p.shape) ctx.fillRect(-p.size * 1.8, -p.size * 0.35, p.size * 3.6, p.size * 0.7);
      else ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
      ctx.restore();
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function frame(now) {
    if (!running) return;
    const dt = Math.min(0.05, (now - (last || now)) / 1000);
    last = now;
    update(dt);
    draw();
    requestAnimationFrame(frame);
  }

  function sync() {
    const should = visible && !document.hidden && !reduced.matches;
    if (should && !running) { running = true; last = 0; requestAnimationFrame(frame); }
    if (!should) { running = false; draw(); }
  }

  // Pointer and touch both feed the same smoothed target; nothing ever snaps to the cursor.
  addEventListener('pointermove', (e) => {
    const r = hero.getBoundingClientRect();
    const inside = e.clientY >= r.top && e.clientY <= r.bottom;
    pointer.tx = e.clientX - r.left; pointer.ty = e.clientY - r.top;
    pointer.activeTarget = inside ? (e.pointerType === 'mouse' ? 1 : 0.5) : 0;
  }, { passive: true });
  hero.addEventListener('pointerleave', () => { pointer.activeTarget = 0; });

  new ResizeObserver(resize).observe(hero);
  new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; sync(); }).observe(hero);
  document.addEventListener('visibilitychange', sync);
  reduced.addEventListener('change', sync);
  // Theme toggles and late layout (fonts, images) move the colours and the tool positions.
  new MutationObserver(readTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] });
  addEventListener('load', readZones);
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', readTheme);
  setInterval(() => running && readZones(), 2000);
}
