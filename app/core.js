// Core: storage, teams, screens, scoreboard, modals, sound, confetti.
const TEAM_COLORS = ['#ff3d8b', '#2f7bff', '#f5a300', '#1fb866', '#9b5bff', '#ff7a1f', '#0fb5c9', '#e0303f', '#72b51c', '#c0399f'];
const MAX_TEAMS = TEAM_COLORS.length;
const DEFAULT_TEAM_NAMES = ['Red Rockets', 'Blue Thunder', 'Golden Geese', 'Green Machine', 'Purple Pandas', 'Orange Crush', 'Teal Titans', 'Ruby Rebels', 'Lime Lightning', 'Berry Blasters'];

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const fmt = n => Number(n).toLocaleString();

const App = {
  data: null,        // { trivia:[], board:[], wheel:[], teams:[], settings:{} }
  screens: {},
  cleanup: null,
  current: null,

  async start() {
    let d = null;
    try { d = window.api ? await window.api.loadData() : JSON.parse(localStorage.getItem('gss-data') || 'null'); } catch (e) { d = null; }
    const fresh = !d || !Array.isArray(d.trivia);
    if (fresh) d = GSData.starterData();
    d.teams ||= [0, 1, 2].map(i => ({ id: GSData.uid(), name: DEFAULT_TEAM_NAMES[i], color: TEAM_COLORS[i], score: 0 }));
    d.settings = Object.assign({ sound: true, triviaPoints: 100, speedBonus: true, boardDeduct: true, vowelCost: 250 }, d.settings || {});
    this.data = d;
    const added = this.applyPacks();
    this.save(true);

    $('#homeLink').onclick = () => this.leaveGame();
    $('#fsBtn').onclick = () => this.toggleFullscreen();
    $('#soundBtn').onclick = () => { d.settings.sound = !d.settings.sound; this.save(); this.syncSoundBtn(); };
    this.syncSoundBtn();
    document.addEventListener('keydown', e => {
      if (e.key === 'F11') { e.preventDefault(); this.toggleFullscreen(); }
      if (e.key === 'Escape' && Modal.stack.length) Modal.stack[Modal.stack.length - 1].close();
      // ← / → move through a game (not while typing or in a pop-up)
      if (this.nav && !Modal.stack.length && !/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) {
        if (e.key === 'ArrowLeft' && this.nav.backOn) { e.preventDefault(); this.nav.back(); }
        if (e.key === 'ArrowRight' && this.nav.nextOn) { e.preventDefault(); this.nav.next(); }
      }
    });
    this.show('home');
    if (added.length && !fresh) { // first-time visitors just get everything, no pop-up
      Modal.open({
        title: '🎉 New questions added!',
        body: `<div style="font-size:19px;line-height:1.6">${added.map(a => `<div>📦 <b>${esc(a.name)}</b> — ${a.summary}</div>`).join('')}</div>
               <p class="hint" style="margin-top:14px">They're mixed in with your own questions, which weren't changed. Find them in the Question Manager.</p>`,
        actions: [{ label: 'Awesome!', cls: 'pink' }],
      });
    }
  },

  // Question packs (app/packs.js) are added to saved data once each.
  applyPacks() {
    const d = this.data, added = [];
    d.packsApplied ||= [];
    (window.GS_PACKS || []).forEach(p => {
      if (d.packsApplied.includes(p.id)) return;
      const parts = [];
      [['trivia', 'parseTrivia', 'trivia question'], ['board', 'parseBoard', 'board clue'], ['wheel', 'parseWheel', 'puzzle']].forEach(([k, fn, noun]) => {
        if (!p[k]) return;
        const r = GSData[fn](p[k]);
        if (r.problems.length) console.warn('Pack', p.id, k, r.problems);
        d[k].push(...r.items);
        if (r.items.length) parts.push(`${r.items.length} ${noun}${r.items.length === 1 ? '' : 's'}`);
      });
      d.packsApplied.push(p.id);
      added.push({ name: p.name, summary: parts.join(', ') });
    });
    return added;
  },

  save(now) {
    clearTimeout(this._saveT);
    const write = () => {
      try {
        if (window.api) window.api.saveData(this.data);
        else localStorage.setItem('gss-data', JSON.stringify(this.data));
      } catch (e) { toast('Could not save: ' + e.message, true); }
    };
    if (now) write(); else this._saveT = setTimeout(write, 250);
  },

  syncSoundBtn() { $('#soundBtn').textContent = this.data.settings.sound ? '🔊' : '🔇'; },
  async toggleFullscreen() {
    if (window.api) return window.api.toggleFullscreen();
    if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.();
  },

  show(name, ...args) {
    if (this.cleanup) { try { this.cleanup(); } catch (e) {} this.cleanup = null; }
    this.current = name;
    const el = $('#screen');
    el.innerHTML = '';
    el.scrollTop = 0;
    $('#topActions').innerHTML = '';
    this.inGame = false;
    this.nav = null;
    const r = this.screens[name](el, ...args);
    if (typeof r === 'function') this.cleanup = r;
    Scores.render();
  },

  // Leaving a game mid-way asks first.
  async leaveGame() {
    if (this.inGame && !(await confirmBox('Leave this game and go back to the home screen? Team scores are kept.', 'Go home'))) return;
    this.show('home');
  },

  // Standard in-game buttons: ◀ Back · Next ▶ · 🏠 Home · 🏁 End game
  gameBar({ extra = '', handlers = {}, back, next, backTitle = 'Back', nextTitle = 'Next', endTitle, endScreen }) {
    this.nav = { back, next, backOn: true, nextOn: true };
    this.setTopActions(`${extra}
      <button class="btn sm ghost" id="navBack" title="${backTitle} (← key)">◀ Back</button>
      <button class="btn sm cyan" id="navNext" title="${nextTitle} (→ key)">Next ▶</button>
      <button class="btn sm yellow" id="navHome" title="Back to the game menu">🏠 Home</button>
      <button class="btn sm ghost" id="navEnd" title="Show final scores">🏁 End game</button>`, {
      ...handlers,
      navBack: () => this.nav?.backOn && back(),
      navNext: () => this.nav?.nextOn && next(),
      navHome: () => this.leaveGame(),
      navEnd: async () => { if (await confirmBox('End the game now and show final scores?', 'End game')) this.show('results', endTitle, endScreen); },
    });
  },
  setNavEnabled(backOn, nextOn) {
    if (!this.nav) return;
    Object.assign(this.nav, { backOn, nextOn });
    const b = $('#navBack'), n = $('#navNext');
    if (b) b.disabled = !backOn;
    if (n) n.disabled = !nextOn;
  },

  setTopActions(html, handlers = {}) {
    const box = $('#topActions');
    box.innerHTML = html;
    Object.entries(handlers).forEach(([id, fn]) => { const b = box.querySelector('#' + id); if (b) b.onclick = fn; });
  },

  // File helpers (work in the Windows app, and in a browser for testing)
  async openText(title) {
    if (window.api) return window.api.openTextFile({ title });
    return new Promise(res => {
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = '.txt,.json,text/plain';
      inp.onchange = () => { const f = inp.files[0]; if (!f) return res(null); f.text().then(t => res({ name: f.name, text: t.replace(/^﻿/, '') })); };
      inp.click();
    });
  },
  async saveText(defaultName, text, filters) {
    if (window.api) return window.api.saveTextFile({ defaultName, text, filters });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    a.download = defaultName; a.click();
    return defaultName;
  },
};

// ================= SCOREBOARD =================
const Scores = {
  active: null, // highlighted team id (whose turn it is)
  teams() { return App.data.teams; },
  add(teamId, pts) {
    const t = this.teams().find(t => t.id === teamId);
    if (!t) return;
    t.score += pts;
    App.save();
    this.render();
    const chip = $(`.team-chip[data-id="${teamId}"]`);
    if (chip) { chip.classList.remove('bump'); void chip.offsetWidth; chip.classList.add('bump'); }
  },
  resetAll() { this.teams().forEach(t => t.score = 0); App.save(); this.render(); },
  setActive(id) { this.active = id; this.render(); },
  render() {
    const bar = $('#scorebar');
    document.body.classList.toggle('many-teams', this.teams().length > 6);
    const hide = App.current === 'editor' || App.current === 'teams';
    bar.classList.toggle('hidden', hide);
    if (hide) return;
    bar.innerHTML = this.teams().map(t => `
      <div class="team-chip ${this.active === t.id ? 'active' : ''}" data-id="${t.id}" style="--tc:${t.color}">
        <div class="tname">${esc(t.name)}</div>
        <div class="tscore">${fmt(t.score)}</div>
        <div class="adj"><button data-d="1" title="Add 100">+</button><button data-d="-1" title="Subtract 100">−</button></div>
      </div>`).join('');
    $$('.team-chip .adj button', bar).forEach(b => b.onclick = () => {
      this.add(b.closest('.team-chip').dataset.id, 100 * Number(b.dataset.d));
    });
  },
  ranked() { return this.teams().slice().sort((a, b) => b.score - a.score); },
};

// ================= MODALS =================
const Modal = {
  stack: [],
  open({ title, body, actions = [], wide }) {
    const back = document.createElement('div');
    back.className = 'modal-back';
    back.innerHTML = `<div class="modal" ${wide ? 'style="width:min(980px,100%)"' : ''}><h2>${esc(title)}</h2><div class="mbody"></div><div class="actions"></div></div>`;
    const mbody = $('.mbody', back);
    if (typeof body === 'string') mbody.innerHTML = body; else if (body) mbody.appendChild(body);
    const entry = { el: back, close: () => { back.remove(); this.stack = this.stack.filter(x => x !== entry); entry.onClose && entry.onClose(); } };
    actions.forEach(a => {
      const b = document.createElement('button');
      b.className = 'btn ' + (a.cls || '');
      b.textContent = a.label;
      b.onclick = () => a.onClick ? a.onClick(entry.close, mbody) : entry.close();
      $('.actions', back).appendChild(b);
    });
    back.addEventListener('mousedown', e => { if (e.target === back) entry.close(); });
    document.body.appendChild(back);
    this.stack.push(entry);
    const first = $('input, textarea, select', mbody);
    if (first) setTimeout(() => first.focus(), 30);
    return entry;
  },
};
function confirmBox(message, okLabel = 'OK', danger) {
  return new Promise(res => {
    const m = Modal.open({
      title: 'Are you sure?', body: `<p style="font-size:20px;margin:0">${esc(message)}</p>`,
      actions: [
        { label: 'Cancel', cls: 'ghost', onClick: c => { res(false); c(); } },
        { label: okLabel, cls: danger ? 'red' : 'pink', onClick: c => { res(true); c(); } },
      ],
    });
    m.onClose = () => res(false);
  });
}
function toast(msg, bad) {
  $$('.toast').forEach(x => x.remove());
  const t = document.createElement('div');
  t.className = 'toast' + (bad ? ' bad' : '');
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2600);
}

// ================= SOUND (generated, no files needed) =================
const Sfx = {
  ctx: null,
  tone(freq, dur = 0.15, type = 'sine', vol = 0.18, when = 0) {
    if (!App.data?.settings.sound) return;
    try {
      this.ctx ||= new (window.AudioContext || window.webkitAudioContext)();
      const c = this.ctx, t = c.currentTime + when;
      const o = c.createOscillator(), g = c.createGain();
      o.type = type; o.frequency.setValueAtTime(freq, t);
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g).connect(c.destination); o.start(t); o.stop(t + dur + 0.02);
    } catch (e) {}
  },
  tick() { this.tone(1200, 0.04, 'square', 0.05); },
  // Wheel peg: a soft, low wooden "tock" (filtered, quick fade, gentle pitch drop).
  // Throttled so a fast spin sounds like a smooth clatter instead of a buzz.
  peg() {
    if (!App.data?.settings.sound) return;
    try {
      this.ctx ||= new (window.AudioContext || window.webkitAudioContext)();
      const c = this.ctx, t = c.currentTime;
      if (this._lastPeg && t - this._lastPeg < 0.055) return;
      this._lastPeg = t;
      const o = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain();
      o.type = 'triangle';
      o.frequency.setValueAtTime(230 + Math.random() * 25, t);
      o.frequency.exponentialRampToValueAtTime(140, t + 0.07);
      f.type = 'lowpass'; f.frequency.value = 800;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.16, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
      o.connect(f).connect(g).connect(c.destination);
      o.start(t); o.stop(t + 0.1);
    } catch (e) {}
  },
  click() { this.tone(700, 0.05, 'triangle', 0.1); },
  ding() { this.tone(1318, 0.35, 'sine', 0.2); this.tone(1976, 0.4, 'sine', 0.1, 0.05); },
  correct() { [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.22, 'triangle', 0.18, i * 0.09)); },
  wrong() { this.tone(220, 0.35, 'sawtooth', 0.12); this.tone(180, 0.45, 'sawtooth', 0.12, 0.18); },
  buzz() { this.tone(110, 0.6, 'square', 0.1); },
  reveal() { [392, 523, 659].forEach((f, i) => this.tone(f, 0.18, 'triangle', 0.16, i * 0.07)); },
  fanfare() { [523, 523, 523, 698, 880, 784, 1046].forEach((f, i) => this.tone(f, 0.3, 'triangle', 0.18, i * 0.13)); },
};

// ================= CONFETTI =================
function confetti(ms = 3500) {
  const cv = $('#confetti'), ctx = cv.getContext('2d');
  cv.width = innerWidth; cv.height = innerHeight;
  const colors = [...TEAM_COLORS, '#ffffff', '#25d7f0'];
  const parts = Array.from({ length: 220 }, () => ({
    x: Math.random() * cv.width, y: -20 - Math.random() * cv.height * 0.6,
    vx: (Math.random() - 0.5) * 4, vy: 2 + Math.random() * 4, r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.3,
    w: 8 + Math.random() * 8, h: 5 + Math.random() * 6, c: colors[Math.floor(Math.random() * colors.length)],
  }));
  const end = performance.now() + ms;
  (function frame(now) {
    ctx.clearRect(0, 0, cv.width, cv.height);
    parts.forEach(p => {
      p.x += p.vx; p.y += p.vy; p.vy += 0.04; p.r += p.vr;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.c; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); ctx.restore();
    });
    if (now < end) requestAnimationFrame(frame); else ctx.clearRect(0, 0, cv.width, cv.height);
  })(performance.now());
}

// ================= HOME =================
App.screens.home = (el) => {
  Scores.setActive(null);
  const d = App.data;
  const boards = new Set(d.board.map(c => c.board)).size;
  el.innerHTML = `
    <div class="home-hero">
      <h1><span class="w1">Let's</span> <span class="w2">Play</span><span class="w3">!</span></h1>
      <p>Pick a game to put on the big screen</p>
    </div>
    <div class="game-cards">
      <button class="game-card trivia" data-g="trivia">
        <div class="emoji">⚡</div><h2>Trivia Blitz</h2>
        <p>Multiple-choice questions against the clock. Teams lock in answers and score points.</p>
        <span class="count">${d.trivia.length} questions</span>
      </button>
      <button class="game-card board" data-g="board">
        <div class="emoji">🎯</div><h2>Quiz Board</h2>
        <p>Pick a category and a point value. The harder the clue, the bigger the reward.</p>
        <span class="count">${boards} board${boards === 1 ? '' : 's'} · ${d.board.length} clues</span>
      </button>
      <button class="game-card wheel" data-g="wheel">
        <div class="emoji">🎡</div><h2>Spin &amp; Solve</h2>
        <p>Spin the wheel, call a letter, and be the first team to solve the puzzle.</p>
        <span class="count">${d.wheel.length} puzzles</span>
      </button>
    </div>
    <div class="home-actions">
      <button class="btn lg cyan" id="goTeams">👥 Teams &amp; Scores</button>
      <button class="btn lg yellow" id="goEditor">📝 Question Manager</button>
      <button class="btn lg ghost" id="goHelp">❓ How to play</button>
    </div>`;
  $$('.game-card', el).forEach(b => b.onclick = () => { Sfx.click(); App.show(b.dataset.g + 'Setup'); });
  $('#goTeams', el).onclick = () => App.show('teams');
  $('#goEditor', el).onclick = () => App.show('editor');
  $('#goHelp', el).onclick = showHelp;
};

function showHelp() {
  Modal.open({
    title: 'How to play', wide: true,
    body: `<div style="font-size:18px;line-height:1.5">
      <p><b style="color:var(--yellow)">Before you start:</b> open <b>Teams &amp; Scores</b> to set 2–10 team names. Scores carry across games, so you can play all three in one session. Use the <b>+ / −</b> buttons on the scoreboard to fix a score any time.</p>
      <p><b style="color:var(--pink)">⚡ Trivia Blitz</b> — A question shows with a timer. Teams write down or shout out A/B/C/D. Press <kbd>Space</kbd> or <b>Reveal</b> to show the answer, click every team that got it right, then <b>Award &amp; Next</b>.</p>
      <p><b style="color:var(--cyan)">🎯 Quiz Board</b> — A team picks a category and value. Click the tile, read the clue, then <b>Show answer</b>. Click ✓ to award the points or ✗ to take them away (you can turn that off). Close the clue to go back to the board.</p>
      <p><b style="color:var(--orange)">🎡 Spin &amp; Solve</b> — The highlighted team clicks <b>SPIN</b>. If it lands on points, they call a consonant. Click that letter on the keyboard, and they earn the points for each time it appears and spin again. Vowels cost ${App.data.settings.vowelCost}. A miss, BANKRUPT or LOSE A TURN passes to the next team. When a team thinks they know it, click <b>Solve it!</b> and have them say it out loud. If they're right, they bank their round points plus a 500-point bonus.</p>
      <p><b>Getting around:</b> every game has <b>◀ Back</b> and <b>Next ▶</b> (or the <kbd>←</kbd> <kbd>→</kbd> keys) for questions, boards or puzzles, <b>🏠 Home</b> to pick a different game (scores are kept), and <b>🏁 End game</b> for final scores. In Trivia, going back to a scored question lets you fix who got it right.</p>
      <p><b>Tips:</b> Press <kbd>F11</kbd> for full screen on a projector. Press <kbd>Esc</kbd> to close a pop-up.</p></div>`,
    actions: [{ label: 'Got it!', cls: 'pink' }],
  });
}

// ================= TEAMS =================
App.screens.teams = (el) => {
  const d = App.data;
  const draw = () => {
    el.innerHTML = `
      <div class="page-title"><h1>👥 Teams &amp; Scores</h1><div class="spacer"></div>
        <button class="btn orange" id="resetScores">↺ Reset all scores</button>
        <button class="btn pink lg" id="done">Done ✓</button></div>
      <div class="panel">
        <div style="font-size:20px;font-weight:600;margin-bottom:12px">How many teams?</div>
        <div class="count-pick">${Array.from({ length: MAX_TEAMS - 1 }, (_, i) => i + 2).map(n => `<button data-n="${n}" class="${d.teams.length === n ? 'on' : ''}">${n}</button>`).join('')}</div>
        <div class="teams-grid">${d.teams.map((t, i) => `
          <div class="team-edit" style="--tc:${t.color}">
            <input data-i="${i}" value="${esc(t.name)}" maxlength="24" placeholder="Team name">
            <div style="font-size:26px;font-weight:700;min-width:70px;text-align:right">${fmt(t.score)}</div>
          </div>`).join('')}</div>
        <div class="hint">Click a name to rename a team. Scores stay the same when you switch between games.</div>
      </div>
      <div class="panel" style="margin-top:20px">
        <div style="font-size:20px;font-weight:600;margin-bottom:12px">Game settings</div>
        <div class="row">
          <label class="field"><span>Trivia: points per correct answer</span>
            <select class="input" id="sPts">${[50, 100, 200, 500, 1000].map(v => `<option ${d.settings.triviaPoints === v ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
          <label class="field"><span>Trivia: speed bonus</span>
            <select class="input" id="sSpeed"><option value="1">On — reveal early for up to +50%</option><option value="0" ${d.settings.speedBonus ? '' : 'selected'}>Off</option></select></label>
        </div>
        <div class="row">
          <label class="field"><span>Quiz Board: wrong answers</span>
            <select class="input" id="sDeduct"><option value="1">Subtract the points</option><option value="0" ${d.settings.boardDeduct ? '' : 'selected'}>No penalty</option></select></label>
          <label class="field"><span>Spin &amp; Solve: cost to buy a vowel</span>
            <select class="input" id="sVowel">${[0, 100, 250, 500].map(v => `<option ${d.settings.vowelCost === v ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
        </div>
      </div>`;
    $$('.count-pick button', el).forEach(b => b.onclick = () => {
      const n = +b.dataset.n;
      while (d.teams.length < n) { const i = d.teams.length; d.teams.push({ id: GSData.uid(), name: DEFAULT_TEAM_NAMES[i], color: TEAM_COLORS[i], score: 0 }); }
      d.teams.length = n;
      App.save(); draw();
    });
    $$('.team-edit input', el).forEach(inp => inp.oninput = () => { d.teams[inp.dataset.i].name = inp.value.trim() || 'Team ' + (+inp.dataset.i + 1); App.save(); });
    $('#sPts', el).onchange = e => { d.settings.triviaPoints = +e.target.value; App.save(); };
    $('#sSpeed', el).onchange = e => { d.settings.speedBonus = e.target.value === '1'; App.save(); };
    $('#sDeduct', el).onchange = e => { d.settings.boardDeduct = e.target.value === '1'; App.save(); };
    $('#sVowel', el).onchange = e => { d.settings.vowelCost = +e.target.value; App.save(); };
    $('#resetScores', el).onclick = async () => { if (await confirmBox('Set every team back to 0 points?', 'Reset scores', true)) { Scores.resetAll(); draw(); } };
    $('#done', el).onclick = () => App.show('home');
  };
  draw();
};

// ================= RESULTS =================
App.screens.results = (el, gameName, againScreen) => {
  const r = Scores.ranked();
  const order = [r[1], r[0], r[2]].filter(Boolean);
  const tied = r.filter(t => t.score === r[0].score);
  const hs = innerHeight < 800 ? 0.6 : 1;
  const heights = { 0: 260 * hs, 1: 190 * hs, 2: 140 * hs };
  el.innerHTML = `
    <div class="results">
      <h1>${tied.length > 1 ? `🤝 It's a tie!` : `🏆 ${esc(r[0].name)} wins!`}</h1>
      <div style="font-size:24px;color:var(--muted)">${esc(gameName)} — final scores</div>
      <div class="podium">${order.map(t => { const place = r.indexOf(t); return `
        <div class="p"><div class="nm">${esc(t.name)}</div><div class="sc">${fmt(t.score)} pts</div>
        <div class="blk" style="--tc:${t.color};height:${heights[place]}px">${place + 1}</div></div>`; }).join('')}</div>
      <div class="others">${r.slice(3).map((t, i) => `<span>${i + 4}. ${esc(t.name)} — ${fmt(t.score)}</span>`).join('')}</div>
      <div class="home-actions">
        <button class="btn lg pink" id="again">Play again</button>
        <button class="btn lg cyan" id="home">Home</button>
      </div>
    </div>`;
  Sfx.fanfare(); confetti();
  $('#again', el).onclick = () => App.show(againScreen);
  $('#home', el).onclick = () => App.show('home');
};
