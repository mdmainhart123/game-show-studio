// ✍️ Prompt Studio — upbeat letter and journal prompts on the big screen, a quiet writing timer,
// and printable worksheets (built right into the studio). Prompts live in activities-data.js.
App.screens.prompts = (el) => {
  const A = window.GS_ACTIVITIES, s = App.data.settings;
  let kind = s.psKind === 'journal' ? 'journal' : 'letters';
  let cat = s.psCat || 'any', prompt = null, timerId, left = 0, total = 0;
  const seen = { letters: new Set(), journal: new Set() };
  const cats = () => A[kind];
  const catOf = p => cats().find(c => c.prompts.includes(p));
  function pool() { return cat === 'any' ? cats().flatMap(c => c.prompts) : (cats().find(c => c.id === cat) || cats()[0]).prompts; }
  function pick() {
    const all = pool(); let fresh = all.filter(p => !seen[kind].has(p) && p !== prompt);
    if (!fresh.length) { all.forEach(p => seen[kind].delete(p)); fresh = all.filter(p => p !== prompt); }
    prompt = fresh[Math.floor(Math.random() * fresh.length)] || all[0];
    seen[kind].add(prompt);
  }
  const save = () => { s.psKind = kind; s.psCat = cat; App.save(); };

  function draw() {
    const c = catOf(prompt);
    el.innerHTML = `
      <div class="setup ps">
        <h1>✍️ Prompt Studio</h1>
        <div class="ps-tabs">
          <button class="ps-tab${kind === 'letters' ? ' on' : ''}" data-k="letters">💌 Letters</button>
          <button class="ps-tab${kind === 'journal' ? ' on' : ''}" data-k="journal">📓 Journal</button>
        </div>
        <div class="ps-chips">
          <button class="ps-chip${cat === 'any' ? ' on' : ''}" data-c="any">🎲 Surprise me</button>
          ${cats().map(x => `<button class="ps-chip${cat === x.id ? ' on' : ''}" data-c="${x.id}">${x.icon} ${esc(x.name)}</button>`).join('')}
        </div>
        <div class="ps-card" id="psCard">
          <div class="ps-label">${c ? `${c.icon} ${esc(c.name)}` : ''}</div>
          ${kind === 'letters' && c ? `<div class="ps-greet">${esc(c.greet)}</div>` : ''}
          <div class="ps-text">${esc(prompt)}</div>
          <div class="ps-timer" id="psTimer"></div>
        </div>
        <div class="ps-acts">
          <button class="btn lg pink" id="psNew">🎲 New prompt</button>
          <div class="ps-drop"><button class="btn lg ghost" id="psTimeBtn">⏱ Quiet writing ▾</button>
            <div class="gf-menu ps-menu" id="psTimeMenu" hidden>${[3, 5, 10, 15].map(m => `<button class="gf-item" data-m="${m}">⏱ ${m} minutes</button>`).join('')}</div></div>
          <div class="ps-drop"><button class="btn lg ghost" id="psPrintBtn">🖨 Print ▾</button>
            <div class="gf-menu ps-menu" id="psPrintMenu" hidden>
              <button class="gf-item" data-p="sheet">📝 This prompt — a writing sheet</button>
              <button class="gf-item" data-p="home">🏠 Take-home sheet — 10 prompts</button>
              <button class="gf-item" data-p="all">📚 Every ${kind === 'letters' ? 'letter' : 'journal'} prompt</button>
            </div></div>
        </div>
      </div>`;
    $$('.ps-tab', el).forEach(b => b.onclick = () => { if (b.dataset.k === kind) return; kind = b.dataset.k; cat = 'any'; save(); pick(); draw(); });
    $$('.ps-chip', el).forEach(b => b.onclick = () => { cat = b.dataset.c; save(); pick(); draw(); Sfx.click(); });
    $('#psNew', el).onclick = () => { pick(); swap(); Sfx.click(); };
    dropdown('psTimeBtn', 'psTimeMenu', b => startTimer(+b.dataset.m));
    dropdown('psPrintBtn', 'psPrintMenu', b => print(b.dataset.p));
    if (timerId) paintTimer();
  }
  // swap just the prompt (with a little flip) so a running timer keeps going
  function swap() {
    const c = catOf(prompt), card = $('#psCard', el);
    $('.ps-label', card).innerHTML = `${c.icon} ${esc(c.name)}`;
    const g = $('.ps-greet', card); if (g) g.textContent = c.greet;
    $('.ps-text', card).textContent = prompt;
    card.classList.remove('flip'); void card.offsetWidth; card.classList.add('flip');
  }
  function dropdown(btnId, menuId, onPick) {
    const btn = $('#' + btnId, el), menu = $('#' + menuId, el);
    btn.onclick = e => { e.stopPropagation(); $$('.ps-menu', el).forEach(m => { if (m !== menu) m.hidden = true; }); menu.hidden = !menu.hidden; };
    $$('.gf-item', menu).forEach(b => b.onclick = () => { menu.hidden = true; onPick(b); });
  }
  const closeMenus = e => { if (!e.target.closest('.ps-drop')) $$('.ps-menu', el).forEach(m => m.hidden = true); };
  document.addEventListener('click', closeMenus);

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
    $('.pc-num', box).textContent = '✍️';
    $('#psStop', el).onclick = () => { clearInterval(timerId); timerId = null; box.innerHTML = ''; };
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
    else { const all = pool(); list = [{ head: cat === 'any' ? (letters ? '💌 Letter ideas' : '📓 Journal prompts') : `${c.icon} ${c.name}`, items: shuffle(all).slice(0, 10) }]; }
    printPage(letters ? 'Letter Writing Ideas' : 'Journal Prompts', `
      <h1 class="pk-big">${letters ? '💌 Letter Writing Ideas' : '📓 Journal Prompts'}</h1>
      <p class="pk-sub">${what === 'all' ? 'Pick any prompt that speaks to you.' : 'Take this home — try one prompt a day and check it off!'}</p>
      ${list.map(g => `<h2>${esc(g.head)}</h2><ol class="pk-list">${g.items.map(p => `<li><span class="pk-box"></span>${esc(p)}</li>`).join('')}</ol>`).join('')}
      <div class="pk-foot">You’ve got this! 🌟</div>`, 'pk-ws');
  }

  pick(); draw();
  return () => { clearInterval(timerId); document.removeEventListener('click', closeMenus); };
};
