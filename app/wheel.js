// 🎡 Spin & Solve — spin the wheel, call letters, solve the puzzle.
const WEDGES = [500, 900, 700, 300, 800, 'BANKRUPT', 600, 400, 'MYSTERY', 'LOSE A TURN', 350, 500, 900, 300, 650, 'BANKRUPT', 700, 450, 350, 800, 'MYSTERY', 400, 1000, 300];
// 🎁 Mystery wedge: plays as 1,000 per letter; after a correct consonant the team may give up
// those points to flip it — 50/50 JACKPOT (+2,500) or BANKRUPT. Once flipped, it's a plain 1,000.
const MYSTERY_VALUE = 1000, JACKPOT = 2500;
const WEDGE_COLORS = ['#ff3d8b', '#2f7bff', '#f5a300', '#1fb866', '#9b5bff', '#ff7a1f', '#12b5cf'];
const WEDGE_COLORS_CLASSIC = ['#8c3a4d', '#2f5687', '#9a7a32', '#3d7356', '#5d4a86', '#9c5f30', '#2f6f7c'];
const VOWELS = 'AEIOU';
const SOLVE_BONUS = 500;

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
        <div class="hint">Points go straight onto the scoreboard. Vowels cost ${d.settings.vowelCost}, solving adds a ${SOLVE_BONUS} bonus, and BANKRUPT takes away what that team earned on the current puzzle. Scores reset to 0 after each game.</div>
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
  let pIdx = -1, puzzle, rows, shown, usedLetters, bank, turn = 0;
  let phase, spinValue = 0, rot = Math.random() * Math.PI * 2, spinning = false, rafId;
  const N = WEDGES.length, SEG = (Math.PI * 2) / N;

  App.gameBar({
    back: () => navTo(pIdx - 1),
    next: () => navTo(pIdx + 1),
    backTitle: 'Previous puzzle', nextTitle: 'Next puzzle',
    endTitle: 'Spin & Solve', endScreen: 'wheelSetup',
  });
  async function navTo(i) {
    if (spinning || i < 0) return;
    if (phase !== 'solved' && usedLetters.size && !(await confirmBox('Leave this puzzle unsolved? Points already earned stay on the scoreboard.', 'Leave puzzle'))) return;
    if (i >= puzzles.length) { App.endGame('Spin & Solve', 'wheelSetup'); return; }
    pIdx = i - 1;
    startPuzzle();
  }

  el.innerHTML = `
    <div class="wh">
      <div class="wh-left">
        <div class="wheel-box"><div class="pointer"></div><canvas id="wheel" width="900" height="900"></canvas><div class="hub"></div></div>
        <button class="btn xl pink" id="spin">SPIN! 🎡</button>
      </div>
      <div class="wh-right">
        <div class="puzzle" id="puzzle"></div>
        <div class="wcat" id="wcat"></div>
        <div class="status" id="status"></div>
        <div class="letters" id="letters">${'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(L => `<button data-l="${L}" class="${VOWELS.includes(L) ? 'v' : ''}">${L}</button>`).join('')}</div>
        <div class="wh-actions" id="actions"></div>
      </div>
    </div>`;
  const cv = $('#wheel', el), ctx = cv.getContext('2d');
  $('#spin', el).onclick = spin;
  $$('#letters button', el).forEach(b => b.onclick = () => pickLetter(b.dataset.l));

  // ---------- wheel drawing ----------
  function drawWheel() {
    const cx = 450, cy = 450, r = 440;
    ctx.clearRect(0, 0, 900, 900);
    ctx.beginPath(); ctx.arc(cx, cy, r + 6, 0, Math.PI * 2); ctx.fillStyle = App.classic ? '#d4af6a' : '#ffd23f'; ctx.fill();
    WEDGES.forEach((w, i) => {
      const a0 = rot + i * SEG - Math.PI / 2;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, r, a0, a0 + SEG); ctx.closePath();
      const myst = w === 'MYSTERY' && !flipped.has(i);
      if (w === 'MYSTERY' && !myst) w = MYSTERY_VALUE; // already flipped this puzzle
      if (myst) {
        const g = ctx.createLinearGradient(cx, cy, cx + Math.cos(a0 + SEG / 2) * r, cy + Math.sin(a0 + SEG / 2) * r);
        g.addColorStop(0, App.classic ? '#1d3566' : '#5b1fa8'); g.addColorStop(1, App.classic ? '#8a6a28' : '#c48a00');
        ctx.fillStyle = g;
      } else ctx.fillStyle = w === 'BANKRUPT' ? '#111' : w === 'LOSE A TURN' ? (App.classic ? '#e9e1cf' : '#fff') : (App.classic ? WEDGE_COLORS_CLASSIC : WEDGE_COLORS)[i % WEDGE_COLORS.length];
      ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 3; ctx.stroke();
      // label along the radius
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(a0 + SEG / 2);
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillStyle = w === 'LOSE A TURN' ? '#111' : '#fff';
      const txt = myst ? '🎁 MYSTERY' : String(w);
      ctx.font = `${App.classic ? 600 : 700} ${typeof w === 'number' ? 44 : txt.length > 9 ? 22 : 26}px ${App.classic ? 'Oswald' : 'Fredoka'}, sans-serif`;
      if (myst) { ctx.fillStyle = '#ffd23f'; ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowOffsetY = 2; }
      if (typeof w === 'number') { ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowOffsetY = 3; }
      ctx.fillText(txt, r - 22, 0);
      ctx.restore();
    });
    // pegs
    for (let i = 0; i < N; i++) {
      const a = rot + i * SEG - Math.PI / 2;
      ctx.beginPath(); ctx.arc(cx + Math.cos(a) * (r - 8), cy + Math.sin(a) * (r - 8), 6, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();
    }
  }
  function wedgeAtPointer() {
    const norm = ((-rot % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    return Math.floor(norm / SEG) % N;
  }

  // ---------- puzzle ----------
  function startPuzzle() {
    pIdx++;
    if (pIdx >= puzzles.length) { App.endGame('Spin & Solve', 'wheelSetup'); return; }
    puzzle = puzzles[pIdx];
    App.setNavEnabled(pIdx > 0, true);
    rows = GSData.layoutPuzzle(puzzle.phrase).rows;
    shown = new Set(); usedLetters = new Set(); bank = {};
    flipped = new Set(); mysteryIdx = null; // Mystery wedges reset each puzzle
    drawWheel();
    teams.forEach(t => bank[t.id] = 0);
    // Puzzle 1: first team. After that: the team with the most points starts
    // (a tie goes to whichever tied team is first on the scoreboard).
    const leader = teams.reduce((best, t, i) => (t.score > teams[best].score ? i : best), 0);
    turn = pIdx === 0 ? 0 : leader;
    $('#wcat', el).textContent = `${puzzle.category}  ·  Puzzle ${pIdx + 1} of ${puzzles.length}`;
    drawPuzzle(); setTurnPhase(pIdx === 0 ? `${esc(teams[turn].name)}, you're up — spin the wheel!` : `${esc(teams[turn].name)} has the most points, so you start — spin the wheel!`);
  }
  function drawPuzzle(flashLetter) {
    const R = GSData.WHEEL_ROWS, Cn = GSData.WHEEL_COLS;
    const pad = Math.floor((R - rows.length) / 2);
    const grid = [];
    for (let r = 0; r < R; r++) {
      const line = rows[r - pad];
      const cells = Array(Cn).fill(null);
      if (line !== undefined) { const off = Math.floor((Cn - line.length) / 2); [...line].forEach((ch, i) => cells[off + i] = ch); }
      grid.push(cells);
    }
    let k = 0;
    $('#puzzle', el).innerHTML = grid.map(cells => `<div class="prow">${cells.map(ch => {
      if (ch === null || ch === ' ') return `<div class="cell"></div>`;
      const isL = /[A-Z]/.test(ch);
      const vis = !isL || shown.has(ch);
      const fl = flashLetter && ch === flashLetter;
      return `<div class="cell l ${vis ? '' : 'hide'} ${fl ? 'flash' : ''}" ${fl ? `style="animation-delay:${(k++) * 0.35}s"` : ''}>${esc(ch)}</div>`;
    }).join('')}</div>`).join('');
  }
  const letterCount = L => (puzzle.phrase.match(new RegExp(L, 'g')) || []).length;
  const remaining = set => [...new Set(puzzle.phrase.replace(/[^A-Z]/g, ''))].filter(L => set.includes(L) && !shown.has(L));
  const CONS = 'BCDFGHJKLMNPQRSTVWXYZ';

  function renderBanks() { // highlights whose turn it is on the scoreboard
    Scores.setActive(teams[turn].id);
  }
  function status(html) { $('#status', el).innerHTML = html; }
  function setLetters(mode) { // mode: 'cons' | 'vowel' | 'none'
    $$('#letters button', el).forEach(b => {
      const L = b.dataset.l, isV = VOWELS.includes(L);
      b.classList.toggle('used', usedLetters.has(L));
      b.disabled = usedLetters.has(L) || mode === 'none' || (mode === 'cons' && isV) || (mode === 'vowel' && !isV);
    });
  }
  function setActions(html, handlers) {
    $('#actions', el).innerHTML = html;
    Object.entries(handlers || {}).forEach(([id, fn]) => { const b = $('#' + id, el); if (b) b.onclick = fn; });
  }

  function setTurnPhase(msg) {
    phase = 'turn';
    renderBanks();
    const t = teams[turn];
    const consLeft = remaining(CONS).length, vowLeft = remaining(VOWELS).length;
    const canVowel = vowLeft > 0 && t.score >= d.settings.vowelCost;
    status(msg + (consLeft ? '' : ' <span class="hint">(no consonants left)</span>'));
    $('#spin', el).disabled = !consLeft;
    setLetters('none');
    setActions(`
      <button class="btn cyan" id="aVowel" ${canVowel ? '' : 'disabled'}>Buy a vowel (${d.settings.vowelCost})</button>
      <button class="btn green" id="aSolve">Solve it! ✓</button>
      <button class="btn ghost" id="aPass">Next team ▶</button>`, {
      aVowel: () => { phase = 'vowel'; status(`${esc(t.name)}: which vowel?`); setLetters('vowel'); $('#spin', el).disabled = true;
        setActions(`<button class="btn ghost" id="aCancel">Cancel</button>`, { aCancel: () => setTurnPhase(`${esc(t.name)}: spin, buy a vowel, or solve.`) }); },
      aSolve: solve,
      aPass: () => nextTurn('Next team!'),
    });
  }
  function nextTurn(msg) {
    turn = (turn + 1) % teams.length;
    setTurnPhase(`${msg} ${esc(teams[turn].name)}, it's your turn.`);
  }

  function spin() {
    if (spinning || phase !== 'turn') return;
    spinning = true; phase = 'spinning';
    App.setNavEnabled(false, false);
    $('#spin', el).disabled = true; setLetters('none'); setActions('');
    status('Spinning…');
    const start = rot;
    let dist = Math.PI * 2 * (4 + Math.random() * 3) + Math.random() * Math.PI * 2;
    if (App.wheelForce != null) { // demo: land on a chosen wedge
      const norm = (App.wheelForce + 0.3 + Math.random() * 0.4) * SEG;
      let end = -norm; while (end < start + Math.PI * 2 * 5) end += Math.PI * 2;
      dist = end - start; App.wheelForce = null;
    }
    const dur = 4200 + Math.random() * 1200, t0 = performance.now();
    let lastW = wedgeAtPointer();
    const step = now => {
      const p = Math.min(1, (now - t0) / dur);
      const e = 1 - Math.pow(1 - p, 3.2);
      rot = start + dist * e;
      drawWheel();
      const w = wedgeAtPointer();
      if (w !== lastW) { lastW = w; Sfx.peg(); }
      if (p < 1) rafId = requestAnimationFrame(step); else { spinning = false; App.setNavEnabled(pIdx > 0, true); landed(w); }
    };
    rafId = requestAnimationFrame(step);
  }
  function landed(wi) {
    const t = teams[turn];
    let w = WEDGES[wi];
    mysteryIdx = null;
    if (w === 'MYSTERY') {
      if (flipped.has(wi)) w = MYSTERY_VALUE;
      else {
        mysteryIdx = wi; spinValue = MYSTERY_VALUE; phase = 'cons';
        Sfx.ding();
        status(`<span class="big">🎁 MYSTERY!</span> Worth ${fmt(MYSTERY_VALUE)} — ${esc(t.name)}, call a consonant!`);
        setLetters('cons'); setActions('');
        return;
      }
    }
    if (w === 'BANKRUPT') {
      Sfx.wrong();
      const lost = Math.max(0, bank[t.id]);
      if (lost) Scores.add(t.id, -lost);
      bank[t.id] = 0;
      status(`<span class="big">💥 BANKRUPT!</span> ${lost ? `${esc(t.name)} loses the ${fmt(lost)} earned on this puzzle.` : ''}`);
      setTimeout(() => nextTurn('Ouch!'), 2200);
      return;
    }
    if (w === 'LOSE A TURN') { Sfx.buzz(); status(`<span class="big">😬 LOSE A TURN</span>`); setTimeout(() => nextTurn('Too bad!'), 1800); return; }
    spinValue = w; phase = 'cons';
    Sfx.ding();
    status(`<span class="big">${fmt(w)}</span> — ${esc(t.name)}, call a consonant!`);
    setLetters('cons');
    setActions('');
  }
  function pickLetter(L) {
    if (phase === 'solving') return typeLetter(L);
    if (!(phase === 'cons' || phase === 'vowel')) return;
    const t = teams[turn];
    const wasVowel = phase === 'vowel';
    usedLetters.add(L);
    if (wasVowel && d.settings.vowelCost) { bank[t.id] -= d.settings.vowelCost; Scores.add(t.id, -d.settings.vowelCost); }
    const n = letterCount(L);
    if (!n) {
      Sfx.wrong(); setLetters('none');
      status(`No ${L}'s 😕`);
      phase = 'wait';
      setTimeout(() => nextTurn(`No ${L}.`), 1500);
      return;
    }
    shown.add(L);
    drawPuzzle(L);
    for (let i = 0; i < n; i++) setTimeout(() => Sfx.ding(), i * 350);
    const earned = wasVowel ? 0 : spinValue * n;
    bank[t.id] += earned;
    if (earned) Scores.add(t.id, earned);
    phase = 'wait';
    const myst = !wasVowel && mysteryIdx != null ? mysteryIdx : null;
    mysteryIdx = null;
    setTimeout(() => {
      if (myst != null && App.current === 'wheelPlay') { offerFlip(t, earned, myst, n, L); return; }
      const done = !remaining(CONS + VOWELS).length;
      setTurnPhase(`${n} ${L}${n > 1 ? "'s" : ''}! ${earned ? `+${fmt(earned)}. ` : ''}${done ? 'Every letter is up — solve it!' : `${esc(t.name)}: spin, buy a vowel, or solve.`}`);
    }, Math.min(n, 4) * 350 + 400);
  }
  // ---------- 🎁 Mystery flip ----------
  function offerFlip(t, earned, wi, n, L) {
    let chosen = false;
    const keep = () => {
      if (chosen) return; chosen = true;
      const done = !remaining(CONS + VOWELS).length;
      setTurnPhase(`${n} ${L}${n > 1 ? "'s" : ''}! +${fmt(earned)}. ${done ? 'Every letter is up — solve it!' : `${esc(t.name)}: spin, buy a vowel, or solve.`}`);
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
        if (jackpot) setTurnPhase(`<span class="big">💰 JACKPOT!</span> ${esc(t.name)} +${fmt(JACKPOT)}! Spin, buy a vowel, or solve.`);
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
    status(`✍️ ${esc(t.name)}, say your answer! Type it into the empty squares.`);
    $$('#letters button', el).forEach(b => { b.disabled = false; b.classList.remove('used'); });
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
    if (cursor > 0 && (cursor >= slots.length || !slots[cursor].got)) cursor--;
    slots[cursor].got = ''; slots[cursor].el.textContent = '';
    markCursor();
  }
  function cancelSolve() {
    if (phase !== 'solving') return;
    drawPuzzle();
    App.setNavEnabled(pIdx > 0, true);
    setTurnPhase(`${esc(teams[turn].name)}: spin, buy a vowel, or solve.`);
  }
  function checkSolve() {
    if (phase !== 'solving') return;
    const empty = slots.filter(s => !s.got).length;
    if (empty) { status(`Fill in every empty square first — ${empty} to go.`); return; }
    if (slots.every(s => s.got === s.want)) { App.setNavEnabled(pIdx > 0, true); solved(); return; }
    const t = teams[turn];
    phase = 'wait';
    slots.forEach(s => s.el.classList.add('bad'));
    Sfx.wrong();
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
    [...CONS + VOWELS].forEach(L => shown.add(L));
    drawPuzzle();
    Scores.add(t.id, SOLVE_BONUS);
    Sfx.fanfare(); confetti(2500);
    $('#spin', el).disabled = true; setLetters('none');
    status(`<span class="big">🎉 ${esc(t.name)} solved it! +${fmt(SOLVE_BONUS)} bonus</span>`);
    const last = pIdx + 1 >= puzzles.length;
    setActions(`<button class="btn lg pink" id="aNext">${last ? 'Final scores 🏁' : 'Next puzzle ▶'}</button>`, { aNext: startPuzzle });
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
  return () => { cancelAnimationFrame(rafId); document.removeEventListener('keydown', onKey); Scores.setActive(null); };
};
