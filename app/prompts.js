// ✍️ Prompt Studio — upbeat letter and journal prompts on the big screen: a 🎰 Random spin that
// flashes through prompts and lands on one, a dropdown to choose a specific prompt, a quiet
// writing timer, printable worksheets, and 📁 import of extra prompts (saved on this browser).
// Built-in prompts live in activities-data.js.
App.screens.prompts = (el) => {
  const A = window.GS_ACTIVITIES, d = App.data, s = d.settings;
  let kind = s.psKind === 'journal' ? 'journal' : 'letters';
  let cat = s.psCat || 'any', prompt = null, timerId, left = 0, total = 0, spinning = false, spinT;
  const norm = t => String(t).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  // rotation: prompts already shown wait until the rest have had a turn (remembered between visits)
  const seen = { letters: new Set(s.psSeen?.letters || []), journal: new Set(s.psSeen?.journal || []) };

  // built-in categories + anything imported (same-named categories are merged)
  let CATS = {};
  function buildCats() {
    for (const k of ['letters', 'journal']) {
      const base = A[k].map(c => ({ ...c, prompts: [...c.prompts] }));
      (d.customPrompts?.[k] || []).forEach(x => {
        const m = base.find(c => norm(c.name) === norm(x.name));
        if (m) x.prompts.forEach(p => { if (!m.prompts.includes(p)) m.prompts.push(p); });
        else base.push({ id: 'my-' + norm(x.name).replace(/ /g, '-'), icon: x.icon || '⭐', name: x.name, greet: x.greet || 'Dear ________,', prompts: [...x.prompts], mine: true });
      });
      CATS[k] = base.filter(c => c.prompts.length);
    }
  }
  buildCats();
  const cats = () => CATS[kind];
  if (cat !== 'any' && !cats().some(c => c.id === cat)) cat = 'any';
  const catOf = p => cats().find(c => c.prompts.includes(p)) || cats()[0];
  function pool() { return cat === 'any' ? cats().filter(c => !c.solo).flatMap(c => c.prompts) : (cats().find(c => c.id === cat) || cats()[0]).prompts; }
  function pick() {
    const all = pool(); let fresh = all.filter(p => !seen[kind].has(p) && p !== prompt);
    if (!fresh.length) { all.forEach(p => seen[kind].delete(p)); fresh = all.filter(p => p !== prompt); }
    prompt = fresh[Math.floor(Math.random() * fresh.length)] || all[0];
    seen[kind].add(prompt);
    s.psSeen = { letters: [...seen.letters], journal: [...seen.journal] }; App.save();
  }
  const save = () => { s.psKind = kind; s.psCat = cat; App.save(); };

  function pickerHTML() {
    const list = cats(); let n = 0;
    return `<select id="psPick" class="input">${list.map(c => `<optgroup label="${esc(c.icon + ' ' + c.name)}">${c.prompts.map(p => `<option value="${n++}"${p === prompt ? ' selected' : ''}>${esc(p)}</option>`).join('')}</optgroup>`).join('')}</select>`;
  }
  const flat = () => cats().flatMap(c => c.prompts);

  function draw() {
    const c = catOf(prompt), mine = (d.customPrompts?.letters?.length || 0) + (d.customPrompts?.journal?.length || 0);
    el.innerHTML = `
      <div class="setup ps">
        <h1>✍️ Prompt Studio</h1>
        <div class="ps-top">
          <div class="ps-tabs">
            <button class="ps-tab${kind === 'letters' ? ' on' : ''}" data-k="letters">💌 Letters</button>
            <button class="ps-tab${kind === 'journal' ? ' on' : ''}" data-k="journal">📓 Journal</button>
          </div>
          <select class="input ps-catsel" id="psCat" title="Category">
            <option value="any"${cat === 'any' ? ' selected' : ''}>🎲 All categories</option>
            ${cats().map(x => `<option value="${x.id}"${cat === x.id ? ' selected' : ''}>${x.icon} ${esc(x.name)}</option>`).join('')}
          </select>
        </div>
        <div class="ps-card" id="psCard">
          <div class="ps-label">${c ? `${c.icon} ${esc(c.name)}` : ''}</div>
          ${kind === 'letters' && c ? `<div class="ps-greet">${esc(c.greet)}</div>` : ''}
          <div class="ps-text">${esc(prompt)}</div>
          <div class="ps-timer" id="psTimer"></div>
        </div>
        <div class="ps-acts">
          <button class="btn xl pink ps-spin" id="psSpin">🎰 Random</button>
          <div class="ps-tools">
            <div class="ps-pick" title="Choose a specific prompt">${pickerHTML()}</div>
            <div class="ps-drop"><button class="ps-tool" id="psTimeBtn">⏱ Timer</button>
              <div class="gf-menu ps-menu" id="psTimeMenu" hidden>${[3, 5, 10, 15].map(m => `<button class="gf-item" data-m="${m}">⏱ ${m} minutes of quiet writing</button>`).join('')}</div></div>
            <div class="ps-drop"><button class="ps-tool" id="psPrintBtn">🖨 Print</button>
              <div class="gf-menu ps-menu" id="psPrintMenu" hidden>
                <button class="gf-item" data-p="sheet">📝 This prompt — a writing sheet</button>
                <button class="gf-item" data-p="home">🏠 Take-home sheet — 10 prompts</button>
                <button class="gf-item" data-p="all">📚 Every ${kind === 'letters' ? 'letter' : 'journal'} prompt</button>
              </div></div>
            <div class="ps-drop"><button class="ps-tool" id="psFileBtn" title="Import prompts">📁 Import</button>
              <div class="gf-menu ps-menu" id="psFileMenu" hidden>
                <button class="gf-item" data-f="import">📥 Import prompts (.txt)</button>
                <button class="gf-item" data-f="sample">📄 Download a sample file</button>
                ${mine ? `<button class="gf-item" data-f="clear">🗑 Remove imported prompts</button>` : ''}
              </div></div>
          </div>
        </div>
      </div>`;
    $$('.ps-tab', el).forEach(b => b.onclick = () => { if (spinning || b.dataset.k === kind) return; kind = b.dataset.k; cat = 'any'; save(); pick(); draw(); });
    $('#psCat', el).onchange = e => { stopSpin(); cat = e.target.value; save(); pick(); draw(); Sfx.click(); };
    $('#psSpin', el).onclick = spin;
    FolderSelect.enhance($('#psPick', el));
    $('#psPick', el).addEventListener('change', e => {
      if (e.detail === 'sync') return;
      const p = flat()[+e.target.value]; if (!p || p === prompt) return;
      stopSpin(); prompt = p; seen[kind].add(p); swap(true); Sfx.click();
    });
    dropdown('psTimeBtn', 'psTimeMenu', b => startTimer(+b.dataset.m));
    dropdown('psPrintBtn', 'psPrintMenu', b => print(b.dataset.p));
    dropdown('psFileBtn', 'psFileMenu', b => files(b.dataset.f));
    if (timerId) paintTimer();
  }
  // show a prompt on the card (keeps a running timer going)
  function show(p, anim) {
    const c = catOf(p), card = $('#psCard', el); if (!card) return;
    $('.ps-label', card).innerHTML = `${c.icon} ${esc(c.name)}`;
    const g = $('.ps-greet', card); if (g) g.textContent = c.greet;
    $('.ps-text', card).textContent = p;
    if (anim) { card.classList.remove('flip', 'land'); void card.offsetWidth; card.classList.add(anim); }
  }
  function syncPicker() {
    const sel = $('#psPick', el); if (!sel) return;
    sel.value = String(flat().indexOf(prompt));
    sel.dispatchEvent(new CustomEvent('change', { detail: 'sync' }));
  }
  function swap(flip) { show(prompt, flip ? 'flip' : null); syncPicker(); }

  // 🎰 the spin: flash through prompts, slowing down, then land on the picked one
  function spin() {
    if (spinning) return;
    const all = pool();
    pick();
    if (all.length < 2) { swap(true); Sfx.ding(); return; }
    spinning = true;
    const card = $('#psCard', el), btn = $('#psSpin', el);
    card.classList.remove('flip', 'land'); card.classList.add('spin'); btn.disabled = true;
    const notes = [523, 587, 659, 784, 880, 1047, 880, 784, 659, 587];
    const steps = 22; let i = 0, last = null;
    const tickOnce = () => {
      if (i >= steps) return land();
      let p; do { p = all[Math.floor(Math.random() * all.length)]; } while (all.length > 2 && (p === last || p === prompt));
      last = p; show(p);
      Sfx.tone(notes[i % notes.length], 0.09, 'triangle', 0.07);
      const t = i / steps; i++;
      spinT = setTimeout(tickOnce, 45 + 330 * t * t); // fast → slow
    };
    tickOnce();
  }
  function land() {
    spinning = false;
    const card = $('#psCard', el); if (!card) return;
    card.classList.remove('spin'); show(prompt, 'land'); syncPicker();
    [523, 659, 784, 1047].forEach((f, k) => Sfx.tone(f, 0.35, 'sine', 0.11, k * 0.09));
    const b = $('#psSpin', el); if (b) b.disabled = false;
  }
  function stopSpin() { if (!spinning) return; clearTimeout(spinT); spinning = false; $('#psCard', el)?.classList.remove('spin'); const b = $('#psSpin', el); if (b) b.disabled = false; }

  function dropdown(btnId, menuId, onPick) {
    const btn = $('#' + btnId, el), menu = $('#' + menuId, el);
    btn.onclick = e => { e.stopPropagation(); $$('.ps-menu', el).forEach(m => { if (m !== menu) m.hidden = true; }); menu.hidden = !menu.hidden; };
    $$('.gf-item', menu).forEach(b => b.onclick = () => { menu.hidden = true; onPick(b); });
  }
  const closeMenus = e => { if (!e.target.closest('.ps-drop')) $$('.ps-menu', el).forEach(m => m.hidden = true); };
  document.addEventListener('click', closeMenus);
  const onKey = e => {
    if (Modal.stack.length || Menu.isOpen() || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName) || el.querySelector('.fsel.open')) return;
    if (e.code === 'Space') { e.preventDefault(); e.target.blur?.(); spin(); }
  };
  document.addEventListener('keydown', onKey);

  // ⏱ quiet writing timer (no ticking)
  function startTimer(min) {
    clearInterval(timerId); total = left = min * 60;
    paintTimer(); Sfx.click();
    timerId = setInterval(() => {
      left = Math.max(0, left - 0.25);
      RingClock.set($('#psClock', el), left, total, false, true);
      const t = $('#psClockTxt', el); if (t) t.textContent = fmtTime(left);
      if (left <= 0) { clearInterval(timerId); timerId = null; Sfx.ding(); const box = $('#psTimer', el); if (box) box.innerHTML = `<div class="ps-done">✨ Time’s up — finish your last thought ✨</div>`; }
    }, 250);
  }
  const fmtTime = t => { const m = Math.floor(Math.ceil(t) / 60), sec = Math.ceil(t) % 60; return `${m}:${String(sec).padStart(2, '0')}`; };
  function paintTimer() {
    const box = $('#psTimer', el); if (!box) return;
    box.innerHTML = `<div class="ps-clock">${RingClock.html('psClock', total, 'sm')}<div><div class="ps-clock-txt" id="psClockTxt">${fmtTime(left)}</div><div class="hint">Quiet writing time</div></div>
      <button class="btn ghost sm" id="psStop">Stop timer</button></div>`;
    RingClock.set($('#psClock', el), left, total, false, true);
    $('#psStop', el).onclick = () => { clearInterval(timerId); timerId = null; box.innerHTML = ''; };
  }

  // 📁 import — plain text. "# Letters" / "# Journal" picks the tab, "## Name" starts a category,
  // "Greeting: Dear ___," sets a letter greeting, every other line is a prompt.
  async function files(what) {
    if (what === 'sample') {
      App.saveText('prompt-studio-sample.txt', PS_SAMPLE, [{ name: 'Text', extensions: ['txt'] }]);
      toast('📄 Sample file downloaded — fill it in and import it');
      return;
    }
    if (what === 'clear') {
      if (!await confirmBox('Remove all imported prompts from this browser? The built-in prompts stay.', 'Remove')) return;
      d.customPrompts = { letters: [], journal: [] }; App.save(true);
      buildCats(); if (!flat().includes(prompt)) pick(); draw(); toast('🗑 Imported prompts removed');
      return;
    }
    const f = await App.openText('Import prompts'); if (!f) return;
    const res = parsePrompts(f.text, kind);
    if (!res.count) { toast('No prompts found in that file — try the 📄 sample file format', true); return; }
    d.customPrompts = d.customPrompts || { letters: [], journal: [] };
    let added = 0;
    for (const k of ['letters', 'journal']) {
      const into = d.customPrompts[k] = d.customPrompts[k] || [];
      res[k].forEach(x => {
        let m = into.find(c => norm(c.name) === norm(x.name));
        if (!m) { m = { name: x.name, icon: x.icon, greet: x.greet, prompts: [] }; into.push(m); }
        if (x.greet) m.greet = x.greet;
        const builtIn = new Set(A[k].flatMap(c => c.prompts));
        x.prompts.forEach(p => { if (!m.prompts.includes(p) && !builtIn.has(p)) { m.prompts.push(p); added++; } });
      });
      d.customPrompts[k] = into.filter(c => c.prompts.length);
    }
    App.save(true); buildCats(); draw();
    toast(added ? `📥 Added ${added} new prompt${added === 1 ? '' : 's'}` : 'Those prompts are already here 👍');
  }

  // 🖨 printables
  function print(what) {
    const c = catOf(prompt), letters = kind === 'letters';
    const lines = n => `<div class="pk-lines">${'<div></div>'.repeat(n)}</div>`;
    if (what === 'sheet') {
      printPage(letters ? 'Letter Writing' : 'Journal Page', `
        <div class="pk-head"><span>${letters ? '💌 Letter Writing' : '📓 Journal'}</span><span>Name: ______________________ &nbsp; Date: ____________</span></div>
        <div class="pk-prompt"><small>${esc(c.icon + ' ' + c.name)}</small>${esc(prompt)}</div>
        ${letters ? `<div class="pk-greet">${esc(c.greet)}</div>${lines(19)}<div class="pk-sign">With care, _____________________</div>` : lines(22)}
        <div class="pk-foot">Be proud of what you wrote today. 🌟</div>`, 'pk-ws');
      return;
    }
    let list;
    if (what === 'all') list = cats().map(x => ({ head: `${x.icon} ${x.name}`, items: x.prompts }));
    else { const all = pool(); list = [{ head: cat === 'any' ? (letters ? '💌 Letter ideas' : '📓 Journal prompts') : `${c.icon} ${c.name}`, items: shuffle(all.slice()).slice(0, 10) }]; }
    printPage(letters ? 'Letter Writing Ideas' : 'Journal Prompts', `
      <h1 class="pk-big">${letters ? '💌 Letter Writing Ideas' : '📓 Journal Prompts'}</h1>
      <p class="pk-sub">${what === 'all' ? 'Pick any prompt that speaks to you.' : 'Take this home — try one prompt a day and check it off!'}</p>
      ${list.map(g => `<h2>${esc(g.head)}</h2><ol class="pk-list">${g.items.map(p => `<li><span class="pk-box"></span>${esc(p)}</li>`).join('')}</ol>`).join('')}
      <div class="pk-foot">You’ve got this! 🌟</div>`, 'pk-ws');
  }

  pick(); draw();
  return () => { clearInterval(timerId); clearTimeout(spinT); document.removeEventListener('click', closeMenus); document.removeEventListener('keydown', onKey); };
};

// Reads the import text format (also accepts JSON: {"letters":[{"name","greet","prompts":[]}],"journal":[...]}).
function parsePrompts(text, defKind) {
  const out = { letters: [], journal: [], count: 0 };
  const t = text.trim();
  if (t.startsWith('{')) {
    try {
      const j = JSON.parse(t);
      for (const k of ['letters', 'journal']) (j[k] || []).forEach(c => {
        const prompts = (c.prompts || []).map(p => String(p).trim()).filter(Boolean);
        if (prompts.length) { out[k].push({ name: String(c.name || 'My prompts'), icon: c.icon, greet: c.greet, prompts }); out.count += prompts.length; }
      });
      return out;
    } catch (e) { /* fall through to text */ }
  }
  let k = defKind, cur = null;
  const emojiRe = /^(\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic})*)\s*/u;
  for (let raw of text.split(/\r?\n/)) {
    const line = raw.trim(); if (!line) continue;
    let m;
    if ((m = line.match(/^#\s*(letters?|journal(?:\s*prompts?)?)\s*:?$/i)) || (m = line.match(/^(letters?|journal(?:\s*prompts?)?)\s*:$/i))) { k = /^l/i.test(m[1]) ? 'letters' : 'journal'; cur = null; continue; }
    if ((m = line.match(/^##+\s*(.+?)\s*:?$/))) {
      let name = m[1], icon; const e = name.match(emojiRe); if (e) { icon = e[1]; name = name.slice(e[0].length); }
      cur = { name: name || 'My prompts', icon, prompts: [] }; out[k].push(cur); continue;
    }
    if ((m = line.match(/^greeting\s*:\s*(.+)$/i))) { if (cur) cur.greet = m[1]; continue; }
    const p = line.replace(/^(\d+[.)]|[-*•–])\s*/, '').trim(); if (!p) continue;
    if (!cur) { cur = { name: 'My prompts', icon: '⭐', prompts: [] }; out[k].push(cur); }
    cur.prompts.push(p); out.count++;
  }
  out.letters = out.letters.filter(c => c.prompts.length); out.journal = out.journal.filter(c => c.prompts.length);
  return out;
}

const PS_SAMPLE = `# Letters
## 🌈 To someone who made a difference
Greeting: Dear ________,
Tell someone how they helped you become who you are today.
Write about a moment someone showed up for you when it mattered.

## 💌 To your future self
Describe one goal you are working on and why it matters to you.

# Journal
## ✨ Small wins
What is one thing you did this week that you are proud of?
Describe a moment today when you felt calm or happy.
`;
