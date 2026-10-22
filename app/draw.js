// 🎨 Draw It — a Pictionary-style game. One person draws (on a whiteboard, paper or
// easel) while their team guesses. The artist sees the word privately with a quick
// "Peek" on the big screen while everyone else looks away.
const DRAW_POINTS = { easy: 100, medium: 200, hard: 300 };
const DRAW_LABEL = { easy: '🟢 Easy', medium: '🟡 Medium', hard: '🔴 Hard' };

App.screens.drawSetup = (el) => {
  const d = App.data;
  const count = lv => d.draw.filter(w => lv === 'mix' || w.level === lv).length;
  el.innerHTML = `
    <div class="setup">
      <h1>🎨 Draw It</h1>
      ${d.draw.length ? `
      <div class="panel">
        <p style="font-size:20px;margin:0 0 14px">One person draws, everyone else guesses before time runs out — <b>whoever guesses it draws next!</b> No letters or numbers in the drawing.</p>
        <div class="field-row">
          <label class="field"><span>How to play</span><select class="input" id="dMode">
            <option value="teams" ${d.teams.length > 1 ? 'selected' : ''}>${d.teams.length > 1 ? 'Teams (with points)' : `${esc(d.teams[0]?.name || 'Group')} (with points)`}</option>
            <option value="all" ${d.teams.length > 1 ? '' : 'selected'}>No teams — everyone guesses, just for fun</option></select></label>
          <label class="field"><span>Words</span><select class="input" id="dLevel">
            ${['mix', 'easy', 'medium', 'hard'].map(lv => `<option value="${lv}">${lv === 'mix' ? '🎲 Mix of all levels' : DRAW_LABEL[lv]}${lv === 'mix' ? '' : ` (${DRAW_POINTS[lv]} pts)`} — ${count(lv)} words</option>`).join('')}</select></label>
        </div>
        <div class="field-row">
          <label class="field"><span>Time to draw</span><select class="input" id="dTime">
            ${[45, 60, 90, 120].map(s => `<option value="${s}" ${s === 60 ? 'selected' : ''}>${s} seconds</option>`).join('')}<option value="0">♾️ No time limit</option></select></label>
          <label class="field" id="dRoundsF"><span>How many drawings?</span><select class="input" id="dRounds">
            ${[5, 8, 10, 15, 20].map(n => `<option value="${n}" ${n === 10 ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
        </div>
        <div class="hint">Tip: the artist taps <b>👀 Peek</b> to see the word on the big screen while everyone else looks away.</div>
      </div>
      <button class="btn xl pink" id="go">Start! ▶</button>
      <div><button class="link-btn" id="demo">🎬 Watch a demo first</button></div>`
      : `<div class="panel empty">No drawing words yet.<br><br><button class="btn yellow" id="add">📝 Add some words</button></div>`}
    </div>`;
  if (!d.draw.length) { $('#add', el).onclick = () => App.show('editor', 'draw'); return; }
  $('#demo', el).onclick = () => Demo.start('draw');
  const syncRounds = () => { $('#dRoundsF', el).style.display = $('#dMode', el).value === 'teams' ? '' : 'none'; };
  $('#dMode', el).onchange = syncRounds; syncRounds();
  $('#go', el).onclick = () => {
    const level = $('#dLevel', el).value;
    const pool = d.draw.filter(w => level === 'mix' || w.level === level);
    if (!pool.length) { toast('No words at that level yet — pick another, or add some in 📝 Questions.', true); return; }
    Scores.resetAll();
    App.show('drawPlay', { mode: $('#dMode', el).value, level, time: +$('#dTime', el).value, rounds: +$('#dRounds', el).value });
  };
};

App.screens.drawPlay = (el, opts) => {
  const d = App.data, teamsMode = opts.mode === 'teams';
  const teams = Scores.teams();
  App.inGame = teamsMode; // the scoreboard only shows when teams are playing for points
  let deck = Played.order(d.draw.filter(w => opts.level === 'mix' || w.level === opts.level));
  let wi = -1, word, turn = 0, turnsDone = 0, phase, timerId, left, paused = false, peekT;
  // opts.rounds = how many drawings in the game. Whoever guesses a drawing draws the next one.
  const totalTurns = teamsMode ? opts.rounds : Infinity;
  const multi = teamsMode && teams.length > 1;
  const R = 52, C = 2 * Math.PI * R;
  const team = () => teams[turn % teams.length];

  App.gameBar({
    title: '🎨 Draw It',
    extra: teamsMode ? `<span class="turn-pill sm" id="dTurn"></span>` : '',
    next: () => { if (phase !== 'reveal') skipWord(); },
    nextTitle: 'Skip this word',
    pause: { toggle: () => { if (phase !== 'draw') return; paused = !paused; $('#dTimer', el)?.classList.toggle('paused', paused); $('#dBig', el)?.classList.toggle('paused', paused); }, get: () => paused },
    ...(teamsMode ? { endTitle: 'Draw It', endScreen: 'drawSetup' } : {}),
  });

  el.innerHTML = `
    <div class="dr">
      <div class="dr-top">
        <span class="pill dr-level" id="dLevel"></span>
        <span class="dr-count" id="dCount"></span>
        <div class="spacer"></div>
        <div class="timer" id="dTimer"><svg width="120" height="120"><circle cx="60" cy="60" r="${R}" stroke="rgba(255,255,255,.18)" stroke-width="12" fill="rgba(0,0,0,.25)"/>
          <circle id="dRing" cx="60" cy="60" r="${R}" stroke="#ffd23f" stroke-width="12" fill="none" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="0" style="transition:stroke-dashoffset .1s linear"/></svg>
          <div class="num" id="dNum"></div></div>
      </div>
      <div class="dr-card" id="dCard"></div>
      <div class="dr-msg" id="dMsg"></div>
      <div class="wh-actions dr-actions" id="dActs"></div>
    </div>`;

  const card = html => { $('#dCard', el).innerHTML = html; };
  const msg = html => { $('#dMsg', el).innerHTML = html; };
  const acts = (html, hs = {}) => { $('#dActs', el).innerHTML = html; Object.entries(hs).forEach(([id, fn]) => { const b = $('#' + id, el); if (b) b.onclick = fn; }); };
  const stop = () => { clearInterval(timerId); clearTimeout(peekT); };
  const showTimer = on => { $('#dTimer', el).style.visibility = on ? '' : 'hidden'; };

  function setTurnUI() {
    if (!teamsMode) return;
    const t = team(), pill = $('#dTurn');
    Scores.setActive(t.id);
    if (pill) { pill.style.setProperty('--tc', t.color); pill.textContent = `🎨 ${t.name}`; pill.classList.remove('pop'); void pill.offsetWidth; pill.classList.add('pop'); }
  }
  function nextWord() {
    wi++;
    if (wi >= deck.length) { deck = shuffle(deck); wi = 0; } // ran out: reshuffle and keep going
    word = deck[wi];
    $('#dLevel', el).textContent = `${DRAW_LABEL[word.level] || DRAW_LABEL.easy}${teamsMode ? ` · ${DRAW_POINTS[word.level] || 100} pts` : ''}`;
    HostView.set({ game: '🎨 Draw It', meta: `${DRAW_LABEL[word.level] || ''}${teamsMode ? ` · ${team().name} is drawing` : ''}`, answer: word.word, answerLabel: 'Word to draw' });
  }

  // 1. get ready: pick an artist, they see the word privately
  function ready() {
    stop(); phase = 'ready';
    if (teamsMode && turnsDone >= totalTurns) { App.endGame('Draw It', 'drawSetup'); return; }
    setTurnUI(); nextWord(); showTimer(false);
    $('#dCount', el).textContent = teamsMode ? `Turn ${turnsDone + 1} of ${totalTurns}` : `Word ${wi + 1}`;
    card(`<div class="dr-ready">${teamsMode ? `<span class="dr-team" style="--tc:${team().color}">${esc(team().name)}</span>` : ''}
      <div class="dr-big">${multi || !teamsMode ? 'Pick an artist! ✏️' : 'Who\'s drawing? ✏️'}</div>
      <div class="dr-sub">Artist: tap <b>👀 Peek</b> to see your word — everyone else, look away!</div></div>`);
    msg('');
    acts(`<button class="btn lg ghost" id="dPeek">👀 Peek (artist only)</button><button class="btn lg pink" id="dGo">Start drawing ▶ <kbd>Space</kbd></button>`, { dPeek: peek, dGo: startDrawing });
  }
  // show the word on the big screen for a few seconds, with a warning first
  function peek() {
    if (phase === 'peek') return;
    const back = phase; phase = 'peek';
    let n = 3;
    const look = () => card(`<div class="dr-ready"><div class="dr-big">🙈 Everyone else — look away!</div><div class="dr-sub">Showing the word in ${n}…</div></div>`);
    look();
    const tick = () => {
      n--;
      if (n > 0) { look(); peekT = setTimeout(tick, 900); return; }
      card(`<div class="dr-word">${esc(word.word)}</div><div class="dr-sub">Hiding in 4 seconds…</div>`);
      peekT = setTimeout(() => { phase = back; back === 'draw' ? drawingCard() : ready2(); }, 4000);
    };
    peekT = setTimeout(tick, 900);
  }
  function ready2() { // back to the ready card without picking a new word
    card(`<div class="dr-ready">${teamsMode ? `<span class="dr-team" style="--tc:${team().color}">${esc(team().name)}</span>` : ''}
      <div class="dr-big">Got it? Start drawing! ✏️</div><div class="dr-sub">Tap <b>👀 Peek</b> again if you need another look.</div></div>`);
  }
  function drawingCard() {
    card(`<div class="dr-ready">${opts.time ? `<div class="dr-clock" id="dBig">${Math.ceil(left ?? opts.time)}</div>` : ''}<div class="dr-big">✏️ Draw!</div><div class="dr-sub">${teamsMode ? `<b>${esc(team().name)}</b>, shout out your guesses!` : 'Everyone — shout out your guesses!'}</div></div>`);
  }

  // 2. the clock runs while they draw and guess
  function startDrawing() {
    if (phase !== 'ready') return;
    phase = 'draw'; paused = false; left = opts.time;
    drawingCard(); msg('');
    acts(`<button class="btn lg green" id="dGot">✓ Got it!${teamsMode ? ` <small>+${fmt(DRAW_POINTS[word.level] || 100)}</small>` : ''}</button>
      ${opts.time ? '' : `<button class="btn lg red" id="dStop">✋ Stop${teamsMode ? ' — steal!' : ''}</button>`}
      <button class="btn ghost" id="dPeek2">👀 Peek</button><button class="btn ghost" id="dSkip">⏭ Skip word</button>`,
      { dGot: () => (multi ? whoGuessed() : gotIt(teamsMode ? team() : null)), dStop: () => phase === 'draw' && timeUp(true), dPeek2: peek, dSkip: skipWord });
    if (!opts.time) return; // ♾️ no time limit: the host taps Got it! or Stop
    showTimer(true);
    left = opts.time;
    const tb = $('#dTimer', el);
    tb.classList.remove('low', 'paused');
    let lastSec = left;
    $('#dNum', el).textContent = left; $('#dRing', el).style.strokeDashoffset = 0;
    timerId = setInterval(() => {
      if (paused || phase === 'peek') return;
      left = Math.max(0, left - 0.1);
      const s = Math.ceil(left);
      $('#dNum', el).textContent = s;
      const big = $('#dBig', el); if (big) { big.textContent = s; big.classList.toggle('low', s <= 10); }
      $('#dRing', el).style.strokeDashoffset = C * (1 - left / opts.time);
      tb.classList.toggle('low', s <= 10);
      if (s !== lastSec) { lastSec = s; if (s <= 5 && s > 0) Sfx.tick(); }
      if (left <= 0) timeUp();
    }, 100);
  }
  function skipWord() {
    if (phase !== 'draw' && phase !== 'ready') return;
    Played.mark(word);
    nextWord();
    Sfx.click();
    toast('New word — tap 👀 Peek to see it');
    if (phase === 'ready') ready2();
  }
  // Got it! — which team guessed it? They get the points and draw next.
  function whoGuessed() {
    if (phase !== 'draw') return;
    stop(); phase = 'who'; showTimer(false);
    card(`<div class="dr-big">🎉 Who guessed it?</div><div class="dr-sub">They get the points — and they draw next!</div>`);
    acts(`<div class="bq-steal">${teams.map(x => `<button class="bq-st" data-id="${x.id}" style="--tc:${x.color}">${esc(x.name)}</button>`).join('')}</div>`);
    $$('.bq-st', el).forEach(b => b.onclick = () => { phase = 'draw'; gotIt(teams.find(x => x.id === b.dataset.id)); });
  }
  function gotIt(t) {
    if (phase !== 'draw') return;
    stop(); phase = 'reveal';
    Played.mark(word);
    if (t) Scores.add(t.id, DRAW_POINTS[word.level] || 100);
    Sfx.correct(); confetti(1500);
    reveal(`<span class="msg-good">✓ Got it!</span>${t ? ` ${esc(t.name)} +${fmt(DRAW_POINTS[word.level] || 100)}` : ''}${multi ? '' : ' — whoever guessed it draws next!'}`, t);
  }
  // 3. time's up: in team play, any other team can steal it
  function timeUp(stopped) {
    stop(); if (!stopped) Sfx.buzz(); showTimer(false);
    const why = stopped ? '✋ Stopped' : "⏰ Time's up";
    Played.mark(word);
    if (!multi) { phase = 'reveal'; reveal(`<span class="msg-bad">${why}!</span> Pick someone new to draw.`); return; }
    phase = 'steal';
    const others = teams.filter(x => x.id !== team().id);
    Scores.setActive(null);
    card(`<div class="steal-banner">🚨 STEAL!</div><div class="dr-sub">Did another team shout out the right answer?</div>`);
    msg(`<span class="msg-bad">${why}, ${esc(team().name)}</span>`);
    acts(`<div class="bq-steal">${others.map(x => `<button class="bq-st" data-id="${x.id}" style="--tc:${x.color}">${esc(x.name)}</button>`).join('')}</div>
      <button class="btn yellow" id="dNobody">Nobody — Show the word <kbd>Space</kbd></button>`, { dNobody: () => { phase = 'reveal'; reveal('No points this time'); } });
    $$('.bq-st', el).forEach(b => b.onclick = () => {
      const x = teams.find(tm => tm.id === b.dataset.id);
      Scores.add(x.id, DRAW_POINTS[word.level] || 100); Sfx.correct(); confetti(1200);
      phase = 'reveal'; reveal(`<span class="msg-good">🚨 Stolen!</span> ${esc(x.name)} +${fmt(DRAW_POINTS[word.level] || 100)}`, x);
    });
  }
  // next: the team that guessed (or stole) it draws; nobody = the next team in order
  function reveal(html, guesser) {
    showTimer(false);
    card(`<div class="dr-sub">The word was</div><div class="dr-word">${esc(word.word)}</div>`);
    msg(html);
    turnsDone++;
    if (guesser && multi) turn = teams.findIndex(x => x.id === guesser.id); else turn++;
    const last = teamsMode && turnsDone >= totalTurns;
    acts(`<button class="btn lg pink" id="dNext">${last ? 'Final scores 🏁' : teamsMode ? `Next: ${esc(team().name)} ▶` : 'Next word ▶'} <kbd>Space</kbd></button>`, { dNext: ready });
  }

  const onKey = e => {
    if (Modal.stack.length || Menu.isOpen() || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
    if (e.code !== 'Space' && e.key !== 'Enter') return;
    e.preventDefault();
    if (phase === 'ready') startDrawing();
    else if (phase === 'reveal') ready();
    else if (phase === 'steal') { phase = 'reveal'; reveal('No points this time'); }
  };
  document.addEventListener('keydown', onKey);
  ready();
  return () => { stop(); document.removeEventListener('keydown', onKey); Scores.setActive(null); };
};
