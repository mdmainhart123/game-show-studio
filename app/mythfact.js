// 🧐 Myth or Fact? — a statement appears, the team calls MYTH or FACT, then the big reveal with
// a "here's why". Upbeat, fun statements (activities-data.js). Printable card set + paddles built in.
const MF_POINTS = 100;
const mfCats = () => [...new Set(window.GS_ACTIVITIES.myths.map(m => m.cat))];

App.screens.mythSetup = (el) => {
  const d = App.data, s = d.settings, M = window.GS_ACTIVITIES.myths;
  const cats = mfCats(), cur = cats.includes(s.mfCat) ? s.mfCat : 'mix';
  const count = c => M.filter(m => c === 'mix' || m.cat === c).length;
  el.innerHTML = `
    <div class="setup">
      <h1>🧐 Myth or Fact?</h1>
      <div class="panel">
        <p style="font-size:20px;margin:0 0 14px">A statement pops up — is it a <b class="mf-m">MYTH</b> or a <b class="mf-f">FACT</b>? Call it, then see the big reveal and the surprising "here’s why." <b>${MF_POINTS} points</b> for a right call!</p>
        <label class="field"><span>Topic</span><select class="input" id="mfCat">
          <option value="mix" ${cur === 'mix' ? 'selected' : ''}>🎲 Mix of everything — ${count('mix')} statements</option>
          ${cats.map(c => `<option value="${esc(c)}" ${cur === c ? 'selected' : ''}>${esc(c)} — ${count(c)}</option>`).join('')}</select></label>
        <div class="field-row">
          <label class="field"><span>How to play</span><select class="input" id="mfMode">
            <option value="teams">${d.teams.length > 1 ? 'Teams take turns (with points)' : `${esc(d.teams[0]?.name || 'Group')} (with points)`}</option>
            <option value="all">Everyone together — just for fun</option></select></label>
          <label class="field"><span>How many?</span><select class="input" id="mfN">
            ${[10, 15, 20].map(n => `<option value="${n}" ${n === (s.mfN || 10) ? 'selected' : ''}>${n} statements</option>`).join('')}
            <option value="0" ${s.mfN === 0 ? 'selected' : ''}>All of them</option></select></label>
        </div>
        <div class="hint">Tip: print the <b>MYTH / FACT paddles</b> so everyone can hold up their answer, or the <b>card set</b> for small groups.</div>
      </div>
      <button class="btn xl pink" id="go">Start! ▶</button>
      <div class="gf-files" id="mfPrint">
        <button class="btn ghost sm gf-toggle">🖨 Print ▾</button>
        <div class="gf-menu" hidden>
          <button class="gf-item" data-p="paddles">🪧 MYTH / FACT paddles</button>
          <button class="gf-item" data-p="cards">🃏 Fold-over card set (this topic)</button>
          <button class="gf-item" data-p="key">🔑 Answer sheet (this topic)</button>
        </div>
      </div>
    </div>`;
  const pickCat = () => $('#mfCat', el).value;
  const list = () => M.filter(m => pickCat() === 'mix' || m.cat === pickCat());
  const bar = $('#mfPrint', el), menu = $('.gf-menu', bar);
    $('.gf-toggle', bar).onclick = e => { e.stopPropagation(); menu.hidden = !menu.hidden; };
    const close = e => { if (!bar.contains(e.target)) menu.hidden = true; };
    document.addEventListener('click', close);
    $$('.gf-item', menu).forEach(b => b.onclick = () => { menu.hidden = true; mfPrint(b.dataset.p, list(), pickCat()); });
  $('#go', el).onclick = () => {
    s.mfCat = pickCat(); s.mfN = +$('#mfN', el).value; App.save();
    const all = shuffle(list()), n = s.mfN || all.length;
    Scores.resetAll();
    App.show('mythPlay', { items: all.slice(0, n), mode: $('#mfMode', el).value });
  };
  return () => document.removeEventListener('click', close);
};

function mfPrint(what, list, cat) {
  const topic = cat === 'mix' ? 'Myth or Fact?' : `Myth or Fact? — ${cat}`;
  if (what === 'paddles') {
    printPage('Myth or Fact Paddles', `
      <div class="pk-paddle myth"><div>MYTH</div><small>✂ cut out · tape to a stick or fold in half</small></div>
      <div class="pk-paddle fact"><div>FACT</div><small>✂ cut out · tape to a stick or fold in half</small></div>`, 'pk-mf');
    return;
  }
  if (what === 'key') {
    printPage(topic + ' - Answers', `<h1 class="pk-big">🧐 ${esc(topic)}</h1><p class="pk-sub">Answer sheet</p>
      <ol class="pk-key">${list.map(m => `<li><b>${m.fact ? 'FACT' : 'MYTH'}</b> — ${esc(m.s)}<br><small>${esc(m.why)}</small></li>`).join('')}</ol>`, 'pk-ws');
    return;
  }
  printPage(topic + ' - Cards', `<h1 class="pk-big">🧐 ${esc(topic)}</h1><p class="pk-sub">✂ Cut out each card and fold on the dashed line — the statement on the front, the answer hidden on the back.</p>
    <div class="pk-cards">${list.map(m => `<div class="pk-card">
      <div class="pk-front"><small>Myth or Fact?</small>${esc(m.s)}</div>
      <div class="pk-back"><b>${m.fact ? '✅ FACT' : '🧐 MYTH'}</b>${esc(m.why)}</div></div>`).join('')}</div>`, 'pk-mf');
}

App.screens.mythPlay = (el, opts) => {
  const teamsMode = opts.mode === 'teams', teams = Scores.teams(), items = opts.items;
  App.inGame = teamsMode;
  let i = 0, turn = 0, right = 0, phase;
  const team = () => teams[turn % teams.length];
  App.gameBar({ title: '🧐 Myth or Fact?', extra: teamsMode ? `<span class="turn-pill sm" id="mfTurn"></span>` : '', ...(teamsMode ? { endTitle: 'Myth or Fact?', endScreen: 'mythSetup' } : {}) });
  el.innerHTML = `
    <div class="mf">
      <div class="dr-top"><span class="dr-count" id="mfCount"></span><div class="spacer"></div><span class="pill" id="mfCat"></span></div>
      <div class="mf-card" id="mfCard"></div>
      <div class="mf-acts" id="mfActs"></div>
    </div>`;
  const acts = (h, hs = {}) => { $('#mfActs', el).innerHTML = h; Object.entries(hs).forEach(([id, fn]) => { const b = $('#' + id, el); if (b) b.onclick = fn; }); };
  function setTurnUI() {
    if (!teamsMode) return;
    const t = team(), pill = $('#mfTurn'); Scores.setActive(t.id);
    if (pill) { pill.style.setProperty('--tc', t.color); pill.textContent = `🧐 ${t.name}`; pill.classList.remove('pop'); void pill.offsetWidth; pill.classList.add('pop'); }
  }
  function ask() {
    if (i >= items.length) return finish();
    phase = 'ask'; const m = items[i];
    setTurnUI();
    HostView.set({ game: '🧐 Myth or Fact?', meta: m.cat, answer: m.fact ? 'FACT' : 'MYTH', answerLabel: m.why });
    $('#mfCount', el).textContent = `${i + 1} of ${items.length}`;
    $('#mfCat', el).textContent = m.cat;
    $('#mfCard', el).className = 'mf-card in';
    $('#mfCard', el).innerHTML = `${teamsMode ? `<span class="dr-team" style="--tc:${team().color}">${esc(team().name)}, what do you think?</span>` : '<span class="mf-ask">What do you think?</span>'}
      <div class="mf-s">${esc(m.s)}</div>`;
    acts(`<button class="mf-btn myth" id="mfMyth">🧐 MYTH</button><button class="mf-btn fact" id="mfFact">✅ FACT</button>`,
      { mfMyth: () => call(false), mfFact: () => call(true) });
  }
  function call(saidFact) {
    if (phase !== 'ask') return; phase = 'reveal';
    const m = items[i], ok = saidFact === m.fact;
    if (ok) { right++; if (teamsMode) Scores.add(team().id, MF_POINTS); Sfx.correct(); confetti(900); } else Sfx.wrong();
    $('#mfCard', el).className = `mf-card reveal ${m.fact ? 'is-fact' : 'is-myth'}`;
    $('#mfCard', el).innerHTML = `<div class="mf-stamp">${m.fact ? '✅ FACT!' : '🧐 MYTH!'}</div>
      <div class="mf-s small">${esc(m.s)}</div>
      <div class="mf-why">💡 ${esc(m.why)}</div>
      <div class="mf-res ${ok ? 'good' : 'bad'}">${ok ? `✓ Nice call${teamsMode ? `, ${esc(team().name)}! +${MF_POINTS}` : '!'}` : `✗ ${teamsMode ? `${esc(team().name)} said` : 'You said'} ${saidFact ? 'FACT' : 'MYTH'} — now you know!`}</div>`;
    i++;
    const last = i >= items.length;
    acts(`<button class="btn lg pink" id="mfNext">${last ? (teamsMode ? 'Final scores 🏁' : 'See how we did 🎉') : `Next${teamsMode && teams.length > 1 ? `: ${esc(teams[(turn + 1) % teams.length].name)}` : ''} ▶`} <kbd>Space</kbd></button>`, { mfNext: next });
  }
  function next() { if (phase !== 'reveal') return; turn++; ask(); }
  function finish() {
    phase = 'over';
    if (teamsMode) { App.endGame('Myth or Fact?', 'mythSetup'); return; }
    confetti(2500); Sfx.fanfare?.();
    $('#mfCard', el).className = 'mf-card reveal is-fact';
    $('#mfCard', el).innerHTML = `<div class="mf-stamp">🎉 Great job!</div><div class="mf-s">${right} of ${items.length} right</div><div class="mf-why">Look at all the new things we learned today!</div>`;
    acts(`<button class="btn lg pink" id="mfAgain">Play again ▶</button>`, { mfAgain: () => App.show('mythSetup') });
  }
  const onKey = e => {
    if (Modal.stack.length || Menu.isOpen() || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
    if (e.code === 'Space' || e.key === 'Enter') { e.preventDefault(); next(); }
    else if (phase === 'ask' && /^m$/i.test(e.key)) call(false);
    else if (phase === 'ask' && /^f$/i.test(e.key)) call(true);
  };
  document.addEventListener('keydown', onKey);
  ask();
  return () => { document.removeEventListener('keydown', onKey); Scores.setActive(null); };
};
