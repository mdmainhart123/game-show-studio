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
        <label class="field" style="display:flex;align-items:center;gap:10px;color:#fff"><input type="checkbox" id="reset" style="width:22px;height:22px"> Start everyone at 0 points</label>
        <div class="hint">Wrong answers ${App.data.settings.boardDeduct ? 'subtract' : "don't subtract"} points. Change this in Teams &amp; Scores.</div>
      </div>
      <button class="btn xl pink" id="go">Start! ▶</button>`
      : `<div class="panel empty">No boards yet.<br><br><button class="btn yellow" id="add">📝 Add some clues</button></div>`}
    </div>`;
  if (!names.length) { $('#add', el).onclick = () => App.show('editor', 'board'); return; }
  $('#go', el).onclick = () => {
    if ($('#reset', el).checked) Scores.resetAll();
    App.show('boardPlay', $('#bd', el).value);
  };
};

App.screens.boardPlay = (el, name) => {
  App.inGame = true;
  const cats = boardLayout(name);
  const rows = Math.max(...cats.map(c => c.clues.length));
  const used = new Set();
  const totalClues = cats.reduce((s, c) => s + c.clues.length, 0);
  App.setTopActions(`<span style="font-size:20px;font-weight:600;align-self:center;margin-right:8px">${esc(name)}</span><button class="btn sm ghost" id="bEnd">End game</button>`, {
    bEnd: async () => { if (await confirmBox('End the game now and show final scores?', 'End game')) App.show('results', 'Quiz Board', 'boardSetup'); },
  });

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
    Sfx.reveal();
    const judged = {};
    const view = document.createElement('div');
    view.className = 'clue-view';
    view.innerHTML = `
      <div class="meta">${esc(clue.category)} · ${fmt(clue.value)}</div>
      <div class="clue">${esc(clue.clue)}</div>
      <div class="answer hidden" id="ans">${esc(clue.answer)}</div>
      <div class="judge">${Scores.teams().map(t => `
        <div class="jt" style="--tc:${t.color}" data-id="${t.id}"><span class="n">${esc(t.name)}</span>
          <button class="ok" title="Correct: +${clue.value}">✓</button><button class="no" title="Wrong${App.data.settings.boardDeduct ? ': −' + clue.value : ''}">✗</button></div>`).join('')}</div>
      <div class="home-actions" style="margin-top:22px">
        <button class="btn lg yellow" id="show">Show answer <kbd>Space</kbd></button>
        <button class="btn lg ghost" id="back">Back to board ↩</button>
      </div>`;
    el.appendChild(view);
    const showAns = () => { $('#ans', view).classList.remove('hidden'); $('#show', view).classList.add('hidden'); };
    $('#show', view).onclick = showAns;
    $('#back', view).onclick = close;
    $$('.jt', view).forEach(row => {
      const tid = row.dataset.id;
      $('.ok', row).onclick = () => {
        if (judged[tid]) return;
        judged[tid] = 'ok'; $('.ok', row).classList.add('done');
        Scores.add(tid, clue.value); Sfx.correct(); showAns();
        setTimeout(close, 1400);
      };
      $('.no', row).onclick = () => {
        if (judged[tid]) return;
        judged[tid] = 'no'; $('.no', row).classList.add('done');
        if (App.data.settings.boardDeduct) Scores.add(tid, -clue.value);
        Sfx.wrong();
      };
    });
    let closed = false;
    function close() {
      if (closed) return; closed = true;
      view.remove(); drawBoard();
      document.removeEventListener('keydown', onKey);
      if (used.size >= totalClues) setTimeout(() => App.current === 'boardPlay' && App.show('results', 'Quiz Board', 'boardSetup'), 400);
    }
    const onKey = e => {
      if (Modal.stack.length) return;
      if (e.code === 'Space') { e.preventDefault(); $('#ans', view).classList.contains('hidden') ? showAns() : close(); }
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKey);
    cleanupKey = () => document.removeEventListener('keydown', onKey);
  }
  let cleanupKey = () => {};
  drawBoard();
  return () => cleanupKey();
};
