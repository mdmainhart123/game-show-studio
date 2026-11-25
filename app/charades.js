// 🎭 Charades — act it out, no talking! Uses the Draw It word lists (and their Question sets).
// One word per turn (points by level), or a speed round: as many as you can before time runs out.
App.screens.charadesSetup = (el) => {
  const d = App.data;
  const L = GameFiles.pick('draw');
  const count = lv => L.filter(w => lv === 'mix' || w.level === lv).length;
  el.innerHTML = `
    <div class="setup">
      <h1>🎭 Charades</h1>
      ${d.draw.length ? `
      <div class="panel">
        <p style="font-size:20px;margin:0 0 14px">One person <b>acts it out — no talking, no sounds, no pointing at things in the room</b> — while their team guesses before time runs out.</p>
        <div class="field-row">
          <label class="field"><span>How to play</span><select class="input" id="cMode">
            <option value="teams" selected>${d.teams.length > 1 ? 'Teams (with points)' : `${esc(d.teams[0]?.name || 'Group')} (with points)`}</option>
            <option value="all">No teams — just for fun</option></select></label>
          <label class="field"><span>Words</span><select class="input" id="cLevel">
            ${['mix', 'easy', 'medium', 'hard'].map(lv => `<option value="${lv}">${lv === 'mix' ? '🎲 Mix of all levels' : DRAW_LABEL[lv]} — ${count(lv)} words</option>`).join('')}</select></label>
        </div>
        <div class="field-row">
          <label class="field"><span>Turn style</span><select class="input" id="cStyle">
            <option value="one" selected>🎯 One word per turn — Easy 100 · Medium 200 · Hard 300</option>
            <option value="speed">⚡ Speed round — as many as you can, 100 each</option></select></label>
          <label class="field"><span>Time per turn</span><select class="input" id="cTime">
            ${[30, 45, 60, 90, 120].map(s => `<option value="${s}" ${s === 60 ? 'selected' : ''}>${s} seconds</option>`).join('')}
            <option value="0">♾️ No time limit</option></select></label>
        </div>
        <label class="field" id="cRoundsF"><span>Turns for each team</span><select class="input" id="cRounds">
          ${[1, 2, 3, 4, 5].map(n => `<option value="${n}" ${n === 3 ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
        <div class="hint">Uses your Draw It word lists — the same Question sets work here. The actor taps <b>👀 Peek</b> to see the word while everyone else looks away.</div>
      </div>
      <button class="btn xl pink" id="go">Start! ▶</button>`
      : `<div class="panel empty">No words yet.<br><br><button class="btn yellow" id="add">📝 Add some words</button></div>`}
    </div>`;
  if (!d.draw.length) { $('#add', el).onclick = () => App.show('editor', 'draw'); return; }
  const sync = () => { $('#cRoundsF', el).style.display = $('#cMode', el).value === 'teams' ? '' : 'none'; };
  $('#cMode', el).onchange = sync; sync();
  $('#go', el).onclick = () => {
    const level = $('#cLevel', el).value;
    if (!L.some(w => level === 'mix' || w.level === level)) { toast('No words at that level yet — pick another, or add some in 📝 Questions.', true); return; }
    Scores.resetAll();
    App.show('charadesPlay', { mode: $('#cMode', el).value, level, style: $('#cStyle', el).value, time: +$('#cTime', el).value, rounds: +$('#cRounds', el).value });
  };
};

App.screens.charadesPlay = (el, opts) => {
  const teamsMode = opts.mode === 'teams', speed = opts.style === 'speed';
  const teams = Scores.teams();
  App.inGame = teamsMode;
  let deck = Played.order(GameFiles.pick('draw').filter(w => opts.level === 'mix' || w.level === opts.level));
  let wi = -1, word, turn = 0, turnsDone = 0, phase, timerId, left, paused = false, peekT, got = [], earned = 0;
  const totalTurns = teamsMode ? opts.rounds * teams.length : Infinity;
  const team = () => teams[turn % teams.length];
  const pts = w => speed ? 100 : (DRAW_POINTS[w.level] || 100);
  const words = w => w.word.trim().split(/\s+/).length;

  App.gameBar({
    title: '🎭 Charades',
    extra: teamsMode ? `<span class="turn-pill sm" id="cTurn"></span>` : '',
    pause: { toggle: () => { if (phase !== 'act' || !opts.time) return; paused = !paused; RingClock.set($('#cClock', el), left, opts.time, paused); }, get: () => paused },
    ...(teamsMode ? { endTitle: 'Charades', endScreen: 'charadesSetup' } : {}),
  });
  el.innerHTML = `
    <div class="dr si ch">
      <div class="dr-top"><span class="dr-count" id="cCount"></span><div class="spacer"></div><span class="pill si-left" id="cLeft"></span><span class="pill si-tally" id="cTally"></span></div>
      <div class="dr-card" id="cCard"></div>
      <div class="dr-msg" id="cMsg"></div>
      <div class="wh-actions dr-actions" id="cActs"></div>
    </div>`;
  const card = html => { $('#cCard', el).innerHTML = html; };
  const msg = html => { $('#cMsg', el).innerHTML = html; };
  const acts = (html, hs = {}) => { $('#cActs', el).innerHTML = html; Object.entries(hs).forEach(([id, fn]) => { const b = $('#' + id, el); if (b) b.onclick = fn; }); };
  const stop = () => { clearInterval(timerId); clearTimeout(peekT); };
  const badge = () => teamsMode ? `<span class="dr-team" style="--tc:${team().color}">${esc(team().name)}</span>` : '';
  const live = on => { const c = $('#cCard', el); c.classList.toggle('si-live', on); if (teamsMode) c.style.setProperty('--tc', team().color); };
  const leftPill = on => { const p = $('#cLeft', el); if (p) p.textContent = on && opts.time ? `⏸ ${Math.ceil(left)}s left` : ''; };
  const tally = () => { $('#cTally', el).textContent = speed && (phase === 'act' || phase === 'peek') ? `✓ ${got.length} this turn` : ''; };
  const shake = () => { const c = $('#cCard', el); c.classList.remove('si-buzz'); void c.offsetWidth; c.classList.add('si-buzz'); };

  function setTurnUI() {
    if (!teamsMode) return;
    const t = team(), pill = $('#cTurn');
    Scores.setActive(t.id);
    if (pill) { pill.style.setProperty('--tc', t.color); pill.textContent = `🎭 ${t.name}`; pill.classList.remove('pop'); void pill.offsetWidth; pill.classList.add('pop'); }
  }
  function nextWord() {
    wi++;
    if (wi >= deck.length) { deck = shuffle(deck); wi = 0; }
    word = deck[wi];
    HostView.set({ game: '🎭 Charades', meta: teamsMode ? `${team().name} is guessing` : '', answer: word.word });
  }

  // 1. a new turn: pick an actor
  function ready() {
    stop(); phase = 'ready'; paused = false; got = []; earned = 0; live(false); leftPill(false);
    if (teamsMode && turnsDone >= totalTurns) { App.endGame('Charades', 'charadesSetup'); return; }
    setTurnUI(); tally();
    $('#cCount', el).textContent = teamsMode ? `Turn ${turnsDone + 1} of ${totalTurns}` : `Turn ${turnsDone + 1}`;
    card(`<div class="dr-ready">${badge()}
      <div class="dr-big">Pick an actor! 🎭</div>
      <div class="dr-sub">${speed ? 'Act out as many words as you can before time runs out.' : 'Act out the word for your team.'}</div>
      <div class="dr-sub si-rule">No talking, no sounds, no pointing at things in the room!</div>
      <div class="ch-signals">
        <span>🖐️ <b>Number of words</b> — hold up fingers</span>
        <span>☝️ <b>Which word</b> — fingers again</span>
        <span>👂 <b>Sounds like</b> — tug your ear</span>
        <span>🤏 <b>Small word</b> — pinch fingers</span>
      </div></div>`);
    msg('');
    acts(`<button class="btn lg pink" id="cStart">Start turn ▶ <kbd>Space</kbd></button>`, { cStart: begin });
  }
  function begin() { left = opts.time || 0; between(''); }
  // 2. the clock pauses while the actor peeks
  function between(flash) {
    stop(); phase = 'peek'; nextWord(); tally(); live(false);
    card(`<div class="dr-ready">${flash ? `<div class="si-flash">${flash}</div>` : ''}
      <div class="dr-big">👀 Actor only!</div>
      <div class="dr-sub">Everyone else, look away — then tap <b>Peek</b> to see the ${flash ? 'next' : ''} word.</div></div>`);
    msg(''); leftPill(true);
    acts(`<button class="btn lg pink" id="cPeek">👀 Peek</button>${flash ? '' : `<button class="btn lg ghost" id="cBack">↩ Back</button>`}`, { cPeek: peek, cBack: ready });
  }
  function peek() {
    const SECS = 5, n = words(word);
    card(`<div class="si-peek">
      <div class="si-label">Act this out</div>
      <div class="si-word" style="--len:${word.word.length}">${esc(word.word)}</div>
      <div class="ch-info"><span>🖐️ ${n} word${n === 1 ? '' : 's'}</span>${!speed ? `<span>${DRAW_LABEL[word.level] || ''} · ${pts(word)} pts</span>` : ''}</div>
      <div class="si-hide"><div class="si-hide-bar" style="animation-duration:${SECS}s"></div></div>
      <div class="si-hide-txt" id="cHide">Hiding in ${SECS}…</div></div>`);
    acts(`<button class="btn lg green" id="cReady">I'm ready — go! ▶</button>`, { cReady: act });
    let k = SECS;
    const tick = () => { k--; if (k > 0) { const h = $('#cHide', el); if (h) h.textContent = `Hiding in ${k}…`; peekT = setTimeout(tick, 1000); } else act(); };
    peekT = setTimeout(tick, 1000);
  }
  // 3. acting: the clock runs
  function act() {
    stop(); phase = 'act'; msg(''); leftPill(false); tally();
    const n = words(word);
    card(`<div class="dr-ready">${badge()}<div class="dr-big"><span class="ch-mime">🎭</span> Act it out!</div>
      <div class="ch-hint">🖐️ ${n} word${n === 1 ? '' : 's'}</div>
      ${opts.time ? RingClock.html('cClock', left) : speed ? `<div class="si-big-tally">✓ ${got.length}</div>` : ''}</div>`);
    live(true);
    if (opts.time) RingClock.set($('#cClock', el), left, opts.time, paused);
    acts(`<button class="btn lg green" id="cGot">✓ Got it!${teamsMode ? ` <small>+${pts(word)}</small>` : ''}</button>
      <button class="btn lg ghost" id="cSkip">⏭ Skip</button>
      <button class="btn lg ghost" id="cEnd">✋ ${speed ? 'End turn' : 'Stop'}</button>`, {
      cGot: () => {
        if (phase !== 'act') return;
        Played.mark(word); got.push(word.word); earned += pts(word);
        if (teamsMode) Scores.add(team().id, pts(word));
        Sfx.correct();
        if (speed) between(`<span class="msg-good">✓ ${esc(word.word)}</span>${teamsMode ? ` <span class="si-plus">+${pts(word)}</span>` : ''}`);
        else { confetti(1200); turnOver('got'); }
      },
      cSkip: () => { if (phase !== 'act') return; Sfx.click(); between(`<span class="si-skip">⏭ Skipped</span>`); },
      cEnd: () => { if (phase === 'act') turnOver('stop'); },
    });
    if (!opts.time) return;
    timerId = setInterval(() => {
      if (phase !== 'act' || paused) return;
      left = Math.max(0, left - 0.1);
      RingClock.set($('#cClock', el), left, opts.time, paused);
      if (left <= 0) turnOver('time');
    }, 100);
  }
  // 4. the turn ends: got it (one-word style), time's up, or stopped
  function turnOver(why) {
    stop(); phase = 'over'; live(false); leftPill(false); tally();
    if (why === 'time') { Sfx.buzz(); setTimeout(shake, 0); } else if (why === 'stop') Sfx.click();
    const head = why === 'got' ? '🎉 Got it!' : why === 'time' ? "⏰ Time's up!" : '✋ Turn over!';
    card(`<div class="dr-ready">${badge()}<div class="dr-big">${head}</div>
      ${speed ? `<div class="si-score">${got.length} word${got.length === 1 ? '' : 's'}${teamsMode && earned ? ` · +${fmt(earned)}` : ''}</div>
        ${got.length ? `<div class="si-list">${got.map(w => `<span>${esc(w)}</span>`).join('')}</div>` : ''}`
        : why === 'got' ? `<div class="dr-word">${esc(word.word)}</div>${teamsMode ? `<div class="si-score">+${fmt(earned)}</div>` : ''}` : ''}
      ${why !== 'got' ? `<div class="dr-sub">The word was <b>${esc(word.word)}</b></div>` : ''}</div>`);
    msg('');
    turnsDone++; turn++;
    const last = teamsMode && turnsDone >= totalTurns;
    acts(`<button class="btn lg pink" id="cNext">${last ? 'Final scores 🏁' : teamsMode ? `Next: ${esc(team().name)} ▶` : 'Next actor ▶'} <kbd>Space</kbd></button>`, { cNext: ready });
  }

  const onKey = e => {
    if (Modal.stack.length || Menu.isOpen() || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
    if (e.code !== 'Space' && e.key !== 'Enter') return;
    e.preventDefault();
    if (phase === 'ready') begin(); else if (phase === 'over') ready();
  };
  document.addEventListener('keydown', onKey);
  ready();
  return () => { stop(); document.removeEventListener('keydown', onKey); Scores.setActive(null); };
};
