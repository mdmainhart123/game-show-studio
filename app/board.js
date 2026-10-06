// 🎯 Quiz Board — categories × point values.
const CLUE_TIME = 15; // seconds the picking team gets to answer
function boardNames() { return [...new Set(App.data.board.map(c => c.board))]; }
function boardLayout(name) {
  const cats = [];
  App.data.board.filter(c => c.board === name).forEach(c => {
    let col = cats.find(x => x.name === c.category);
    if (!col) cats.push(col = { name: c.category, clues: [] });
    col.clues.push(c);
  });
  cats.forEach(c => { c.clues.sort((a, b) => a.value - b.value); c.clues = c.clues.slice(0, 6); });
  return cats.slice(0, 6);
}

App.screens.boardSetup = (el) => {
  const names = boardNames();
  const played = App.data.board.some(c => c.played);
  // pre-select the first board that still has unplayed clues
  const pick = names.find(n => boardLayout(n).flatMap(c => c.clues).some(x => !x.played)) || names[0];
  el.innerHTML = `
    <div class="setup">
      <h1>🎯 Quiz Board</h1>
      ${names.length ? `
      <div class="panel">
        <label class="field"><span>Which board?</span>
          <select class="input" id="bd">${names.map(n => {
            const clues = boardLayout(n).flatMap(c => c.clues), left = clues.filter(x => !x.played).length;
            return `<option value="${esc(n)}" ${pick === n ? 'selected' : ''}>${!left ? `✓ ${esc(n)} — all played` : left < clues.length ? `${esc(n)} — ${left} of ${clues.length} clues left` : `${esc(n)} — ${clues.length} clues`}</option>`; }).join('')}</select></label>
        ${played ? `<div class="played-note">✓ = every clue on that board has been played. <button class="link-btn sm" id="resetPlayed">Reset played marks</button></div>` : ''}
        <div class="hint">Wrong answers ${App.data.settings.boardDeduct ? 'subtract' : "don't subtract"} points (change in ☰ Menu → Settings). Scores reset to 0 after each game.</div>
      </div>
      <button class="btn xl pink" id="go">Start! ▶</button>
      <div><button class="link-btn" id="demo">🎬 Watch a demo first</button></div>`
      : `<div class="panel empty">No boards yet.<br><br><button class="btn yellow" id="add">📝 Add some clues</button></div>`}
    </div>`;
  if (!names.length) { $('#add', el).onclick = () => App.show('editor', 'board'); return; }
  $('#demo', el).onclick = () => Demo.start('board');
  if ($('#resetPlayed', el)) $('#resetPlayed', el).onclick = async () => {
    if (await confirmBox('Clear all the "played" marks so every board shows as fresh again?', 'Reset marks')) { Played.reset(App.data.board); App.show('boardSetup'); toast('Played marks cleared ✓'); }
  };
  $('#go', el).onclick = () => {
    Scores.resetAll(); // every new game starts at 0
    App.boardUsed = {}; // fresh game: every board's tiles start unplayed
    App.boardDD = {};   // …and gets new hidden Daily Doubles
    App.boardTurn = 0;  // the first team picks first
    App.playedTrivia = new Set();
    App.show('boardPlay', $('#bd', el).value);
  };
};

App.screens.boardPlay = (el, name) => {
  App.inGame = true;
  App.curBoard = name; // for ☰ Menu → Answer key
  let clueTimer = null; // the open clue's clock (for ☰ Menu → Pause)
  const cats = boardLayout(name);
  const rows = Math.max(...cats.map(c => c.clues.length));
  App.boardUsed ||= {};
  const used = (App.boardUsed[name] ||= new Set()); // remembered if you switch boards and come back
  const totalClues = cats.reduce((s, c) => s + c.clues.length, 0);
  const names = boardNames(), bi = names.indexOf(name);
  // Daily Doubles: 1 hidden tile (2 on boards with 20+ clues), never in the top row,
  // and on different categories. Chosen once per board per game.
  App.boardDD ||= {};
  const dd = (App.boardDD[name] ||= (() => {
    const want = totalClues >= 20 ? 2 : 1, picked = new Set();
    for (const col of shuffle(cats)) {
      const options = col.clues.slice(1);
      if (!options.length) continue;
      picked.add(options[Math.floor(Math.random() * options.length)].id);
      if (picked.size >= want) break;
    }
    return picked;
  })());
  const boardMax = Math.max(...cats.flatMap(c => c.clues.map(x => x.value)));
  // Whose pick: right answer = that team picks next; nobody right = next team in order.
  const teams = Scores.teams();
  App.boardTurn = (App.boardTurn || 0) % teams.length;
  const picker = () => teams[App.boardTurn % teams.length];
  function setTurn(i) {
    App.boardTurn = ((i % teams.length) + teams.length) % teams.length;
    const t = picker(), pill = $('#bTurn');
    Scores.setActive(t.id);
    if (pill) { pill.style.setProperty('--tc', t.color); pill.textContent = `🎯 ${t.name}${/s$/i.test(t.name) ? "'" : "'s"} pick`; pill.classList.remove('pop'); void pill.offsetWidth; pill.classList.add('pop'); }
  }
  App.gameBar({
    title: `🎯 ${esc(name)}`, extra: `<span class="turn-pill sm" id="bTurn"></span>`,
    back: () => App.show('boardPlay', names[bi - 1]),
    next: () => App.show('boardPlay', names[bi + 1]),
    backTitle: 'Previous board', nextTitle: 'Next board',
    endTitle: 'Quiz Board', endScreen: 'boardSetup',
    pause: { toggle: () => clueTimer?.toggle(), get: () => !!clueTimer?.paused },
  });
  const navNormal = () => App.setNavEnabled(bi > 0, bi < names.length - 1);
  navNormal();
  setTurn(App.boardTurn);
  // host can click a team on the scoreboard to make it their pick
  App.chipClick = id => { if (!$('.clue-view')) { setTurn(teams.findIndex(t => t.id === id)); Sfx.click(); } };
  Scores.render();

  function drawBoard() {
    el.innerHTML = `<div class="jb" style="grid-template-columns:repeat(${cats.length},1fr);grid-template-rows:minmax(80px,.8fr) repeat(${rows},1fr)">
      ${cats.map(c => `<div class="cat">${esc(c.name)}</div>`).join('')}
      ${Array.from({ length: rows }, (_, r) => cats.map(c => {
        const clue = c.clues[r];
        if (!clue) return `<div class="tile none"></div>`;
        return `<button class="tile ${used.has(clue.id) ? 'used' : ''}" data-id="${clue.id}">${fmt(clue.value)}</button>`;
      }).join('')).join('')}
    </div>`;
    $$('.tile[data-id]', el).forEach(b => b.onclick = () => openClue(b.dataset.id));
  }

  function openClue(id) {
    const clue = App.data.board.find(c => c.id === id);
    used.add(id);
    Played.mark(clue);
    App.setNavEnabled(false, false); // finish the clue before switching boards
    const view = document.createElement('div');
    view.className = 'clue-view';
    el.appendChild(view);
    let closed = false, onKey = () => {}, winner = null;
    const closeHooks = [];
    const setKeys = fn => { document.removeEventListener('keydown', onKey); onKey = fn; document.addEventListener('keydown', onKey); cleanupKey = () => document.removeEventListener('keydown', onKey); };
    function close() {
      if (closed) return; closed = true;
      closeHooks.forEach(f => f()); clueTimer = null;
      view.remove(); drawBoard(); navNormal();
      setTurn(winner ? teams.findIndex(t => t.id === winner) : App.boardTurn + 1);
      document.removeEventListener('keydown', onKey);
      if (used.size >= totalClues) setTimeout(boardDone, 400);
    }
    if (dd.has(id)) dailyDouble(); else showClue(null);

    // ---- Daily Double: splash → which team → wager → clue ----
    function dailyDouble() {
      Sfx.fanfare();
      view.classList.add('dd');
      view.innerHTML = `<div class="dd-splash">DAILY<br>DOUBLE!</div>
        <div class="meta" style="margin-top:18px">${esc(clue.category)}</div>
        <div class="dd-step"></div>`;
      askWager(picker()); // it belongs to the team whose pick it was
    }
    function askWager(t) {
      const max = Math.max(t.score, boardMax);
      $('.dd-step', view).innerHTML = `
        <div class="dd-q"><span class="dd-team" style="--tc:${t.color}">${esc(t.name)}</span>, how much do you wager?</div>
        <div class="hint" style="font-size:18px;margin-bottom:12px">Anything from 0 to ${fmt(max)}${t.score < boardMax ? ` (you can go up to the board's top value, ${fmt(boardMax)})` : ''}</div>
        <div class="dd-wager">
          <input class="input" id="wager" type="number" min="0" max="${max}" step="100" value="${Math.min(max, clue.value)}">
          <button class="btn sm ghost" data-v="${Math.round(max / 2 / 100) * 100}">Half</button>
          <button class="btn sm orange" data-v="${max}">All in! (${fmt(max)})</button>
        </div>
        <div class="err" id="wErr"></div>
        <button class="btn lg pink" id="wGo">Show the clue ▶</button>`;
      const inp = $('#wager', view);
      inp.focus(); inp.select();
      $$('[data-v]', view).forEach(b => b.onclick = () => { inp.value = b.dataset.v; });
      const go = () => {
        const w = Math.round(+inp.value);
        if (!(w >= 0 && w <= max)) { $('#wErr', view).textContent = `Pick a number from 0 to ${fmt(max)}`; return; }
        view.classList.remove('dd');
        showClue({ team: t, wager: w });
      };
      $('#wGo', view).onclick = go;
      setKeys(e => { if (e.key === 'Enter') go(); if (e.key === 'Escape') close(); });
    }

    // ---- the clue itself ----
    // The answer stays HIDDEN while teams are answering (the host checks it on the printed
    // answer key — ☰ Menu → Answer key), so a steal is still a real steal.
    // 1. The team whose pick it is answers against a 15-second clock: host taps ✓ or ✗.
    // 2. ✓ → points, answer shown, they pick next.  ✗ or time's up → 🚨 STEAL.
    // 3. Steal: tap the team that calls out first; same clock, same ✓ / ✗.
    // 4. Nobody gets it → Show Answer, and the next team picks.
    // Daily Doubles belong to one team only — no steals.
    function showClue(ddInfo) {
      if (!ddInfo) Sfx.reveal();
      const owner = ddInfo ? ddInfo.team : picker();
      const plus = ddInfo ? ddInfo.wager : clue.value;
      const minus = ddInfo ? ddInfo.wager : (App.data.settings.boardDeduct ? clue.value : 0);
      const tried = new Set();
      const R = 40, C = 2 * Math.PI * R;
      let timerId, left, total = CLUE_TIME, phase = 'answer', paused = false;
      // three layers: category & value on top · the clue in the middle · host controls at the bottom
      view.classList.add('cv');
      view.innerHTML = `
        <button class="clue-x" id="bX" title="Back to the board (Esc)">✕</button>
        <div class="cv-top">
          <div class="steal-banner hidden" id="stealBanner">🚨 STEAL!</div>
          <div class="meta">${esc(clue.category)} · ${ddInfo ? `🎲 Daily Double — ${esc(ddInfo.team.name)} wagered ${fmt(ddInfo.wager)}` : fmt(clue.value)}</div>
        </div>
        <div class="cv-mid">
          <div class="clue">${esc(clue.clue)}</div>
          <div class="answer hidden" id="ans">${esc(clue.answer)}</div>
        </div>
        <div class="cv-host">
          <div class="bq" id="bq"></div>
          <div class="home-actions bq-actions" id="bqActs"></div>
        </div>`;
      $('#bX', view).onclick = () => { stop(); close(); };
      const bq = $('#bq', view);
      const acts = (html, hs = {}) => { $('#bqActs', view).innerHTML = html; Object.entries(hs).forEach(([id, fn]) => { const b = $('#' + id, view); if (b) b.onclick = fn; }); };
      const stop = () => clearInterval(timerId);
      const banner = on => $('#stealBanner', view).classList.toggle('hidden', !on);
      const showAns = () => $('#ans', view).classList.remove('hidden');
      clueTimer = { stop, get paused() { return paused; }, toggle: () => { paused = !paused; $('.btimer', view)?.classList.toggle('paused', paused); } };

      // one team answering out loud, with the clock
      function answering(t, isSteal) {
        phase = 'answer';
        Scores.setActive(t.id);
        banner(isSteal);
        bq.innerHTML = `
          <div class="bq-row">
            <span class="bq-team" style="--tc:${t.color}">${esc(t.name)}</span>
            <div class="timer btimer" id="btimer" title="Click to pause"><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="${R}" stroke="rgba(255,255,255,.18)" stroke-width="10" fill="rgba(0,0,0,.25)"/>
              <circle class="ring" cx="50" cy="50" r="${R}" stroke="#ffd23f" stroke-width="10" fill="none" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="0" style="transition:stroke-dashoffset .1s linear"/></svg><div class="num">${total}</div></div>
            <button class="btn lg green" id="bOk">✓ Right <small>+${fmt(plus)}</small></button>
            <button class="btn lg red" id="bNo">✗ Wrong${minus ? ` <small>−${fmt(minus)}</small>` : ''}</button>
          </div>`;
        $('#bOk', view).onclick = () => right(t);
        $('#bNo', view).onclick = () => wrong(t, false);
        acts(isSteal ? `<button class="link-btn" id="bCancel">↩ Not them — pick another team</button>` : '',
          { bCancel: () => { stop(); stealMenu(); } });
        left = total; paused = false;
        const tb = $('#btimer', view);
        tb.onclick = () => clueTimer.toggle();
        let lastSec = total;
        stop();
        timerId = setInterval(() => {
          if (paused || App.current !== 'boardPlay') return;
          left = Math.max(0, left - 0.1);
          const s = Math.ceil(left);
          $('.num', tb).textContent = s;
          $('.ring', tb).style.strokeDashoffset = C * (1 - left / total);
          tb.classList.toggle('low', s <= 5);
          if (s !== lastSec) { lastSec = s; if (s <= 5 && s > 0) Sfx.tick(); }
          if (left <= 0) { Sfx.buzz(); wrong(t, true); }
        }, 100);
      }
      function right(t) {
        if (phase !== 'answer') return;
        stop(); phase = 'done';
        winner = t.id;
        banner(false);
        Scores.add(t.id, plus); Sfx.correct(); showAns();
        if (ddInfo) confetti(1800);
        bq.innerHTML = `<div class="bq-msg"><span class="msg-good">✓ Correct!</span> ${esc(t.name)} +${fmt(plus)}</div>`;
        acts('');
        setTimeout(close, ddInfo ? 2400 : 2000);
      }
      function wrong(t, timedOut) {
        if (phase !== 'answer') return;
        stop();
        tried.add(t.id);
        // Running out the clock costs nothing on a normal clue; a wrong answer can (Settings).
        // A Daily Double wager is lost either way.
        const lose = ddInfo ? minus : timedOut ? 0 : minus;
        if (lose) Scores.add(t.id, -lose);
        if (!timedOut) Sfx.wrong();
        const why = `${timedOut ? `⏰ Time's up, ${esc(t.name)}` : `✗ ${esc(t.name)}`}${lose ? ` −${fmt(lose)}` : ''}`;
        if (ddInfo) return nobody(why);
        stealMenu(why);
      }
      function stealMenu(why) {
        stop(); phase = 'steal';
        Scores.setActive(null);
        banner(true);
        const open = Scores.teams().filter(x => !tried.has(x.id));
        if (!open.length) return nobody(`${why ? why + ' ' : ''}Every team has tried.`);
        bq.innerHTML = `
          ${why ? `<div class="bq-msg bad">${why}</div>` : ''}
          <div class="bq-steal-title">Who wants it? <span class="hint">Tap the first team to call out</span></div>
          <div class="bq-steal">${Scores.teams().map(x => `<button class="bq-st ${tried.has(x.id) ? 'out' : ''}" data-id="${x.id}" style="--tc:${x.color}" ${tried.has(x.id) ? 'disabled' : ''}>${tried.has(x.id) ? '✗ ' : ''}${esc(x.name)}</button>`).join('')}</div>`;
        $$('.bq-st:not(.out)', view).forEach(b => b.onclick = () => { Sfx.click(); answering(Scores.teams().find(x => x.id === b.dataset.id), true); });
        acts(`<button class="btn lg yellow" id="bShow">Nobody — Show Answer <kbd>Space</kbd></button>`, { bShow: () => nobody('') });
      }
      function nobody(why) {
        stop(); phase = 'done';
        banner(false);
        Scores.setActive(null);
        showAns(); Sfx.reveal();
        $('#bX', view)?.remove();
        bq.innerHTML = `<div class="bq-msg ${why ? 'bad' : ''}">${why || 'No points this time'}</div>`;
        acts(`<button class="btn lg pink" id="bBack">Back to board ↩ <kbd>Space</kbd></button>`, { bBack: close });
      }

      answering(owner, false);
      setKeys(e => {
        if (Modal.stack.length || Menu.isOpen()) return;
        if (e.code === 'Space') { e.preventDefault(); if (phase === 'done') close(); else if (phase === 'steal') nobody(''); }
        if (e.key === 'Escape') { stop(); close(); }
      });
      closeHooks.push(stop);
    }
  }
  function boardDone() {
    if (App.current !== 'boardPlay') return;
    const hasNext = bi < names.length - 1;
    Sfx.fanfare();
    Modal.open({
      title: '🎯 Board complete!',
      body: `<p style="font-size:20px;margin:0">Every clue on <b>${esc(name)}</b> has been played.${hasNext ? ` Keep going with <b>${esc(names[bi + 1])}</b>, or wrap up?` : ''}</p>`,
      actions: [
        { label: '🏁 Final scores', cls: hasNext ? 'ghost' : 'pink', onClick: c => { c(); App.endGame('Quiz Board', 'boardSetup'); } },
        ...(hasNext ? [{ label: 'Next board ▶', cls: 'pink', onClick: c => { c(); App.show('boardPlay', names[bi + 1]); } }] : []),
      ],
    });
  }
  let cleanupKey = () => {};
  drawBoard();
  return () => { cleanupKey(); clueTimer?.stop?.(); };
};
