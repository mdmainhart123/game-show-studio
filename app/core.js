const APP_VERSION = '20261005-1915'; // shown at the bottom of the ☰ Menu
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
    d.words ||= [];
    d.teams ||= [0, 1, 2].map(i => ({ id: GSData.uid(), name: DEFAULT_TEAM_NAMES[i], color: TEAM_COLORS[i], score: 0 }));
    d.settings = Object.assign({ sound: true, triviaPoints: 100, speedBonus: true, boardDeduct: true, vowelCost: 250, triviaPenalty: 'half', finalRound: true, theme: 'classic', wheelBonus: true }, d.settings || {});
    this.data = d;
    const added = this.applyPacks();
    this.applyTheme();
    this.save(true);

    $('#homeLink').onclick = () => this.leaveGame();
    $('#fsBtn').onclick = () => this.toggleFullscreen();
    $('#menuBtn').onclick = () => { if (!(typeof Demo !== 'undefined' && Demo.running)) Menu.open(); };
    document.addEventListener('keydown', e => {
      if (e.key === 'F11') { e.preventDefault(); this.toggleFullscreen(); }
      if (e.key === 'Escape' && Modal.stack.length) Modal.stack[Modal.stack.length - 1].close();
      else if (e.key === 'Escape' && Menu.isOpen()) Menu.close();
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
      [['trivia', 'parseTrivia', 'trivia question'], ['board', 'parseBoard', 'board clue'], ['wheel', 'parseWheel', 'puzzle'], ['words', 'parseWords', 'Word Guess word']].forEach(([k, fn, noun]) => {
        if (!p[k]) return;
        const r = GSData[fn](p[k]);
        if (r.problems.length) console.warn('Pack', p.id, k, r.problems);
        // packs can target a question set: 'standard' (default) or 'recovery'
        const bank = p.bank || 'standard';
        d.bank ||= 'standard';
        if (bank === d.bank) { d[k].forEach(x => delete x.played); d[k].push(...r.items); }
        else { d.banks ||= {}; const b = (d.banks[bank] ||= { trivia: [], board: [], wheel: [], words: [] }); (b[k] ||= []).forEach(x => delete x.played); b[k].push(...r.items); }
        if (r.items.length) parts.push(`${r.items.length} ${noun}${r.items.length === 1 ? '' : 's'}`);
      });
      d.packsApplied.push(p.id);
      added.push({ name: p.name + (p.bank === 'recovery' ? ' (used in the 🌿 Recovery look)' : ''), summary: parts.join(', ') });
    });
    return added;
  },

  // Look: 'classic' (navy & gold), 'playful' (original bright colours) or
  // 'recovery' (friendly, calm — and switches to the Mental Health & Recovery question set)
  get look() { const t = this.data?.settings.theme; return t === 'playful' || t === 'recovery' ? t : 'classic'; },
  get classic() { return this.look === 'classic'; },
  applyTheme() {
    const look = this.look;
    document.body.classList.toggle('theme-classic', look === 'classic');
    document.body.classList.toggle('theme-recovery', look === 'recovery');
    this.useBank(look === 'recovery' ? 'recovery' : 'standard');
  },
  // Swap the active question set. The other set is kept safely in data.banks.
  useBank(name) {
    const d = this.data;
    d.bank ||= 'standard';
    if (d.bank === name) return;
    d.banks ||= {};
    d.banks[d.bank] = { trivia: d.trivia, board: d.board, wheel: d.wheel, words: d.words };
    const next = d.banks[name] || { trivia: [], board: [], wheel: [], words: [] };
    Object.assign(d, { trivia: next.trivia || [], board: next.board || [], wheel: next.wheel || [], words: next.words || [] });
    delete d.banks[name];
    d.bank = name;
  },
  async setLook(look) {
    if (look === this.look) return;
    if (this.inGame && !(await confirmBox('Changing the look ends this game and goes back to the home screen. Continue?', 'Change look'))) return false;
    this.data.settings.theme = look;
    this.applyTheme();
    this.save(true);
    if (this.inGame || ['home', 'editor'].includes(this.current) || /Setup$/.test(this.current)) this.show(this.current === 'editor' ? 'editor' : 'home');
    toast(look === 'recovery' ? '🌿 Recovery look — Mental Health & Recovery questions' : look === 'playful' ? '🎈 Playful look' : '🎩 Classic look');
    return true;
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
    this.chipClick = null;
    Menu.close();
    const r = this.screens[name](el, ...args);
    if (typeof r === 'function') this.cleanup = r;
    Scores.render();
  },

  // Leaving a game mid-way asks first.
  async leaveGame() {
    if (this.inGame && !(await confirmBox('Leave this game and go back to the home screen? Scores will reset to 0.', 'Go home'))) return;
    this.show('home');
  },

  // In-game top bar: the game's name (+ any badge, like whose turn it is). Previous / Next,
  // Pause, End game and Home live in the ☰ Menu; ← → keys still move between questions.
  gameBar({ title = '', extra = '', handlers = {}, back, next, backTitle = 'Back', nextTitle = 'Next', endTitle, endScreen, endLabel, endAction, pause }) {
    this.nav = {
      back, next, backTitle, nextTitle, backOn: true, nextOn: true, pause, endLabel,
      end: endAction || (endTitle ? async () => { if (await confirmBox('End the game now?', 'End game')) this.endGame(endTitle, endScreen); } : null),
    };
    this.setTopActions(`${title ? `<span class="gb-title">${title}</span>` : ''}${extra}`, handlers);
  },
  // Every game ends here. Quiz Board gets the Final (wager) Round if it's on; then the podium.
  endGame(title, againScreen) {
    if (title === 'Quiz Board' && this.data.settings.finalRound && this.data.trivia.length) this.show('finalRound', title, againScreen);
    else this.show('results', title, againScreen);
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

// ================= PLAYED MARKS =================
// Questions/clues get a 'played' flag when shown in a real game (not demos).
// Flags live on the items, so each question set (regular / recovery) keeps its own,
// and they reset whenever new questions are loaded (import or question pack).
const Played = {
  mark(item) { if (item && !(typeof Demo !== 'undefined' && Demo.running) && !item.played) { item.played = true; App.save(); } },
  reset(list) { list.forEach(x => delete x.played); App.save(); },
  label(name, items) {
    const left = items.filter(x => !x.played).length;
    if (!left) return `✓ ${name} — all played`;
    if (left < items.length) return `${name} (${left} of ${items.length} left)`;
    return `${name} (${items.length})`;
  },
  // unplayed first (shuffled), then played ones (shuffled)
  order(items) { return [...shuffle(items.filter(x => !x.played)), ...shuffle(items.filter(x => x.played))]; },
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
    const hide = !App.inGame; // the scoreboard only shows during a game
    bar.classList.toggle('hidden', hide);
    if (hide) return;
    bar.innerHTML = this.teams().map(t => `
      <div class="team-chip ${this.active === t.id ? 'active' : ''}" data-id="${t.id}" style="--tc:${t.color}">
        <div class="tname">${esc(t.name)}</div>
        <div class="tscore">${fmt(t.score)}</div>
      </div>`).join('');
    // a game can let the host click a team box (e.g. Quiz Board: "it's your pick")
    bar.classList.toggle('clickable', !!App.chipClick);
    if (App.chipClick) $$('.team-chip', bar).forEach(ch => ch.onclick = () => App.chipClick(ch.dataset.id));
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
  const colors = App.look === 'recovery' ? ['#e8896f', '#4fa3a5', '#f2c46d', '#7fb685', '#ffffff', '#9b8ec4'] : App.classic ? ['#d4af6a', '#e8d29e', '#b8913f', '#f3eee4', '#8fa7c9'] : [...TEAM_COLORS, '#ffffff', '#25d7f0'];
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
  Scores.resetAll(); // back at Home = fresh scores
  el.innerHTML = `
    <div class="home-hero">
      <h1><span class="w1">Let's</span> <span class="w2">Play</span><span class="w3">!</span></h1>
      ${App.look === 'recovery' ? '<div class="edition">🌿 Mental Health &amp; Recovery Edition</div>' : ''}
    </div>
    <div class="game-cards">
      <button class="game-card trivia" data-g="trivia"><div class="emoji">⚡</div><h2>Trivia Blitz</h2><p>Answer against the clock</p></button>
      <button class="game-card board" data-g="board"><div class="emoji">🎯</div><h2>Quiz Board</h2><p>Pick a category, win the points</p></button>
      <button class="game-card wheel" data-g="wheel"><div class="emoji">🎡</div><h2>Spin &amp; Solve</h2><p>Spin, guess, solve the puzzle</p></button>
      <button class="game-card words" data-g="words"><div class="emoji">🔤</div><h2>Word Guess</h2><p>Crack the 5-letter word</p></button>
    </div>
    <div class="home-teams">${App.data.teams.map(t => `<span style="--tc:${t.color}">${esc(t.name)}</span>`).join('')}</div>
    <div class="home-hint">Host: teams, questions, settings and demos are in the <b>☰ Menu</b> (top right)</div>`;
  $$('.game-card', el).forEach(b => b.onclick = () => { Sfx.click(); App.show(b.dataset.g + 'Setup'); });
};

function showHelp() {
  Modal.open({
    title: 'How to play', wide: true,
    body: `<div style="font-size:18px;line-height:1.5">
      <p><b style="color:var(--yellow)">Before you start:</b> open <b>☰ Menu → Teams</b> to set 2–10 team names. Scores reset to 0 when a game ends or you go back Home. To fix a score during a game, use <b>☰ Menu → Fix a score</b>.</p>
      <p><b style="color:var(--pink)">⚡ Trivia Blitz</b> — <b>Take turns</b> (default): the highlighted team picks an answer; tap it on screen (or press <kbd>A</kbd>–<kbd>D</kbd>). Right = they earn the points and start the next question. After every question the answer stays up for 15 seconds, then the next one appears (click <i>stay here</i> to pause it). Wrong = that answer is crossed out and the next team tries (they lose half the points by default; change it in ☰ Menu → Settings). <b>Everyone answers</b>: all teams answer at once, press <kbd>Space</kbd> to reveal, then click every team that got it right.</p>
      <p><b style="color:var(--cyan)">🎯 Quiz Board</b> — The highlighted team picks a category and value; click the tile and read the clue. Only the team whose pick it is answers, with a 15-second clock (pause it in ☰ Menu). The answer stays hidden on screen — check it on your printed answer key (☰ Menu → 🖨️ Answer key) and click ✓ Right or ✗ Wrong (wrong answers can cost points; you can turn that off). Wrong or out of time? <b>🚨 STEAL!</b> — tap whichever team calls out first; they get the same 15 seconds and the same ✓ / ✗. If nobody gets it, click <b>Show Answer</b>. Whoever gets it right (even on a steal) picks next; if nobody does, the next team picks. Daily Doubles can't be stolen. Click a team's score box to change whose pick it is.</p>
      <p><b style="color:var(--orange)">🎡 Spin &amp; Solve</b> — The highlighted team clicks <b>SPIN</b>. If it lands on points, they call a consonant. Click that letter on the keyboard, and they earn the points for each time it appears and spin again. Vowels cost ${App.data.settings.vowelCost}. A miss, BANKRUPT or LOSE A TURN passes to the next team. Land on a <b>🎁 MYSTERY</b> wedge and it's worth 1,000 per letter; get a letter right and the team can keep the points or give them up to flip the card: 50/50 for a +2,500 JACKPOT or BANKRUPT. When a team thinks they know it, click <b>Solve it!</b>, have them say it out loud, and type it into the empty squares (keyboard or on-screen letters; ⌫ to fix). <b>Check answer</b> tells you if they got it: right = 500-point bonus, wrong = next team's turn. Points go straight onto the scoreboard at the bottom; BANKRUPT takes away whatever that team earned on the current puzzle. <b>🔓 FREE PLAY</b>: call any letter (vowels free, consonants 500 each) and a miss doesn't cost the turn. <b>🦹 STEAL</b>: take up to 500 points from a team of your choice. In the 🌿 Recovery look, <b>🤝 PAY IT FORWARD</b> gives 300 to another team and 300 to you, and <b>🙏 GRATITUDE</b> earns 500 for sharing something you're grateful for. At the end, the leading team plays a <b>🏁 Bonus Round</b>: R S T L N E are free, they pick 3 consonants and a vowel, then have 30 seconds to say the answer for +2,000 (turn it off in Settings).</p>
      <p><b style="color:var(--green)">🔤 Word Guess</b> — everyone plays together, no teams or points. Find the hidden 5-letter word in 6 tries: type the room's guess and press Enter. <b style="color:#3ee08f">Green</b> = right letter, right spot; <b style="color:var(--yellow)">yellow</b> = in the word, wrong spot; gray = not in the word. Then press Next word.</p>
      <p><b style="color:var(--pink)">🎲 Daily Doubles</b> — each Quiz Board hides one or two. It belongs to the team whose pick it was: they bet any amount up to their score (or the board's top value), and only they answer.</p>
      <p><b style="color:var(--yellow)">🏆 Final Round</b> — after the Quiz Board, there's one last question. Teams secretly bet points (anyone under 1,000 can still bet up to 1,000), you type the bets in, then reveal and mark each team right or wrong. Turn it off in ☰ Menu → Settings.</p>
      <p><b>Getting around:</b> every game has <b>◀ Back</b> and <b>Next ▶</b> (or the <kbd>←</kbd> <kbd>→</kbd> keys) for questions, boards or puzzles, and the <b>☰ Menu</b> has 🏁 End game, 🏠 Quit to Home and ⏸ Pause. In Everyone-answers Trivia, going back to a scored question lets you fix who got it right.</p>
      <p><b>Look:</b> switch between <b>🎩 Classic</b> (navy &amp; gold), <b>🎈 Playful</b> (the original bright colours) and <b>🌿 Recovery</b> (calm and friendly) in <b>☰ Menu → 🎨 Look</b> or Settings. Recovery also switches every game to the <b>Mental Health &amp; Recovery</b> question set; Classic and Playful use your regular questions.</p>
      <p><b>Tips:</b> Press <kbd>F11</kbd> for full screen on a projector. Press <kbd>Esc</kbd> to close a pop-up.</p></div>`,
    actions: [{ label: 'Got it!', cls: 'pink' }],
  });
}

// ================= TEAMS =================
App.screens.teams = (el) => {
  const d = App.data;
  App.setTopActions(`<button class="btn sm pink" id="tDone">Done ✓</button>`, { tDone: () => App.show('home') });
  const draw = () => {
    el.innerHTML = `
      <div class="page-title"><h1>👥 Teams</h1></div>
      <div class="panel">
        <div style="font-size:20px;font-weight:600;margin-bottom:12px">How many teams?</div>
        <div class="count-pick">${Array.from({ length: MAX_TEAMS - 1 }, (_, i) => i + 2).map(n => `<button data-n="${n}" class="${d.teams.length === n ? 'on' : ''}">${n}</button>`).join('')}</div>
        <div class="teams-grid">${d.teams.map((t, i) => `
          <div class="team-edit" style="--tc:${t.color}"><input data-i="${i}" value="${esc(t.name)}" maxlength="24" placeholder="Team name"></div>`).join('')}</div>
        <div class="hint">Click a name to rename a team. The first team starts each game.</div>
      </div>`;
    $$('.count-pick button', el).forEach(b => b.onclick = () => {
      const n = +b.dataset.n;
      while (d.teams.length < n) { const i = d.teams.length; d.teams.push({ id: GSData.uid(), name: DEFAULT_TEAM_NAMES[i], color: TEAM_COLORS[i], score: 0 }); }
      d.teams.length = n;
      App.save(); draw();
    });
    $$('.team-edit input', el).forEach(inp => inp.oninput = () => { d.teams[inp.dataset.i].name = inp.value.trim() || 'Team ' + (+inp.dataset.i + 1); App.save(); });
  };
  draw();
};

// ================= SETTINGS =================
App.screens.settings = (el) => {
  const d = App.data, s = d.settings;
  App.setTopActions(`<button class="btn sm pink" id="sDone">Done ✓</button>`, { sDone: () => App.show('home') });
  const sel = (id, opts, cur) => `<select class="input" id="${id}">${opts.map(([v, l]) => `<option value="${v}" ${String(cur) === String(v) ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
  el.innerHTML = `
    <div class="page-title"><h1>⚙️ Settings</h1></div>
    <div class="settings-grid">
      <div class="panel"><h3>⚡ Trivia Blitz</h3>
        <label class="field"><span>Points per correct answer</span>${sel('sPts', [50, 100, 200, 500, 1000].map(v => [v, v]), s.triviaPoints)}</label>
        <label class="field"><span>Take turns: wrong answers</span>${sel('sPen', [['none', 'No penalty — the turn just passes'], ['half', 'Lose half the points'], ['full', 'Lose the full points']], s.triviaPenalty)}</label>
        <label class="field"><span>Everyone answers: speed bonus</span>${sel('sSpeed', [[1, 'On (up to +50% for fast reveals)'], [0, 'Off']], s.speedBonus ? 1 : 0)}</label>
      </div>
      <div class="panel"><h3>🎯 Quiz Board</h3>
        <label class="field"><span>Wrong answers (and wrong steals)</span>${sel('sDeduct', [[1, 'Subtract the points'], [0, 'No penalty']], s.boardDeduct ? 1 : 0)}</label>
        <label class="field"><span>🏆 Final wager round at the end</span>${sel('sFinal', [[1, 'On'], [0, 'Off']], s.finalRound ? 1 : 0)}</label>
      </div>
      <div class="panel"><h3>🎡 Spin &amp; Solve</h3>
        <label class="field"><span>Cost to buy a vowel</span>${sel('sVowel', [0, 100, 250, 500].map(v => [v, v]), s.vowelCost)}</label>
        <label class="field"><span>🏁 Bonus round for the leader at the end</span>${sel('sBonus', [[1, 'On'], [0, 'Off']], s.wheelBonus !== false ? 1 : 0)}</label>
      </div>
      <div class="panel"><h3>🏆 Every game</h3>
        <label class="field"><span>Sound effects</span>${sel('sSound', [[1, 'On'], [0, 'Off']], s.sound ? 1 : 0)}</label>
        <label class="field"><span>Look</span>${sel('sTheme', [['classic', '🎩 Classic — navy & gold'], ['playful', '🎈 Playful — the original bright look'], ['recovery', '🌿 Recovery — friendly look + mental health & recovery questions']], App.look)}</label>
      </div>
    </div>`;
  const on = (id, fn) => $('#' + id, el).onchange = e => { fn(e.target.value); App.save(); toast('Saved ✓'); };
  on('sPts', v => s.triviaPoints = +v);
  on('sPen', v => s.triviaPenalty = v);
  on('sSpeed', v => s.speedBonus = v === '1');
  on('sDeduct', v => s.boardDeduct = v === '1');
  on('sVowel', v => s.vowelCost = +v);
  on('sBonus', v => s.wheelBonus = v === '1');
  on('sFinal', v => s.finalRound = v === '1');
  on('sSound', v => s.sound = v === '1');
  $('#sTheme', el).onchange = e => App.setLook(e.target.value);
};

const LOOK_NAMES = { classic: 'Classic', playful: 'Playful', recovery: 'Recovery' };
// ================= ☰ HOST MENU =================
const Menu = {
  isOpen() { return !!$('#menuBack'); },
  close() { $('#menuBack')?.remove(); },
  open() {
    if (this.isOpen()) return;
    const inGame = App.inGame, nav = App.nav, s = App.data.settings;
    const back = document.createElement('div');
    back.id = 'menuBack';
    back.className = 'menu-back';
    back.innerHTML = `<aside class="menu">
      <div class="menu-head"><b>☰ Host menu</b><button class="icon-btn" id="mClose" title="Close (Esc)">✕</button></div>
      <section class="looks"><h4>🎨 Choose a look</h4>
        <div class="look-pick">
          ${[['classic', '🎩', 'Classic', 'Navy &amp; gold'], ['playful', '🎈', 'Playful', 'Bright &amp; fun'], ['recovery', '🌿', 'Recovery', 'Mental health questions']].map(([k, ic, n, sub]) =>
            `<button class="lk ${App.look === k ? 'on' : ''}" data-look="${k}"><span class="ic">${ic}</span><b>${n}</b><small>${sub}</small></button>`).join('')}
        </div>
      </section>
      ${inGame ? `
      <section><h4>This game</h4>
        ${nav?.back || nav?.next ? `<div class="mi-row"><button class="mi" id="mPrev" ${nav.backOn ? '' : 'disabled'}>◀ ${esc(nav.backTitle)}</button><button class="mi" id="mNext" ${nav.nextOn ? '' : 'disabled'}>${esc(nav.nextTitle)} ▶</button></div>` : ''}
        ${nav?.pause ? `<button class="mi" id="mPause">${nav.pause.get() ? '▶ Resume the clock' : '⏸ Pause the clock'}</button>` : ''}
        ${nav?.end ? `<button class="mi" id="mEnd">${nav.endLabel || '🏁 End game &amp; final scores'}</button>` : ''}
        <button class="mi" id="mHome">🏠 Quit to Home</button>
      </section>
      <section><h4>Fix a score</h4>
        <div class="fix">${Scores.teams().map(t => `<div class="fix-row" data-id="${t.id}"><span class="dot" style="--tc:${t.color}"></span><span class="fn">${esc(t.name)}</span><b class="fs">${fmt(t.score)}</b>
          <button data-d="-100">−100</button><button data-d="100">+100</button></div>`).join('')}</div>
      </section>` : ''}
      <section><h4>Set up</h4>
        <button class="mi" data-go="teams">👥 Teams</button>
        <button class="mi" data-go="editor">📝 Questions</button>
        <button class="mi" data-go="settings">⚙️ Settings</button>
      </section>
      <section><h4>Show the group how to play</h4>
        <div class="mi-grid"><button class="mi" data-demo="trivia">🎬 ⚡ Trivia</button><button class="mi" data-demo="board">🎬 🎯 Quiz Board</button><button class="mi" data-demo="wheel">🎬 🎡 Spin &amp; Solve</button><button class="mi" data-demo="words">🎬 🔤 Word Guess</button></div>
        <button class="mi" id="mHelp">❓ How to play (rules)</button>
      </section>
      <section><h4>For the host</h4>
        <button class="mi" id="mKey">🖨️ Answer key (print or save as PDF)</button>
      </section>
      <section><h4>Display &amp; data</h4>
        <button class="mi" id="mSound">${s.sound ? '🔊 Sound on' : '🔇 Sound off'}</button>
        <div class="mi-row"><button class="mi" id="mBackup">💾 Back up</button><button class="mi" id="mRestore">📂 Restore</button></div>
      </section>
      <div class="menu-ver">Version ${APP_VERSION}</div>
    </aside>`;
    document.body.appendChild(back);
    requestAnimationFrame(() => back.classList.add('open'));
    const q = id => $('#' + id, back);
    back.addEventListener('mousedown', e => { if (e.target === back) this.close(); });
    q('mClose').onclick = () => this.close();
    // leaving a game from the menu asks first
    const go = async fn => { this.close(); if (inGame && !(await confirmBox('Leave this game? Scores will reset to 0.', 'Leave game'))) return; fn(); };
    if (q('mPause')) q('mPause').onclick = () => { nav.pause.toggle(); q('mPause').textContent = nav.pause.get() ? '▶ Resume the clock' : '⏸ Pause the clock'; };
    if (q('mPrev')) q('mPrev').onclick = () => { this.close(); nav.backOn && nav.back(); };
    if (q('mNext')) q('mNext').onclick = () => { this.close(); nav.nextOn && nav.next(); };
    if (q('mEnd')) q('mEnd').onclick = () => { this.close(); nav.end(); };
    if (q('mHome')) q('mHome').onclick = () => go(() => App.show('home'));
    $$('.fix-row', back).forEach(r => $$('button', r).forEach(b => b.onclick = () => {
      Scores.add(r.dataset.id, +b.dataset.d);
      $('.fs', r).textContent = fmt(Scores.teams().find(t => t.id === r.dataset.id).score);
    }));
    $$('[data-go]', back).forEach(b => b.onclick = () => go(() => App.show(b.dataset.go)));
    $$('[data-demo]', back).forEach(b => b.onclick = () => go(() => Demo.start(b.dataset.demo)));
    q('mHelp').onclick = () => { this.close(); showHelp(); };
    q('mKey').onclick = () => { this.close(); answerKey(); };
    q('mSound').onclick = () => { s.sound = !s.sound; App.save(); q('mSound').textContent = s.sound ? '🔊 Sound on' : '🔇 Sound off'; };
    $$('[data-look]', back).forEach(b => b.onclick = async () => {
      if (b.dataset.look === App.look) return;
      this.close();
      await App.setLook(b.dataset.look);
    });
    q('mBackup').onclick = () => App.backup();
    q('mRestore').onclick = () => App.restore();
  },
};

// Backup / restore of all questions (used by the menu and the Question Manager)
App.backup = async function () {
  const d = this.data, date = new Date().toISOString().slice(0, 10);
  const p = await this.saveText(`game-show-backup-${d.bank === 'recovery' ? 'recovery-' : ''}${date}.json`, JSON.stringify({ app: 'Game Show Studio', version: 2, trivia: d.trivia, board: d.board, wheel: d.wheel, words: d.words }, null, 2), [{ name: 'Backup file', extensions: ['json'] }]);
  if (p) toast('Backup saved ✓');
};
App.restore = async function (after) {
  const f = await this.openText('Choose a backup (.json) file');
  if (!f) return;
  let b;
  try { b = JSON.parse(f.text); } catch (e) { toast("That file isn't a backup file", true); return; }
  if (!Array.isArray(b.trivia) || !Array.isArray(b.board) || !Array.isArray(b.wheel)) { toast("That file isn't a Game Show Studio backup", true); return; }
  if (!(await confirmBox(`Replace all questions with this backup? (${b.trivia.length} trivia, ${b.board.length} board clues, ${b.wheel.length} puzzles${Array.isArray(b.words) ? `, ${b.words.length} words` : ''})`, 'Restore', true))) return;
  Object.assign(this.data, { trivia: b.trivia, board: b.board, wheel: b.wheel }, Array.isArray(b.words) ? { words: b.words } : {});
  this.save(true); toast('Backup restored ✓');
  after && after();
};

// ================= RESULTS =================
App.screens.results = (el, gameName, againScreen) => {
  // Snapshot the final scores for the podium, then reset everyone to 0.
  const r = Scores.ranked().map(t => ({ ...t }));
  Scores.resetAll();
  const order = [r[1], r[0], r[2]].filter(Boolean);
  const tied = r.filter(t => t.score === r[0].score);
  const hs = innerHeight < 500 ? 0.3 : innerWidth < 760 ? 0.45 : innerHeight < 800 ? 0.6 : 1;
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

// ================= FINAL ROUND (wager) =================
// Category → secret wagers → question → judge each team → podium.
const FINAL_MIN_CAP = 1000; // teams with less than this can still wager up to it (comeback chance)
App.screens.finalRound = (el, title, againScreen) => {
  App.inGame = true;
  Scores.setActive(null);
  const teams = Scores.teams();
  const played = App.playedTrivia || new Set();
  const pool = App.data.trivia.filter(q => !played.has(q.id));
  const q = Played.order(pool.length ? pool : App.data.trivia)[0];
  Played.mark(q);
  const order = shuffle([q.answer, ...q.wrong]);
  const wagers = {};
  const cap = t => Math.max(t.score, FINAL_MIN_CAP);
  let timerId;
  App.setTopActions(`<button class="btn sm ghost" id="fSkip">Skip to final scores ⏭</button>`, {
    fSkip: () => App.show('results', title, againScreen),
  });
  Sfx.fanfare();

  // Step 1: category + secret wagers
  el.innerHTML = `
    <div class="final">
      <div class="final-title">🏆 FINAL ROUND 🏆</div>
      <div class="final-cat">Category: <b>${esc(q.category || 'General')}</b></div>
      <p class="final-help">Each team: <b>secretly</b> write down how many points you'll bet on one last question.
        Get it right and you <b style="color:var(--green)">win</b> your bet. Get it wrong and you <b style="color:#ffb3bb">lose</b> it.
        Teams with less than ${fmt(FINAL_MIN_CAP)} points can still bet up to ${fmt(FINAL_MIN_CAP)}!</p>
      <div class="wager-grid">${teams.map(t => `
        <label class="wg" style="--tc:${t.color}"><span class="wn">${esc(t.name)}</span><span class="ws">${fmt(t.score)} pts · bet 0–${fmt(cap(t))}</span>
          <input class="input" type="password" inputmode="numeric" data-id="${t.id}" placeholder="🔒 wager" autocomplete="off"></label>`).join('')}</div>
      <div class="err" id="fErr" style="text-align:center"></div>
      <div style="text-align:center"><button class="btn xl pink" id="lock">Lock in wagers 🔒</button></div>
      <p class="hint" style="text-align:center">Host: collect the written bets and type them in. They stay hidden (🔒) until the end.</p>
    </div>`;
  $('#lock', el).onclick = () => {
    const bad = [];
    $$('.wg input', el).forEach(inp => {
      const t = teams.find(x => x.id === inp.dataset.id);
      const raw = inp.value.trim();
      const w = raw === '' ? 0 : Math.round(Number(raw));
      if (!(w >= 0 && w <= cap(t))) bad.push(`${t.name}: 0–${fmt(cap(t))}`);
      wagers[t.id] = w;
    });
    if (bad.length) { $('#fErr', el).textContent = 'Check these bets — ' + bad.join(' · '); return; }
    askQuestion();
  };

  // Step 2: the question, with a 30-second clock
  function askQuestion() {
    let left = 30;
    el.innerHTML = `
      <div class="tq-wrap">
        <div class="tq-top"><span class="pill" style="font-size:18px;padding:6px 14px">🏆 Final Round · ${esc(q.category || 'General')}</span><div class="spacer"></div>
          <div class="final-clock" id="fclock">${left}</div></div>
        <div class="tq-card">${esc(q.question)}</div>
        <div class="answers" id="answers" style="${order.length <= 2 ? 'grid-template-columns:1fr 1fr;max-height:260px' : ''}">
          ${order.map((a, i) => `<div class="ans a${i} ${a === q.answer ? 'right' : 'wrong'}"><div class="shape"><span>${'ABCD'[i]}</span></div><div>${esc(a)}</div></div>`).join('')}
        </div>
        <div class="award"><span class="hint" style="font-size:18px">Every team: write down your answer!</span><div class="spacer"></div>
          <button class="btn lg yellow" id="fReveal">Reveal answer <kbd>Space</kbd></button></div>
      </div>`;
    $('#fReveal', el).onclick = reveal;
    timerId = setInterval(() => {
      left--; const c = $('#fclock', el); if (!c) return;
      c.textContent = left; c.classList.toggle('low', left <= 5);
      if (left <= 5 && left > 0) Sfx.tick();
      if (left <= 0) { Sfx.buzz(); reveal(); }
    }, 1000);
  }

  // Step 3: reveal, then judge each team (wagers shown as each is judged)
  function reveal() {
    if (!timerId) return;
    clearInterval(timerId); timerId = null;
    Sfx.reveal();
    // show just the correct answer, full width, so the judging row has room
    const ans = $('#answers', el);
    ans.classList.add('revealed');
    $$('.ans.wrong', ans).forEach(x => x.remove());
    ans.style.gridTemplateColumns = '1fr'; ans.style.flex = '0 0 auto';
    $('#fclock', el).style.visibility = 'hidden';
    const done = {};
    $('.award', el).outerHTML = `<div class="award final-judge">
      <span class="lbl">Did they get it?</span>
      ${teams.map(t => `<div class="fj" style="--tc:${t.color}" data-id="${t.id}"><span class="n">${esc(t.name)}</span><span class="w">🔒</span>
        <button class="ok">✓</button><button class="no">✗</button></div>`).join('')}
      <div class="spacer"></div><button class="btn lg pink" id="fDone">Final scores 🏆</button></div>`;
    $$('.fj', el).forEach(row => {
      const t = teams.find(x => x.id === row.dataset.id), w = wagers[t.id];
      const judge = right => {
        if (done[t.id]) return;
        done[t.id] = true;
        $('.w', row).textContent = w ? (right ? '+' : '−') + fmt(w) : '0';
        row.classList.add(right ? 'right' : 'wrong');
        if (w) Scores.add(t.id, right ? w : -w);
        right ? Sfx.correct() : Sfx.wrong();
      };
      $('.ok', row).onclick = () => judge(true);
      $('.no', row).onclick = () => judge(false);
    });
    $('#fDone', el).onclick = () => App.show('results', title, againScreen);
  }

  const onKey = e => { if (!Modal.stack.length && e.code === 'Space' && timerId && !/INPUT/.test(e.target.tagName)) { e.preventDefault(); reveal(); } };
  document.addEventListener('keydown', onKey);
  return () => { clearInterval(timerId); document.removeEventListener('keydown', onKey); };
};


// 🖨️ Host answer key — prints (or saves as PDF) the clues and answers so the host
// can judge without revealing anything on the big screen.
function answerKey() {
  const d = App.data;
  const boards = [...new Set(d.board.map(c => c.board))];
  const cats = [...new Set(d.trivia.map(q => q.category || 'General'))];
  const opts = [
    ...boards.map(n => [`b:${n}`, `🎯 Quiz Board — ${n}`]),
    ...(boards.length > 1 ? [['b:*', '🎯 Quiz Board — every board']] : []),
    ...cats.map(n => [`t:${n}`, `⚡ Trivia — ${n}`]),
    ...(cats.length > 1 ? [['t:*', '⚡ Trivia — every category']] : []),
    ...(d.wheel.length ? [['w:*', '🎡 Spin & Solve — every puzzle']] : []),
  ];
  if (!opts.length) { toast('No questions yet.'); return; }
  const cur = App.current === 'boardPlay' && App.curBoard ? `b:${App.curBoard}` : opts[0][0];
  Modal.open({
    title: '🖨️ Answer key',
    body: `<p style="font-size:18px;margin:0 0 12px">Print it (or save it as a PDF on your phone) so you can check answers without showing them on screen.</p>
      <label class="field"><span>Which questions?</span><select class="input" id="keyPick">${opts.map(([v, l]) => `<option value="${esc(v)}" ${v === cur ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`,
    actions: [
      { label: 'Cancel', cls: 'ghost', onClick: c => c() },
      { label: '🖨️ Print', cls: 'pink', onClick: c => { const v = $('#keyPick').value; c(); printKey(v); } },
    ],
  });
}
function printKey(v) {
  const d = App.data, [kind, name] = [v[0], v.slice(2)];
  const row = (a, b, c) => `<tr><td>${a}</td><td>${b}</td><td class="k-ans">${c}</td></tr>`;
  let html = '';
  if (kind === 'b') {
    const boards = name === '*' ? [...new Set(d.board.map(c => c.board))] : [name];
    html = boards.map(b => {
      const clues = d.board.filter(c => c.board === b);
      const catNames = [...new Set(clues.map(c => c.category))];
      return `<h2>🎯 ${esc(b)}</h2>` + catNames.map(cn => `<h3>${esc(cn)}</h3><table>${clues.filter(c => c.category === cn).sort((x, y) => x.value - y.value)
        .map(c => row(fmt(c.value), esc(c.clue), esc(c.answer))).join('')}</table>`).join('');
    }).join('');
  } else if (kind === 't') {
    const cats = name === '*' ? [...new Set(d.trivia.map(q => q.category || 'General'))] : [name];
    html = cats.map(cn => `<h2>⚡ ${esc(cn)}</h2><table>${d.trivia.filter(q => (q.category || 'General') === cn)
      .map((q, i) => row(i + 1, esc(q.question), esc(q.answer))).join('')}</table>`).join('');
  } else {
    html = `<h2>🎡 Spin &amp; Solve</h2><table>${d.wheel.map((p, i) => row(i + 1, esc(p.category), esc(p.phrase))).join('')}</table>`;
  }
  $('#printKey')?.remove();
  const box = document.createElement('div');
  box.id = 'printKey';
  box.innerHTML = `<h1>Game Show Studio — Host answer key</h1><p class="k-note">Keep this away from the players 🤫</p>${html}`;
  document.body.appendChild(box);
  document.body.classList.add('printing');
  const done = () => { document.body.classList.remove('printing'); box.remove(); window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  setTimeout(() => { window.print(); setTimeout(done, 1000); }, 50);
}
