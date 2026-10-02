// 🎡 Spin & Solve — spin the wheel, call letters, solve the puzzle.
const WEDGES = [500, 900, 700, 300, 800, 'BANKRUPT', 600, 400, 550, 'LOSE A TURN', 350, 500, 900, 300, 650, 'BANKRUPT', 700, 450, 350, 800, 600, 400, 1000, 300];
const WEDGE_COLORS = ['#ff3d8b', '#2f7bff', '#f5a300', '#1fb866', '#9b5bff', '#ff7a1f', '#12b5cf'];
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
      <button class="btn xl pink" id="go">Start! ▶</button>`
      : `<div class="panel empty">No puzzles yet.<br><br><button class="btn yellow" id="add">📝 Add some puzzles</button></div>`}
    </div>`;
  if (!d.wheel.length) { $('#add', el).onclick = () => App.show('editor', 'wheel'); return; }
  $('#go', el).onclick = () => {
    const cat = $('#cat', el).value;
    const pool = shuffle(d.wheel.filter(p => !cat || p.category === cat));
    Scores.resetAll(); // every new game starts at 0
    App.show('wheelPlay', pool.slice(0, +$('#num', el).value));
  };
};

App.screens.wheelPlay = (el, puzzles) => {
  App.inGame = true;
  const d = App.data;
  const teams = Scores.teams();
  // bank[teamId] = points that team has earned on the CURRENT puzzle (only used for BANKRUPT);
  // the points themselves go straight onto the scoreboard.
  let pIdx = -1, puzzle, rows, shown, usedLetters, bank, turn = Math.floor(Math.random() * teams.length) - 1;
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
    if (i >= puzzles.length) { App.show('results', 'Spin & Solve', 'wheelSetup'); return; }
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
    ctx.beginPath(); ctx.arc(cx, cy, r + 6, 0, Math.PI * 2); ctx.fillStyle = '#ffd23f'; ctx.fill();
    WEDGES.forEach((w, i) => {
      const a0 = rot + i * SEG - Math.PI / 2;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, r, a0, a0 + SEG); ctx.closePath();
      ctx.fillStyle = w === 'BANKRUPT' ? '#111' : w === 'LOSE A TURN' ? '#fff' : WEDGE_COLORS[i % WEDGE_COLORS.length];
      ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 3; ctx.stroke();
      // label along the radius
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(a0 + SEG / 2);
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillStyle = w === 'LOSE A TURN' ? '#111' : '#fff';
      const txt = String(w);
      ctx.font = `700 ${typeof w === 'number' ? 44 : w.length > 9 ? 22 : 26}px Fredoka, sans-serif`;
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
    if (pIdx >= puzzles.length) { App.show('results', 'Spin & Solve', 'wheelSetup'); return; }
    puzzle = puzzles[pIdx];
    App.setNavEnabled(pIdx > 0, true);
    rows = GSData.layoutPuzzle(puzzle.phrase).rows;
    shown = new Set(); usedLetters = new Set(); bank = {};
    teams.forEach(t => bank[t.id] = 0);
    turn = (turn + 1) % teams.length;
    $('#wcat', el).textContent = `${puzzle.category}  ·  Puzzle ${pIdx + 1} of ${puzzles.length}`;
    drawPuzzle(); setTurnPhase(`${esc(teams[turn].name)}, you're up — spin the wheel!`);
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
    const start = rot, dist = Math.PI * 2 * (4 + Math.random() * 3) + Math.random() * Math.PI * 2;
    const dur = 4200 + Math.random() * 1200, t0 = performance.now();
    let lastW = wedgeAtPointer();
    const step = now => {
      const p = Math.min(1, (now - t0) / dur);
      const e = 1 - Math.pow(1 - p, 3.2);
      rot = start + dist * e;
      drawWheel();
      const w = wedgeAtPointer();
      if (w !== lastW) { lastW = w; Sfx.peg(); }
      if (p < 1) rafId = requestAnimationFrame(step); else { spinning = false; App.setNavEnabled(pIdx > 0, true); landed(WEDGES[w]); }
    };
    rafId = requestAnimationFrame(step);
  }
  function landed(w) {
    const t = teams[turn];
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
    setTimeout(() => {
      const done = !remaining(CONS + VOWELS).length;
      setTurnPhase(`${n} ${L}${n > 1 ? "'s" : ''}! ${earned ? `+${fmt(earned)}. ` : ''}${done ? 'Every letter is up — solve it!' : `${esc(t.name)}: spin, buy a vowel, or solve.`}`);
    }, Math.min(n, 4) * 350 + 400);
  }
  function solve() {
    const t = teams[turn];
    Modal.open({
      title: `Did ${t.name} solve it?`,
      body: `<p style="font-size:22px;margin:0">Have ${esc(t.name)} say their answer out loud, then pick one.</p>`,
      actions: [
        { label: '✗ Wrong', cls: 'red', onClick: c => { c(); Sfx.wrong(); nextTurn(`Not quite!`); } },
        { label: '✓ Correct!', cls: 'green', onClick: c => { c(); solved(); } },
      ],
    });
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
  const onKey = e => { if (!Modal.stack.length && e.code === 'Space' && phase === 'turn') { e.preventDefault(); spin(); } };
  document.addEventListener('keydown', onKey);
  return () => { cancelAnimationFrame(rafId); document.removeEventListener('keydown', onKey); Scores.setActive(null); };
};
