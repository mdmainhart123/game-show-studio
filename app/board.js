// 🎯 Quiz Board — categories × point values.
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
  el.innerHTML = `
    <div class="setup">
      <h1>🎯 Quiz Board</h1>
      ${names.length ? `
      <div class="panel">
        <label class="field"><span>Which board?</span>
          <select class="input" id="bd">${names.map(n => { const L = boardLayout(n); return `<option value="${esc(n)}">${esc(n)} — ${L.length} categories, ${L.reduce((s, c) => s + c.clues.length, 0)} clues</option>`; }).join('')}</select></label>
        <div class="hint">Wrong answers ${App.data.settings.boardDeduct ? 'subtract' : "don't subtract"} points (change in ☰ Menu → Settings). Scores reset to 0 after each game.</div>
      </div>
      <button class="btn xl pink" id="go">Start! ▶</button>
      <div><button class="link-btn" id="demo">🎬 Watch a demo first</button></div>`
      : `<div class="panel empty">No boards yet.<br><br><button class="btn yellow" id="add">📝 Add some clues</button></div>`}
    </div>`;
  if (!names.length) { $('#add', el).onclick = () => App.show('editor', 'board'); return; }
  $('#demo', el).onclick = () => Demo.start('board');
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
    extra: `<span class="turn-pill sm" id="bTurn"></span><span class="bname" style="font-size:18px;font-weight:600;align-self:center;margin:0 6px">${esc(name)} <span class="hint">(${bi + 1} of ${names.length})</span></span>`,
    back: () => App.show('boardPlay', names[bi - 1]),
    next: () => App.show('boardPlay', names[bi + 1]),
    backTitle: 'Previous board', nextTitle: 'Next board',
    endTitle: 'Quiz Board', endScreen: 'boardSetup',
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
    App.setNavEnabled(false, false); // finish the clue before switching boards
    const view = document.createElement('div');
    view.className = 'clue-view';
    el.appendChild(view);
    let closed = false, onKey = () => {}, winner = null;
    const setKeys = fn => { document.removeEventListener('keydown', onKey); onKey = fn; document.addEventListener('keydown', onKey); cleanupKey = () => document.removeEventListener('keydown', onKey); };
    function close() {
      if (closed) return; closed = true;
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

    // ---- the clue itself (normal, or Daily Double for one team) ----
    function showClue(ddInfo) {
      if (!ddInfo) Sfx.reveal();
      const judged = {};
      const teams = ddInfo ? [ddInfo.team] : Scores.teams();
      const plus = ddInfo ? ddInfo.wager : clue.value;
      const minus = ddInfo ? ddInfo.wager : (App.data.settings.boardDeduct ? clue.value : 0);
      view.innerHTML = `
        <div class="meta">${esc(clue.category)} · ${ddInfo ? `🎲 Daily Double — ${esc(ddInfo.team.name)} wagered ${fmt(ddInfo.wager)}` : fmt(clue.value)}</div>
        <div class="clue">${esc(clue.clue)}</div>
        <div class="answer hidden" id="ans">${esc(clue.answer)}</div>
        <div class="judge">${teams.map(t => `
          <div class="jt" style="--tc:${t.color}" data-id="${t.id}"><span class="n">${esc(t.name)}</span>
            <button class="ok" title="Correct: +${plus}">✓</button><button class="no" title="Wrong${minus ? ': −' + minus : ''}">✗</button></div>`).join('')}</div>
        <div class="home-actions" style="margin-top:22px">
          <button class="btn lg yellow" id="show">Show answer <kbd>Space</kbd></button>
          <button class="btn lg ghost" id="back">Back to board ↩</button>
        </div>`;
      const showAns = () => { $('#ans', view).classList.remove('hidden'); $('#show', view).classList.add('hidden'); };
      $('#show', view).onclick = showAns;
      $('#back', view).onclick = close;
      $$('.jt', view).forEach(row => {
        const tid = row.dataset.id;
        $('.ok', row).onclick = () => {
          if (judged[tid]) return;
          judged[tid] = 'ok'; $('.ok', row).classList.add('done');
          winner = tid;
          Scores.add(tid, plus); Sfx.correct(); showAns();
          if (ddInfo) confetti(1800);
          setTimeout(close, ddInfo ? 2000 : 1400);
        };
        $('.no', row).onclick = () => {
          if (judged[tid]) return;
          judged[tid] = 'no'; $('.no', row).classList.add('done');
          if (minus) Scores.add(tid, -minus);
          Sfx.wrong();
          if (ddInfo) { showAns(); setTimeout(close, 2600); }
        };
      });
      setKeys(e => {
        if (Modal.stack.length) return;
        if (e.code === 'Space') { e.preventDefault(); $('#ans', view).classList.contains('hidden') ? showAns() : close(); }
        if (e.key === 'Escape') close();
      });
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
  return () => cleanupKey();
};
