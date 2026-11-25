// 🗣️ Say It, Don't Say It — one person describes the word without saying it (or any of its
// "don't say" words) while their team races the clock to guess as many as they can.
// Uses the Draw It word lists; a word's optional "don't say" words come from its third part.
const SAY_POINTS = 100;
const SAY_STOP = new Set('a an the of in on at to and or for with your you my our their his her its is are be someone something while from into out up by as'.split(' '));
// The words the clue-giver can't say: every real word of the answer, plus its "don't say" list.
function sayBanned(w) {
  const own = w.word.split(/[\s\-\/]+/).map(x => x.replace(/[^a-z0-9']/gi, '')).filter(x => x && !SAY_STOP.has(x.toLowerCase()));
  const seen = new Set();
  return [...own, ...(w.banned || [])].filter(x => { const k = x.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
}

App.screens.sayitSetup = (el) => {
  const d = App.data;
  const L = GameFiles.pick('draw');
  const count = lv => L.filter(w => lv === 'mix' || w.level === lv).length;
  el.innerHTML = `
    <div class="setup">
      <h1>🗣️ Say It, Don't Say It</h1>
      ${d.draw.length ? `
      <div class="panel">
        <p style="font-size:20px;margin:0 0 14px">One person describes the word <b>without saying it</b> — or any of the "don't say" words — while their team guesses as many as they can before time runs out. <b>${SAY_POINTS} points a word!</b></p>
        <div class="field-row">
          <label class="field"><span>How to play</span><select class="input" id="sMode">
            <option value="teams" selected>${d.teams.length > 1 ? 'Teams (with points)' : `${esc(d.teams[0]?.name || 'Group')} (with points)`}</option>
            <option value="all">No teams — just for fun</option></select></label>
          <label class="field"><span>Words</span><select class="input" id="sLevel">
            ${['mix', 'easy', 'medium', 'hard'].map(lv => `<option value="${lv}">${lv === 'mix' ? '🎲 Mix of all levels' : DRAW_LABEL[lv]} — ${count(lv)} words</option>`).join('')}</select></label>
        </div>
        <div class="field-row">
          <label class="field"><span>Time per turn</span><select class="input" id="sTime">
            ${[45, 60, 90, 120].map(s => `<option value="${s}" ${s === 60 ? 'selected' : ''}>${s} seconds</option>`).join('')}
            <option value="0">♾️ No time limit — tap End turn</option></select></label>
          <label class="field" id="sRoundsF"><span>Turns for each team</span><select class="input" id="sRounds">
            ${[1, 2, 3, 4].map(n => `<option value="${n}" ${n === 2 ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
        </div>
        <div class="hint">Uses your Draw It word lists — the same Question sets work here. The clue-giver taps <b>👀 Peek</b> to see each word while everyone else looks away. Add extra "don't say" words to any word in 📝 Questions → 🎨 Draw It.</div>
      </div>
      <button class="btn xl pink" id="go">Start! ▶</button>`
      : `<div class="panel empty">No words yet.<br><br><button class="btn yellow" id="add">📝 Add some words</button></div>`}
    </div>`;
  if (!d.draw.length) { $('#add', el).onclick = () => App.show('editor', 'draw'); return; }
  const syncRounds = () => { $('#sRoundsF', el).style.display = $('#sMode', el).value === 'teams' ? '' : 'none'; };
  $('#sMode', el).onchange = syncRounds; syncRounds();
  $('#go', el).onclick = () => {
    const level = $('#sLevel', el).value;
    if (!L.some(w => level === 'mix' || w.level === level)) { toast('No words at that level yet — pick another, or add some in 📝 Questions.', true); return; }
    Scores.resetAll();
    App.show('sayitPlay', { mode: $('#sMode', el).value, level, time: +$('#sTime', el).value, rounds: +$('#sRounds', el).value });
  };
};

App.screens.sayitPlay = (el, opts) => {
  const teamsMode = opts.mode === 'teams';
  const teams = Scores.teams();
  App.inGame = teamsMode;
  let deck = Played.order(GameFiles.pick('draw').filter(w => opts.level === 'mix' || w.level === opts.level));
  let wi = -1, word, turn = 0, turnsDone = 0, phase, timerId, left, paused = false, peekT, got = [];
  const totalTurns = teamsMode ? opts.rounds * teams.length : Infinity;
  const team = () => teams[turn % teams.length];

  App.gameBar({
    title: "🗣️ Say It",
    extra: teamsMode ? `<span class="turn-pill sm" id="sTurn"></span>` : '',
    pause: { toggle: () => { if (phase !== 'say' || !opts.time) return; paused = !paused; RingClock.set($('#sClock', el), left, opts.time, paused); }, get: () => paused },
    ...(teamsMode ? { endTitle: "Say It, Don't Say It", endScreen: 'sayitSetup' } : {}),
  });

  el.innerHTML = `
    <div class="dr si">
      <div class="dr-top"><span class="dr-count" id="sCount"></span><div class="spacer"></div><span class="pill si-tally" id="sTally"></span></div>
      <div class="dr-card" id="sCard"></div>
      <div class="dr-msg" id="sMsg"></div>
      <div class="wh-actions dr-actions" id="sActs"></div>
    </div>`;
  const card = html => { $('#sCard', el).innerHTML = html; };
  const msg = html => { $('#sMsg', el).innerHTML = html; };
  const acts = (html, hs = {}) => { $('#sActs', el).innerHTML = html; Object.entries(hs).forEach(([id, fn]) => { const b = $('#' + id, el); if (b) b.onclick = fn; }); };
  const stop = () => { clearInterval(timerId); clearTimeout(peekT); };
  const tally = () => { $('#sTally', el).textContent = phase === 'ready' || phase === 'over' ? '' : `✓ ${got.length} word${got.length === 1 ? '' : 's'} this turn`; };
  const badge = () => teamsMode ? `<span class="dr-team" style="--tc:${team().color}">${esc(team().name)}</span>` : '';
  const clock = () => opts.time ? RingClock.html('sClock', left) : '';
  const liveCard = on => { const c = $('#sCard', el); c.classList.toggle('si-live', on); if (teamsMode) c.style.setProperty('--tc', team().color); };

  function setTurnUI() {
    if (!teamsMode) return;
    const t = team(), pill = $('#sTurn');
    Scores.setActive(t.id);
    if (pill) { pill.style.setProperty('--tc', t.color); pill.textContent = `🗣️ ${t.name}`; pill.classList.remove('pop'); void pill.offsetWidth; pill.classList.add('pop'); }
  }
  function nextWord() {
    wi++;
    if (wi >= deck.length) { deck = shuffle(deck); wi = 0; }
    word = deck[wi];
    HostView.set({ game: "🗣️ Say It, Don't Say It", meta: teamsMode ? `${team().name} is guessing` : '', answer: word.word, answerLabel: `Don't say: ${sayBanned(word).join(', ')}` });
  }

  // 1. a new turn: the team picks a clue-giver
  function ready() {
    stop(); phase = 'ready'; paused = false; got = []; liveCard(false);
    if (teamsMode && turnsDone >= totalTurns) { App.endGame("Say It, Don't Say It", 'sayitSetup'); return; }
    setTurnUI(); tally();
    $('#sCount', el).textContent = teamsMode ? `Turn ${turnsDone + 1} of ${totalTurns}` : `Turn ${turnsDone + 1}`;
    card(`<div class="dr-ready">${badge()}
      <div class="dr-big">Pick a clue-giver! 🗣️</div>
      <div class="dr-sub">Describe each word without saying it or any <b>"don't say"</b> word.</div>
      <div class="dr-sub si-rule">No spelling, rhyming or "sounds like"!</div></div>`);
    msg('');
    acts(`<button class="btn lg pink" id="sStart">Start turn ▶ <kbd>Space</kbd></button>`, { sStart: () => { left = opts.time || 0; between(''); } });
  }
  // 2. between words the clock is paused and the clue-giver peeks at the next one
  function between(flash) {
    stop(); phase = 'peek'; nextWord(); tally(); liveCard(false);
    card(`<div class="dr-ready">${flash ? `<div class="si-flash">${flash}</div>` : ''}
      <div class="dr-big">👀 Clue-giver only!</div>
      <div class="dr-sub">Everyone else, look away — then tap <b>Peek</b> to see the ${flash ? 'next' : 'first'} word.</div></div>`);
    msg(opts.time ? `<span class="si-paused">⏸ Clock paused at ${Math.ceil(left)}</span>` : '');
    acts(`<button class="btn lg pink" id="sPeek">👀 Peek</button>`, { sPeek: peek });
  }
  function peek() {
    let n = 5;
    const show = () => card(`<div class="dr-word">${esc(word.word)}</div>
      <div class="si-ban"><span>🚫 Don't say:</span>${sayBanned(word).map(b => `<b>${esc(b)}</b>`).join('')}</div>
      <div class="dr-sub">Hiding in ${n}…</div>`);
    show();
    acts(`<button class="btn lg green" id="sReady">I'm ready — go! ▶</button>`, { sReady: say });
    const tick = () => { n--; if (n > 0) { show(); peekT = setTimeout(tick, 1000); } else say(); };
    peekT = setTimeout(tick, 1000);
  }
  // 3. describing: the clock runs
  function say() {
    stop(); phase = 'say'; msg('');
    card(`<div class="dr-ready">${badge()}<div class="dr-big"><span class="si-talk">🗣️</span> Describe it!</div>
      ${opts.time ? clock() : `<div class="si-big-tally">✓ ${got.length}</div><div class="dr-sub">word${got.length === 1 ? '' : 's'} so far</div>`}</div>`);
    liveCard(true);
    if (opts.time) RingClock.set($('#sClock', el), left, opts.time, paused);
    acts(`<button class="btn lg green" id="sGot">✓ Got it!${teamsMode ? ` <small>+${SAY_POINTS}</small>` : ''}</button>
      <button class="btn lg red" id="sSaid">🚫 Said it!</button>
      <button class="btn lg ghost" id="sSkip">⏭ Skip</button>
      ${opts.time ? '' : `<button class="btn lg ghost" id="sEnd">⏹ End turn</button>`}`, {
      sGot: () => { if (phase !== 'say') return; Played.mark(word); got.push(word.word); if (teamsMode) Scores.add(team().id, SAY_POINTS); Sfx.correct(); between(`<span class="msg-good">✓ ${esc(word.word)}</span>${teamsMode ? ` <span class="si-plus">+${SAY_POINTS}</span>` : ''}`); },
      sSaid: () => { if (phase !== 'say') return; Played.mark(word); Sfx.buzz(); between(`<span class="msg-bad">🚫 Said it! The word was ${esc(word.word)}</span>`); buzz(); },
      sSkip: () => { if (phase !== 'say') return; Sfx.click(); between(`<span class="si-skip">⏭ Skipped</span>`); },
      sEnd: () => { if (phase === 'say') turnOver(true); },
    });
    if (!opts.time) return; // ♾️ no clock: the turn ends with ⏹ End turn
    timerId = setInterval(() => {
      if (phase !== 'say' || paused) return;
      left = Math.max(0, left - 0.1);
      RingClock.set($('#sClock', el), left, opts.time, paused);
      if (left <= 0) turnOver();
    }, 100);
  }
  const buzz = () => { const c = $('#sCard', el); c.classList.remove('si-buzz'); void c.offsetWidth; c.classList.add('si-buzz'); };
  // 4. time's up: show how they did, next team
  function turnOver(ended) {
    stop(); phase = 'over'; liveCard(false);
    if (ended) Sfx.click(); else { Sfx.buzz(); setTimeout(buzz, 0); }
    const n = got.length;
    card(`<div class="dr-ready">${badge()}<div class="dr-big">${ended ? '⏹ Turn over!' : "⏰ Time's up!"}</div>
      <div class="si-score">${n} word${n === 1 ? '' : 's'}${teamsMode && n ? ` · +${fmt(n * SAY_POINTS)}` : ''}</div>
      ${n ? `<div class="si-list">${got.map(w => `<span>${esc(w)}</span>`).join('')}</div>` : ''}
      ${ended ? '' : `<div class="dr-sub">The last word was <b>${esc(word.word)}</b></div>`}</div>`);
    msg(''); tally();
    turnsDone++; turn++;
    const last = teamsMode && turnsDone >= totalTurns;
    acts(`<button class="btn lg pink" id="sNext">${last ? 'Final scores 🏁' : teamsMode ? `Next: ${esc(team().name)} ▶` : 'Next clue-giver ▶'} <kbd>Space</kbd></button>`, { sNext: ready });
  }

  const onKey = e => {
    if (Modal.stack.length || Menu.isOpen() || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
    if (e.code !== 'Space' && e.key !== 'Enter') return;
    e.preventDefault();
    if (phase === 'ready') { left = opts.time || 0; between(''); }
    else if (phase === 'over') ready();
  };
  document.addEventListener('keydown', onKey);
  ready();
  return () => { stop(); document.removeEventListener('keydown', onKey); Scores.setActive(null); };
};
