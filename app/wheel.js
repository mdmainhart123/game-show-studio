// 🎡 Spin & Solve — spin the wheel, call letters, solve the puzzle.
const WEDGES = [500, 900, 700, 300, 800, 'BANKRUPT', 600, 400, 'MYSTERY', 'LOSE A TURN', 350, 500, 900, 300, 650, 'BANKRUPT', 700, 450, 350, 800, 'MYSTERY', 400, 1000, 300];
// 🎁 Mystery wedge: plays as 1,000 per letter; after a correct consonant the team may give up
// those points to flip it — 50/50 JACKPOT (+2,500) or BANKRUPT. Once flipped, it's a plain 1,000.
const MYSTERY_VALUE = 1000, JACKPOT = 2500;
// Special wedges. Classic & Playful: FREE PLAY + STEAL. Recovery: FREE PLAY + PAY IT FORWARD + GRATITUDE.
const FREE_PLAY_VALUE = 500, STEAL_AMOUNT = 500, PAY_FORWARD = 300, GRATITUDE_POINTS = 500, BONUS_PRIZE = 2000;
const SPECIAL_WEDGES = {
  'FREE PLAY': { label: '🔓 FREE PLAY', bg: '#13a07a' },
  'STEAL': { label: '🦹 STEAL', bg: '#3b1d63' },
  'PAY IT FORWARD': { label: '🤝 PAY IT FORWARD', bg: '#d36f5f' },
  'GRATITUDE': { label: '🙏 GRATITUDE', bg: '#e2ae45', fg: '#3a2a08' },
  'EXPRESS': { label: '🚂 EXPRESS', bg: '#56637a' },
  'DOUBLE PLAY': { label: '✖2 DOUBLE PLAY', bg: '#0e7f8f' },
  'JACKPOT': { label: '💰 JACKPOT', bg: '#a8770a' },
  'WILD CARD': { label: '🃏 WILD CARD', bg: '#b0127a' },
  'BONUS': { label: '🎉 BONUS', bg: '#c2410c' },
};
const BONUS_WEDGE = 1000; // 🎉 Bonus: +1,000 and spin again (replaces Steal / Pay It Forward when there's only one team)
// 🚂 Express: 1,000 per consonant without spinning (one miss = BANKRUPT) · ✖2 Double Play: next spin
// counts double · 💰 Jackpot: instant bonus, spin again · 🃏 Wild Card: a free letter is revealed, spin again
const EXPRESS_VALUE = 1000, JACKPOT_WEDGE = 2500;
// ⌫ for the typed-answer squares: clears the square under the cursor if it has a letter,
// otherwise the nearest filled square before it (or the last filled one). Returns the new cursor.
function eraseSlot(slots, cursor) {
  if (!slots.length) return cursor;
  let i = cursor < slots.length && slots[cursor].got ? cursor : -1;
  for (let j = Math.min(cursor, slots.length) - 1; i < 0 && j >= 0; j--) if (slots[j].got) i = j;
  for (let j = slots.length - 1; i < 0 && j >= 0; j--) if (slots[j].got) i = j;
  if (i < 0) return cursor;
  slots[i].got = ''; slots[i].el.textContent = '';
  return i;
}
function wedgesFor(look, teamCount = 2) {
  const w = WEDGES.slice();
  w[3] = 'FREE PLAY';                       // replaces a 300
  w[6] = 'WILD CARD'; w[11] = 'DOUBLE PLAY'; w[21] = 'JACKPOT'; w[23] = 'EXPRESS'; // replace 600, 500, 400, 300
  if (look === 'recovery') { w[18] = 'PAY IT FORWARD'; w[13] = 'GRATITUDE'; } // replace a 350 and a 300
  else w[18] = 'STEAL';                     // replaces a 350
  if (teamCount < 2) w.forEach((x, k) => { if (x === 'STEAL' || x === 'PAY IT FORWARD') w[k] = 'BONUS'; }); // no one to steal from or give to
  if (teamCount < 2) w[w.indexOf('LOSE A TURN')] = 2500; // no one to pass the turn to: a big-money wedge instead
  return w;
}
const WEDGE_COLORS = ['#ff3d8b', '#2f7bff', '#f5a300', '#1fb866', '#9b5bff', '#ff7a1f', '#12b5cf'];
const WEDGE_COLORS_RECOVERY = ['#e8896f', '#4fa3a5', '#f2c46d', '#7fb685', '#9b8ec4', '#e5a46b', '#6fb7d6'];
const WEDGE_COLORS_CLASSIC = ['#8c3a4d', '#2f5687', '#9a7a32', '#3d7356', '#5d4a86', '#9c5f30', '#2f6f7c'];
// Bright TV game-show wedge colours (Classic & Playful looks)
const WEDGE_COLORS_SHOW = ['#e3262f', '#f5c518', '#1e6fd9', '#f07c1d', '#8a3fb5', '#1fa05a', '#e23d8e', '#17a2c6'];
const VOWELS = 'AEIOU';
const SOLVE_BONUS = 500;

// ---------- the puzzle board ----------
// Like the TV board: 4 rows of 12 / 14 / 14 / 12 tiles (the four corners are missing).
// Letters light up blue one at a time with a "ding", then turn over to show the letter.
const BOARD_VOID = (r, c) => (r === 0 || r === 3) && (c === 0 || c === 13);
function wrapRows(text, widths) {
  const rows = []; let cur = '';
  for (const w of text.split(' ')) {
    const max = widths[Math.min(rows.length, widths.length - 1)];
    if (!cur) cur = w; else if ((cur + ' ' + w).length <= max) cur += ' ' + w; else { rows.push(cur); cur = w; }
  }
  if (cur) rows.push(cur);
  return rows;
}
function puzzleGrid(phrase) {
  const R = GSData.WHEEL_ROWS, C = GSData.WHEEL_COLS, lay = GSData.layoutPuzzle(phrase);
  let rows = lay.rows || [];
  const fits = (rs, pad) => rs.every((l, i) => ((i + pad === 0 || i + pad === R - 1) ? l.length <= 12 : l.length <= C));
  const centre = Math.floor((R - rows.length) / 2);
  const pads = [centre, ...Array.from({ length: R - rows.length + 1 }, (_, i) => i).filter(p => p !== centre)];
  let pad = pads.find(p => fits(rows, p)), corners = true;
  if (pad === undefined && lay.text) { const alt = wrapRows(lay.text, [12, 14, 14, 12]); if (alt.length <= R && fits(alt, 0)) { rows = alt; pad = 0; } }
  if (pad === undefined) { pad = centre; corners = false; } // very rare: use the corner tiles too
  return Array.from({ length: R }, (_, r) => {
    const line = rows[r - pad], cells = Array(C).fill(null);
    if (line !== undefined) { const off = Math.floor((C - line.length) / 2); [...line].forEach((ch, i) => cells[off + i] = ch); }
    return cells.map((ch, col) => ({ ch, void: corners && BOARD_VOID(r, col) }));
  });
}
function renderBoard(box, grid, isShown) {
  box.classList.add('wof');
  box.innerHTML = grid.map(row => `<div class="prow">${row.map(({ ch, void: v }) => {
    if (v) return '<div class="cell void"></div>';
    if (ch === null || ch === ' ') return '<div class="cell"></div>';
    const isL = /[A-Z]/.test(ch);
    return `<div class="cell l ${isL && !isShown(ch) ? 'hide' : ''}" data-ch="${esc(ch)}">${esc(ch)}</div>`;
  }).join('')}</div>`).join('');
}
// Light up every hidden tile for these letters (left to right, top to bottom) with a ding,
// then turn them over one by one. Returns how long the whole thing takes, in ms.
function revealTiles(box, letters, { gap = 650, turnGap = 320, pause = 450, quiet = false } = {}) {
  const cells = $$('.cell.l.hide', box).filter(cl => letters.includes(cl.dataset.ch));
  cells.forEach((cl, i) => setTimeout(() => { if (!cl.isConnected) return; cl.classList.add('lit'); if (!quiet || i % 3 === 0) Sfx.bell(); }, i * gap));
  const t1 = cells.length * gap + pause;
  cells.forEach((cl, i) => setTimeout(() => { if (!cl.isConnected) return; cl.classList.remove('lit', 'hide'); cl.classList.add('turn'); if (!quiet) Sfx.tileTurn(); }, t1 + i * turnGap));
  return cells.length ? t1 + cells.length * turnGap + 300 : 0;
}
// On-screen keyboard in QWERTY order (vowels tinted)
function qwertyKeys() {
  return ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'].map(r => `<div class="kr">${[...r].map(L => `<button data-l="${L}" class="${VOWELS.includes(L) ? 'v' : ''}">${L}</button>`).join('')}</div>`).join('');
}
// Contestant strip across the top: avatar, name tag and a money tag that counts up/down.
function contestantStrip(box) {
  const teams = Scores.teams(), shownScore = {};
  teams.forEach(t => shownScore[t.id] = t.score);
  box.innerHTML = teams.map(t => `
    <div class="ct" data-id="${t.id}" style="--tc:${t.color}">
      <div class="ct-av">${esc((t.name.match(/\p{L}|\p{N}/u) || ['?'])[0].toUpperCase())}</div>
      <div class="ct-tag"><div class="ct-name">${esc(t.name)}</div><div class="ct-score">${fmt(t.score)}</div></div>
      <div class="ct-bubble"></div>
    </div>`).join('');
  const tick = setInterval(() => {
    teams.forEach(t => {
      const cur = shownScore[t.id], want = t.score;
      const node = $(`.ct[data-id="${t.id}"]`, box);
      if (!node) return;
      node.classList.toggle('on', Scores.active === t.id);
      if (cur === want) return;
      const step = Math.sign(want - cur) * Math.max(1, Math.ceil(Math.abs(want - cur) / 8));
      shownScore[t.id] = Math.abs(want - cur) <= Math.abs(step) ? want : cur + step;
      $('.ct-score', node).textContent = fmt(shownScore[t.id]);
      node.classList.toggle('up', want > cur); node.classList.toggle('down', want < cur);
      if (shownScore[t.id] === want) setTimeout(() => node.classList.remove('up', 'down'), 300);
    });
  }, 45);
  return {
    stop: () => clearInterval(tick),
    say(id, text, ms = 1800) {
      const b = $(`.ct[data-id="${id}"] .ct-bubble`, box); if (!b) return;
      b.textContent = text; b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
      clearTimeout(b._t); b._t = setTimeout(() => b.classList.remove('show'), ms);
    },
  };
}
function boardParty(box, ms = 3500) {
  const f = box.closest('.pz-frame'); if (!f) return;
  f.classList.add('party'); setTimeout(() => f.classList.remove('party'), ms);
}

App.screens.wheelSetup = (el) => {
  const d = App.data;
  const cats = [...new Set(d.wheel.map(p => p.category))].sort();
  el.innerHTML = `
    <div class="setup">
      <h1>🎡 Spin &amp; Solve</h1>
      ${d.wheel.length ? `
      <div class="panel">
        <label class="field"><span>Category</span>
          <select class="input" id="cat"><option value="">🎲 All categories (${d.wheel.length})</option>
          ${cats.map(c => `<option value="${esc(c)}">${esc(c)} (${d.wheel.filter(p => p.category === c).length})</option>`).join('')}</select></label>
        <label class="field"><span>How many puzzles?</span>
          <select class="input" id="num">${[1, 3, 5, 8].map(n => `<option value="${n}" ${n === 3 ? 'selected' : ''}>${n}</option>`).join('')}<option value="9999">All of them</option></select></label>
        <div class="hint">Points go straight onto the scoreboard. Vowels cost ${d.settings.vowelCost}, solving adds a ${SOLVE_BONUS} bonus, and BANKRUPT takes away what that team earned on the current puzzle. ${d.settings.wheelBonus !== false ? 'The leader plays a 🏁 Bonus Round at the end. ' : ''}Scores reset to 0 after each game.</div>
      </div>
      <button class="btn xl pink" id="go">Start! ▶</button>
      <div><button class="link-btn" id="demo">🎬 Watch a demo first</button></div>`
      : `<div class="panel empty">No puzzles yet.<br><br><button class="btn yellow" id="add">📝 Add some puzzles</button></div>`}
    </div>`;
  if (!d.wheel.length) { $('#add', el).onclick = () => App.show('editor', 'wheel'); return; }
  $('#demo', el).onclick = () => Demo.start('wheel');
  $('#go', el).onclick = () => {
    const cat = $('#cat', el).value;
    const pool = shuffle(d.wheel.filter(p => !cat || p.category === cat));
    Scores.resetAll(); // every new game starts at 0
    App.playedTrivia = new Set();
    App.show('wheelPlay', pool.slice(0, +$('#num', el).value));
  };
};

App.screens.wheelPlay = (el, puzzles) => {
  App.inGame = true;
  const d = App.data;
  const teams = Scores.teams();
  // bank[teamId] = points that team has earned on the CURRENT puzzle (only used for BANKRUPT);
  // the points themselves go straight onto the scoreboard.
  let flipped = new Set(), mysteryIdx = null;
  let pIdx = -1, puzzle, grid, shown, usedLetters, bank, turn = 0;
  let phase, spinValue = 0, rot = Math.random() * Math.PI * 2, spinning = false, rafId;
  let bulbs = 0, glow = null; // rim-light chase step · landed-wedge highlight
  let doubleNext = false, hintUsed = false; // ✖2 Double Play token (this turn only) · 💡 one hint per puzzle
  const W = wedgesFor(App.look, teams.length); // the look can't change mid-game
  const N = W.length, SEG = (Math.PI * 2) / N;

  App.gameBar({
    back: () => navTo(pIdx - 1),
    next: () => navTo(pIdx + 1),
    backTitle: 'Previous puzzle', nextTitle: 'Next puzzle',
    endTitle: 'Spin & Solve', endScreen: 'wheelSetup',
    title: '🎡 Spin &amp; Solve', extra: `<span class="turn-pill sm" id="wTurn"></span>`,
  });
  async function navTo(i) {
    if (spinning || i < 0) return;
    if (phase !== 'solved' && usedLetters.size && !(await confirmBox('Leave this puzzle unsolved? Points already earned stay on the scoreboard.', 'Leave puzzle'))) return;
    if (i >= puzzles.length) { finishGame(); return; }
    pIdx = i - 1;
    startPuzzle();
  }

  // TV-studio stage: contestants on top, the board in the middle, round buttons below.
  // The wheel rises up from the bottom when it's time to spin.
  el.innerHTML = `
    <div class="wf-stage">
      <div class="wf-players" id="wfPlayers"></div>
      <div class="wf-board">
        <div class="pz-frame oval"><div class="puzzle" id="puzzle"></div><div class="cat-intro" id="catIntro"></div></div>
        <div class="wf-catrow"><div class="wcat" id="wcat"></div><div class="callout" id="callout"></div></div>
        <div class="status" id="status"></div>
        <div class="used-strip" id="used"></div>
      </div>
      <div class="wf-controls">
        <div class="turn-bar" id="turnBar">
          <button class="rb rb-vowel" id="aVowel"><span class="ic">A</span><span class="lb">VOWEL</span><small id="vowelNote"></small></button>
          <button class="rb rb-spin" id="spin"><span class="ic">🎡</span><span class="lb">SPIN</span></button>
          <button class="rb rb-solve" id="aSolve"><span class="ic">💬</span><span class="lb">SOLVE</span></button>
        </div>
        <div class="letters qwerty kb-hidden" id="letters">${qwertyKeys()}</div>
        <div class="wh-actions" id="actions"></div>
      </div>
      <div class="wheel-stage" id="wheelStage">
        <div class="wheel-box"><div class="flapper" id="flapper"></div><canvas id="wheel" width="900" height="900"></canvas><div class="hub"></div></div>
      </div>
    </div>`;
  document.body.classList.add('wf-on');
  const strip = contestantStrip($('#wfPlayers', el));
  const showTurnBar = on => $('#turnBar', el).classList.toggle('hidden', !on);
  // the vowel / solve buttons live in the turn bar
  $('#aVowel', el).onclick = () => {
    if (phase !== 'turn') return;
    strip.say(teams[turn].id, "I'd like to buy a vowel!");
    phase = 'vowel'; status('Which vowel?'); setLetters('vowel');
    setActions(`<button class="btn ghost" id="aCancel">Cancel</button>`, { aCancel: () => setTurnPhase('Spin, buy a vowel, or solve.') });
  };
  $('#aSolve', el).onclick = () => { if (phase === 'turn') { strip.say(teams[turn].id, "I'd like to solve!"); solve(); } };
  const cv = $('#wheel', el), ctx = cv.getContext('2d');
  $('#spin', el).onclick = spin;
  $$('#letters button', el).forEach(b => b.onclick = () => pickLetter(b.dataset.l));

  // ---------- wheel drawing ----------
  function drawWheel() {
    const cx = 450, cy = 450, r = 408, rim = 440;
    const pal = App.look === 'recovery' ? WEDGE_COLORS_RECOVERY : WEDGE_COLORS_SHOW;
    ctx.clearRect(0, 0, 900, 900);
    // outer rim with a ring of light bulbs
    const rg = ctx.createRadialGradient(cx, cy, r, cx, cy, rim), rec = App.look === 'recovery';
    rg.addColorStop(0, rec ? '#3a2a10' : '#1a1050'); rg.addColorStop(0.5, rec ? '#e9c98c' : '#7d6bff'); rg.addColorStop(1, rec ? '#5a4214' : '#24156b');
    ctx.beginPath(); ctx.arc(cx, cy, rim, 0, Math.PI * 2); ctx.fillStyle = rg; ctx.fill();
    for (let b = 0; b < 48; b++) {
      const a = (b / 48) * Math.PI * 2, on = (b + bulbs) % 2 === 0;
      ctx.beginPath(); ctx.arc(cx + Math.cos(a) * (r + 16), cy + Math.sin(a) * (r + 16), 7, 0, Math.PI * 2);
      ctx.fillStyle = on ? (rec ? '#fff6c4' : '#e6f4ff') : (rec ? '#7a6230' : '#3d2f9c'); ctx.shadowColor = on ? (rec ? '#ffe680' : '#8fd0ff') : 'transparent'; ctx.shadowBlur = on ? 14 : 0; ctx.fill();
    }
    ctx.shadowBlur = 0; ctx.shadowColor = 'transparent';
    W.forEach((w, i) => {
      const a0 = rot + i * SEG - Math.PI / 2;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, r, a0, a0 + SEG); ctx.closePath();
      const myst = w === 'MYSTERY' && !flipped.has(i);
      if (w === 'MYSTERY' && !myst) w = MYSTERY_VALUE; // already flipped this puzzle
      if (myst) {
        const g = ctx.createLinearGradient(cx, cy, cx + Math.cos(a0 + SEG / 2) * r, cy + Math.sin(a0 + SEG / 2) * r);
        g.addColorStop(0, '#5b1fa8'); g.addColorStop(1, '#c48a00');
        ctx.fillStyle = g;
      } else if (SPECIAL_WEDGES[w]) ctx.fillStyle = SPECIAL_WEDGES[w].bg;
      else ctx.fillStyle = w === 'BANKRUPT' ? '#0d0d0d' : w === 'LOSE A TURN' ? '#f4f4f4' : pal[i % pal.length];
      ctx.fill();
      // a little shine toward the rim, and thin dark dividers
      const sh = ctx.createRadialGradient(cx, cy, r * 0.25, cx, cy, r);
      sh.addColorStop(0, 'rgba(0,0,0,.18)'); sh.addColorStop(0.7, 'rgba(255,255,255,0)'); sh.addColorStop(1, 'rgba(255,255,255,.14)');
      ctx.fillStyle = sh; ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 2; ctx.stroke();
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(a0 + SEG / 2);
      const sp = SPECIAL_WEDGES[w];
      if (typeof w === 'number') {
        // numbers stacked one digit under another, reading from the rim toward the middle
        const s = String(w), h = 50;
        ctx.font = `700 54px Oswald, 'Arial Narrow', sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = '#fff'; ctx.shadowColor = 'rgba(0,0,0,.55)'; ctx.shadowBlur = 4; ctx.shadowOffsetY = 2;
        [...s].forEach((ch, k) => { ctx.save(); ctx.translate(r - 44 - k * h, 0); ctx.rotate(Math.PI / 2); ctx.fillText(ch, 0, 2); ctx.restore(); });
      } else {
        const txt = myst ? '🎁 MYSTERY' : sp ? sp.label : String(w);
        ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
        ctx.fillStyle = w === 'LOSE A TURN' ? '#111' : myst ? '#ffd23f' : sp?.fg || '#fff';
        ctx.font = `700 ${txt.length > 14 ? 21 : txt.length > 9 ? 25 : 30}px Oswald, 'Arial Narrow', sans-serif`;
        if (w !== 'LOSE A TURN') { ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = 3; ctx.shadowOffsetY = 2; }
        ctx.fillText(txt, r - 26, 0);
      }
      ctx.restore();
    });
    // the wedge that was just landed on glows
    if (glow && glow.a > 0) {
      const a0 = rot + glow.i * SEG - Math.PI / 2;
      ctx.save(); ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, r, a0, a0 + SEG); ctx.closePath();
      ctx.fillStyle = `rgba(255,255,255,${0.28 * glow.a})`; ctx.fill();
      ctx.lineWidth = 9; ctx.strokeStyle = `rgba(255,255,200,${glow.a})`; ctx.shadowColor = '#fff6a0'; ctx.shadowBlur = 25; ctx.stroke(); ctx.restore();
    }
    // chrome pegs between the wedges
    for (let i = 0; i < N; i++) {
      const a = rot + i * SEG - Math.PI / 2, px = cx + Math.cos(a) * (r - 9), py = cy + Math.sin(a) * (r - 9);
      const pg = ctx.createRadialGradient(px - 2, py - 2, 1, px, py, 8);
      pg.addColorStop(0, '#ffffff'); pg.addColorStop(0.5, '#c9ced6'); pg.addColorStop(1, '#5d6470');
      ctx.beginPath(); ctx.arc(px, py, 7.5, 0, Math.PI * 2); ctx.fillStyle = pg; ctx.fill();
    }
  }
  // the flapper at the top flicks each time a peg passes it
  function kickFlapper(speed) {
    const f = $('#flapper', el); if (!f || !f.animate) return;
    const deg = Math.max(8, Math.min(28, 10 + speed * 18));
    f.animate([{ rotate: '0deg' }, { rotate: `-${deg}deg`, offset: 0.35 }, { rotate: '0deg' }], { duration: Math.max(90, 220 - speed * 120), easing: 'ease-out' });
  }
  function glowWedge(i) {
    glow = { i, a: 1 };
    const t0 = performance.now();
    const fade = now => {
      if (!glow || glow.i !== i) return;
      const p = (now - t0) / 2200;
      glow.a = p < 1 ? 0.55 + 0.45 * Math.cos(p * Math.PI * 6) * (1 - p) : 0;
      drawWheel();
      if (p < 1) requestAnimationFrame(fade); else glow = null;
    };
    requestAnimationFrame(fade);
  }
  const bulbTimer = setInterval(() => { bulbs++; if (!spinning && !glow) drawWheel(); }, 600);
  function wedgeAtPointer() {
    const norm = ((-rot % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    return Math.floor(norm / SEG) % N;
  }

  // ---------- puzzle ----------
  function finishGame() {
    if (d.settings.wheelBonus !== false && !(typeof Demo !== 'undefined' && Demo.running)) App.show('wheelBonus', puzzles.map(p => p.id));
    else App.endGame('Spin & Solve', 'wheelSetup');
  }
  function startPuzzle() {
    pIdx++;
    if (pIdx >= puzzles.length) { finishGame(); return; }
    puzzle = puzzles[pIdx];
    App.setNavEnabled(pIdx > 0, true);
    grid = puzzleGrid(puzzle.phrase);
    shown = new Set(); usedLetters = new Set(); bank = {};
    flipped = new Set(); mysteryIdx = null; // Mystery wedges reset each puzzle
    doubleNext = false; hintUsed = false;
    HostView.set({ game: '🎡 Spin & Solve', meta: `${puzzle.category} · Puzzle ${pIdx + 1} of ${puzzles.length}`, answer: puzzle.phrase, answerLabel: 'Puzzle' });
    drawWheel();
    teams.forEach(t => bank[t.id] = 0);
    // Puzzle 1: first team. After that: the team with the most points starts
    // (a tie goes to whichever tied team is first on the scoreboard).
    const leader = teams.reduce((best, t, i) => (t.score > teams[best].score ? i : best), 0);
    turn = pIdx === 0 ? 0 : leader;
    $('#wcat', el).textContent = `Category: ${puzzle.category}  ·  Puzzle ${pIdx + 1} of ${puzzles.length}`;
    drawPuzzle(); categoryIntro(); setTurnPhase(pIdx === 0 ? `${esc(teams[turn].name)} — spin the wheel!` : `${esc(teams[turn].name)} leads, so they start — spin!`);
  }
  function drawPuzzle() { renderBoard($('#puzzle', el), grid, ch => shown.has(ch)); }
  const letterCount = L => (puzzle.phrase.match(new RegExp(L, 'g')) || []).length;
  const remaining = set => [...new Set(puzzle.phrase.replace(/[^A-Z]/g, ''))].filter(L => set.includes(L) && !shown.has(L));
  const CONS = 'BCDFGHJKLMNPQRSTVWXYZ';

  function renderBanks() { // whose turn it is: glowing score box + chip in the top bar
    const t = teams[turn], pill = $('#wTurn');
    Scores.setActive(t.id);
    if (pill && pill.dataset.id !== t.id) { pill.dataset.id = t.id; pill.style.setProperty('--tc', t.color); pill.textContent = `🎡 ${t.name}`; pill.classList.remove('pop'); void pill.offsetWidth; pill.classList.add('pop'); }
  }
  // The letter keyboard only shows when a letter is being called (or typed); otherwise
  // a thin strip lists the letters already used.
  function showKeys(on) {
    $('#letters', el).classList.toggle('kb-hidden', !on);
    if (on) showTurnBar(false);
    const u = $('#used', el), list = [...usedLetters].sort();
    u.innerHTML = !on && list.length ? `<span class="hint">Used:</span> ${list.map(L => `<b class="${VOWELS.includes(L) ? 'v' : ''}">${L}</b>`).join('')}` : '';
  }
  function status(html) { $('#status', el).innerHTML = html; }
  // the big letter tile + count bubble that pops up over the category bar
  function callout(L, n) {
    const co = $('#callout', el);
    co.innerHTML = `<span class="co-l">${L}</span><span class="co-n ${n ? '' : 'zero'}">${n}</span>`;
    co.classList.remove('show'); void co.offsetWidth; co.classList.add('show');
    clearTimeout(co._t); co._t = setTimeout(() => co.classList.remove('show'), Math.max(1800, n * 700 + 900));
  }
  // "And the category is…" banner sweeping across the board
  function categoryIntro() {
    const ci = $('#catIntro', el);
    ci.innerHTML = `<span>And the category is:</span> <b>${esc(puzzle.category)}</b>`;
    ci.classList.remove('show'); void ci.offsetWidth; ci.classList.add('show');
    Sfx.whoosh();
  }
  function setLetters(mode) { // mode: 'cons' | 'vowel' | 'none'
    $$('#letters button', el).forEach(b => {
      const L = b.dataset.l, isV = VOWELS.includes(L);
      b.classList.toggle('used', usedLetters.has(L));
      const expressBlock = mode === 'express' && isV && teams[turn].score < d.settings.vowelCost; // vowels still cost on the Express
      b.disabled = usedLetters.has(L) || mode === 'none' || (mode === 'cons' && isV) || (mode === 'vowel' && !isV) || expressBlock; // 'free' / 'express' = any letter
    });
    showKeys(mode !== 'none');
  }
  function setActions(html, handlers) {
    showTurnBar(false);
    $('#actions', el).innerHTML = html;
    Object.entries(handlers || {}).forEach(([id, fn]) => { const b = $('#' + id, el); if (b) b.onclick = fn; });
  }

  function setTurnPhase(msg) {
    phase = 'turn';
    renderBanks();
    const t = teams[turn];
    const consLeft = remaining(CONS).length, vowLeft = remaining(VOWELS).length;
    const canVowel = vowLeft > 0 && t.score >= d.settings.vowelCost; // vowLeft = vowels in the puzzle still hidden
    status(msg + (consLeft ? '' : ' <span class="hint">(no consonants left)</span>') + (doubleNext ? ' <span class="pill dbl">✖2 next spin counts double</span>' : ''));
    $('#spin', el).disabled = !consLeft;
    setLetters('none');
    setActions(`
      <div class="pass-link"><button class="link-btn" id="aPass">Skip to next team ▶</button>${!hintUsed && remaining(CONS + VOWELS).length > 1 ? ' &nbsp;·&nbsp; <button class="link-btn" id="aHint" title="Reveals one letter for free (once per puzzle)">💡 Hint</button>' : ''}</div>`, {
      aHint: () => { hintUsed = true; freeLetter('💡 Hint:'); },
      aPass: () => nextTurn('Next team!'),
    });
    const vb = $('#aVowel', el);
    vb.disabled = !canVowel;
    $('#vowelNote', el).textContent = !vowLeft ? 'all up' : t.score < d.settings.vowelCost ? `needs ${fmt(d.settings.vowelCost)}` : fmt(d.settings.vowelCost);
    showTurnBar(true);
  }
  function nextTurn(msg) {
    doubleNext = false; // a Double Play only lasts for the team's own turn
    turn = (turn + 1) % teams.length;
    setTurnPhase(`${msg} ${esc(teams[turn].name)}'s turn.`);
  }

  function spin() {
    if (spinning || phase !== 'turn') return;
    spinning = true; phase = 'spinning';
    App.setNavEnabled(false, false);
    setLetters('none'); setActions('');
    status('Spinning…');
    const stage = $('#wheelStage', el);
    stage.classList.add('up');
    const start = rot;
    let dist = Math.PI * 2 * (4 + Math.random() * 3) + Math.random() * Math.PI * 2;
    if (App.wheelForce != null) { // demo: land on a chosen wedge
      const norm = (App.wheelForce + 0.3 + Math.random() * 0.4) * SEG;
      let end = -norm; while (end < start + Math.PI * 2 * 5) end += Math.PI * 2;
      dist = end - start; App.wheelForce = null;
    }
    // a little wind-up backwards, then a long smooth slow-down
    const back = 0.16, wind = 380, dur = 5200 + Math.random() * 1400, t0 = performance.now() + 650; // wait for the wheel to rise
    let lastW = wedgeAtPointer(), lastRot = rot, lastT = t0 + 650;
    Sfx.whoosh();
    const step = now => {
      const el2 = now - t0;
      if (el2 < 0) { rafId = requestAnimationFrame(step); return; }
      if (el2 < wind) { const q = el2 / wind; rot = start - back * Math.sin(q * Math.PI / 2); }
      else { const p = Math.min(1, (el2 - wind) / dur); rot = start - back + (dist + back) * (1 - Math.pow(1 - p, 3.6)); }
      drawWheel();
      const w = wedgeAtPointer();
      const speed = Math.min(1, Math.abs(rot - lastRot) / Math.max(1, now - lastT) * 40); lastRot = rot; lastT = now;
      if (w !== lastW) { lastW = w; Sfx.peg(speed); kickFlapper(speed); }
      if (el2 < wind + dur) rafId = requestAnimationFrame(step);
      else {
        glowWedge(w);
        // show where it landed for a moment, then the wheel sinks away and the result plays out
        setTimeout(() => {
          stage.classList.remove('up');
          setTimeout(() => { if (App.current !== 'wheelPlay') return; spinning = false; App.setNavEnabled(pIdx > 0, true); landed(w); }, 450);
        }, 1150);
      }
    };
    rafId = requestAnimationFrame(step);
  }
  function landed(wi) {
    const t = teams[turn];
    let w = W[wi];
    mysteryIdx = null;
    if (w === 'MYSTERY') {
      if (flipped.has(wi)) w = MYSTERY_VALUE;
      else {
        mysteryIdx = wi; spinValue = MYSTERY_VALUE; phase = 'cons';
        Sfx.ding();
        status(`<span class="big">🎁 MYSTERY!</span> ${fmt(MYSTERY_VALUE)} — call a consonant!`);
        setLetters('cons'); setActions('');
        return;
      }
    }
    if (w === 'BANKRUPT') {
      Sfx.bankrupt();
      $('.wheel-box', el)?.classList.add('bust'); setTimeout(() => $('.wheel-box', el)?.classList.remove('bust'), 700);
      const lost = Math.max(0, bank[t.id]);
      if (lost) Scores.add(t.id, -lost);
      bank[t.id] = 0;
      status(`<span class="big">💥 BANKRUPT!</span> ${lost ? `${esc(t.name)} loses the ${fmt(lost)} earned on this puzzle.` : ''}`);
      setTimeout(() => nextTurn('Ouch!'), 2200);
      return;
    }
    if (w === 'LOSE A TURN') { Sfx.loseTurn(); status(`<span class="big">😬 LOSE A TURN</span>`); setTimeout(() => nextTurn('Too bad!'), 1800); return; }
    if (w === 'FREE PLAY') {
      spinValue = FREE_PLAY_VALUE; phase = 'free';
      Sfx.ding();
      status(`<span class="big">🔓 FREE PLAY!</span> Any letter · vowels free · consonants ${fmt(FREE_PLAY_VALUE)} · no lost turn`);
      setLetters('free'); setActions('');
      return;
    }
    if (w === 'EXPRESS') return expressWedge(t);
    if (w === 'DOUBLE PLAY') {
      Sfx.bell(); doubleNext = true;
      setTurnPhase(`<span class="big">✖2 DOUBLE PLAY!</span> Spin again — your next spin counts double.`); return;
    }
    if (w === 'JACKPOT') {
      Sfx.solve(); confetti(1500);
      Scores.add(t.id, JACKPOT_WEDGE); bank[t.id] += JACKPOT_WEDGE;
      setTurnPhase(`<span class="big">💰 JACKPOT!</span> ${esc(t.name)} +${fmt(JACKPOT_WEDGE)} — spin again!`); return;
    }
    if (w === 'BONUS') {
      Sfx.solve(); confetti(1200);
      Scores.add(t.id, BONUS_WEDGE); bank[t.id] += BONUS_WEDGE;
      setTurnPhase(`<span class="big">🎉 BONUS!</span> ${esc(t.name)} +${fmt(BONUS_WEDGE)} — spin again!`); return;
    }
    if (w === 'WILD CARD') return freeLetter('<span class="big">🃏 WILD CARD!</span>', true);
    if (w === 'STEAL') return stealWedge(t);
    if (w === 'PAY IT FORWARD') return payForwardWedge(t);
    if (w === 'GRATITUDE') return gratitudeWedge(t);
    const dbl = doubleNext; doubleNext = false;
    spinValue = dbl ? w * 2 : w; phase = 'cons';
    Sfx.ding();
    status(dbl ? `<span class="big">${fmt(w)} ✖2 = ${fmt(spinValue)}</span> — call a consonant!` : `<span class="big">${fmt(w)}</span> — call a consonant!`);
    setLetters('cons');
    setActions('');
  }
  function pickLetter(L) {
    if (phase === 'solving') return typeLetter(L);
    if (!(phase === 'cons' || phase === 'vowel' || phase === 'free' || phase === 'express')) return;
    const t = teams[turn];
    const free = phase === 'free', express = phase === 'express';
    const wasVowel = phase === 'vowel' || ((free || express) && VOWELS.includes(L));
    usedLetters.add(L);
    if (wasVowel && !free && d.settings.vowelCost) { bank[t.id] -= d.settings.vowelCost; Scores.add(t.id, -d.settings.vowelCost); }
    const n = letterCount(L);
    if (!n) callout(L, 0);
    if (!n && free) { // Free Play: a miss doesn't cost the turn
      Sfx.noLetter();
      setTurnPhase(`No ${L}'s — but it's Free Play, so ${esc(t.name)} keeps the turn!`);
      return;
    }
    if (!n && express) { // a miss on the Express = BANKRUPT
      Sfx.noLetter(); setTimeout(() => Sfx.bankrupt(), 600); setLetters('none');
      const lost = Math.max(0, bank[t.id]);
      if (lost) Scores.add(t.id, -lost);
      bank[t.id] = 0;
      status(`No ${L}'s — <span class="big">💥 the Express crashed!</span>${lost ? ` ${esc(t.name)} loses ${fmt(lost)}.` : ''}`);
      phase = 'wait';
      setTimeout(() => nextTurn('BANKRUPT!'), 2600);
      return;
    }
    if (!n) {
      Sfx.noLetter(); setLetters('none');
      status(`No ${L}'s 😕`);
      phase = 'wait';
      setTimeout(() => nextTurn(`No ${L}.`), 1500);
      return;
    }
    drawPuzzle();
    status('');
    callout(L, n);
    const revealMs = revealTiles($('#puzzle', el), L); // light up, ding, then turn each tile
    shown.add(L);
    setLetters('none');
    const earned = wasVowel ? 0 : (express ? EXPRESS_VALUE : spinValue) * n;
    bank[t.id] += earned;
    if (earned) Scores.add(t.id, earned);
    phase = 'wait';
    const myst = !wasVowel && mysteryIdx != null ? mysteryIdx : null;
    mysteryIdx = null;
    setTimeout(() => {
      if (myst != null && App.current === 'wheelPlay') { offerFlip(t, earned, myst, n, L); return; }
      const done = !remaining(CONS + VOWELS).length;
      if (express && !done && App.current === 'wheelPlay') { expressPhase(`${n} ${L}${n > 1 ? "'s" : ''}! ${earned ? `+${fmt(earned)}. ` : ''}Keep going!`); return; }
      setTurnPhase(`${n} ${L}${n > 1 ? "'s" : ''}! ${earned ? `+${fmt(earned)}. ` : ''}${done ? 'Every letter is up — solve it!' : ''}`);
    }, revealMs + 200);
  }
  // ---------- 🚂 Express ----------
  function expressWedge(t) {
    phase = 'special'; Sfx.bell();
    status(`<span class="big">🚂 EXPRESS!</span>`);
    Modal.open({
      title: '🚂 All aboard the Express?',
      body: `<p style="font-size:19px;margin:0">${esc(t.name)}: <b>ride the Express</b> — call consonants for ${fmt(EXPRESS_VALUE)} each and buy vowels <b>without spinning</b>, as long as you like. But one wrong letter and it's <b style="color:#ffb3bb">BANKRUPT</b>!<br><br>Or play it safe: one consonant for ${fmt(EXPRESS_VALUE)}, like a normal spin.</p>`,
      actions: [
        { label: 'Play it safe', cls: 'ghost', onClick: c => { c(); spinValue = EXPRESS_VALUE; phase = 'cons'; status(`<span class="big">${fmt(EXPRESS_VALUE)}</span> — call a consonant!`); setLetters('cons'); setActions(''); } },
        { label: '🚂 All aboard!', cls: 'pink', onClick: c => { c(); Sfx.whoosh(); expressPhase('All aboard! Call a letter.'); } },
      ],
    });
  }
  function expressPhase(msg) {
    phase = 'express'; renderBanks();
    $('#spin', el).disabled = true;
    status(`<span class="pill express">🚂 EXPRESS · ${fmt(EXPRESS_VALUE)} a consonant · vowels ${fmt(d.settings.vowelCost)}</span> ${msg}`);
    setLetters('express');
    setActions(`<button class="btn lg green" id="aSolveX">Solve it! ✓</button><button class="btn lg ghost" id="aOff">🛑 Get off the Express</button>`, {
      aSolveX: () => { phase = 'turn'; solve(); }, aOff: () => setTurnPhase('Off the Express — spin, buy a vowel, or solve.'),
    });
  }
  // ---------- 🃏 Wild Card / 💡 Hint: reveal one letter for free ----------
  function freeLetter(title, spinAgain) {
    const pool = remaining(CONS).length ? remaining(CONS) : remaining(VOWELS);
    if (!pool.length) return setTurnPhase(title + ' Every letter is already up — solve it!');
    const L = pool[Math.floor(Math.random() * pool.length)];
    phase = 'wait'; setLetters('none'); setActions('');
    usedLetters.add(L);
    drawPuzzle();
    status(`${title} Here come the ${L}'s…`);
    const ms = revealTiles($('#puzzle', el), L);
    shown.add(L);
    setTimeout(() => {
      if (App.current !== 'wheelPlay') return;
      setTurnPhase(`${title} The ${L}'s are up${spinAgain ? ' — spin again!' : '.'}`);
    }, ms + 200);
  }
  // ---------- 🦹 Steal · 🤝 Pay it forward · 🙏 Gratitude ----------
  function pickTeam(title, intro, list, onPick, onNone) {
    let done = false;
    const m = Modal.open({
      title, body: `<p style="font-size:19px;margin:0 0 14px">${intro}</p>
        <div class="team-pick">${list.map(o => `<button class="tp" data-id="${o.t.id}" style="--tc:${o.t.color}"><b>${esc(o.t.name)}</b><small>${o.note}</small></button>`).join('')}</div>`,
      actions: [],
    });
    $$('.tp', m.el).forEach(b => b.onclick = () => { if (done) return; done = true; m.onClose = null; m.close(); onPick(teams.find(x => x.id === b.dataset.id)); });
    m.onClose = () => { if (!done) { done = true; onNone(); } };
  }
  const after = (t, msg) => setTurnPhase(msg);
  function stealWedge(t) {
    phase = 'special'; Sfx.ding();
    const others = teams.filter(o => o.id !== t.id && o.score > 0);
    status(`<span class="big">🦹 STEAL!</span>`);
    if (!others.length) {
      Scores.add(t.id, STEAL_AMOUNT); bank[t.id] += STEAL_AMOUNT;
      setTimeout(() => after(t, `Nobody has points to steal — so ${esc(t.name)} takes ${fmt(STEAL_AMOUNT)} from the bank!`), 1400);
      return;
    }
    pickTeam('🦹 Steal!', `<b>${esc(t.name)}</b>, who do you want to steal from? You take up to ${fmt(STEAL_AMOUNT)} points.`,
      others.map(o => ({ t: o, note: `${fmt(o.score)} pts` })),
      victim => {
        const amt = Math.min(STEAL_AMOUNT, victim.score);
        Scores.add(victim.id, -amt); Scores.add(t.id, amt); bank[t.id] += amt;
        Sfx.correct();
        after(t, `🦹 ${esc(t.name)} stole ${fmt(amt)} from ${esc(victim.name)}!`);
      },
      () => after(t, 'No steal this time.'));
  }
  function payForwardWedge(t) {
    phase = 'special'; Sfx.ding();
    status(`<span class="big">🤝 PAY IT FORWARD!</span>`);
    const others = teams.filter(o => o.id !== t.id);
    const give = other => {
      if (other) Scores.add(other.id, PAY_FORWARD);
      Scores.add(t.id, PAY_FORWARD); bank[t.id] += PAY_FORWARD;
      Sfx.correct(); confetti(1500);
      after(t, other ? `🤝 ${esc(t.name)} gave ${fmt(PAY_FORWARD)} to ${esc(other.name)} — and earned ${fmt(PAY_FORWARD)} too!` : `🤝 +${fmt(PAY_FORWARD)}!`);
    };
    if (!others.length) return give(null);
    pickTeam('🤝 Pay it forward', `Kindness pays! <b>${esc(t.name)}</b>, choose a team to give ${fmt(PAY_FORWARD)} points to — and you'll earn ${fmt(PAY_FORWARD)} too.`,
      others.map(o => ({ t: o, note: `${fmt(o.score)} pts` })), give, () => give(others[0]));
  }
  function gratitudeWedge(t) {
    phase = 'special'; Sfx.ding();
    status(`<span class="big">🙏 GRATITUDE!</span>`);
    let done = false;
    const finish = shared => {
      if (done) return; done = true;
      if (shared) { Scores.add(t.id, GRATITUDE_POINTS); bank[t.id] += GRATITUDE_POINTS; Sfx.correct(); confetti(1500); }
      after(t, shared ? `🙏 Thank you for sharing! ${esc(t.name)} +${fmt(GRATITUDE_POINTS)}.` : 'No problem!');
    };
    const m = Modal.open({
      title: '🙏 Gratitude',
      body: `<p style="font-size:21px;margin:0"><b>${esc(t.name)}</b>, share one thing you're grateful for today — big or small — and earn <b>${fmt(GRATITUDE_POINTS)}</b> points.</p>`,
      actions: [
        { label: 'Skip', cls: 'ghost', onClick: c => { m.onClose = null; c(); finish(false); } },
        { label: `✓ They shared one (+${fmt(GRATITUDE_POINTS)})`, cls: 'green', onClick: c => { m.onClose = null; c(); finish(true); } },
      ],
    });
    m.onClose = () => finish(false);
  }

  // ---------- 🎁 Mystery flip ----------
  function offerFlip(t, earned, wi, n, L) {
    let chosen = false;
    const keep = () => {
      if (chosen) return; chosen = true;
      const done = !remaining(CONS + VOWELS).length;
      setTurnPhase(`${n} ${L}${n > 1 ? "'s" : ''}! +${fmt(earned)}. ${done ? 'Every letter is up — solve it!' : ''}`);
    };
    const m = Modal.open({
      title: '🎁 Mystery wedge!',
      body: `<div class="flip-wrap">
          <div class="flip-card" id="flipCard"><div class="face front">?</div><div class="face back" id="flipBack"></div></div>
          <div class="flip-text"><p style="font-size:22px;margin:0 0 10px"><b>${esc(t.name)}</b> just earned <b style="color:var(--green)">+${fmt(earned)}</b>.</p>
          <p style="font-size:18px;margin:0" class="hint">Keep it — or give it up and <b>flip the card</b>:<br>💰 <b style="color:var(--yellow)">JACKPOT</b> +${fmt(JACKPOT)} &nbsp;or&nbsp; 💥 <b style="color:#ffb3bb">BANKRUPT</b> (lose everything from this puzzle). 50/50!</p></div>
        </div>`,
      actions: [
        { label: `Keep +${fmt(earned)}`, cls: 'ghost', onClick: c => { c(); } },
        { label: '🎁 Flip it!', cls: 'pink', onClick: (c, mb) => flip(c, mb) },
      ],
    });
    m.onClose = keep;
    function flip(close, mb) {
      if (chosen) return; chosen = true;
      $$('.modal .actions button').forEach(b => b.disabled = true);
      // give up this spin's points, then reveal
      Scores.add(t.id, -earned); bank[t.id] -= earned;
      const jackpot = App.mysteryForce ? App.mysteryForce === 'jackpot' : Math.random() < 0.5;
      App.mysteryForce = null;
      flipped.add(wi); drawWheel();
      const back = $('#flipBack', mb);
      back.classList.add(jackpot ? 'jackpot' : 'bust');
      back.innerHTML = jackpot ? `💰<br>JACKPOT<br>+${fmt(JACKPOT)}` : '💥<br>BANKRUPT';
      Sfx.reveal();
      setTimeout(() => $('#flipCard', mb).classList.add('flipped'), 300);
      setTimeout(() => {
        if (jackpot) {
          Scores.add(t.id, JACKPOT); bank[t.id] += JACKPOT;
          Sfx.fanfare(); confetti(2500);
        } else {
          const lost = Math.max(0, bank[t.id]);
          if (lost) Scores.add(t.id, -lost);
          bank[t.id] = 0;
          Sfx.wrong();
        }
      }, 1300);
      setTimeout(() => {
        m.onClose = null; close();
        if (App.current !== 'wheelPlay') return;
        if (jackpot) setTurnPhase(`<span class="big">💰 JACKPOT!</span> ${esc(t.name)} +${fmt(JACKPOT)}!`);
        else { status(`<span class="big">💥 BANKRUPT!</span> The gamble didn't pay off.`); setTimeout(() => nextTurn('Ouch!'), 1800); }
      }, 3600);
    }
  }

  // ---------- Solving: type the team's answer into the empty squares ----------
  let slots = [], cursor = 0;
  function solve() {
    if (phase !== 'turn') return;
    const t = teams[turn];
    phase = 'solving';
    App.setNavEnabled(false, false);
    $('#spin', el).disabled = true;
    slots = $$('.cell.l.hide', el).map((c, i) => {
      const slot = { el: c, want: c.textContent, got: '' };
      c.classList.remove('hide'); c.classList.add('slot'); c.textContent = '';
      c.onclick = () => { if (phase === 'solving') { cursor = i; markCursor(); } };
      return slot;
    });
    cursor = 0; markCursor();
    status(`✍️ Say it out loud — type it into the empty squares.`);
    $$('#letters button', el).forEach(b => { b.disabled = false; b.classList.remove('used'); });
    showKeys(true);
    setActions(`<button class="btn ghost" id="sBack" title="Backspace">⌫ Back</button>
      <button class="btn green" id="sCheck">Check answer ✓</button>
      <button class="btn ghost" id="sCancel">Cancel</button>`, { sBack: backspace, sCheck: checkSolve, sCancel: cancelSolve });
  }
  function markCursor() {
    slots.forEach((s, i) => s.el.classList.toggle('cur', i === cursor));
  }
  function typeLetter(L) {
    if (phase !== 'solving' || cursor >= slots.length) return;
    slots[cursor].got = L; slots[cursor].el.textContent = L;
    cursor = Math.min(cursor + 1, slots.length);
    markCursor(); Sfx.click();
  }
  function backspace() {
    if (phase !== 'solving' || !slots.length) return;
    cursor = eraseSlot(slots, cursor); markCursor(); Sfx.click();
  }

  function cancelSolve() {
    if (phase !== 'solving') return;
    drawPuzzle();
    App.setNavEnabled(pIdx > 0, true);
    setTurnPhase(`Spin, buy a vowel, or solve.`);
  }
  function checkSolve() {
    if (phase !== 'solving') return;
    const empty = slots.filter(s => !s.got).length;
    if (empty) { status(`Fill in every empty square first — ${empty} to go.`); return; }
    if (slots.every(s => s.got === s.want)) { App.setNavEnabled(pIdx > 0, true); solved(); return; }
    const t = teams[turn];
    phase = 'wait';
    slots.forEach(s => s.el.classList.add('bad'));
    Sfx.noLetter();
    setActions('');
    $$('#letters button', el).forEach(b => b.disabled = true);
    status(`<span class="big">✗ Not quite, ${esc(t.name)}!</span>`);
    setTimeout(() => {
      if (App.current !== 'wheelPlay') return;
      drawPuzzle();
      App.setNavEnabled(pIdx > 0, true);
      nextTurn('Wrong answer!');
    }, 2200);
  }
  function solved() {
    const t = teams[turn];
    const rest = remaining(CONS + VOWELS).join('');
    drawPuzzle();
    revealTiles($('#puzzle', el), rest, { gap: 70, turnGap: 45, pause: 200, quiet: true });
    [...CONS + VOWELS].forEach(L => shown.add(L));
    boardParty($('#puzzle', el));
    Scores.add(t.id, SOLVE_BONUS);
    Sfx.solve(); confetti(3000);
    $('#spin', el).disabled = true; setLetters('none');
    status(`<span class="big">🎉 ${esc(t.name)} solved it! +${fmt(SOLVE_BONUS)} bonus</span>`);
    const last = pIdx + 1 >= puzzles.length;
    setActions(`<button class="btn lg pink" id="aNext">${last ? (d.settings.wheelBonus !== false && !Demo.running ? 'Bonus Round 🏁' : 'Final scores 🏁') : 'Next puzzle ▶'}</button>`, { aNext: startPuzzle });
    phase = 'solved';
  }

  drawWheel();
  document.fonts?.ready.then(drawWheel);
  startPuzzle();
  const onKey = e => {
    if (Modal.stack.length) return;
    if (phase === 'solving') {
      if (/^[a-z]$/i.test(e.key)) { e.preventDefault(); typeLetter(e.key.toUpperCase()); }
      else if (e.key === 'Backspace') { e.preventDefault(); backspace(); }
      else if (e.key === 'Enter') { e.preventDefault(); checkSolve(); }
      else if (e.key === 'Escape') cancelSolve();
      return;
    }
    if (e.code === 'Space' && phase === 'turn') { e.preventDefault(); spin(); }
  };
  document.addEventListener('keydown', onKey);
  return () => { cancelAnimationFrame(rafId); clearInterval(bulbTimer); strip.stop(); document.body.classList.remove('wf-on'); glow = null; document.removeEventListener('keydown', onKey); Scores.setActive(null); };
};

// 🏁 BONUS ROUND — the leading team plays one last puzzle alone.
// R S T L N E are given; they pick 3 more consonants and 1 vowel, then have
// 30 seconds to say the answer. The host types it in to check it.
App.screens.wheelBonus = (el, usedIds = []) => {
  App.inGame = true;
  const d = App.data, teams = Scores.teams();
  const t = teams.reduce((best, x) => (x.score > best.score ? x : best), teams[0]);
  const GIVEN = 'RSTLNE', CONS = 'BCDFGHJKLMNPQRSTVWXYZ';
  const pool = d.wheel.filter(p => !usedIds.includes(p.id));
  const puzzle = shuffle(pool.length ? pool : d.wheel)[0];
  HostView.set({ game: '🏁 Bonus Round', meta: puzzle.category, answer: puzzle.phrase, answerLabel: 'Puzzle' });
  const grid = puzzleGrid(puzzle.phrase);
  const shown = new Set(), picks = [];
  let phase = 'intro', timerId, left = 30, slots = [], cursor = 0;
  Scores.setActive(t.id);
  App.gameBar({ title: '🏁 Bonus Round', endLabel: '⏭ Skip the bonus round', endAction: () => done() });

  el.innerHTML = `
    <div class="bonus">
      <div class="bonus-head"><span class="bonus-title">🏁 BONUS ROUND</span>
        <span class="bonus-sub"><span class="turn-pill sm" style="--tc:${t.color}">${esc(t.name)}</span> plays for <b>+${fmt(BONUS_PRIZE)}</b></span></div>
      <div class="pz-frame oval"><div class="puzzle" id="bPuzzle"></div></div>
      <div class="wcat">${esc(puzzle.category)}</div>
      <div class="status" id="bStatus"></div>
      <div class="bonus-picks" id="bPicks"></div>
      <div class="letters qwerty" id="bLetters">${qwertyKeys()}</div>
      <div class="wh-actions" id="bActions"></div>
    </div>`;
  $$('#bLetters button', el).forEach(b => b.onclick = () => press(b.dataset.l));

  function draw() { renderBoard($('#bPuzzle', el), grid, ch => shown.has(ch)); }
  const status = h => { $('#bStatus', el).innerHTML = h; };
  const actions = (h, hs = {}) => { $('#bActions', el).innerHTML = h; Object.entries(hs).forEach(([id, fn]) => { const b = $('#' + id, el); if (b) b.onclick = fn; }); };
  function letters(mode) {
    $('#bLetters', el).style.display = mode === 'none' ? 'none' : '';
    $$('#bLetters button', el).forEach(b => {
      const L = b.dataset.l, v = VOWELS.includes(L);
      const used = GIVEN.includes(L) || picks.includes(L);
      b.classList.toggle('used', used && mode !== 'type');
      b.disabled = mode === 'none' ? true : mode === 'type' ? false : used || (v ? picks.some(p => VOWELS.includes(p)) : picks.filter(p => !VOWELS.includes(p)).length >= 3);
    });
  }
  function showPicks() {
    const c = picks.filter(p => !VOWELS.includes(p)), v = picks.find(p => VOWELS.includes(p));
    $('#bPicks', el).innerHTML = phase === 'pick' || phase === 'picked' ? `Picks: ${[0, 1, 2].map(i => `<span>${c[i] || '?'}</span>`).join('')} + <span class="v">${v || '?'}</span>` : '';
  }

  // step 1: R S T L N E
  draw(); letters('none');
  status(`<b>${esc(t.name)}</b> has the most points! Here are your free letters…`);
  actions(`<button class="btn lg pink" id="bGo">Reveal R S T L N E</button>`, { bGo: () => {
    actions(''); status('R · S · T · L · N · E');
    draw(); const ms = revealTiles($('#bPuzzle', el), GIVEN, { gap: 260, turnGap: 140, pause: 300 });
    [...GIVEN].forEach(L => shown.add(L));
    setTimeout(() => {
      if (App.current !== 'wheelBonus') return;
      phase = 'pick'; letters('pick'); showPicks();
      status(`Now pick <b>3 more consonants</b> and <b>1 vowel</b>.`);
    }, ms);
  } });

  function press(L) {
    if (phase === 'type') return typeLetter(L);
    if (phase !== 'pick') return;
    picks.push(L); Sfx.click(); letters('pick'); showPicks();
    if (picks.length === 4) {
      phase = 'picked'; letters('none');
      actions(`<button class="btn ghost" id="bUndo">Change picks</button><button class="btn lg pink" id="bReveal">Reveal my letters</button>`, {
        bUndo: () => { picks.length = 0; phase = 'pick'; letters('pick'); showPicks(); actions(''); },
        bReveal: reveal,
      });
    }
  }
  function reveal() {
    const hits = picks.filter(L => puzzle.phrase.includes(L));
    phase = 'revealing'; actions(''); $('#bPicks', el).innerHTML = ''; status(hits.length ? 'Let\'s see those letters…' : 'None of those letters are in the puzzle!');
    draw(); const ms = hits.length ? revealTiles($('#bPuzzle', el), hits.join(''), { gap: 380, turnGap: 200, pause: 300 }) : (Sfx.noLetter(), 900);
    picks.forEach(L => shown.add(L));
    setTimeout(() => {
      if (App.current !== 'wheelBonus' || phase !== 'revealing') return;
      phase = 'clock';
      actions(`<button class="btn lg green" id="bType">They have an answer ✍️</button>`, { bType: startTyping });
      tick();
      timerId = setInterval(tick, 1000);
    }, ms);
  }
  function tick() {
    status(`<span class="bonus-clock ${left <= 3 ? 'low' : ''}">${left}</span> seconds to say the answer!`);
    if (left > 0 && left <= 5) Sfx.tick();
    if (left <= 0) {
      clearInterval(timerId); Sfx.buzz();
      status(`<span class="big">⏰ Time's up!</span>`);
      actions(`<button class="btn ghost" id="bLate">They answered in time — type it</button><button class="btn lg pink" id="bShow">Reveal the answer</button>`, { bLate: startTyping, bShow: () => finish(false) });
    }
    left--;
  }
  function startTyping() {
    clearInterval(timerId);
    phase = 'type';
    slots = $$('.cell.l.hide', el).map((c, i) => { const s = { el: c, want: c.textContent, got: '' }; c.classList.remove('hide'); c.classList.add('slot'); c.textContent = ''; c.onclick = () => { cursor = i; mark(); }; return s; });
    cursor = 0; mark(); letters('type');
    status(`Type <b>${esc(t.name)}</b>'s answer into the empty squares.`);
    actions(`<button class="btn ghost" id="bBack">⌫ Back</button><button class="btn lg green" id="bCheck">Check answer ✓</button>`, { bBack: back, bCheck: check });
  }
  const mark = () => slots.forEach((s, i) => s.el.classList.toggle('cur', i === cursor));
  function typeLetter(L) { if (cursor >= slots.length) return; slots[cursor].got = L; slots[cursor].el.textContent = L; cursor = Math.min(cursor + 1, slots.length); mark(); Sfx.click(); }
  function back() { cursor = eraseSlot(slots, cursor); mark(); Sfx.click(); }
  function check() {
    const empty = slots.filter(s => !s.got).length;
    if (empty) { status(`Fill in every empty square first — ${empty} to go.`); return; }
    finish(slots.every(s => s.got === s.want));
  }
  function finish(won) {
    clearInterval(timerId);
    phase = 'done'; letters('none');
    const rest = [...new Set(puzzle.phrase.replace(/[^A-Z]/g, ''))].filter(L => !shown.has(L)).join('');
    draw(); revealTiles($('#bPuzzle', el), rest, { gap: 70, turnGap: 45, pause: 200, quiet: true });
    [...puzzle.phrase].forEach(ch => /[A-Z]/.test(ch) && shown.add(ch));
    if (won) { Scores.add(t.id, BONUS_PRIZE); Sfx.solve(); confetti(3500); boardParty($('#bPuzzle', el), 4500); status(`<span class="big">🎉 ${esc(t.name)} solved the bonus puzzle! +${fmt(BONUS_PRIZE)}</span>`); }
    else { Sfx.bankrupt(); status(`<span class="big">So close!</span> The answer was <b>${esc(puzzle.phrase)}</b>.`); }
    actions(`<button class="btn lg pink" id="bDone">Final scores 🏁</button>`, { bDone: done });
  }
  function done() { clearInterval(timerId); App.endGame('Spin & Solve', 'wheelSetup'); }

  const onKey = e => {
    if (Modal.stack.length || Menu.isOpen()) return;
    if (phase === 'type') {
      if (/^[a-z]$/i.test(e.key)) { e.preventDefault(); typeLetter(e.key.toUpperCase()); }
      else if (e.key === 'Backspace') { e.preventDefault(); back(); }
      else if (e.key === 'Enter') { e.preventDefault(); check(); }
    } else if (phase === 'pick' && /^[a-z]$/i.test(e.key)) {
      const b = $(`#bLetters button[data-l="${e.key.toUpperCase()}"]`, el); if (b && !b.disabled) press(e.key.toUpperCase());
    }
  };
  document.addEventListener('keydown', onKey);
  return () => { clearInterval(timerId); document.removeEventListener('keydown', onKey); Scores.setActive(null); };
};
