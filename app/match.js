// 🃏 Match It — a memory game. Tiles hide a word or its clue; teams take turns flipping
// two at a time to find the matching word + clue. Uses the crossword puzzles (word | clue).
const MATCH_POINTS = 100;

App.screens.matchSetup = (el) => {
  const d = App.data, s = d.settings;
  const puzzles = (d.cross || []).filter(p => (p.entries || []).length >= 4);
  const cur = puzzles.find(p => p.id === s.matchPuzzle) || puzzles[0];
  el.innerHTML = `
    <div class="setup">
      <h1>🃏 Match It</h1>
      ${puzzles.length ? `
      <div class="panel">
        <p style="font-size:20px;margin:0 0 14px">Flip two tiles to find a <b>word and its clue</b>. Find a match: <b>${MATCH_POINTS} points and go again!</b> No match: the tiles flip back and the next team tries. Call out tiles by their numbers.</p>
        <label class="field"><span>Topic</span><select class="input" id="mPuz">
          ${Archive.options(puzzles.map(p => ({ value: p.id, name: p.title, selected: p === cur, label: `${p.title} (${p.entries.length} pairs)` })))}</select></label>
        <div class="field-row">
          <label class="field"><span>How to play</span><select class="input" id="mMode">
            <option value="teams" selected>${d.teams.length > 1 ? 'Teams (with points)' : `${esc(d.teams[0]?.name || 'Group')} (with points)`}</option>
            <option value="all">No teams — the whole group plays together</option></select></label>
          <label class="field"><span>How many pairs?</span><select class="input" id="mPairs"></select></label>
        </div>
        <label class="field"><span>Time per turn</span><select class="input" id="mTime">
          <option value="0" selected>♾️ No time limit</option>
          ${[15, 20, 30, 45].map(n => `<option value="${n}" ${s.matchTime === n ? 'selected' : ''}>${n} seconds to flip two tiles</option>`).join('')}</select></label>
        <div class="hint">Topics come from your crosswords (word | clue) — every crossword you add or import shows up here too.</div>
      </div>
      <button class="btn xl pink" id="go">Start! ▶</button>`
      : `<div class="panel empty">No crosswords yet — Match It uses their words and clues.<br><br><button class="btn yellow" id="add">🧩 Go to Crossword</button></div>`}
    </div>`;
  if (!puzzles.length) { $('#add', el).onclick = () => App.show('crossSetup'); return; }
  const fillPairs = () => {
    const p = puzzles.find(x => x.id === $('#mPuz', el).value), max = p.entries.length;
    const opts = [4, 6, 8, 10, 12].filter(n => n <= max);
    if (!opts.includes(Math.min(max, 12))) opts.push(Math.min(max, 12));
    const want = s.matchPairs && opts.includes(s.matchPairs) ? s.matchPairs : opts.includes(8) ? 8 : opts[opts.length - 1];
    $('#mPairs', el).innerHTML = opts.map(n => `<option value="${n}" ${n === want ? 'selected' : ''}>${n} pairs (${n * 2} tiles)</option>`).join('');
  };
  $('#mPuz', el).onchange = () => { s.matchPuzzle = $('#mPuz', el).value; App.save(); fillPairs(); };
  fillPairs();
  $('#go', el).onclick = () => {
    s.matchPuzzle = $('#mPuz', el).value; s.matchPairs = +$('#mPairs', el).value; s.matchTime = +$('#mTime', el).value; App.save();
    Scores.resetAll();
    App.show('matchPlay', { puzzle: s.matchPuzzle, pairs: s.matchPairs, mode: $('#mMode', el).value, time: s.matchTime });
  };
};

App.screens.matchPlay = (el, opts) => {
  const teamsMode = opts.mode === 'teams';
  const teams = Scores.teams();
  App.inGame = teamsMode;
  const p = (App.data.cross || []).find(x => x.id === opts.puzzle);
  if (!p) { App.show('matchSetup'); return; }
  const pairs = shuffle(p.entries).slice(0, opts.pairs);
  const tiles = shuffle(pairs.flatMap((e, i) => [{ pair: i, kind: 'word', text: e.word }, { pair: i, kind: 'clue', text: e.clue }]));
  const cols = tiles.length <= 12 ? 4 : tiles.length <= 16 ? 4 : tiles.length <= 20 ? 5 : 6;
  let turn = 0, first = null, lock = false, found = 0, tries = 0, flipT, clockT, left = opts.time || 0, paused = false, over = false;
  const team = () => teams[turn % teams.length];

  App.gameBar({
    title: '🃏 Match It',
    extra: teamsMode ? `<span class="turn-pill sm" id="mTurn"></span>` : '',
    ...(opts.time ? { pause: { toggle: () => { paused = !paused; RingClock.set($('#mClock', el), left, opts.time, paused); }, get: () => paused } } : {}),
    ...(teamsMode ? { endTitle: 'Match It', endScreen: 'matchSetup' } : {}),
  });
  el.innerHTML = `
    <div class="mt">
      <div class="mt-top"><span class="pill">${esc(p.title)}</span><span class="dr-count" id="mCount"></span><div class="spacer"></div><div class="dr-msg mt-msg" id="mMsg"></div>${opts.time ? RingClock.html('mClock', opts.time, 'sm') : ''}</div>
      <div class="mt-grid" style="--cols:${cols}">${tiles.map((t, i) => `
        <button class="mt-tile" data-i="${i}" aria-label="Tile ${i + 1}">
          <span class="mt-back">${i + 1}</span>
          <span class="mt-face ${t.kind}"><small>${t.kind === 'word' ? 'WORD' : 'CLUE'}</small><span class="mt-text">${esc(t.text)}</span></span>
        </button>`).join('')}</div>
      <div class="wh-actions dr-actions" id="mActs"></div>
    </div>`;
  const msg = html => { $('#mMsg', el).innerHTML = html; };
  const tileEl = i => $(`.mt-tile[data-i="${i}"]`, el);
  const count = () => { $('#mCount', el).textContent = `${found} of ${pairs.length} found${teamsMode ? '' : ` · ${tries} tr${tries === 1 ? 'y' : 'ies'}`}`; };
  function setTurnUI() {
    if (!teamsMode) return;
    const t = team(), pill = $('#mTurn');
    Scores.setActive(t.id);
    if (pill) { pill.style.setProperty('--tc', t.color); pill.textContent = `🃏 ${t.name}`; pill.classList.remove('pop'); void pill.offsetWidth; pill.classList.add('pop'); }
  }
  HostView.set({ game: '🃏 Match It', meta: p.title, answer: pairs.map(e => e.word).join(' · '), answerLabel: 'Words in play' });

  // ⏱ optional turn clock: a fresh clock for every go; run out and the turn passes
  function startClock() {
    if (!opts.time || over) return;
    clearInterval(clockT); left = opts.time; RingClock.set($('#mClock', el), left, opts.time, paused);
    clockT = setInterval(() => {
      if (paused || lock) return;
      left = Math.max(0, left - 0.1);
      RingClock.set($('#mClock', el), left, opts.time, paused);
      if (left <= 0) timeUp();
    }, 100);
  }
  function timeUp() {
    clearInterval(clockT); lock = true; Sfx.buzz();
    msg(`<span class="msg-bad">⏰ Time's up!</span>${teamsMode && teams.length > 1 ? ` — next up: <b>${esc(teams[(turn + 1) % teams.length].name)}</b>` : ''}`);
    flipT = setTimeout(() => {
      if (first !== null) { tileEl(first).classList.remove('up'); first = null; }
      lock = false; nextTurn();
    }, 1800);
  }
  function nextTurn() {
    if (teamsMode) { turn++; setTurnUI(); msg(`<b>${esc(team().name)}</b>, flip two tiles!`); } else msg('Flip two tiles!');
    startClock();
  }
  function flip(i) {
    const t = tiles[i], b = tileEl(i);
    if (lock || t.done || b.classList.contains('up')) return;
    Sfx.click();
    b.classList.add('up');
    if (first === null) { first = i; msg(`${teamsMode ? `<b>${esc(team().name)}</b>: ` : ''}pick one more tile`); return; }
    const a = tiles[first], ai = first; first = null; tries++;
    if (a.pair === t.pair) {
      a.done = t.done = true; found++;
      const color = teamsMode ? team().color : '#2fd27a';
      [tileEl(ai), b].forEach(x => { x.classList.add('done'); x.style.setProperty('--tc', color); });
      if (teamsMode) Scores.add(team().id, MATCH_POINTS);
      Sfx.correct(); count();
      if (found === pairs.length) return finish();
      msg(`<span class="msg-good">✓ Match!</span> ${teamsMode ? `${esc(team().name)} +${MATCH_POINTS} — go again!` : 'Keep going!'}`);
      startClock();
    } else {
      lock = true; Sfx.wrong(); count();
      msg(`<span class="msg-bad">No match</span>${teamsMode && teams.length > 1 ? ` — next up: <b>${esc(teams[(turn + 1) % teams.length].name)}</b>` : ''}`);
      flipT = setTimeout(() => {
        tileEl(ai).classList.remove('up'); b.classList.remove('up');
        lock = false; nextTurn();
      }, 2600);
    }
  }
  function finish() {
    over = true; clearInterval(clockT);
    confetti(2500); Sfx.correct();
    msg(`<span class="msg-good">🎉 All ${pairs.length} pairs found${teamsMode ? '' : ` in ${tries} tries`}!</span>`);
    if (teamsMode) $('#mActs', el).innerHTML = `<button class="btn lg pink" id="mEnd">Final scores 🏁</button>`;
    else $('#mActs', el).innerHTML = `<button class="btn lg pink" id="mAgain">Play again ▶</button><button class="btn lg ghost" id="mNew">Pick another topic</button>`;
    $('#mEnd', el) && ($('#mEnd', el).onclick = () => App.endGame('Match It', 'matchSetup'));
    $('#mAgain', el) && ($('#mAgain', el).onclick = () => App.show('matchPlay', opts));
    $('#mNew', el) && ($('#mNew', el).onclick = () => App.show('matchSetup'));
  }
  $$('.mt-tile', el).forEach(b => b.onclick = () => flip(+b.dataset.i));
  setTurnUI(); count();
  msg(teamsMode ? `<b>${esc(team().name)}</b>, flip two tiles!` : 'Flip two tiles!');
  startClock();
  return () => { clearTimeout(flipT); clearInterval(clockT); Scores.setActive(null); };
};
