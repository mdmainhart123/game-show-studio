// 🧩 Crossword — type in a list of words and clues, and the app builds a crossword.
// The whole room solves it together on the big screen, or print it out (with an answer key).
// Puzzles are kept in App.data.cross: [{ id, title, entries: [{ word, clue }] }]

// Letters only, upper case ("Peanut butter" → PEANUTBUTTER); the clue shows the word lengths, e.g. (6,6).
const cwClean = w => String(w || '').toUpperCase().replace(/[^A-Z]/g, '');
const cwLens = w => String(w || '').trim().split(/[\s-]+/).map(x => cwClean(x).length).filter(Boolean).join(',');

// Parse "word | clue" (or "word - clue", "word: clue") lines into entries.
function cwParseLines(text) {
  const entries = [], problems = [], seen = new Set();
  String(text || '').split(/\r?\n/).forEach((raw, i) => {
    const l = raw.trim();
    if (!l || /^(#|\/\/)/.test(l)) return;
    const m = l.match(/^(.+?)\s*(?:\||\t|:| - | – )\s*(.+)$/);
    if (!m) { problems.push(`Line ${i + 1}: needs a word and a clue, like "apple | A red fruit"`); return; }
    const word = cwClean(m[1]);
    if (word.length < 2) { problems.push(`Line ${i + 1}: "${m[1]}" is too short`); return; }
    if (word.length > 20) { problems.push(`Line ${i + 1}: "${m[1]}" is too long (20 letters max)`); return; }
    if (seen.has(word)) { problems.push(`Line ${i + 1}: ${word} is listed twice`); return; }
    seen.add(word);
    entries.push({ word: m[1].trim(), clue: m[2].trim() });
  });
  return { entries, problems };
}

// ---------- the generator ----------
// Tries many random orders, placing each word where it crosses the most letters already on the grid,
// and keeps the layout that fits the most words in the smallest square.
function buildCrossword(entries, tries = 60) {
  const words = entries.map((e, i) => ({ i, w: cwClean(e.word) })).filter(x => x.w.length >= 2);
  let best = null;
  for (let t = 0; t < tries; t++) {
    const order = words.slice().sort((a, b) => (b.w.length - a.w.length) + (Math.random() - 0.5) * (t ? 6 : 0));
    const cells = new Map(); // "r,c" -> { ch, a: bool, d: bool }
    const placed = [];
    const at = (r, c) => cells.get(r + ',' + c);
    const fits = (w, r, c, dir) => {
      const dr = dir === 'd' ? 1 : 0, dc = dir === 'a' ? 1 : 0;
      if (at(r - dr, c - dc) || at(r + dr * w.length, c + dc * w.length)) return -1; // touching the ends
      let cross = 0;
      for (let k = 0; k < w.length; k++) {
        const rr = r + dr * k, cc = c + dc * k, cell = at(rr, cc);
        if (cell) {
          if (cell.ch !== w[k] || cell[dir]) return -1;
          cross++;
        } else if (at(rr + dc, cc + dr) || at(rr - dc, cc - dr)) return -1; // side by side with another word
      }
      return cross;
    };
    const put = (x, r, c, dir) => {
      const dr = dir === 'd' ? 1 : 0, dc = dir === 'a' ? 1 : 0;
      for (let k = 0; k < x.w.length; k++) {
        const key = (r + dr * k) + ',' + (c + dc * k);
        const cell = cells.get(key) || { ch: x.w[k] };
        cell[dir] = true; cells.set(key, cell);
      }
      placed.push({ ...x, r, c, dir });
    };
    const left = [];
    order.forEach((x, n) => {
      if (n === 0) { put(x, 0, 0, Math.random() < 0.5 ? 'a' : 'd'); return; }
      let opts = [];
      cells.forEach((cell, key) => {
        const [r0, c0] = key.split(',').map(Number);
        for (let k = 0; k < x.w.length; k++) {
          if (x.w[k] !== cell.ch) continue;
          for (const dir of ['a', 'd']) {
            if (cell[dir]) continue;
            const r = dir === 'd' ? r0 - k : r0, c = dir === 'a' ? c0 - k : c0;
            const s = fits(x.w, r, c, dir);
            if (s > 0) opts.push({ r, c, dir, s });
          }
        }
      });
      if (!opts.length) { left.push(x); return; }
      const top = Math.max(...opts.map(o => o.s));
      opts = opts.filter(o => o.s === top);
      const o = opts[Math.floor(Math.random() * opts.length)];
      put(x, o.r, o.c, o.dir);
    });
    // second chance for words that didn't fit the first time
    left.forEach(x => {
      let done = false;
      cells.forEach((cell, key) => {
        if (done) return;
        const [r0, c0] = key.split(',').map(Number);
        for (let k = 0; k < x.w.length && !done; k++) {
          if (x.w[k] !== cell.ch) continue;
          for (const dir of ['a', 'd']) {
            if (done || cell[dir]) continue;
            const r = dir === 'd' ? r0 - k : r0, c = dir === 'a' ? c0 - k : c0;
            if (fits(x.w, r, c, dir) > 0) { put(x, r, c, dir); done = true; }
          }
        }
      });
    });
    const rs = [...cells.keys()].map(k => +k.split(',')[0]), cs = [...cells.keys()].map(k => +k.split(',')[1]);
    const minR = Math.min(...rs), minC = Math.min(...cs), rows = Math.max(...rs) - minR + 1, cols = Math.max(...cs) - minC + 1;
    const score = placed.length * 10000 - Math.max(rows, cols) * 100 - rows * cols / 10;
    if (!best || score > best.score) best = { score, placed: placed.map(p => ({ ...p, r: p.r - minR, c: p.c - minC })), rows, cols };
  }
  if (!best) return null;
  // number the starts in reading order
  const starts = [...new Set(best.placed.map(p => p.r * 1000 + p.c))].sort((a, b) => a - b);
  best.placed.forEach(p => { p.num = starts.indexOf(p.r * 1000 + p.c) + 1; p.entry = entries[p.i]; });
  best.unplaced = words.filter(x => !best.placed.some(p => p.i === x.i)).map(x => entries[x.i]);
  return best;
}

// ---------- setup: pick or make a puzzle ----------
App.screens.crossSetup = (el) => {
  const d = App.data;
  d.cross ||= [];
  const draw = () => {
    el.innerHTML = `
      <div class="setup cw-setup">
        <h1>🧩 Crossword</h1>
        <div class="panel">
          <p style="font-size:20px;margin:0 0 14px">Pick a puzzle — the app builds a fresh crossword from its words every time. Solve it together on the big screen, or print it.</p>
          ${d.cross.length ? `<div class="cw-list">${d.cross.map(p => `
            <div class="cw-item" data-id="${p.id}">
              <button class="cw-play" data-play="${p.id}"><b>${esc(p.title)}</b><small>${p.entries.length} words</small></button>
              <button class="btn sm ghost" data-edit="${p.id}" title="Edit">✏️</button>
              <button class="btn sm ghost" data-print="${p.id}" title="Print">🖨️</button>
              <button class="btn sm ghost" data-export="${p.id}" title="Save as a text file">📤</button>
            </div>`).join('')}</div>` : '<div class="hint">No puzzles yet — make one below.</div>'}
          <div class="cw-new">
            <button class="btn green" id="cwNew">＋ Make a new crossword</button>
            ${d.trivia.length ? '<button class="btn cyan" id="cwQuick">⚡ Quick crossword from your trivia answers</button>' : ''}
          </div>
          <div class="cw-new cw-files">
            <button class="btn yellow" id="cwImp">📥 Import from text file</button>
            <button class="btn ghost" id="cwTpl">📄 Save blank template</button>
            ${d.cross.length ? '<button class="btn ghost" id="cwExp">📤 Export all</button>' : ''}
          </div>
        </div>
        <div><button class="link-btn" id="demo">🎬 Watch a demo first</button></div>
      </div>`;
    $('#demo', el).onclick = () => Demo.start('cross');
    $$('[data-play]', el).forEach(b => b.onclick = () => App.show('crossPlay', d.cross.find(p => p.id === b.dataset.play)));
    $$('[data-edit]', el).forEach(b => b.onclick = () => editPuzzle(d.cross.find(p => p.id === b.dataset.edit)));
    $$('[data-print]', el).forEach(b => b.onclick = () => printMenu(d.cross.find(p => p.id === b.dataset.print)));
    $('#cwNew', el).onclick = () => editPuzzle(null);
    // one puzzle → "crossword - <title>.txt"
    $$('[data-export]', el).forEach(b => b.onclick = async () => {
      const p = d.cross.find(x => x.id === b.dataset.export);
      const txt = `== ${p.title}\n${p.entries.map(e => `${e.word} | ${e.clue}`).join('\n')}\n`;
      if (await App.saveText(`crossword - ${p.title.replace(/[\\/:*?"<>|]+/g, '').trim() || 'puzzle'}.txt`, txt.replace(/\n/g, '\r\n'))) toast('Saved ✓');
    });
    $('#cwTpl', el).onclick = async () => { if (await App.saveText(GSData.TEMPLATES.cross.file, GSData.TEMPLATES.cross.text.replace(/\n/g, '\r\n'))) toast('Template saved ✓'); };
    if ($('#cwExp', el)) $('#cwExp', el).onclick = async () => {
      const txt = d.cross.map(p => `== ${p.title}\n${p.entries.map(e => `${e.word} | ${e.clue}`).join('\n')}`).join('\n\n') + '\n';
      if (await App.saveText('crossword - All puzzles.txt', txt.replace(/\n/g, '\r\n'))) toast('Crosswords exported ✓');
    };
    // 📥 Import: read the file, add each puzzle in it, and open the crossword right away
    $('#cwImp', el).onclick = async () => {
      const f = await App.openText('Choose a crossword text file');
      if (!f) return;
      let { items, problems } = GSData.parseCross(f.text);
      if (!items.length) { // no "== Title" line? use the whole file as one puzzle named after the file
        const r = cwParseLines(f.text);
        if (r.entries.length >= 3) items = [{ id: GSData.uid(), title: f.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' '), entries: r.entries }];
        problems = r.problems;
      }
      if (!items.length) { Modal.open({ title: 'Nothing to import', body: `<p style="font-size:19px">No crossword words were found in <b>${esc(f.name)}</b>. Each line should look like <b>word | clue</b> (at least 3 words). Press <b>📄 Save blank template</b> for an example.</p>`, actions: [{ label: 'OK', cls: 'pink' }] }); return; }
      d.cross.push(...items); App.save();
      toast(`Imported ${items.length === 1 ? `"${items[0].title}"` : items.length + ' crosswords'} ✓`);
      if (items.length === 1) App.show('crossPlay', items[0]); else draw();
    };
    if ($('#cwQuick', el)) $('#cwQuick', el).onclick = () => {
      // short, single-word trivia answers make good crossword entries
      const pool = shuffle(d.trivia.filter(q => /^[A-Za-z]{3,12}$/.test(q.answer.trim())));
      if (pool.length < 6) { toast('Not enough one-word trivia answers for a crossword.', true); return; }
      App.show('crossPlay', { id: 'quick', title: '⚡ Quick crossword', entries: pool.slice(0, 15).map(q => ({ word: q.answer, clue: q.question })) });
    };
  };
  function editPuzzle(p) {
    const isNew = !p;
    Modal.open({
      title: isNew ? '🧩 New crossword' : '✏️ Edit crossword', wide: true,
      body: `
        <label class="field"><span>Title</span><input class="input" id="cwT" value="${esc(p?.title || '')}" placeholder="e.g. Fall Fun" maxlength="40"></label>
        <label class="field"><span>Words and clues — one per line: <b>word | clue</b></span>
          <textarea class="input cw-ta" id="cwW" rows="12" placeholder="pumpkin | Big orange squash carved at Halloween\nacorn | A squirrel's favorite snack\nleaves | They change color and fall in autumn">${esc((p?.entries || []).map(e => `${e.word} | ${e.clue}`).join('\n'))}</textarea></label>
        <div class="hint">8–20 words works best. Spaces and punctuation in a word are left out of the grid.</div>
        <div class="err" id="cwErr"></div>`,
      actions: [
        ...(isNew ? [] : [{ label: '🗑 Delete', cls: 'red', onClick: async c => { if (await confirmBox(`Delete "${p.title}"?`, 'Delete', true)) { d.cross = d.cross.filter(x => x !== p); App.save(); c(); draw(); } } }]),
        { label: 'Cancel', cls: 'ghost' },
        { label: 'Save ✓', cls: 'green', onClick: (c, mb) => {
          const title = $('#cwT', mb).value.trim() || 'My crossword';
          const { entries, problems } = cwParseLines($('#cwW', mb).value);
          if (entries.length < 3) { $('#cwErr', mb).innerHTML = (problems[0] ? esc(problems[0]) + '<br>' : '') + 'Add at least 3 words.'; return; }
          if (problems.length) toast(problems[0], true);
          if (isNew) d.cross.push({ id: GSData.uid(), title, entries }); else Object.assign(p, { title, entries });
          App.save(); c(); draw(); toast('Saved ✓');
        } },
      ],
    });
  }
  draw();
};

// ---------- play ----------
App.screens.crossPlay = (el, puzzle) => {
  let cw = buildCrossword(puzzle.entries);
  if (!cw || cw.placed.length < 2) { toast('Those words don\'t cross — try adding more words.', true); App.show('crossSetup'); return; }
  let grid, fill, sel = null, dir = 'a', t0 = Date.now(), tick, done = false, flash = [], flashBad = [];
  App.gameBar({ title: '🧩 Crossword', next: () => newLayout(), nextTitle: 'Shuffle a new layout' });

  function setup() {
    grid = Array.from({ length: cw.rows }, () => Array(cw.cols).fill(null));
    cw.placed.forEach(p => { for (let k = 0; k < p.w.length; k++) { const r = p.r + (p.dir === 'd' ? k : 0), c = p.c + (p.dir === 'a' ? k : 0); grid[r][c] ||= { ch: p.w[k], words: {} }; grid[r][c].words[p.dir] = p; } });
    cw.placed.forEach(p => { grid[p.r][p.c].num = p.num; });
    fill = grid.map(row => row.map(() => ''));
    const first = cw.placed.slice().sort((a, b) => a.num - b.num)[0];
    sel = { r: first.r, c: first.c }; dir = first.dir;
    done = false; t0 = Date.now();
  }
  function newLayout() { cw = buildCrossword(puzzle.entries) || cw; savePrint(); setup(); render(); toast('New layout 🔀'); }
  // the printed puzzle and its answer key always match the layout on screen
  function savePrint() { const p = App.data.cross.find(x => x.id === puzzle.id); if (p) { p.layout = packLayout(cw); App.save(); } }
  const wordAt = (r, c, d0) => grid[r]?.[c]?.words[d0];
  const curWord = () => wordAt(sel.r, sel.c, dir) || wordAt(sel.r, sel.c, dir === 'a' ? 'd' : 'a');

  el.innerHTML = `
    <div class="cw">
      <div class="cw-main">
        <div class="cw-top"><b class="cw-title">${esc(puzzle.title)}</b><span class="cw-time" id="cwTime">0:00</span><span class="cw-prog" id="cwProg"></span></div>
        <div class="cw-cur" id="cwCur"></div>
        <div class="cw-gridwrap"><div class="cw-grid" id="cwGrid"></div></div>
        <div class="letters qwerty cw-keys" id="cwKeys">${qwertyKeys()}<div class="kr"><button data-l="BACK" class="wide">⌫</button></div></div>
        <div class="wh-actions cw-acts">
          <button class="btn ghost" id="cwCheck">✓ Check</button>
          <button class="btn ghost" id="cwLetter">Reveal letter</button>
          <button class="btn ghost" id="cwWord">Reveal word</button>
          <button class="btn ghost" id="cwAll">Reveal all</button>
          <button class="btn ghost" id="cwPrint">🖨️ Print</button>
        </div>
      </div>
      <div class="cw-clues" id="cwClues"></div>
    </div>`;

  function render() {
    const cur = curWord();
    const g = $('#cwGrid', el);
    g.style.gridTemplateColumns = `repeat(${cw.cols}, minmax(0, 1fr))`;
    g.style.gridTemplateRows = `repeat(${cw.rows}, minmax(0, 1fr))`; // every square the same size, filled or not
    g.style.setProperty('--cols', cw.cols); g.style.setProperty('--rows', cw.rows);
    g.innerHTML = grid.map((row, r) => row.map((cell, c) => {
      if (!cell) return '<div class="cwc x"></div>';
      const inCur = cur && (cur.dir === 'a' ? r === cur.r && c >= cur.c && c < cur.c + cur.w.length : c === cur.c && r >= cur.r && r < cur.r + cur.w.length);
      const isSel = sel.r === r && sel.c === c;
      const fl = flash.findIndex(([fr, fc]) => fr === r && fc === c), fb = flashBad.findIndex(([fr, fc]) => fr === r && fc === c);
      const fx = fl >= 0 ? 'win' : fb >= 0 ? 'lose' : '', fi = Math.max(fl, fb);
      return `<div class="cwc ${inCur ? 'hl' : ''} ${isSel ? 'sel' : ''} ${cell.bad ? 'bad' : ''} ${cell.shown ? 'shown' : ''} ${fx}" ${fx ? `style="animation-delay:${fi * 70}ms"` : ''} data-r="${r}" data-c="${c}">${cell.num ? `<i>${cell.num}</i>` : ''}<b>${fill[r][c]}</b></div>`;
    }).join('')).join('');
    $$('.cwc[data-r]', g).forEach(x => x.onclick = () => {
      const r = +x.dataset.r, c = +x.dataset.c;
      if (sel.r === r && sel.c === c && grid[r][c].words[dir === 'a' ? 'd' : 'a']) dir = dir === 'a' ? 'd' : 'a';
      else { sel = { r, c }; if (!grid[r][c].words[dir]) dir = dir === 'a' ? 'd' : 'a'; }
      render();
    });
    $('#cwCur', el).innerHTML = cur ? `<button class="cw-nav" id="cwPrev" title="Previous clue">◀</button><span class="cw-tag">${cur.num} ${cur.dir === 'a' ? 'Across' : 'Down'}</span> <span class="cw-ctext">${esc(cur.entry.clue)} <span class="cw-len">(${cwLens(cur.entry.word)})</span></span><button class="cw-nav" id="cwNext" title="Next clue">▶</button>` : '';
    if (cur) { $('#cwPrev', el).onclick = () => nextClue(-1); $('#cwNext', el).onclick = () => nextClue(1); }
    const list = d0 => cw.placed.filter(p => p.dir === d0).sort((a, b) => a.num - b.num).map(p => {
      const full = [...p.w].every((ch, k) => fill[p.r + (p.dir === 'd' ? k : 0)][p.c + (p.dir === 'a' ? k : 0)]);
      return `<li class="${p === cur ? 'on' : ''} ${full ? 'full' : ''}" data-n="${p.num}" data-d="${p.dir}"><b>${p.num}</b> ${esc(p.entry.clue)} <span class="cw-len">(${cwLens(p.entry.word)})</span></li>`;
    }).join('');
    $('#cwClues', el).innerHTML = `<div><h3>Across</h3><ol>${list('a')}</ol></div><div><h3>Down</h3><ol>${list('d')}</ol></div>`;
    $$('#cwClues li', el).forEach(li => li.onclick = () => { const p = cw.placed.find(x => x.num === +li.dataset.n && x.dir === li.dataset.d); sel = { r: p.r, c: p.c }; dir = p.dir; jumpEmpty(p); render(); });
    // keep the current clue in view inside the list (without scrolling the page)
    const box = $('#cwClues', el), on = $('#cwClues li.on', el);
    if (on && getComputedStyle(box).overflowY !== 'visible') { const t = on.offsetTop - box.offsetTop; if (t < box.scrollTop || t > box.scrollTop + box.clientHeight - on.offsetHeight) box.scrollTop = t - 40; }
    const total = grid.flat().filter(Boolean).length, filled = fill.flat().filter(Boolean).length;
    $('#cwProg', el).textContent = `${filled} / ${total} letters`;
    if (cw.unplaced?.length && !render.warned) { render.warned = true; toast(`${cw.unplaced.length} word${cw.unplaced.length > 1 ? 's' : ''} didn't fit — press ▶ in the ☰ Menu for a new layout`); }
  }
  function nextClue(n) {
    if (done) return;
    const ws = cw.placed.slice().sort((a, b) => (a.dir === b.dir ? a.num - b.num : a.dir === 'a' ? -1 : 1));
    const p = ws[(ws.indexOf(curWord()) + n + ws.length) % ws.length];
    sel = { r: p.r, c: p.c }; dir = p.dir; jumpEmpty(p); render();
  }
  function jumpEmpty(p) {
    for (let k = 0; k < p.w.length; k++) { const r = p.r + (p.dir === 'd' ? k : 0), c = p.c + (p.dir === 'a' ? k : 0); if (!fill[r][c]) { sel = { r, c }; return; } }
  }
  function step(n) {
    const p = curWord(); if (!p) return;
    const k = p.dir === 'a' ? sel.c - p.c : sel.r - p.r, nk = k + n;
    if (nk < 0 || nk >= p.w.length) return;
    sel = { r: p.r + (p.dir === 'd' ? nk : 0), c: p.c + (p.dir === 'a' ? nk : 0) };
  }
  function type(L) {
    if (done) return;
    const cell = grid[sel.r][sel.c]; if (cell.shown) { step(1); render(); return; }
    fill[sel.r][sel.c] = L; cell.bad = false; Sfx.click();
    dir = curWord().dir;
    const at = { ...sel };
    step(1);
    // a word just filled in? flash it green if it's right, red if it's not
    Object.values(grid[at.r][at.c].words).forEach(p => {
      if (p.ok) return;
      const cs = wordCells(p), got = cs.map(([r, c]) => fill[r][c]).join('');
      if (got.length < cs.length) return; // not full yet
      if (got === p.w) { p.ok = true; flash.push(...cs); Sfx.bell(); }
      else if (got !== p.lastBad) { p.lastBad = got; flashBad.push(...cs); Sfx.noLetter(); }
    });
    render(); flash = []; flashBad = []; checkDone();
  }
  function back() {
    if (done) return;
    if (!fill[sel.r][sel.c] || grid[sel.r][sel.c].shown) step(-1);
    if (!grid[sel.r][sel.c].shown) { fill[sel.r][sel.c] = ''; grid[sel.r][sel.c].bad = false; }
    render();
  }
  function move(dr, dc) {
    let r = sel.r + dr, c = sel.c + dc;
    while (r >= 0 && c >= 0 && r < cw.rows && c < cw.cols) { if (grid[r][c]) { sel = { r, c }; if (!grid[r][c].words[dir]) dir = dir === 'a' ? 'd' : 'a'; break; } r += dr; c += dc; }
    render();
  }
  function reveal(cells) { cw.placed.forEach(p => { if (wordCells(p).every(([r, c]) => cells.some(x => x[0] === r && x[1] === c) || fill[r][c] === grid[r][c].ch)) p.ok = true; }); cells.forEach(([r, c]) => { if (fill[r][c] !== grid[r][c].ch) { fill[r][c] = grid[r][c].ch; grid[r][c].shown = true; grid[r][c].bad = false; } }); Sfx.reveal(); render(); checkDone(); }
  const wordCells = p => Array.from({ length: p.w.length }, (_, k) => [p.r + (p.dir === 'd' ? k : 0), p.c + (p.dir === 'a' ? k : 0)]);
  function checkDone() {
    const ok = grid.every((row, r) => row.every((cell, c) => !cell || fill[r][c] === cell.ch));
    if (ok && !done) {
      done = true; clearInterval(tick);
      Sfx.solve(); confetti(3500);
      $('#cwCur', el).innerHTML = `<span class="cw-win">🎉 Solved in ${$('#cwTime', el).textContent}!</span> <button class="btn sm pink" id="cwAgain">🔀 Play again (new layout)</button>`;
      $('#cwAgain', el).onclick = newLayout;
    }
  }
  $$('#cwKeys button', el).forEach(b => b.onclick = () => (b.dataset.l === 'BACK' ? back() : type(b.dataset.l)));
  $('#cwCheck', el).onclick = () => {
    let wrong = 0;
    grid.forEach((row, r) => row.forEach((cell, c) => { if (cell && fill[r][c] && fill[r][c] !== cell.ch) { cell.bad = true; wrong++; } }));
    render();
    toast(wrong ? `${wrong} letter${wrong > 1 ? 's' : ''} to fix (in red)` : 'Everything so far is right ✓', !!wrong);
    wrong ? Sfx.noLetter() : Sfx.correct();
  };
  $('#cwLetter', el).onclick = () => reveal([[sel.r, sel.c]]);
  $('#cwWord', el).onclick = () => { const p = curWord(); if (p) reveal(wordCells(p)); };
  $('#cwAll', el).onclick = async () => { if (await confirmBox('Reveal the whole crossword?', 'Reveal all')) reveal(cw.placed.flatMap(wordCells)); };
  $('#cwPrint', el).onclick = () => printMenu(puzzle, cw);
  const onKey = e => {
    if (Modal.stack.length || Menu.isOpen() || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
    if (/^[a-z]$/i.test(e.key) && !e.ctrlKey && !e.metaKey) { e.preventDefault(); type(e.key.toUpperCase()); }
    else if (e.key === 'Backspace') { e.preventDefault(); back(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); move(0, -1); } else if (e.key === 'ArrowRight') { e.preventDefault(); move(0, 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1, 0); } else if (e.key === 'ArrowDown') { e.preventDefault(); move(1, 0); }
    else if (e.key === ' ' || e.key === 'Tab') { e.preventDefault(); nextClue(e.shiftKey ? -1 : 1); }
  };
  document.addEventListener('keydown', onKey, true);
  tick = setInterval(() => { const s = Math.floor((Date.now() - t0) / 1000); const t = $('#cwTime', el); if (t) t.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }, 1000);
  savePrint(); setup(); render();
  App._cwAnswer = () => curWord()?.w || ''; // used by the demo
  return () => { clearInterval(tick); document.removeEventListener('keydown', onKey, true); };
};

// ---------- print: the blank puzzle and its answer key are separate printouts ----------
// The layout is saved with the puzzle, so the answer key printed later matches the puzzle handed out.
function packLayout(cw) { return { rows: cw.rows, cols: cw.cols, placed: cw.placed.map(p => [p.i, p.r, p.c, p.dir]) }; }
function unpackLayout(puzzle) {
  const L = puzzle.layout; if (!L) return null;
  const placed = L.placed.map(([i, r, c, dir]) => ({ i, r, c, dir, w: cwClean(puzzle.entries[i]?.word), entry: puzzle.entries[i] }));
  if (placed.some(p => !p.entry || !p.w)) return null; // the words were edited since — make a new layout
  const starts = [...new Set(placed.map(p => p.r * 1000 + p.c))].sort((a, b) => a - b);
  placed.forEach(p => p.num = starts.indexOf(p.r * 1000 + p.c) + 1);
  return { rows: L.rows, cols: L.cols, placed };
}
function printMenu(puzzle, cw) {
  const saved = App.data.cross.find(x => x.id === puzzle.id);
  cw ||= unpackLayout(puzzle);
  const fresh = () => { const n = buildCrossword(puzzle.entries); if (saved && n) { saved.layout = packLayout(n); App.save(); } return n; };
  Modal.open({
    title: '🖨️ Print — ' + esc(puzzle.title),
    body: `<p style="font-size:18px;margin:0 0 6px">Print the blank puzzle to hand out, and the answer key separately. ${cw ? 'Both use the same layout.' : ''}</p>
      <div class="hint">Tip: choose “Save as PDF” in the print window to keep a file.</div>`,
    actions: [
      { label: 'Cancel', cls: 'ghost' },
      { label: '🔑 Answers', cls: 'cyan', onClick: c => { c(); printCrossword(puzzle, cw || fresh(), true); } },
      { label: '📄 Blank puzzle', cls: 'pink', onClick: c => { c(); cw ||= fresh(); printCrossword(puzzle, cw, false); } },
    ],
  });
}
function printCrossword(puzzle, cw, answers = false) {
  cw ||= buildCrossword(puzzle.entries);
  if (!cw) return;
  const g = Array.from({ length: cw.rows }, () => Array(cw.cols).fill(null));
  cw.placed.forEach(p => { for (let k = 0; k < p.w.length; k++) g[p.r + (p.dir === 'd' ? k : 0)][p.c + (p.dir === 'a' ? k : 0)] = p.w[k]; });
  const nums = {}; cw.placed.forEach(p => nums[p.r + ',' + p.c] = p.num);
  // laid out like a classic printable crossword: big centred title, the grid filling the page width,
  // then Across and Down clues in two columns (answer key on its own page at the end)
  const size = Math.floor(Math.max(16, Math.min(40, 680 / cw.cols, 620 / cw.rows)));
  const table = answers => `<table class="pk-cw" style="--s:${size}px">${g.map((row, r) => `<tr>${row.map((ch, c) => ch ? `<td>${nums[r + ',' + c] ? `<i>${nums[r + ',' + c]}</i>` : ''}${answers ? ch : ''}</td>` : '<td class="x"></td>').join('')}</tr>`).join('')}</table>`;
  const clues = d0 => cw.placed.filter(p => p.dir === d0).sort((a, b) => a.num - b.num).map(p => `<li><b>${p.num}.</b> ${esc(p.entry.clue)}</li>`).join('');
  $('#printKey')?.remove();
  const box = document.createElement('div');
  box.id = 'printKey';
  box.className = 'pk-cross';
  box.innerHTML = `<h1 class="pk-title">${esc(puzzle.title)}${answers ? ' — Answers' : ''}</h1>${table(answers)}
    <div class="pk-clues"><div><h3>Across</h3><ol>${clues('a')}</ol></div><div><h3>Down</h3><ol>${clues('d')}</ol></div></div>`;
  const oldTitle = document.title; document.title = puzzle.title + (answers ? ' - Answers' : ''); // becomes the PDF file name
  document.body.appendChild(box);
  document.body.classList.add('printing');
  const done = () => { document.title = oldTitle; document.body.classList.remove('printing'); box.remove(); window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  setTimeout(() => { window.print(); setTimeout(done, 1000); }, 50);
}
