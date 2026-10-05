// 📝 Question Manager — add / edit / delete / import for all three games.
const TABS = {
  trivia: { label: '⚡ Trivia', color: '#ff3d8b', noun: 'question', parse: 'parseTrivia' },
  board: { label: '🎯 Quiz Board', color: '#2f7bff', noun: 'clue', parse: 'parseBoard' },
  wheel: { label: '🎡 Spin & Solve', color: '#ff7a1f', noun: 'puzzle', parse: 'parseWheel' },
  words: { label: '🔤 Word Guess', color: '#1fb866', noun: 'word', parse: 'parseWords' },
};

App.screens.editor = (el, startTab = 'trivia') => {
  const d = App.data;
  let tab = startTab, search = '', boardFilter = '';
  App.setTopActions(`<button class="btn sm pink" id="eDone">Done ✓</button>`, {
    eDone: () => App.show('home'),
  });

  function draw() {
    const T = TABS[tab];
    const list = d[tab];
    el.innerHTML = `
      <div class="page-title"><h1>📝 Question Manager</h1><div class="spacer"></div>
        <span class="set-badge ${d.bank === 'recovery' ? 'rec' : ''}">${d.bank === 'recovery' ? '🌿 Editing: Mental Health &amp; Recovery questions' : '📚 Editing: Regular questions'}</span></div>
      <div class="hint" style="margin:-10px 0 14px">${d.bank === 'recovery' ? 'These are used when the Look is set to Recovery.' : 'These are used in the Classic and Playful looks. Switch the Look to Recovery (☰ Menu) to edit the recovery questions.'}</div>
      <div class="tabs">${Object.entries(TABS).map(([k, t]) => `<button class="tab ${k === tab ? 'on' : ''}" data-t="${k}" style="--tc:${t.color}">${t.label} <span class="pill">${d[k].length}</span></button>`).join('')}</div>
      <div class="toolbar">
        <button class="btn green" id="add">＋ Add ${T.noun}</button>
        <button class="btn cyan" id="imp">📥 Import from text file</button>
        <button class="btn ghost" id="tpl">📄 Save blank template</button>
        ${tab === 'board' ? `<select class="input" id="bf"><option value="">All boards</option>${boardNames().map(b => `<option ${b === boardFilter ? 'selected' : ''}>${esc(b)}</option>`).join('')}</select>` : ''}
        <input class="input" id="search" placeholder="🔍 Search…" value="${esc(search)}">
        <div style="flex:1"></div>
        <button class="btn sm red" id="clear" ${list.length ? '' : 'disabled'}>🗑 Delete all</button>
      </div>
      <div id="listBox"></div>`;
    $$('.tab', el).forEach(b => b.onclick = () => { tab = b.dataset.t; search = ''; draw(); });
    $('#add', el).onclick = () => openForm(null);
    $('#imp', el).onclick = importFile;
    $('#tpl', el).onclick = async () => { const p = await App.saveText(GSData.TEMPLATES[tab].file, GSData.TEMPLATES[tab].text.replace(/\n/g, '\r\n')); if (p) toast('Template saved ✓'); };
    $('#clear', el).onclick = async () => {
      if (await confirmBox(`Delete ALL ${list.length} ${TABS[tab].label.slice(2).trim()} ${T.noun}s? You can't undo this (unless you made a backup).`, 'Delete all', true)) { d[tab] = []; App.save(); draw(); toast('Deleted'); }
    };
    const s = $('#search', el);
    s.oninput = () => { search = s.value; drawList(); };
    if ($('#bf', el)) $('#bf', el).onchange = e => { boardFilter = e.target.value; drawList(); };
    drawList();
    if (search) { s.focus(); s.setSelectionRange(search.length, search.length); }
  }

  function matches(item) {
    if (!search) return true;
    return Object.values(item).join(' ').toLowerCase().includes(search.toLowerCase());
  }

  function drawList() {
    const box = $('#listBox', el);
    const items = d[tab].filter(matches);
    if (!d[tab].length) { box.innerHTML = `<div class="empty">Nothing here yet. Click <b>＋ Add</b>, or <b>📥 Import</b> a text file.<br><span class="hint">Tip: "Save blank template" gives you a file to fill in with Notepad.</span></div>`; return; }
    if (!items.length) { box.innerHTML = `<div class="empty">No matches for "${esc(search)}"</div>`; return; }
    if (tab === 'trivia') {
      box.innerHTML = `<div class="qlist">${items.map(q => `
        <div class="qitem" data-id="${q.id}">
          <div class="qmain"><div class="qtext">${esc(q.question)}</div>
          <div class="qsub"><span class="pill">${esc(q.category || 'General')}</span><span class="pill">⏱ ${q.time || 20}s</span><b>✓ ${esc(q.answer)}</b> &nbsp;·&nbsp; ✗ ${q.wrong.map(esc).join(' · ')}</div></div>
          <button class="btn sm ghost" data-edit>Edit</button><button class="btn sm red" data-del>🗑</button>
        </div>`).join('')}</div>`;
    } else if (tab === 'words') {
      box.innerHTML = `<div class="word-list">${items.map(w => `
        <div class="qitem" data-id="${w.id}">
          <div class="qmain"><div class="qtext" style="letter-spacing:4px;font-weight:700">${esc(w.word)}</div><div class="qsub">${w.hint ? `<span class="pill">${esc(w.hint)}</span>` : '<span class="hint">no hint</span>'}</div></div>
          <button class="btn sm ghost" data-edit>Edit</button><button class="btn sm red" data-del>🗑</button>
        </div>`).join('')}</div>`;
    } else if (tab === 'wheel') {
      box.innerHTML = `<div class="qlist">${items.map(p => `
        <div class="qitem" data-id="${p.id}">
          <div class="qmain"><div class="qtext" style="letter-spacing:1px">${esc(p.phrase)}</div><div class="qsub"><span class="pill">${esc(p.category)}</span></div></div>
          <button class="btn sm ghost" data-edit>Edit</button><button class="btn sm red" data-del>🗑</button>
        </div>`).join('')}</div>`;
    } else {
      const names = boardNames().filter(b => !boardFilter || b === boardFilter);
      box.innerHTML = names.map(bn => {
        const inBoard = items.filter(c => c.board === bn);
        if (!inBoard.length) return '';
        const L = boardLayout(bn);
        const cats = [...new Set(inBoard.map(c => c.category))];
        return `<div class="panel" style="margin-bottom:16px">
          <div class="group-head">🎯 ${esc(bn)} <span class="sub">${L.length} categor${L.length === 1 ? 'y' : 'ies'} shown in game</span><div style="flex:1"></div>
            <button class="btn sm green" data-addto="${esc(bn)}">＋ Add clue</button>
            <button class="btn sm ghost" data-ren="${esc(bn)}">✏️ Rename board</button>
            <button class="btn sm red" data-delb="${esc(bn)}">🗑 Delete board</button></div>
          ${cats.map(cn => `<div class="group-head" style="font-size:18px;margin-top:10px">${esc(cn)}</div><div class="qlist">
            ${inBoard.filter(c => c.category === cn).sort((a, b) => a.value - b.value).map(c => `
            <div class="qitem" data-id="${c.id}"><span class="pill" style="font-size:16px;background:var(--yellow);color:#3a1d00">${fmt(c.value)}</span>
              <div class="qmain"><div class="qtext">${esc(c.clue)}</div><div class="qsub"><b>✓ ${esc(c.answer)}</b></div></div>
              <button class="btn sm ghost" data-edit>Edit</button><button class="btn sm red" data-del>🗑</button></div>`).join('')}</div>`).join('')}
        </div>`;
      }).join('');
      $$('[data-addto]', box).forEach(b => b.onclick = e => { e.stopPropagation(); openForm(null, { board: b.dataset.addto }); });
      $$('[data-ren]', box).forEach(b => b.onclick = e => { e.stopPropagation(); renameBoard(b.dataset.ren); });
      $$('[data-delb]', box).forEach(b => b.onclick = async e => {
        e.stopPropagation();
        const bn = b.dataset.delb, n = d.board.filter(c => c.board === bn).length;
        if (await confirmBox(`Delete the board "${bn}" and all ${n} of its clues?`, 'Delete board', true)) { d.board = d.board.filter(c => c.board !== bn); App.save(); draw(); toast('Board deleted'); }
      });
    }
    $$('.qitem', box).forEach(row => {
      const id = row.dataset.id;
      row.onclick = () => openForm(d[tab].find(x => x.id === id));
      $('[data-del]', row).onclick = async e => {
        e.stopPropagation();
        if (await confirmBox(`Delete this ${TABS[tab].noun}?`, 'Delete', true)) { d[tab] = d[tab].filter(x => x.id !== id); App.save(); draw(); toast('Deleted'); }
      };
    });
  }

  // ---------- forms ----------
  const datalist = (id, vals) => `<datalist id="${id}">${[...new Set(vals)].filter(Boolean).sort().map(v => `<option value="${esc(v)}">`).join('')}</datalist>`;

  function openForm(item, preset = {}) {
    const isNew = !item;
    const v = Object.assign({}, preset, item || {});
    let body;
    if (tab === 'trivia') {
      const w = v.wrong || [];
      body = `
        <label class="field"><span>Question *</span><textarea class="input" id="fQ" rows="2">${esc(v.question)}</textarea></label>
        <label class="field"><span>✓ Correct answer *</span><input class="input" id="fA" value="${esc(v.answer)}" style="border-color:rgba(62,224,143,.6)"></label>
        <div class="row">
          <label class="field"><span>✗ Wrong answer 1 *</span><input class="input" id="fW0" value="${esc(w[0])}"></label>
          <label class="field"><span>✗ Wrong answer 2</span><input class="input" id="fW1" value="${esc(w[1])}"></label>
          <label class="field"><span>✗ Wrong answer 3</span><input class="input" id="fW2" value="${esc(w[2])}"></label>
        </div>
        <div class="row">
          <label class="field"><span>Category</span><input class="input" id="fC" list="dlC" value="${esc(v.category || '')}" placeholder="General">${datalist('dlC', d.trivia.map(q => q.category))}</label>
          <label class="field"><span>Timer</span><select class="input" id="fT">${[10, 15, 20, 30, 45, 60, 90].map(s => `<option value="${s}" ${(v.time || 20) === s ? 'selected' : ''}>${s} seconds</option>`).join('')}</select></label>
        </div>
        <div class="hint">Answers get shuffled during play. For True/False, use "True" and "False" with just one wrong answer.</div>
        <div class="err" id="fErr"></div>`;
    } else if (tab === 'board') {
      body = `
        <div class="row">
          <label class="field"><span>Board *</span><input class="input" id="fB" list="dlB" value="${esc(v.board || boardFilter || boardNames()[0] || 'My Board')}">${datalist('dlB', boardNames())}</label>
          <label class="field"><span>Category *</span><input class="input" id="fC" list="dlC" value="${esc(v.category || '')}">${datalist('dlC', d.board.map(c => c.category))}</label>
          <label class="field" style="max-width:150px"><span>Points *</span><input class="input" id="fV" type="number" min="1" step="100" value="${v.value || 100}"></label>
        </div>
        <label class="field"><span>Clue *</span><textarea class="input" id="fQ" rows="3">${esc(v.clue)}</textarea></label>
        <label class="field"><span>✓ Answer *</span><input class="input" id="fA" value="${esc(v.answer)}"></label>
        <div class="hint">Type a new board or category name to create one. Each board shows up to 6 categories × 6 clues.</div>
        <div class="err" id="fErr"></div>`;
    } else if (tab === 'words') {
      body = `
        <label class="field"><span>5-letter word *</span><input class="input" id="fW" value="${esc(v.word || '')}" maxlength="5" style="text-transform:uppercase;letter-spacing:8px;font-size:30px;font-weight:700;max-width:260px"></label>
        <label class="field"><span>Hint (optional)</span><input class="input" id="fH" list="dlH" value="${esc(v.hint || '')}" placeholder="e.g. Animal">${datalist('dlH', d.words.map(w => w.hint))}</label>
        <div class="err" id="fErr"></div>`;
    } else {
      body = `
        <label class="field"><span>Category *</span><input class="input" id="fC" list="dlC" value="${esc(v.category || '')}" placeholder="Phrase, Place, Thing…">${datalist('dlC', ['Phrase', 'Place', 'Thing', 'Person', 'Food & Drink', 'Event', 'Before & After', 'Fun & Games', ...d.wheel.map(p => p.category)])}</label>
        <label class="field"><span>Puzzle *</span><input class="input" id="fP" value="${esc(v.phrase || '')}" style="text-transform:uppercase;letter-spacing:1px"></label>
        <div class="puzzle" id="fPrev" style="padding:10px;box-shadow:none"></div>
        <div class="err" id="fErr" style="margin-top:8px"></div>`;
    }
    const m = Modal.open({
      title: (isNew ? 'Add ' : 'Edit ') + TABS[tab].noun, body, wide: tab !== 'wheel' && tab !== 'words',
      actions: [
        ...(isNew ? [] : [{ label: '🗑 Delete', cls: 'red', onClick: async close => {
          if (await confirmBox(`Delete this ${TABS[tab].noun}?`, 'Delete', true)) { d[tab] = d[tab].filter(x => x.id !== item.id); App.save(); close(); draw(); toast('Deleted'); }
        } }]),
        { label: 'Cancel', cls: 'ghost' },
        ...(isNew ? [{ label: 'Save & add another', cls: 'cyan', onClick: (close, mb) => { if (save(mb)) { close(); openForm(null, keepFor(mb)); } } }] : []),
        { label: 'Save ✓', cls: 'green', onClick: (close, mb) => { if (save(mb)) close(); } },
      ],
    });
    const mb = $('.mbody', m.el);
    if (tab === 'wheel') {
      const upd = () => {
        const lay = GSData.layoutPuzzle($('#fP', mb).value);
        $('#fErr', mb).textContent = $('#fP', mb).value.trim() && !lay.ok ? lay.error : '';
        const rows = lay.ok ? lay.rows : [];
        $('#fPrev', mb).innerHTML = Array.from({ length: 4 }, (_, r) => {
          const line = rows[r - Math.floor((4 - rows.length) / 2)] || '';
          const off = Math.floor((14 - line.length) / 2);
          return `<div class="prow">${Array.from({ length: 14 }, (_, c) => { const ch = line[c - off]; return ch && ch !== ' ' ? `<div class="cell l" style="font-size:18px">${esc(ch)}</div>` : `<div class="cell"></div>`; }).join('')}</div>`;
        }).join('');
      };
      $('#fP', mb).oninput = upd; upd();
    }
    function keepFor(mb) { // keep board + category when adding several clues in a row
      if (tab === 'board') return { board: $('#fB', mb).value.trim(), category: $('#fC', mb).value.trim(), value: (+$('#fV', mb).value || 0) + 100 };
      if (tab === 'trivia') return { category: $('#fC', mb).value.trim(), time: +$('#fT', mb).value };
      if (tab === 'words') return { hint: $('#fH', mb).value.trim() };
      return { category: $('#fC', mb).value.trim() };
    }
    function save(mb) {
      const val = id => ($('#' + id, mb)?.value || '').trim();
      const err = msg => { $('#fErr', mb).textContent = msg; return false; };
      let rec;
      if (tab === 'trivia') {
        if (!val('fQ')) return err('Please type the question.');
        if (!val('fA')) return err('Please type the correct answer.');
        const wrong = ['fW0', 'fW1', 'fW2'].map(val).filter(Boolean);
        if (!wrong.length) return err('Add at least one wrong answer.');
        if (wrong.some(w => w.toLowerCase() === val('fA').toLowerCase())) return err('A wrong answer matches the correct answer.');
        rec = { question: val('fQ'), answer: val('fA'), wrong, category: val('fC') || 'General', time: +val('fT') || 20 };
      } else if (tab === 'board') {
        if (!val('fB')) return err('Please name the board.');
        if (!val('fC')) return err('Please enter a category.');
        if (!(+val('fV') > 0)) return err('Points must be a number above 0.');
        if (!val('fQ') || !val('fA')) return err('Please fill in both the clue and the answer.');
        rec = { board: val('fB'), category: val('fC'), value: Math.round(+val('fV')), clue: val('fQ'), answer: val('fA') };
      } else if (tab === 'words') {
        const w = val('fW').toUpperCase();
        if (!/^[A-Z]{5}$/.test(w)) return err('The word must be exactly 5 letters (A–Z).');
        if (d.words.some(x => x.word === w && x !== item)) return err(`${w} is already in your list.`);
        rec = { word: w, hint: val('fH') };
      } else {
        if (!val('fC')) return err('Please enter a category.');
        const lay = GSData.layoutPuzzle(val('fP'));
        if (!lay.ok) return err(lay.error);
        rec = { category: val('fC'), phrase: lay.text };
      }
      if (isNew) d[tab].push({ id: GSData.uid(), ...rec }); else Object.assign(item, rec);
      App.save(); draw(); toast(isNew ? 'Added ✓' : 'Saved ✓');
      return true;
    }
  }

  function renameBoard(old) {
    Modal.open({
      title: 'Rename board', body: `<label class="field"><span>New name</span><input class="input" id="rn" value="${esc(old)}"></label><div class="err" id="rnErr"></div>`,
      actions: [{ label: 'Cancel', cls: 'ghost' }, { label: 'Rename', cls: 'green', onClick: (close, mb) => {
        const nn = $('#rn', mb).value.trim();
        if (!nn) { $('#rnErr', mb).textContent = 'Name can\'t be empty'; return; }
        if (nn !== old && boardNames().includes(nn)) { $('#rnErr', mb).textContent = 'Another board already has that name'; return; }
        d.board.forEach(c => { if (c.board === old) c.board = nn; });
        if (boardFilter === old) boardFilter = nn;
        App.save(); close(); draw();
      } }],
    });
  }

  // ---------- import ----------
  async function importFile() {
    const f = await App.openText(`Choose a ${TABS[tab].label.slice(2).trim()} text file`);
    if (!f) return;
    const { items, problems } = GSData[TABS[tab].parse](f.text);
    const n = items.length, noun = TABS[tab].noun + (n === 1 ? '' : 's');
    const probHtml = problems.length ? `<p style="margin:14px 0 6px;font-weight:600">⚠️ ${problems.length} thing${problems.length === 1 ? '' : 's'} to check:</p><div class="problems">${problems.map(p => `<div>• ${esc(p)}</div>`).join('')}</div>` : '';
    if (!n) {
      Modal.open({ title: 'Nothing to import', body: `<p style="font-size:19px">No ${TABS[tab].noun}s were found in <b>${esc(f.name)}</b>. Is it the right template for the <b>${TABS[tab].label.slice(2).trim()}</b> tab?</p>${probHtml}`, actions: [{ label: 'OK', cls: 'pink' }] });
      return;
    }
    let extra = '';
    if (tab === 'board') {
      const bs = [...new Set(items.map(c => c.board))];
      const clash = bs.filter(b => boardNames().includes(b));
      extra = `<p class="hint">Board${bs.length > 1 ? 's' : ''}: ${bs.map(esc).join(', ')}${clash.length ? ` — <b style="color:var(--yellow)">${clash.map(esc).join(', ')} already exist${clash.length === 1 ? 's' : ''}; "Add" will merge clues into it.</b>` : ''}</p>`;
    }
    Modal.open({
      title: `Import ${n} ${noun}?`, wide: true,
      body: `<p style="font-size:19px;margin:0">Found <b style="color:var(--green)">${n} ${noun}</b> in <b>${esc(f.name)}</b>.</p>${extra}${probHtml}`,
      actions: [
        { label: 'Cancel', cls: 'ghost' },
        { label: `Replace all ${TABS[tab].noun}s`, cls: 'red', onClick: async close => {
          if (await confirmBox(`This removes your ${d[tab].length} current ${TABS[tab].noun}s and keeps only the ${n} imported. Continue?`, 'Replace', true)) { d[tab] = items; App.save(); close(); draw(); toast(`Imported ${n} ${noun} ✓`); }
        } },
        { label: `Add ${n} ${noun} ✓`, cls: 'green', onClick: close => { d[tab].forEach(x => delete x.played); d[tab].push(...items); App.save(); close(); draw(); toast(`Imported ${n} ${noun} ✓`); } },
      ],
    });
  }

  // ---------- backup / restore ----------
  const backup = () => App.backup();
  const restore = () => App.restore(draw);

  draw();
};
