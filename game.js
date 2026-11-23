// =====================================================================
//  NEON NEBULA WORDLE – Spiellogik, Effekte und Sounds
// =====================================================================
(() => {
  const ROWS = 6, COLS = 5;
  const ANSWERS = window.ANSWERS, VALID = new Set(window.VALID);
  const $ = id => document.getElementById(id);
  const boardEl = $('board'), kbEl = $('kb'), frameEl = $('frame');
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = a => a[(Math.random() * a.length) | 0];
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const space = () => window.space || { pulse() {}, gloom() {} }; // falls 3D (noch) nicht geladen

  const C = { pink: '#ff3cc7', pink2: '#ff6ad5', cyan: '#00e5ff', cyan2: '#5ff3ff', violet: '#7b3cff', purple: '#c86bff', white: '#ffffff', red: '#ff2d55' };

  // ------------------------------------------------------------------
  //  Spielzustand
  // ------------------------------------------------------------------
  let answer, row, col, grid, over, busy, lastAnswer;
  let stars = 0, shownStars = 0, knownGreen = new Set();
  const tiles = [], rows = [];

  function chooseAnswer() {
    const forced = new URLSearchParams(location.search).get('word'); // nur zum Testen
    if (forced && forced.length === 5 && !lastAnswer) return forced.toLowerCase();
    let w;
    do { w = pick(ANSWERS); } while (w === lastAnswer);
    return w;
  }

  // ------------------------------------------------------------------
  //  Aufbau: Spielfeld + Tastatur
  // ------------------------------------------------------------------
  for (let r = 0; r < ROWS; r++) {
    const rEl = document.createElement('div');
    rEl.className = 'row';
    rows.push(rEl);
    tiles.push([]);
    for (let c = 0; c < COLS; c++) {
      const t = document.createElement('div');
      t.className = 'tile';
      t.style.setProperty('--d', `${(r * 0.25 + c * 0.08).toFixed(2)}s`);
      t.style.setProperty('--i', c);
      rEl.appendChild(t);
      tiles[r].push(t);
    }
    boardEl.appendChild(rEl);
  }

  const KEYS = ['qwertyuiop', 'asdfghjkl', ['enter', ...'zxcvbnm', 'back']];
  const keyEls = {};
  KEYS.forEach(line => {
    const r = document.createElement('div');
    r.className = 'kb-row';
    [...line].forEach(k => {
      const b = document.createElement('button');
      b.className = 'key' + (k.length > 1 ? ' wide' : '');
      b.textContent = k === 'back' ? '⌫' : k;
      b.dataset.key = k;
      b.addEventListener('click', () => { handleKey(k); b.blur(); });
      r.appendChild(b);
      keyEls[k] = b;
    });
    kbEl.appendChild(r);
  });

  // Lauflichter rund um den Rahmen
  function layoutBulbs() {
    const box = $('bulbs');
    box.innerHTML = '';
    const w = frameEl.offsetWidth, h = frameEl.offsetHeight, step = 22;
    const inset = parseFloat(getComputedStyle(frameEl).getPropertyValue('--bulb-inset')) || 8, corner = inset + 16; // Lichter sitzen mittig auf der Leiste, Ecken sind rund
    const pts = [];
    const edge = (x1, y1, x2, y2) => {
      const len = Math.hypot(x2 - x1, y2 - y1), n = Math.max(1, Math.round(len / step));
      for (let i = 0; i < n; i++) pts.push([x1 + (x2 - x1) * i / n, y1 + (y2 - y1) * i / n]);
    };
    edge(corner, inset, w - corner, inset);
    edge(w - inset, corner, w - inset, h - corner);
    edge(w - corner, h - inset, corner, h - inset);
    edge(inset, h - corner, inset, corner);
    const cols = [C.pink, C.cyan, C.purple];
    pts.forEach(([x, y], i) => {
      const b = document.createElement('span');
      b.className = 'bulb';
      b.style.left = x + 'px'; b.style.top = y + 'px';
      b.style.setProperty('--c', cols[i % 3]);
      b.style.background = i % 3 === 1 ? '#bdfaff' : '#ffd0f2';
      b.style.animationDelay = `${-((pts.length - i) * 0.07) % 1.4}s`;
      box.appendChild(b);
    });
  }

  // ------------------------------------------------------------------
  //  Sounds (werden live erzeugt, keine Dateien nötig)
  // ------------------------------------------------------------------
  let ac, master, muted = localStorage.getItem('nnw-muted') === '1';
  const muteBtn = $('mute');
  muteBtn.classList.toggle('off', muted);
  muteBtn.addEventListener('click', () => {
    muted = !muted;
    localStorage.setItem('nnw-muted', muted ? '1' : '0');
    muteBtn.classList.toggle('off', muted);
    muteBtn.blur();
  });
  function audio() {
    if (!ac) {
      ac = new (window.AudioContext || window.webkitAudioContext)();
      master = ac.createGain(); master.gain.value = 0.45; master.connect(ac.destination);
    }
    if (ac.state === 'suspended') ac.resume();
    return ac;
  }
  function tone(freq, dur, { type = 'sine', vol = 0.15, when = 0, slide = null, attack = 0.005 } = {}) {
    if (muted || !ac) return;
    const t0 = ac.currentTime + when;
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(master);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }
  function noise(dur, { vol = 0.2, when = 0, from = 400, to = 4000, q = 1 } = {}) {
    if (muted || !ac) return;
    const t0 = ac.currentTime + when;
    const buf = ac.createBuffer(1, ac.sampleRate * dur, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = ac.createBufferSource(); src.buffer = buf;
    const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = q;
    f.frequency.setValueAtTime(from, t0); f.frequency.exponentialRampToValueAtTime(to, t0 + dur);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + dur * 0.3); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t0);
  }
  const N = n => 440 * Math.pow(2, (n - 69) / 12); // MIDI-Note -> Frequenz
  const sfx = {
    type: () => tone(1400, 0.05, { type: 'square', vol: 0.025 }),
    back: () => tone(500, 0.06, { type: 'square', vol: 0.02 }),
    absent: () => tone(170, 0.14, { type: 'triangle', vol: 0.06 }),
    present: i => { tone(N(79 + i), 0.35, { vol: 0.12 }); tone(N(91 + i), 0.2, { vol: 0.04, when: 0.02 }); },
    correct: i => { [0, 4, 7].forEach((s, k) => tone(N(84 + i * 2 + s), 0.45, { type: 'triangle', vol: 0.11, when: k * 0.04 })); },
    weak: () => { [96, 100, 103].forEach((n, k) => tone(N(n), 0.3, { vol: 0.05, when: k * 0.07 })); },
    medium: () => { [72, 76, 79, 84, 88].forEach((n, k) => tone(N(n), 0.4, { type: 'triangle', vol: 0.1, when: k * 0.07 })); noise(0.6, { vol: 0.06, from: 2000, to: 9000 }); },
    strong: () => {
      noise(0.9, { vol: 0.25, from: 200, to: 8000, q: 0.7 });
      tone(90, 1.1, { type: 'sine', vol: 0.4, slide: 35, when: 0.05 });
      [72, 76, 79, 84, 88, 91, 96, 100].forEach((n, k) => tone(N(n), 0.6, { type: 'triangle', vol: 0.11, when: 0.1 + k * 0.06 }));
      [96, 103, 108].forEach((n, k) => tone(N(n), 1.2, { vol: 0.05, when: 0.6 + k * 0.1 }));
    },
    win: () => {
      sfx.strong();
      const mel = [72, 76, 79, 84, 79, 84, 88, 91, 96];
      mel.forEach((n, k) => { tone(N(n), 0.5, { type: 'square', vol: 0.05, when: 0.9 + k * 0.11 }); tone(N(n + 12), 0.4, { vol: 0.05, when: 0.9 + k * 0.11 }); });
      for (let k = 0; k < 14; k++) tone(N(96 + (k * 5) % 15), 0.25, { vol: 0.04, when: 2 + k * 0.08 });
    },
    bad: () => {
      tone(150, 0.7, { type: 'sawtooth', vol: 0.12, slide: 40 });
      tone(75, 0.9, { type: 'sine', vol: 0.35, slide: 30 });
      noise(0.5, { vol: 0.15, from: 900, to: 120 });
    },
    invalid: () => { tone(220, 0.09, { type: 'square', vol: 0.05 }); tone(185, 0.12, { type: 'square', vol: 0.05, when: 0.1 }); },
    cheesy: () => {
      tone(260, 0.25, { type: 'triangle', vol: 0.15, slide: 520 });
      tone(520, 0.35, { type: 'triangle', vol: 0.13, slide: 180, when: 0.25 });
      tone(N(84), 0.2, { vol: 0.06, when: 0.7 }); tone(N(88), 0.3, { vol: 0.06, when: 0.82 });
    },
    starTick: k => tone(N(88 + (k % 12)), 0.08, { vol: 0.035 }),
    lose: () => { [67, 63, 60, 55].forEach((n, k) => tone(N(n), 0.6, { type: 'triangle', vol: 0.12, when: k * 0.22 })); },
  };

  // ------------------------------------------------------------------
  //  Partikel-Effekte (eigene Zeichenfläche über allem)
  // ------------------------------------------------------------------
  const fxc = $('fx'), fx = fxc.getContext('2d');
  const DPR = Math.min(devicePixelRatio || 1, 2);
  let FW, FH;
  function resizeFx() {
    FW = innerWidth; FH = window.APP_H || innerHeight;
    fxc.width = FW * DPR; fxc.height = FH * DPR;
    fx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  const glowCache = {};
  function glow(color) {
    if (/^#[0-9a-f]{3}$/i.test(color)) color = '#' + [...color.slice(1)].map(c => c + c).join(''); // #fff -> #ffffff
    if (glowCache[color]) return glowCache[color];
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, '#ffffff'); grd.addColorStop(0.2, color); grd.addColorStop(1, color + '00');
    g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
    return (glowCache[color] = c);
  }
  const parts = [], rings = [], flyers = [];
  function burst(x, y, { count = 30, colors = [C.cyan, C.white], speed = 300, size = 4, gravity = 0, life = 1, shapes = ['dot', 'star', 'spark'], drag = 0.985, spread = Math.PI * 2, dir = 0 } = {}) {
    for (let i = 0; i < count; i++) {
      const a = dir + (Math.random() - 0.5) * spread, v = speed * rand(0.25, 1);
      parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0, max: life * rand(0.6, 1.2), size: size * rand(0.5, 1.4), color: pick(colors), shape: pick(shapes), rot: rand(0, 6), vr: rand(-6, 6), gravity, drag });
    }
  }
  function implode(x, y, { count = 70, radius = 260, colors = ['#3a1a5a', '#7b3cff', '#ff2d55', '#1a0a2a'], life = 0.9 } = {}) {
    for (let i = 0; i < count; i++) {
      const a = rand(0, Math.PI * 2), r = radius * rand(0.6, 1.2);
      const sx = x + Math.cos(a) * r, sy = y + Math.sin(a) * r;
      const T = life * rand(0.7, 1);
      parts.push({ x: sx, y: sy, vx: (x - sx) / T, vy: (y - sy) / T, life: 0, max: T, size: rand(2, 5), color: pick(colors), shape: 'spark', rot: 0, vr: 0, gravity: 0, drag: 1 });
    }
  }
  function ring(x, y, { color = C.cyan, max = 300, width = 6, life = 0.7, delay = 0 } = {}) {
    rings.push({ x, y, color, max, width, life: -delay, dur: life });
  }
  function starPath(ctx, s) {
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const r = i % 2 ? s * 0.35 : s, a = i * Math.PI / 4;
      i ? ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r) : ctx.moveTo(r, 0);
    }
    ctx.closePath();
  }
  let fxLast = performance.now(), rain = 0;
  function fxLoop(now) {
    const dt = Math.min((now - fxLast) / 1000, 0.05); fxLast = now;
    fx.clearRect(0, 0, FW, FH);
    fx.globalCompositeOperation = 'lighter';

    if (rain > 0) {  // Sternenregen beim Sieg
      rain -= dt;
      for (let i = 0; i < 4; i++) parts.push({ x: rand(0, FW), y: -10, vx: rand(-40, 40), vy: rand(250, 500), life: 0, max: 3, size: rand(3, 8), color: pick([C.cyan2, C.pink2, C.white, C.purple]), shape: pick(['star', 'dot']), rot: rand(0, 6), vr: rand(-4, 4), gravity: 120, drag: 1 });
    }

    for (let i = rings.length - 1; i >= 0; i--) {
      const r = rings[i];
      r.life += dt;
      if (r.life < 0) continue;
      const p = r.life / r.dur;
      if (p >= 1) { rings.splice(i, 1); continue; }
      const e = 1 - Math.pow(1 - p, 3);
      fx.globalAlpha = 1 - p;
      fx.strokeStyle = r.color; fx.lineWidth = r.width * (1 - p) + 1;
      fx.shadowColor = r.color; fx.shadowBlur = 20;
      fx.beginPath(); fx.arc(r.x, r.y, r.max * e, 0, Math.PI * 2); fx.stroke();
    }
    fx.shadowBlur = 0;

    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.life += dt;
      if (p.life >= p.max || p.y > FH + 40) { parts.splice(i, 1); continue; }
      p.vx *= p.drag; p.vy = p.vy * p.drag + p.gravity * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
      const f = 1 - p.life / p.max;
      fx.globalAlpha = Math.min(1, f * 1.5);
      if (p.shape === 'dot') {
        const s = p.size * 3;
        fx.drawImage(glow(p.color), p.x - s, p.y - s, s * 2, s * 2);
      } else if (p.shape === 'star') {
        fx.save(); fx.translate(p.x, p.y); fx.rotate(p.rot);
        fx.fillStyle = p.color; starPath(fx, p.size * 1.6); fx.fill();
        fx.fillStyle = '#fff'; starPath(fx, p.size * 0.7); fx.fill();
        fx.restore();
      } else {
        const sp = Math.hypot(p.vx, p.vy) || 1, len = Math.min(26, sp * 0.04) + p.size;
        fx.strokeStyle = p.color; fx.lineWidth = p.size * 0.6; fx.lineCap = 'round';
        fx.beginPath(); fx.moveTo(p.x, p.y); fx.lineTo(p.x - p.vx / sp * len, p.y - p.vy / sp * len); fx.stroke();
      }
    }
    // Sterne, die zum Zähler fliegen (gold) oder aus ihm heraus verglühen (rot)
    for (let i = flyers.length - 1; i >= 0; i--) {
      const f = flyers[i];
      f.t += dt;
      if (f.t < 0) continue;
      if (!f.started) { f.started = true; f.onStart && f.onStart(); }
      const p = Math.min(1, f.t / f.dur);
      const POP = 0.28;
      let x, y, sc;
      if (p < POP) {            // 1. rausploppen
        const q = 1 - Math.pow(1 - p / POP, 3);
        x = f.sx + (f.px - f.sx) * q; y = f.sy + (f.py - f.sy) * q;
        sc = 0.3 + 1.3 * q;
      } else {                  // 2. im Bogen zum Ziel
        const q = (p - POP) / (1 - POP), e = q * q * (3 - 2 * q);
        x = (1 - e) * (1 - e) * f.px + 2 * (1 - e) * e * f.cx + e * e * f.tx;
        y = (1 - e) * (1 - e) * f.py + 2 * (1 - e) * e * f.cy + e * e * f.ty;
        sc = f.loss ? 1.6 - 1.2 * e : 1.6 - 0.8 * e;
      }
      f.trail.push([x, y]); if (f.trail.length > 16) f.trail.shift();
      const trailCol = f.loss ? '#ff5a2c' : '#ffc93c';
      f.trail.forEach(([qx, qy], k) => {
        fx.globalAlpha = (k + 1) / f.trail.length * 0.75;
        const s = (2 + k * 0.9) * sc;
        fx.drawImage(glow(trailCol), qx - s, qy - s, s * 2, s * 2);
      });
      // Funken bzw. Glut, die vom Stern abfallen
      if (Math.random() < 0.7) parts.push({ x, y, vx: rand(-60, 60), vy: f.loss ? rand(-20, 60) : rand(-60, 60), life: 0, max: rand(0.3, 0.7), size: rand(1.5, 3), color: f.loss ? pick(['#ff2d55', '#ff8a00', '#ffd24a']) : pick(['#ffe58a', '#fff', '#ffd24a']), shape: f.loss ? 'dot' : pick(['dot', 'star']), rot: 0, vr: 4, gravity: f.loss ? 400 : 0, drag: 0.96 });
      fx.globalAlpha = 1;
      fx.save(); fx.translate(x, y); fx.rotate(f.t * (f.loss ? -10 : 7));
      const S = 13 * sc;
      fx.drawImage(glow(f.loss ? '#ff2d55' : '#ffd24a'), -S * 3, -S * 3, S * 6, S * 6);
      fx.fillStyle = f.loss ? '#ff5a3c' : '#ffe58a'; starPath(fx, S); fx.fill();
      fx.fillStyle = f.loss ? '#ffd0a0' : '#ffffff'; starPath(fx, S * 0.45); fx.fill();
      fx.restore();
      if (p >= 1) { flyers.splice(i, 1); f.done(); }
    }
    fx.globalAlpha = 1;
    requestAnimationFrame(fxLoop);
  }

  function flash(color, opacity = 0.5, ms = 500) {
    const el = $('flash');
    el.style.background = `radial-gradient(circle at 50% 45%, ${color}, transparent 75%)`;
    el.animate([{ opacity }, { opacity: 0 }], { duration: ms, easing: 'ease-out' });
  }
  // Effekt-Schriftzug: jeder Buchstabe ist ein eigenes Element, damit er einzeln animiert werden kann
  let glintTimers = [];
  function banner(text, kind, sub = '', opts = {}) {
    const el = $('banner');
    glintTimers.forEach(clearTimeout); glintTimers = [];
    el.className = 'banner ' + kind;
    el.innerHTML = '';
    const lines = text.split('\n');
    const words = [];
    let idx = 0;
    lines.forEach(line => {
      const word = document.createElement('div');
      word.className = 'word';
      [...line].forEach(ch => {
        const s = document.createElement('span');
        s.className = 'ch' + (ch === ' ' ? ' sp' : '');
        s.textContent = ch === ' ' ? '\u00a0' : ch;
        s.dataset.ch = ch === ' ' ? '' : ch;
        s.style.setProperty('--i', idx++);
        s.style.setProperty('--r', (Math.random() * 0.45).toFixed(2));
        s.style.setProperty('--rot', `${Math.round(rand(-25, 25))}deg`);
        word.appendChild(s);
      });
      el.appendChild(word);
      words.push(word);
    });
    // zu breite Schriftzüge verkleinern, damit sie auf den Bildschirm passen
    words.forEach(w => { w.style.fontSize = ''; });
    const widest = Math.max(...words.map(w => w.scrollWidth));
    if (widest > innerWidth * 0.94) {
      const f = parseFloat(getComputedStyle(words[0]).fontSize) * (innerWidth * 0.94) / widest;
      words.forEach(w => { w.style.fontSize = f + 'px'; });
    }
    if (sub) {
      const d = document.createElement('div');
      d.className = 'sub'; d.textContent = sub;
      el.appendChild(d);
    }
    void el.offsetWidth;
    el.classList.add('show');
    const lifeMs = parseFloat(getComputedStyle(el).animationDuration) * 1000 || 1900;
    const gone = wait(lifeMs);
    // Glitzer-Blitze auf den Buchstaben
    const isWin = /\bwin\b/.test(kind);
    if (isWin || kind === 'nova') {
      const n = isWin ? (opts.glints || 9) : 5;
      for (let k = 0; k < n; k++) {
        glintTimers.push(setTimeout(() => {
          const letters = words.flatMap(w => [...w.children]).filter(c => !c.classList.contains('sp'));
          const L = pick(letters);
          if (!L) return;
          const g = document.createElement('span');
          g.className = 'glint';
          g.style.left = (L.offsetLeft + L.offsetWidth * rand(0.2, 0.8)) + 'px';
          g.style.top = (L.offsetTop + L.offsetHeight * rand(0.15, 0.5)) + 'px';
          el.appendChild(g);
          setTimeout(() => g.remove(), 1000);
        }, 450 + k * (isWin ? 230 : 160)));
      }
    }
    return gone;
  }

  function frameAnim(cls, ms) {
    frameEl.classList.remove(cls); void frameEl.offsetWidth; frameEl.classList.add(cls);
    setTimeout(() => frameEl.classList.remove(cls), ms);
  }
  function party(ms) { frameEl.classList.add('party'); setTimeout(() => frameEl.classList.remove('party'), ms); }
  const center = el => { const b = el.getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2]; };

  let toastTimer;
  function toast(msg, ms = 1400) {
    const el = $('toast');
    el.textContent = msg; el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), ms);
  }

  // ------------------------------------------------------------------
  //  Die Effekt-Stufen
  // ------------------------------------------------------------------
  // Pro Kachel beim Umdrehen
  function tileFx(tile, state, i) {
    const [x, y] = center(tile);
    if (state === 'correct') {
      burst(x, y, { count: 18, colors: [C.cyan, C.cyan2, C.white], speed: 260, size: 3.5 });
      ring(x, y, { color: C.cyan, max: 60, width: 4, life: 0.5 });
      sfx.correct(i);
    } else if (state === 'present') {
      burst(x, y, { count: 9, colors: [C.pink, C.pink2, C.white], speed: 160, size: 3, shapes: ['dot', 'star'] });
      sfx.present(i);
    } else {
      burst(x, y, { count: 6, colors: ['#4a3a66', '#2a1f40'], speed: 60, size: 3, shapes: ['dot'], gravity: 200, life: 0.6 });
      sfx.absent();
    }
  }

  // Nach der ganzen Reihe – je nach Treffer
  function rowFx(r, states) {
    const greens = states.filter(s => s === 'correct').length;
    const yellows = states.filter(s => s === 'present').length;
    const [bx, by] = center(boardEl);
    const [rx, ry] = center(rows[r]);
    const greenTiles = tiles[r].filter((_, i) => states[i] === 'correct');

    if (greens >= 3) {
      // ★★★ SEHR STARK: Supernova
      const big = greens === 4;
      sfx.strong();
      flash('#ffffff', 0.75, 260);
      setTimeout(() => flash(C.cyan, 0.45, 900), 120);
      space().pulse(1, C.cyan);
      frameAnim('boom', 600); party(2200);
      burst(rx, ry, { count: big ? 260 : 180, colors: [C.cyan, C.cyan2, C.white, C.pink2, C.purple], speed: big ? 1100 : 850, size: 5, life: 1.6, drag: 0.975 });
      [0, 0.12, 0.26, 0.42].forEach((d, k) => ring(rx, ry, { color: k % 2 ? C.pink : C.cyan, max: Math.max(FW, FH) * (0.4 + k * 0.15), width: 10 - k * 2, life: 1, delay: d }));
      greenTiles.forEach((t, k) => setTimeout(() => { const [x, y] = center(t); burst(x, y, { count: 40, colors: [C.white, C.cyan2], speed: 500, size: 4, shapes: ['star'] }); }, 150 + k * 90));
      return banner(big ? 'HYPERNOVA!!' : 'SUPERNOVA!', 'nova', `${greens} STARS ALIGNED`);
    } else if (greens >= 1) {
      // ★★ MITTEL: Komet
      sfx.medium();
      flash(C.cyan, 0.2, 500);
      space().pulse(0.5, C.cyan);
      frameAnim('boom', 600); party(900);
      greenTiles.forEach(t => { const [x, y] = center(t); burst(x, y, { count: 45, colors: [C.cyan, C.cyan2, C.white], speed: 480, size: 4.5, life: 1.1 }); ring(x, y, { color: C.cyan2, max: 140, width: 5, life: 0.8 }); });
      if (yellows) tiles[r].forEach((t, i) => { if (states[i] === 'present') { const [x, y] = center(t); burst(x, y, { count: 14, colors: [C.pink, C.pink2], speed: 220, size: 3 }); } });
      return banner(greens === 2 ? 'SHOOTING STAR' : 'SPARK!', 'spark');
    } else if (yellows >= 1) {
      // ★ SCHWACH: kurzes Glitzern
      sfx.weak();
      space().pulse(0.22, C.pink);
      tiles[r].forEach((t, i) => { if (states[i] === 'present') { const [x, y] = center(t); burst(x, y, { count: 16, colors: [C.pink, C.pink2, C.white], speed: 200, size: 3, shapes: ['star', 'dot'], life: 0.9 }); } });
      ring(rx, ry, { color: C.pink, max: 180, width: 3, life: 0.7 });
      return wait(300);
    } else {
      // ✖ NEGATIV: Schwarzes Loch
      sfx.bad();
      flash(C.red, 0.4, 700);
      space().gloom(1);
      rows[r].classList.remove('dud'); void rows[r].offsetWidth; rows[r].classList.add('dud');
      frameAnim('quake', 500);
      implode(rx, ry, { radius: Math.max(220, rows[r].offsetWidth) });
      tiles[r].forEach(t => { const [x, y] = center(t); burst(x, y, { count: 10, colors: ['#3a2a55', '#5a3a6a', '#2a1530'], speed: 120, size: 4, shapes: ['dot', 'spark'], gravity: 600, life: 1, dir: Math.PI / 2, spread: 1.8 }); });
      return banner('BLACK HOLE', 'bad', 'NO MATCHES');
    }
  }

  // ------------------------------------------------------------------
  //  STERNE
  // ------------------------------------------------------------------
  const hud = $('hud');
  const SOLVE_BONUS = [20, 15, 10, 5, 2, 0];

  // ---------- 3D-Stern aus Schichten bauen ----------
  (() => {
    const spin = $('starSpin');
    const L = 9;
    for (let i = 0; i < L; i++) {
      const d = document.createElement('div');
      const z = (i - (L - 1) / 2) * 1.1;
      d.className = 'layer' + (i === 0 || i === L - 1 ? ' face' : '');
      d.style.setProperty('--z', z + 'px');
      if (i === 0) d.style.transform = `translateZ(${z}px) rotateY(180deg)`; // Rückseite
      spin.appendChild(d);
    }
  })();

  // ---------- Rang-Anzeige ----------
  const METER_MAX = 34;
  const TIERS = [
    { key: 'stinky', at: 0, label: 'STINKY<br>WIN', color: '#ff6ad5' },
    { key: 'poopy', at: 16, label: 'STINKY<br>POOPY WIN', color: '#5ff3ff' },
    { key: 'legendary', at: 23, label: 'LEGENDARY<br>STINKY WIN', color: '#ffd24a' },
  ];
  const pct = v => Math.max(0, Math.min(1, v / METER_MAX)) * 100;
  const tierEls = TIERS.map(t => {
    const el = document.createElement('div');
    el.className = 'tier';
    el.style.setProperty('--tc', t.color);
    el.textContent = `★ ${t.at}`;
    $('tiers').appendChild(el);
    if (t.at > 0) {
      const m = document.createElement('div');
      m.className = 'mark'; m.dataset.at = t.at;
      $('marks').appendChild(m);
    }
    return el;
  });
  const tierIndex = v => { let i = -1; TIERS.forEach((t, k) => { if (v >= t.at) i = k; }); return i; };
  let lastTier = 0;
  // Auf dem Handy liegt der Balken quer über dem Spielfeld, am Computer hochkant links daneben
  const horiz = () => matchMedia('(max-width: 600px)').matches;
  function placeMeter() {
    const h = horiz();
    tierEls.forEach((el, k) => { const p = pct(TIERS[k].at) + '%'; el.style.bottom = h ? '' : p; el.style.left = h ? p : ''; });
    document.querySelectorAll('.mark').forEach(m => { const p = pct(+m.dataset.at) + '%'; m.style.bottom = h ? '' : p; m.style.left = h ? p : ''; });
  }
  function setLen(el, v) { if (horiz()) { el.style.width = v; el.style.height = ''; } else { el.style.height = v; el.style.width = ''; } }
  function updateMeter(celebrate = false) {
    const bar = $('bar');
    placeMeter();
    $('fill').style.setProperty('--barH', bar.clientHeight + 'px');
    $('fill').style.setProperty('--barW', bar.clientWidth + 'px');
    setLen($('fill'), pct(shownStars) + '%');
    $('meter').classList.toggle('neg', shownStars < 0);
    // Vorschau: so weit käme man, wenn man im nächsten Versuch löst
    const potential = over ? shownStars : Math.max(0, stars) + (COLS - knownGreen.size) * 2 + 3 + (SOLVE_BONUS[row] ?? 0);
    setLen($('ghost'), pct(potential) + '%');
    const ti = tierIndex(shownStars);
    tierEls.forEach((el, k) => { el.classList.toggle('reached', k <= ti); el.classList.toggle('current', k === ti); });
    if (celebrate && ti > lastTier && ti >= 1) rankUp(ti);
    lastTier = Math.max(ti, 0);
  }
  function rankUp(ti) {
    const el = tierEls[ti];
    el.classList.remove('rankup'); void el.offsetWidth; el.classList.add('rankup');
    const [x, y] = center(el);
    burst(x + 40, y, { count: 40, colors: [TIERS[ti].color, C.white, '#ffd24a'], speed: 320, size: 4, life: 1, shapes: ['star', 'dot'] });
    ring(x + 40, y, { color: TIERS[ti].color, max: 90, width: 5, life: 0.7 });
    floatLabel('RANK UP!', Math.max(130, x + 20), y - 40, 'plus', TIERS[ti].label.replace('<br>', ' '));
    [0, 4, 7, 12].forEach((n, k) => tone(N(84 + n), 0.3, { type: 'triangle', vol: 0.08, when: k * 0.07 }));
  }

  function setCount(n) { shownStars = n; $('starCount').textContent = n; hud.classList.toggle('neg', n < 0); updateMeter(true); }
  function hudAnim(cls) { hud.classList.remove('gain', 'loss'); void hud.offsetWidth; hud.classList.add(cls); }

  function floatLabel(text, x, y, kind, small = '') {
    const el = document.createElement('div');
    el.className = 'float-label ' + kind;
    el.innerHTML = text + (small ? `<small>${small}</small>` : '');
    el.style.left = x + 'px'; el.style.top = y + 'px';
    document.body.appendChild(el);
    el.animate([
      { transform: 'translate(-50%, -50%) scale(.4)', opacity: 0 },
      { transform: 'translate(-50%, -70%) scale(1.15)', opacity: 1, offset: 0.2 },
      { transform: 'translate(-50%, -90%) scale(1)', opacity: 1, offset: 0.75 },
      { transform: 'translate(-50%, -130%) scale(.9)', opacity: 0 },
    ], { duration: 1500, easing: 'ease-out' }).onfinish = () => el.remove();
  }

  // Sterne ploppen aus den Kacheln und fliegen zum Zähler
  function gainStars(n, sources, label = '', delay = 0) {
    if (n <= 0) return Promise.resolve();
    stars += n;
    const [tx, ty] = center($('hudStar'));
    const srcs = sources.length ? sources : [rows[Math.max(0, row - 1)]];
    const [lx, ly] = center(srcs[srcs.length - 1]);
    setTimeout(() => floatLabel(`+${n} ★`, Math.min(FW - 90, lx + 90), ly, 'plus', label), delay);
    const stagger = Math.max(30, Math.min(90, 900 / n));
    return new Promise(res => {
      let left = n;
      for (let k = 0; k < n; k++) {
        const [sx, sy] = center(srcs[k % srcs.length]);
        const a = rand(0, Math.PI * 2), d = rand(50, 110);
        const px = sx + Math.cos(a) * d, py = sy + Math.sin(a) * d - 30;
        flyers.push({
          sx, sy, px, py, tx, ty,
          cx: (px + tx) / 2 + rand(-200, 200), cy: Math.min(py, ty) - rand(60, 200),
          t: -(delay + k * stagger) / 1000, dur: rand(1.05, 1.3), trail: [],
          onStart: () => { tone(N(96 + (k % 5) * 2), 0.12, { vol: 0.03 }); burst(sx, sy, { count: 5, colors: ['#ffe58a', '#fff'], speed: 120, size: 2.5, life: 0.4, shapes: ['star'] }); },
          done: () => {
            setCount(shownStars + 1); hudAnim('gain'); sfx.starTick(k);
            burst(tx, ty, { count: 14, colors: ['#ffe58a', '#ffd24a', C.white], speed: 220, size: 3.5, life: 0.6, shapes: ['star', 'dot'] });
            ring(tx, ty, { color: '#ffd24a', max: 46, width: 4, life: 0.4 });
            if (--left === 0) res();
          },
        });
      }
    });
  }

  // Sterne werden aus dem Zähler gerissen und verglühen im schwarzen Loch
  function loseStars(n, r) {
    stars -= n;
    const [rx, ry] = center(rows[r]);
    const [hx, hy] = center($('hudStar'));
    floatLabel(`−${n} ★`, Math.min(FW - 90, rx + 90), ry, 'minus');
    for (let k = 0; k < n; k++) {
      const a = rand(Math.PI * 0.2, Math.PI * 0.8), d = rand(60, 100);
      const px = hx + Math.cos(a) * d, py = hy + Math.sin(a) * d;
      flyers.push({
        loss: true, sx: hx, sy: hy, px, py, tx: rx + rand(-30, 30), ty: ry,
        cx: (px + rx) / 2 + rand(-120, 120), cy: Math.max(py, ry) + rand(20, 120),
        t: -(250 + k * 260) / 1000, dur: 1.2, trail: [],
        onStart: () => {
          setCount(shownStars - 1); hudAnim('loss');
          tone(700, 0.5, { type: 'sawtooth', vol: 0.05, slide: 90 });
          burst(hx, hy, { count: 16, colors: ['#ff2d55', '#ff8a00', '#ffd24a'], speed: 200, size: 3, life: 0.6, gravity: 300 });
          ring(hx, hy, { color: '#ff2d55', max: 50, width: 4, life: 0.4 });
        },
        done: () => {},
      });
      const f = flyers[flyers.length - 1];
      f.done = () => {
        burst(f.tx, f.ty, { count: 24, colors: ['#3a1a2a', '#5a2030', '#ff2d55', '#ff8a00'], speed: 180, size: 3.5, life: 0.8, gravity: 300, shapes: ['dot', 'spark'] });
        noise(0.25, { vol: 0.08, from: 800, to: 150 });
      };
    }
  }

  // Sterne für eine Reihe berechnen
  function scoreRow(states) {
    const greens = states.filter(s => s === 'correct').length;
    const yellows = states.filter(s => s === 'present').length;
    if (!greens && !yellows) return { delta: -2, newIdx: [] };
    const newIdx = [];
    states.forEach((s, i) => { if (s === 'correct' && !knownGreen.has(i)) { newIdx.push(i); knownGreen.add(i); } });
    const base = newIdx.length * 2, bonus = greens >= 3 ? 3 : 0;
    return { delta: base + bonus, base, bonus, newIdx };
  }

  const RANKS = {
    legendary: { title: 'LEGENDARY\nSTINKY WIN' },
    poopy:     { title: 'STINKY POOPY\nWIN' },
    stinky:    { title: 'STINKY WIN' },
    cheesy:    { title: 'CHEESY\nBUTCRACK' },
    constipated: { title: 'CONSTIPATED' },
  };
  function rankFor(solvedRow) {
    if (solvedRow === ROWS - 1) return 'cheesy';           // mit Glück im letzten Versuch
    return TIERS[Math.max(0, tierIndex(stars))].key;
  }

  function fireworks(n, every, start = 0, big = false) {
    for (let k = 0; k < n; k++) {
      setTimeout(() => {
        const x = rand(FW * 0.08, FW * 0.92), y = rand(FH * 0.08, FH * 0.6);
        const col = pick([C.cyan, C.pink, C.purple, C.cyan2, '#ffd24a']);
        burst(x, y, { count: big ? 110 : 70, colors: [col, C.white], speed: big ? 560 : 420, size: big ? 5 : 4, gravity: 220, life: 1.5, shapes: ['dot', 'star', 'spark'] });
        ring(x, y, { color: col, max: big ? 180 : 120, width: 4, life: 0.6 });
        tone(N(84 + (k * 7) % 12), 0.3, { vol: 0.05 });
      }, start + k * every);
    }
  }
  function shootingStar() {
    let x = -40, y = FH * rand(0.12, 0.3);
    const vx = FW / 1.1, vy = FH * 0.12;
    const iv = setInterval(() => {
      x += vx * 0.03; y += vy * 0.03;
      burst(x, y, { count: 5, colors: ['#ffe58a', C.white, C.cyan2], speed: 60, size: 3, life: 0.7, shapes: ['dot', 'star'] });
      if (x > FW + 40) clearInterval(iv);
    }, 30);
  }

  // Das Finale – je besser der Rang, desto krasser
  async function finale(rk, r) {
    const R = RANKS[rk];
    const sub = `★ ${stars} STARS`;
    const [rx, ry] = center(rows[Math.min(r, ROWS - 1)]);
    if (rk === 'legendary') {
      sfx.win(); setTimeout(() => sfx.strong(), 1600);
      flash('#ffffff', 0.95, 400);
      setTimeout(() => flash(C.cyan, 0.5, 1000), 200);
      setTimeout(() => flash(C.pink, 0.5, 1000), 1400);
      for (let k = 0; k < 6; k++) setTimeout(() => space().pulse(1, k % 2 ? C.pink : C.cyan), k * 800);
      frameAnim('boom', 600); party(8000);
      burst(rx, ry, { count: 480, colors: [C.cyan, C.cyan2, C.white, C.pink, C.pink2, C.purple, '#ffd24a'], speed: 1600, size: 6, life: 2.2, drag: 0.975 });
      for (let k = 0; k < 9; k++) ring(rx, ry, { color: [C.cyan, C.pink, C.purple, '#ffd24a'][k % 4], max: Math.max(FW, FH) * 0.9, width: 14, life: 1.4, delay: k * 0.18 });
      banner(R.title, 'win gold', sub, { glints: 18 });   // gold wie in der Anzeige
      rain = 7;
      tiles[r].forEach((t, i) => setTimeout(() => t.classList.add('win'), i * 100));
      fireworks(26, 210, 400, true);
      await wait(5600);
    } else if (rk === 'poopy') {
      sfx.win();
      flash('#ffffff', 0.85, 300);
      setTimeout(() => flash(C.pink, 0.4, 1000), 150);
      space().pulse(1, C.pink); setTimeout(() => space().pulse(1, C.cyan), 1200);
      frameAnim('boom', 600); party(5000);
      burst(rx, ry, { count: 300, colors: [C.cyan, C.cyan2, C.white, C.pink, C.pink2, C.purple], speed: 1250, size: 5.5, life: 2, drag: 0.975 });
      [0, 0.15, 0.3, 0.5, 0.7].forEach((d, k) => ring(rx, ry, { color: [C.cyan, C.pink, C.purple][k % 3], max: Math.max(FW, FH) * 0.8, width: 12, life: 1.3, delay: d }));
      banner(R.title, 'win cyan', sub);                   // türkis wie in der Anzeige
      rain = 3.5;
      tiles[r].forEach((t, i) => setTimeout(() => t.classList.add('win'), i * 100));
      fireworks(12, 230, 500);
      await wait(3400);
    } else if (rk === 'stinky') {
      sfx.medium();
      flash(C.pink, 0.35, 600);
      space().pulse(0.6, C.pink);
      frameAnim('boom', 600); party(2500);
      burst(rx, ry, { count: 130, colors: [C.pink, C.pink2, C.white, C.cyan2], speed: 750, size: 4.5, life: 1.4 });
      ring(rx, ry, { color: C.pink, max: 400, width: 8, life: 1 });
      ring(rx, ry, { color: C.cyan, max: 300, width: 6, life: 1, delay: 0.15 });
      banner(R.title, 'win pink', sub);                   // pink wie in der Anzeige
      tiles[r].forEach((t, i) => setTimeout(() => t.classList.add('win'), i * 100));
      fireworks(5, 300, 400);
      await wait(2600);
    } else if (rk === 'cheesy') {
      sfx.cheesy();
      space().pulse(0.25, '#ffd24a');
      shootingStar();
      burst(rx, ry, { count: 30, colors: ['#ffe58a', C.white, C.pink2], speed: 260, size: 3.5, life: 1, shapes: ['star', 'dot'] });
      banner(R.title, 'spark', 'PHEW… JUST MADE IT');
      tiles[r].forEach((t, i) => setTimeout(() => t.classList.add('win'), i * 100));
      await wait(2300);
    } else {
      // constipated: das ganze Spielfeld wird eingesogen
      sfx.bad(); setTimeout(() => sfx.lose(), 500);
      space().gloom(1); setTimeout(() => space().gloom(1), 900);
      flash(C.red, 0.45, 900);
      const [bx, by] = center(boardEl);
      frameEl.classList.add('suck');
      implode(bx, by, { count: 160, radius: Math.max(FW, FH) * 0.5, life: 1.4 });
      banner(R.title, 'bad', sub);
      await wait(2300);
    }
    showEnd(R.title, answer, stars, { legendary: 'gold', poopy: 'cyan', stinky: 'pink' }[rk] || '');
  }

  function showEnd(title, word, n, tone = '') {
    $('endTitle').innerHTML = title.split('\n').map(l => `<span class="chrome ${tone}" data-text="${l}">${l}</span>`).join('<br>');
    $('endStars').textContent = `★ ${n} STARS`;
    $('endWord').textContent = word.toUpperCase();
    $('endcard').classList.add('show');
  }

  // ------------------------------------------------------------------
  //  Spiellogik
  // ------------------------------------------------------------------
  function evaluate(guess, target) {
    const res = Array(COLS).fill('absent');
    const left = {};
    for (let i = 0; i < COLS; i++) {
      if (guess[i] === target[i]) res[i] = 'correct';
      else left[target[i]] = (left[target[i]] || 0) + 1;
    }
    for (let i = 0; i < COLS; i++) {
      if (res[i] !== 'correct' && left[guess[i]]) { res[i] = 'present'; left[guess[i]]--; }
    }
    return res;
  }

  const rank = { absent: 1, present: 2, correct: 3 };
  function paintKey(letter, state) {
    const el = keyEls[letter];
    const cur = el.dataset.state;
    if (!cur || rank[state] > rank[cur]) {
      el.classList.remove('absent', 'present', 'correct');
      el.classList.add(state);
      el.dataset.state = state;
    }
  }

  function setActiveRow() { rows.forEach((r, i) => r.classList.toggle('active', i === row && !over)); if (typeof updateMeter === 'function') updateMeter(); }

  function handleKey(k) {
    audio();
    if (over) { if (k === 'enter' && $('endcard').classList.contains('show')) newGame(); return; }
    if (busy) return;
    if (k === 'enter') return submit();
    if (k === 'back') {
      if (col > 0) { col--; grid[row][col] = ''; const t = tiles[row][col]; t.textContent = ''; t.classList.remove('filled'); sfx.back(); }
      return;
    }
    if (/^[a-z]$/.test(k) && col < COLS) {
      grid[row][col] = k;
      const t = tiles[row][col];
      t.textContent = k;
      t.classList.remove('filled'); void t.offsetWidth; t.classList.add('filled');
      col++;
      sfx.type();
    }
  }

  async function submit() {
    if (col < COLS) { invalid('Not enough letters'); return; }
    const guess = grid[row].join('');
    if (!VALID.has(guess)) { invalid('Not in word list'); return; }

    busy = true;
    const r = row;
    const states = evaluate(guess, answer);
    // Kacheln nacheinander umdrehen
    for (let i = 0; i < COLS; i++) {
      const t = tiles[r][i];
      t.classList.add('flip');
      await wait(280);
      t.classList.remove('filled');
      t.classList.add(states[i]);
      tileFx(t, states[i], i);
      paintKey(guess[i], states[i]);
      await wait(120);
    }
    await wait(250);
    tiles[r].forEach(t => t.classList.remove('flip'));

    const won = states.every(s => s === 'correct');
    const sc = scoreRow(states);
    const greenSrc = sc.newIdx.map(i => tiles[r][i]);
    row++; col = 0;
    if (won) {
      over = true; setActiveRow();
      await gainStars(sc.delta, greenSrc.length ? greenSrc : tiles[r], sc.bonus ? '3+ BONUS' : '');
      const sb = SOLVE_BONUS[r];
      if (sb) await gainStars(sb, tiles[r], `SOLVED IN ${r + 1}`, 150);
      await wait(250);
      await finale(rankFor(r), r);
    } else {
      // Sterne erst, wenn der Schriftzug verschwunden ist – läuft nebenher, man kann weitertippen
      const starsDone = rowFx(r, states).then(() => {
        if (sc.delta < 0) { loseStars(-sc.delta, r); return wait(250 + -sc.delta * 260 + 1300); }
        return gainStars(sc.delta, greenSrc, sc.bonus ? '3+ BONUS' : '');
      });
      if (row === ROWS) {
        over = true; setActiveRow();
        await starsDone;
        await wait(300);
        await finale('constipated', r);
      } else setActiveRow();
    }
    busy = false;
  }

  function invalid(msg) {
    toast(msg);
    sfx.invalid();
    const r = rows[row];
    r.classList.remove('invalid'); void r.offsetWidth; r.classList.add('invalid');
  }

  function newGame() {
    lastAnswer = answer;
    answer = chooseAnswer();
    row = 0; col = 0; over = false; busy = false;
    grid = Array.from({ length: ROWS }, () => Array(COLS).fill(''));
    tiles.flat().forEach(t => { t.className = 'tile'; t.textContent = ''; });
    rows.forEach(r => r.classList.remove('dud', 'invalid'));
    Object.values(keyEls).forEach(k => { k.classList.remove('absent', 'present', 'correct'); delete k.dataset.state; });
    $('endcard').classList.remove('show');
    frameEl.classList.remove('suck');
    stars = 0; knownGreen = new Set(); lastTier = 0; setCount(0); hud.classList.remove('gain', 'loss');
    setActiveRow();
  }

  // ------------------------------------------------------------------
  //  Eingabe
  // ------------------------------------------------------------------
  addEventListener('keydown', e => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    let k = e.key.toLowerCase();
    if (k === 'backspace') k = 'back';
    if (k !== 'enter' && k !== 'back' && !/^[a-z]$/.test(k)) return;
    e.preventDefault();
    const el = keyEls[k];
    if (el) { el.classList.add('pressed'); setTimeout(() => el.classList.remove('pressed'), 100); }
    handleKey(k);
  });
  $('again').addEventListener('click', () => { audio(); newGame(); });

  addEventListener('resize', () => { resizeFx(); layoutBulbs(); updateMeter(); });

  resizeFx();
  requestAnimationFrame(fxLoop);
  newGame();
  // Lauflichter erst setzen, wenn die Schrift geladen ist (sonst falsche Größe)
  (document.fonts ? document.fonts.ready : Promise.resolve()).then(layoutBulbs);
  layoutBulbs();
})();
