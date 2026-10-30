const APP_VERSION = '20261030-1015'; // shown at the bottom of the ☰ Menu
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
    d.draw ||= [];
    d.cross ||= [];
    d.teams ||= [0, 1, 2].map(i => ({ id: GSData.uid(), name: DEFAULT_TEAM_NAMES[i], color: TEAM_COLORS[i], score: 0 }));
    d.settings = Object.assign({ sound: true, triviaPoints: 100, speedBonus: true, boardDeduct: true, vowelCost: 250, triviaPenalty: 'half', finalRound: true, theme: 'classic', wheelBonus: true }, d.settings || {});
    this.data = d;
    const added = this.applyPacks();
    const mine = this.applyMyContent();
    if (mine) added.push(mine);
    this.applyTheme();
    this.save(true);

    $('#homeLink').onclick = () => this.leaveGame();
    $('#navBack').onclick = () => this.goBack();
    $('#navFwd').onclick = () => this.goForward();
    // the browser's / phone's own Back button does the same as ◀
    try { history.replaceState({ gss: 1 }, ''); history.pushState({ gss: 2 }, ''); } catch (e) {}
    window.addEventListener('popstate', () => { try { history.pushState({ gss: 2 }, ''); } catch (e) {} this.goBack(); });
    $('#fsBtn').onclick = () => this.toggleFullscreen();
    $('#menuBtn').onclick = () => { if (!(typeof Demo !== 'undefined' && Demo.running)) Menu.open(); };
    document.addEventListener('keydown', e => {
      if (e.key === 'F11') { e.preventDefault(); this.toggleFullscreen(); }
      if (e.key === 'Escape' && Modal.stack.length) Modal.stack[Modal.stack.length - 1].close();
      else if (e.key === 'Escape' && Menu.isOpen()) Menu.close();
      // ← / → move through a game (not while typing or in a pop-up)
      if (this.nav && this.current !== 'wordsPlay' && !Modal.stack.length && !/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) {
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
      [['trivia', 'parseTrivia', 'trivia question'], ['board', 'parseBoard', 'board clue'], ['wheel', 'parseWheel', 'puzzle'], ['words', 'parseWords', 'Word Guess word'], ['draw', 'parseDraw', 'Draw It word'], ['cross', 'parseCross', 'crossword']].forEach(([k, fn, noun]) => {
        if (!p[k]) return;
        const r = GSData[fn](p[k]);
        if (r.problems.length) console.warn('Pack', p.id, k, r.problems);
        // packs can target a question set: 'standard' (default) or 'recovery'
        const bank = p.bank || 'standard';
        d.bank ||= 'standard';
        if (bank === d.bank) { d[k].forEach(x => delete x.played); d[k].push(...r.items); }
        else { d.banks ||= {}; const b = (d.banks[bank] ||= { trivia: [], board: [], wheel: [], words: [], draw: [], cross: [] }); (b[k] ||= []).forEach(x => delete x.played); b[k].push(...r.items); }
        if (r.items.length) parts.push(`${r.items.length} ${noun}${r.items.length === 1 ? '' : 's'}`);
      });
      d.packsApplied.push(p.id);
      added.push({ name: p.name + (p.bank === 'recovery' ? ' (used in the 🌿 Recovery look)' : ''), summary: parts.join(', ') });
    });
    return added;
  },

  // Built-in copy of Matt's own material (app/mycontent.js), merged in once per version.
  applyMyContent() {
    const c = window.GS_MY_CONTENT, d = this.data;
    if (!c || !c.id || d.myContentApplied === c.id) return null;
    const KEYS = ['trivia', 'board', 'wheel', 'words', 'draw', 'cross'];
    const sig = x => { const o = { ...x }; delete o.id; delete o.played; delete o.layout; delete o.sets; return JSON.stringify(o); };
    let n = 0;
    d.bank ||= 'standard';
    Object.entries(c.banks || {}).forEach(([bank, set]) => {
      const tgt = bank === d.bank ? d : ((d.banks ||= {})[bank] ||= {});
      KEYS.forEach(k => {
        const key = (GameFiles.info[k] && GameFiles.info[k].key) || sig;
        const list = (tgt[k] ||= []), byId = new Map(list.map(x => [x.id, x])), byKey = new Map(list.map(x => [key(x), x]));
        (set[k] || []).forEach(x => {
          const old = byId.get(x.id) || byKey.get(key(x));
          if (old) { (x.sets || []).forEach(s => { old.sets ||= []; if (!old.sets.includes(s)) old.sets.push(s); }); return; }
          const y = JSON.parse(JSON.stringify(x)); delete y.played;
          list.push(y); byId.set(y.id, y); byKey.set(key(y), y); n++;
        });
      });
    });
    d.myContentApplied = c.id;
    return n ? { name: 'Your saved material', summary: `${n} item${n === 1 ? '' : 's'} from your built-in collection` } : null;
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
    d.banks[d.bank] = { trivia: d.trivia, board: d.board, wheel: d.wheel, words: d.words, draw: d.draw, cross: d.cross };
    const next = d.banks[name] || {};
    Object.assign(d, { trivia: next.trivia || [], board: next.board || [], wheel: next.wheel || [], words: next.words || [], draw: next.draw || [], cross: next.cross || [] });
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

  // ◀ ▶ screen history. Only "menu" screens (home, start screens, Question Manager,
  // teams, settings) are remembered; a game in progress goes back to its start screen.
  navStack: [], navFwd: [],
  navPage: n => n === 'home' || n === 'editor' || n === 'teams' || n === 'settings' || /Setup$/.test(n),
  async goBack() {
    if (typeof Demo !== 'undefined' && Demo.running) return;
    if (Modal.stack.length) { Modal.stack[Modal.stack.length - 1].close(); return; }
    if (Menu.isOpen()) { Menu.close(); return; }
    const inPage = this.navPage(this.current), st = this.navStack;
    if (!inPage) {
      const back = st[st.length - 1] || { name: 'home', args: [] };
      const msg = this.inGame ? 'Leave this game and go back? Scores will reset to 0.' : 'Leave this game and go back?';
      if (this.current !== 'results' && !(await confirmBox(msg, '◀ Go back'))) return;
      this._nav = true; this.show(back.name, ...back.args); return;
    }
    if (st.length < 2) return;
    this.navFwd.push(st.pop());
    const t = st[st.length - 1];
    this._nav = true; this.show(t.name, ...t.args);
  },
  async goForward() {
    if (typeof Demo !== 'undefined' && Demo.running) return;
    if (!this.navFwd.length || !this.navPage(this.current)) return;
    const t = this.navFwd.pop();
    this.navStack.push(t);
    this._nav = true; this.show(t.name, ...t.args);
  },
  navTrack(name, args) {
    const fromNav = this._nav; this._nav = false;
    if (!this.navPage(name)) return;
    const st = this.navStack, top = st[st.length - 1];
    if (top && top.name === name) top.args = args;          // same screen redrawn (e.g. after a change)
    else if (!fromNav) { st.push({ name, args }); this.navFwd = []; if (st.length > 40) st.shift(); }
  },
  navButtons() {
    const b = $('#navBack'), f = $('#navFwd'); if (!b) return;
    b.disabled = this.navPage(this.current) ? this.navStack.length < 2 : false;
    f.disabled = !this.navFwd.length || !this.navPage(this.current);
  },

  show(name, ...args) {
    this.navTrack(name, args);
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
    HostView.state = { idle: name === 'home' ? 'Pick a game on the big screen.' : 'Nothing to answer right now.' };
    const r = this.screens[name](el, ...args);
    if (typeof r === 'function') this.cleanup = r;
    const fk = (name.match(/^(trivia|board|wheel|words|draw)Setup$/) || [])[1];
    if (fk) GameFiles.attach(el, fk);
    Scores.render();
    this.navButtons();
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
// 🖥️ Host window (switched off in the menu for now — host.html still works if reopened later): the main window tells it what's on screen (question + answer, whose turn, scores).
const HostView = {
  ch: ('BroadcastChannel' in window) ? new BroadcastChannel('gss-host') : null,
  state: {},
  set(s) { this.state = s || {}; this.send(); },
  update(s) { Object.assign(this.state, s); this.send(); },
  send() {
    if (typeof Demo !== 'undefined' && Demo.running) return; // demos don't drive the host window
    const teams = App.data?.teams || [], at = teams.find(t => t.id === Scores.active);
    const msg = { ...this.state, look: App.look, ts: Date.now(),
      team: this.state.team ?? (App.inGame && at ? at.name : ''), teamColor: this.state.teamColor ?? at?.color,
      scores: App.inGame ? teams.map(t => ({ name: t.name, color: t.color, score: fmt(t.score), on: t.id === Scores.active })) : [] };
    try { localStorage.setItem('gss-host', JSON.stringify(msg)); } catch (e) {}
    try { this.ch?.postMessage(msg); } catch (e) {}
  },
  open() {
    const w = window.open(`host.html?v=${APP_VERSION}`, 'gssHost', 'width=1000,height=640');
    if (!w) { toast('Your browser blocked the window — allow pop-ups for this site and try again.', true); return; }
    setTimeout(() => this.send(), 600);
    toast('Host window opened — drag it onto your laptop screen 🖥️');
  },
};

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
    if (typeof HostView !== 'undefined') HostView.send(); // keep the host window's scores & turn current
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
  _ac() {
    if (!App.data?.settings.sound) return null;
    try { return (this.ctx ||= new (window.AudioContext || window.webkitAudioContext)()); } catch (e) { return null; }
  },
  // filtered white-noise burst (clacks, swooshes, applause) — shares one 2-second noise buffer
  noise(dur, { type = 'bandpass', freq = 1000, q = 1, vol = 0.2, when = 0, attack = 0.002 } = {}) {
    const c = this._ac(); if (!c) return;
    try {
      if (!this._nb) {
        this._nb = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
        const d = this._nb.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      }
      const t = c.currentTime + when, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
      s.buffer = this._nb; f.type = type; f.frequency.value = freq; f.Q.value = q;
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(f).connect(g).connect(c.destination); s.start(t, Math.random() * 1.2, dur + 0.05); s.stop(t + dur + 0.05);
    } catch (e) {}
  },
  // ---- Trivia Blitz quiz-show sounds (original) ----
  qzCount(i) { this.tone([392, 523, 659][i - 1] || 784, 0.22, 'triangle', 0.18); this.tone(([392, 523, 659][i - 1] || 784) * 2, 0.12, 'sine', 0.05); },
  qzQuestion() { [523, 659, 784].forEach((f, i) => this.tone(f, 0.12, 'square', 0.05, i * 0.06)); this.noise(0.25, { freq: 3000, q: 0.8, vol: 0.05 }); },
  gong() { [110, 165, 220, 277].forEach((f, i) => this.tone(f, 1.6, 'sine', [0.2, 0.08, 0.1, 0.05][i])); this.noise(0.4, { type: 'lowpass', freq: 600, vol: 0.08 }); },
  // ---- Spin & Solve: original game-show style sounds (all generated here, nothing copied) ----
  // Wheel clacker: a crisp plastic "clack" each time a peg passes the flapper; softer as it slows.
  peg(speed = 1) {
    const c = this._ac(); if (!c) return;
    const t = c.currentTime;
    if (this._lastPeg && t - this._lastPeg < 0.03) return;
    this._lastPeg = t;
    const v = Math.max(0.35, Math.min(1, speed));
    this.noise(0.035, { freq: 2400 + Math.random() * 400, q: 5, vol: 0.32 * v });
    this.tone(340 + Math.random() * 30, 0.045, 'square', 0.035 * v);
  },
  // Letter found: a bright struck-bell "ding" for each tile that lights up.
  bell() {
    [[1568, 0.2, 1.1], [2352, 0.05, 0.6], [3136, 0.06, 0.45], [4705, 0.02, 0.25]].forEach(([f, v, d]) => this.tone(f, d, 'sine', v));
  },
  tileTurn() { this.noise(0.06, { freq: 1500, q: 1.4, vol: 0.13 }); this.tone(620, 0.05, 'triangle', 0.05); },
  // No such letter: two short low buzzes
  noLetter() { this.tone(196, 0.26, 'square', 0.08); this.tone(185, 0.3, 'square', 0.08, 0.3); },
  // Bankrupt: a descending "wah-wah-wah-waaah"
  bankrupt() {
    const c = this._ac(); if (!c) return;
    try {
      const t0 = c.currentTime;
      [[392, 0, 0.38], [370, 0.42, 0.38], [349, 0.84, 0.38], [330, 1.26, 1.25]].forEach(([f, w, d], i) => {
        const t = t0 + w, o = c.createOscillator(), lp = c.createBiquadFilter(), g = c.createGain();
        o.type = 'sawtooth'; o.frequency.setValueAtTime(f, t); o.frequency.linearRampToValueAtTime(f * 0.97, t + d);
        if (i === 3) { const l = c.createOscillator(), lg = c.createGain(); l.frequency.value = 6; lg.gain.value = 7; l.connect(lg).connect(o.frequency); l.start(t + 0.15); l.stop(t + d); }
        lp.type = 'lowpass'; lp.Q.value = 6; lp.frequency.setValueAtTime(350, t); lp.frequency.linearRampToValueAtTime(1300, t + 0.12); lp.frequency.linearRampToValueAtTime(450, t + d);
        g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.17, t + 0.03); g.gain.setValueAtTime(0.17, t + d - 0.1); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
        o.connect(lp).connect(g).connect(c.destination); o.start(t); o.stop(t + d + 0.02);
      });
    } catch (e) {}
  },
  loseTurn() { this.tone(523, 0.18, 'triangle', 0.15); this.tone(392, 0.4, 'triangle', 0.15, 0.2); },
  whoosh() { this.noise(0.7, { freq: 700, q: 0.7, vol: 0.12, attack: 0.25 }); },
  // Crowd applause: lots of tiny claps over a soft roar
  applause(dur = 3) {
    if (!this._ac()) return;
    this.noise(dur, { type: 'lowpass', freq: 2500, q: 0.5, vol: 0.05, attack: 0.25 });
    for (let i = 0; i < dur * 45; i++) {
      const w = Math.random() * dur, fade = 1 - w / dur * 0.7;
      this.noise(0.03 + Math.random() * 0.04, { freq: 1200 + Math.random() * 2800, q: 1.2, vol: (0.04 + Math.random() * 0.06) * fade, when: w });
    }
  },
  // Puzzle solved: a short, bright original brass-style jingle, then applause
  solve() {
    [[523, 0], [659, 0.1], [784, 0.2], [1047, 0.32], [784, 0.5], [1047, 0.62]].forEach(([f, w], i) => {
      const d = i === 5 ? 0.7 : 0.16;
      this.tone(f, d, 'square', 0.06, w); this.tone(f, d, 'triangle', 0.14, w); this.tone(f / 2, d, 'triangle', 0.08, w);
    });
    setTimeout(() => this.applause(3.2), 350);
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
      <button class="game-card draw" data-g="draw"><div class="emoji">🎨</div><h2>Draw It</h2><p>Sketch it, guess it, beat the clock</p></button>
      <button class="game-card cross" data-g="cross"><div class="emoji">🧩</div><h2>Crossword</h2><p>Build one from your words, solve it together</p></button>
    </div>
    <div class="home-teams">${App.data.teams.map(t => `<span style="--tc:${t.color}">${esc(t.name)}</span>`).join('')}</div>
    <div class="home-hint">Host: teams, questions, settings and demos are in the <b>☰ Menu</b> (top right)</div>`;
  $$('.game-card', el).forEach(b => b.onclick = () => { Sfx.click(); App.show(b.dataset.g + 'Setup'); });
};

function showHelp() {
  Modal.open({
    title: 'How to play', wide: true,
    body: `<div style="font-size:18px;line-height:1.5">
      <p><b style="color:var(--yellow)">Before you start:</b> open <b>☰ Menu → Teams</b> to set up 1–10 teams — or pick <b>0 · Group</b> to play as one big group with no teams (everyone shouts out answers). Scores reset to 0 when a game ends or you go back Home. To fix a score during a game, use <b>☰ Menu → Fix a score</b>.</p>
      <p><b style="color:var(--pink)">⚡ Trivia Blitz</b> — <b>Take turns</b> (default): the highlighted team picks an answer; tap it on screen (or press <kbd>A</kbd>–<kbd>D</kbd>). Right = they earn the points. Each new question goes to the next team in order. With only one team, the whole group shouts out answers together (a wrong answer is just crossed out, no penalty). After every question the answer stays up for 15 seconds, then the next one appears (click <i>stay here</i> to pause it). Wrong = that answer is crossed out and the next team tries (they lose half the points by default; change it in ☰ Menu → Settings). <b>Everyone answers</b>: all teams answer at once, press <kbd>Space</kbd> to reveal, then click every team that got it right.</p>
      <p><b style="color:var(--cyan)">🎯 Quiz Board</b> — The highlighted team picks a category and value; click the tile and read the clue. Only the team whose pick it is answers, with a 15-second clock (pause it in ☰ Menu). The answer stays hidden on screen — check it on your printed answer key (☰ Menu → 🖨️ Answer key), or click <b>👁 Reveal answer</b> to stop the clock and show it. Click <b>✓ Right</b> to award the points or <b>✗ Wrong</b> to end the clue and show the answer (wrong answers can cost points; you can turn that off). Out of time? <b>🚨 STEAL!</b> — tap whichever team calls out first; they get the same 15 seconds and the same buttons. (No steals with one team or Group — the answer is just shown.) If nobody gets it, click <b>👁 Reveal answer</b>. Whoever gets it right (even on a steal) picks next; if nobody does, the next team picks. On a Daily Double, the wagering team plays for its bet; if they miss, the other teams can steal it for the clue's normal value. Click a team's score box to change whose pick it is.</p>
      <p><b style="color:var(--orange)">🎡 Spin &amp; Solve</b> — The highlighted team clicks <b>SPIN</b>. If it lands on points, they call a consonant. Click that letter on the keyboard, and they earn the points for each time it appears and spin again. Vowels cost ${App.data.settings.vowelCost}. A miss, BANKRUPT or LOSE A TURN passes to the next team. Land on a <b>🎁 MYSTERY</b> wedge and it's worth 1,000 per letter; get a letter right and the team can keep the points or give them up to flip the card: 50/50 for a +2,500 JACKPOT or BANKRUPT. When a team thinks they know it, click <b>Solve it!</b>, have them say it out loud, and type it into the empty squares (keyboard or on-screen letters; ⌫ to fix). <b>Check answer</b> tells you if they got it: right = 500-point bonus, wrong = next team's turn. Points go straight onto the scoreboard at the bottom; BANKRUPT takes away whatever that team earned on the current puzzle. <b>🔓 FREE PLAY</b>: call any letter (vowels free, consonants 500 each) and a miss doesn't cost the turn. <b>🦹 STEAL</b>: take up to 500 points from a team of your choice. (With only one team or Group, Steal and Pay It Forward become <b>🎉 BONUS</b>: +1,000 and spin again, and Lose a Turn becomes a big <b>2,500</b> wedge.) In the 🌿 Recovery look, <b>🤝 PAY IT FORWARD</b> gives 300 to another team and 300 to you, and <b>🙏 GRATITUDE</b> earns 500 for sharing something you're grateful for. Once it's played, that wedge changes to a new wellness prompt — 🌱 Self-Care, 🧰 Coping Skill, 💪 Strength, 💬 Kind Words, then 🌬️ Deep Breath — each worth 500. <b>🚂 EXPRESS</b>: ride it to call consonants for 1,000 each (and buy vowels) without spinning — one miss is BANKRUPT — or play it safe as a single 1,000. <b>✖2 DOUBLE PLAY</b>: your next spin counts double. <b>💰 JACKPOT</b>: +2,500 and spin again. <b>🃏 WILD CARD</b>: a free letter is revealed, then spin again. Stuck? The host can use <b>💡 Hint</b> once per puzzle to reveal a letter. At the end, the leading team plays a <b>🏁 Bonus Round</b>: R S T L N E are free, they pick 3 consonants and a vowel, then have 30 seconds to say the answer for +2,000 (turn it off in Settings).</p>
      <p><b style="color:var(--green)">🔤 Word Guess</b> — everyone plays together, no teams or points. Find the hidden 5-letter word in 6 tries: type the room's guess and press Enter. <b style="color:#3ee08f">Green</b> = right letter, right spot; <b style="color:var(--yellow)">yellow</b> = in the word, wrong spot; gray = not in the word. Then press Next word.</p>
      <p><b style="color:var(--pink)">🎲 Daily Doubles</b> — each Quiz Board hides one or two. It belongs to the team whose pick it was: they bet any amount up to their score (or the board's top value), and only they answer.</p>
      <p><b style="color:#4fd1c5">🧩 Crossword</b> — Pick a puzzle (or make your own: one <b>word | clue</b> per line) and the app builds a crossword from it — a fresh layout every time. The whole room solves it together: click a square (click again to switch Across/Down) or a clue, then type. <b>☰ Options</b> has Check (wrong letters turn red), reveal a letter, a word or everything, hide the clue list for a bigger grid, large text, a new layout and Print. Use <b>− Fit ＋</b> (or the − and + keys) to zoom in for easier reading. Print lets you print the blank puzzle and the answers separately (same layout as on screen). Correct words flash green. <b>⚡ Quick crossword</b> builds one from your one-word trivia answers. <b>📄 Save blank template</b> gives you a text file to fill in (== Title, then word | clue lines); <b>📥 Import from text file</b> builds the crossword from it automatically.</p>
      <p><b style="color:#b98cff">🎨 Draw It</b> — One person draws (whiteboard, paper or easel — no letters or numbers!) while everyone else guesses. The artist taps <b>👀 Peek</b> to see the word while everyone else looks away, then press <b>Start drawing</b>. <b>✓ Got it!</b> — tap the team that guessed it: they get the points (Easy 100 · Medium 200 · Hard 300) and <b>draw next</b>. Out of time? <b>🚨 Steal!</b> — a team that shouted the right answer gets the points and draws next; if nobody got it, the next team in order draws. Choose <i>No teams</i> to just play for fun — whoever guesses it draws next. To add your own words, use <b>📥 Import words from text file</b> on the Draw It screen (one word per line, like <i>banana | easy</i>; <b>📄 Save blank template</b> gives you a ready-made file). Words you already have are skipped. <b>⏭ Skip word</b> swaps in a new one.</p>
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
        <div class="count-pick">${Array.from({ length: MAX_TEAMS + 1 }, (_, i) => i).map(n => `<button data-n="${n}" class="${(d.settings.group ? 0 : d.teams.length) === n ? 'on' : ''}">${n === 0 ? '0 · Group' : n}</button>`).join('')}</div>
        ${d.settings.group ? `<div class="group-note">👥 <b>Group</b> — no teams. Everyone plays together and shouts out answers; the group's points add up as one score.</div>` : `
        <div class="teams-grid">${d.teams.map((t, i) => `
          <div class="team-edit" style="--tc:${t.color}"><input data-i="${i}" value="${esc(t.name)}" maxlength="24" placeholder="Team name"></div>`).join('')}</div>
        <div class="hint">Click a name to rename a team. ${d.teams.length > 1 ? 'The first team starts each game.' : 'With one team, everyone plays together under that name.'}</div>`}
      </div>`;
    $$('.count-pick button', el).forEach(b => b.onclick = () => {
      const n = +b.dataset.n;
      // 0 = "Group": one shared score called Group; everyone plays together
      if (n === 0) { d.settings.group = true; d.teams = [{ id: d.teams[0]?.id || GSData.uid(), name: 'Group', color: '#7a5cff', score: 0 }]; App.save(); draw(); return; }
      if (d.settings.group) { d.settings.group = false; d.teams[0].name = DEFAULT_TEAM_NAMES[0]; d.teams[0].color = TEAM_COLORS[0]; }
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
        <div class="mi-grid"><button class="mi" data-demo="trivia">🎬 ⚡ Trivia</button><button class="mi" data-demo="board">🎬 🎯 Quiz Board</button><button class="mi" data-demo="wheel">🎬 🎡 Spin &amp; Solve</button><button class="mi" data-demo="words">🎬 🔤 Word Guess</button><button class="mi" data-demo="draw">🎬 🎨 Draw It</button><button class="mi" data-demo="cross">🎬 🧩 Crossword</button></div>
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

// 📥 Import / 📄 template / 📤 export bar on each game's start screen
// (Crossword has its own, because it works with whole puzzles.)
const GameFiles = {
  info: {
    trivia: { parse: 'parseTrivia', noun: 'question', file: 'trivia', key: x => x.question.toLowerCase(),
      out: list => list.map(q => [`Q: ${q.question}`, `A: ${q.answer}`, ...(q.wrong || []).map(w => `W: ${w}`), `C: ${q.category || 'General'}`, `T: ${q.time || 20}`].join('\n')).join('\n\n') },
    board: { parse: 'parseBoard', noun: 'clue', file: 'quiz board', key: x => `${x.board}|${x.category}|${x.clue}`.toLowerCase(),
      out: list => { const t = [], bo = [...new Set(list.map(x => x.board))], co = [...new Set(list.map(x => x.board + '\u0001' + x.category))]; let b, c; [...list].sort((p, q) => bo.indexOf(p.board) - bo.indexOf(q.board) || co.indexOf(p.board + '\u0001' + p.category) - co.indexOf(q.board + '\u0001' + q.category) || p.value - q.value).forEach(x => { if (x.board !== b) { b = x.board; c = null; t.push(`${t.length ? '\n' : ''}BOARD: ${b}`); } if (x.category !== c) { c = x.category; t.push(`\nCATEGORY: ${c}`); } t.push(`${x.value} | ${x.clue} | ${x.answer}`); }); return t.join('\n'); } },
    wheel: { parse: 'parseWheel', noun: 'puzzle', file: 'spin and solve', key: x => x.phrase.toUpperCase(),
      out: list => list.map(x => `${x.category} | ${x.phrase}`).join('\n') },
    words: { parse: 'parseWords', noun: 'word', file: 'word guess', key: x => x.word.toUpperCase(),
      out: list => list.map(x => x.hint ? `${x.word.toLowerCase()} | ${x.hint}` : x.word.toLowerCase()).join('\n') },
    draw: { parse: 'parseDraw', noun: 'word', file: 'draw it', key: x => x.word.toLowerCase(),
      out: list => list.map(x => `${x.word} | ${x.level || 'easy'}`).join('\n') },
  },
  // Imported files become named sets (e.g. "Halloween Easy") you can pick on the start screen.
  setName(file) {
    let n = String(file || '').replace(/\.[^.]+$/, '').replace(/^[0-9a-f]{8}-/i, '').replace(/[_]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2');
    n = n.replace(/^\s*(trivia( blitz)?|quiz ?board|spin ?(and|&)? ?solve|word ?guess|draw ?it|crossword)\b[\s-]*/i, '').replace(/\btemplate\b/ig, '').replace(/\s*-\s*$/, '').replace(/\s+/g, ' ').trim();
    return n || 'Imported';
  },
  sets(k) { const m = new Map(); (App.data[k] || []).forEach(x => (x.sets || []).forEach(s => m.set(s, (m.get(s) || 0) + 1))); return m; },
  chosen(k) { const c = (App.data.settings.setPick || {})[k] || ''; return c && this.sets(k).has(c) ? c : ''; },
  // The questions/words/puzzles the next game should use (all, or just the chosen set)
  pick(k) { const c = this.chosen(k), all = App.data[k] || []; return c ? all.filter(x => (x.sets || []).includes(c)) : all; },
  attach(el, k) {
    const host = $('.setup', el); if (!host) return;
    const sets = this.sets(k), panel = $('.setup > .panel:not(.empty)', el);
    if (sets.size && panel) {
      const cur = this.chosen(k), f = document.createElement('label');
      f.className = 'field gf-set';
      f.innerHTML = `<span>Question set</span><select class="input" id="gfSet"><option value="">📚 Everything (${App.data[k].length})</option>${[...sets].sort((a, b) => { const lv = n => n.replace(/\b(easy|beginner)\b/i, '1').replace(/\b(intermediate|medium)\b/i, '2').replace(/\b(hard|advanced)\b/i, '3'); return lv(a[0]).localeCompare(lv(b[0])); }).map(([s, c]) => `<option value="${esc(s)}" ${s === cur ? 'selected' : ''}>${esc(s)} (${c})</option>`).join('')}</select>`;
      panel.prepend(f);
      $('#gfSet', f).onchange = e => { (App.data.settings.setPick ||= {})[k] = e.target.value; App.save(); App.show(App.current); };
    }
    const d = App.data, I = this.info[k], n = d[k].length;
    const bar = document.createElement('div');
    bar.className = 'cw-new gf-files';
    bar.innerHTML = `<button class="btn yellow" data-f="imp">📥 Import ${I.noun}s from text file</button>
      <button class="btn ghost" data-f="tpl">📄 Save blank template</button>
      ${n ? `<button class="btn ghost" data-f="exp">📤 Export my ${I.noun}s</button>` : ''}`;
    host.appendChild(bar);
    $('[data-f="tpl"]', bar).onclick = async () => { const T = GSData.TEMPLATES[k]; if (await App.saveText(T.file, T.text.replace(/\n/g, '\r\n'))) toast('Template saved ✓'); };
    if (n) $('[data-f="exp"]', bar).onclick = async () => { if (await App.saveText(`${I.file} - My ${I.noun}s.txt`, (I.out(d[k]) + '\n').replace(/\n/g, '\r\n'))) toast('Saved ✓'); };
    $('[data-f="imp"]', bar).onclick = () => this.import(k);
  },
  async import(k, after) {
    const d = App.data, I = this.info[k], screen = App.current;
    const f = await App.openText('Choose a text file');
    if (!f) return;
    let { items, problems } = GSData[I.parse](f.text);
    const set = this.setName(f.name);
    if (k === 'board' && items.some(c => c.board === 'Imported Board')) { items.forEach(c => { if (c.board === 'Imported Board') c.board = set; }); problems = problems.filter(p => !/No BOARD: line/.test(p)); }
    const have = new Map(d[k].map(x => [I.key(x), x]));
    const tag = x => { if (k !== 'board') { x.sets ||= []; if (!x.sets.includes(set)) x.sets.push(set); } };
    const fresh = items.filter(x => { const key = I.key(x), old = have.get(key); if (old) { tag(old); return false; } tag(x); have.set(key, x); return true; });
    const dup = items.length - fresh.length, pl = (c, w) => `${c} ${w}${c === 1 ? '' : 's'}`;
    if (fresh.length) d[k].push(...fresh);
    if (items.length && k !== 'board') (d.settings.setPick ||= {})[k] = set;
    if (items.length) App.save(true);
    let extra = '';
    if (k === 'board' && fresh.length) extra = `<p class="hint">Board${new Set(fresh.map(c => c.board)).size > 1 ? 's' : ''}: ${[...new Set(fresh.map(c => c.board))].map(esc).join(', ')}</p>`;
    if (k === 'draw' && fresh.length) extra = `<p class="hint">${['easy', 'medium', 'hard'].map(l => [l, fresh.filter(w => w.level === l).length]).filter(x => x[1]).map(([l, c]) => `${DRAW_LABEL[l]} ${c}`).join(' · ')}</p>`;
    Modal.open({
      title: fresh.length ? `📥 Added ${pl(fresh.length, I.noun)}!` : `No new ${I.noun}s added`,
      body: `<div style="font-size:19px;line-height:1.6">
        <p style="margin:0">${fresh.length ? `From <b>${esc(f.name)}</b>.` : `No new ${I.noun}s were found in <b>${esc(f.name)}</b>.${items.length ? '' : ' Is it the right kind of file for this game? <b>📄 Save blank template</b> shows the layout.'}`}</p>${extra}
        ${dup ? `<p class="hint">${pl(dup, I.noun)} ${dup === 1 ? 'was' : 'were'} already in your list, so ${dup === 1 ? 'it was' : 'they were'} not added twice.</p>` : ''}
        ${items.length && k !== 'board' ? `<p style="margin:12px 0 0">Saved as the set <b style="color:var(--yellow)">${esc(set)}</b> (${pl(items.length, I.noun)}) — pick it from <b>Question set</b> on the start screen.</p>` : ''}
        ${problems.length ? `<p style="margin:12px 0 4px;font-weight:600">⚠️ Things to check:</p><div class="problems">${problems.map(p => `<div>• ${esc(p)}</div>`).join('')}</div>` : ''}</div>`,
      actions: [{ label: 'OK', cls: 'pink', onClick: close => { close(); if (after) after(); else if (items.length && App.current === screen) App.show(screen); } }],
    });
  },
};

// Backup / restore of all questions (used by the menu and the Question Manager)
App.backup = async function () {
  const d = this.data, date = new Date().toISOString().slice(0, 10);
  const p = await this.saveText(`game-show-backup-${date}.json`, JSON.stringify({ app: 'Game Show Studio', version: 3, banks: this.allBanks() }, null, 2), [{ name: 'Backup file', extensions: ['json'] }]);
  if (p) toast('Backup saved ✓');
};
const BANK_KEYS = ['trivia', 'board', 'wheel', 'words', 'draw', 'cross'];
const pick = (o) => Object.fromEntries(BANK_KEYS.map(k => [k, (o && o[k]) || []]));
// Both question sets (Standard + Recovery), every game.
App.allBanks = function () {
  const d = this.data, out = { [d.bank || 'standard']: pick(d) };
  Object.entries(d.banks || {}).forEach(([b, set]) => { if (!out[b]) out[b] = pick(set); });
  return out;
};
App.restore = async function (after) {
  const f = await this.openText('Choose a backup (.json) file');
  if (!f) return;
  let b;
  try { b = JSON.parse(f.text); } catch (e) { toast("That file isn't a backup file", true); return; }
  if (b && b.banks && typeof b.banks === 'object') {
    const cnt = Object.values(b.banks).reduce((n, s) => n + BANK_KEYS.reduce((m, k) => m + ((s && s[k]) || []).length, 0), 0);
    if (!(await confirmBox(`Replace all questions, words and puzzles with this backup? (${cnt} items, both question sets)`, 'Restore', true))) return;
    const d = this.data, cur = d.bank || 'standard';
    d.banks = {};
    Object.entries(b.banks).forEach(([name, set]) => { if (name === cur) Object.assign(d, pick(set)); else d.banks[name] = pick(set); });
    if (!b.banks[cur]) Object.assign(d, pick({}));
    this.save(true); toast('Backup restored ✓');
    after && after();
    return;
  }
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
      <h1>${r.length === 1 ? `🎉 Great game, ${esc(r[0].name)}!` : tied.length > 1 ? `🤝 It's a tie!` : `🏆 ${esc(r[0].name)} wins!`}</h1>
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
  HostView.set({ game: '🏆 Final Round', meta: q.category || 'General', prompt: q.question, answer: q.answer });
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
