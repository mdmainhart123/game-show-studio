// ⚡ Trivia Blitz — multiple choice with timer, host awards teams.
App.screens.triviaSetup = (el) => {
  const d = App.data;
  const cats = [...new Set(d.trivia.map(q => q.category || 'General'))].sort();
  el.innerHTML = `
    <div class="setup">
      <h1>⚡ Trivia Blitz</h1>
      ${d.trivia.length ? `
      <div class="panel">
        <label class="field"><span>Category</span>
          <select class="input" id="cat"><option value="">🎲 All categories (${d.trivia.length}${d.trivia.some(q => q.played) ? ` · ${d.trivia.filter(q => !q.played).length} left` : ''})</option>
          ${cats.map(c => `<option value="${esc(c)}">${esc(Played.label(c, d.trivia.filter(q => (q.category || 'General') === c)))}</option>`).join('')}</select></label>
        ${d.trivia.some(q => q.played) ? `<div class="played-note">✓ = every question in that category has been played. New games use unplayed questions first. <button class="link-btn sm" id="resetPlayed">Reset played marks</button></div>` : ''}
        <label class="field"><span>How many questions?</span>
          <select class="input" id="num">${[5, 10, 15, 20, 30].map(n => `<option value="${n}" ${n === 10 ? 'selected' : ''}>${n}</option>`).join('')}<option value="9999">All of them</option></select></label>
        <div class="field"><span>Play style</span>
          <div class="mode-pick">
            <button class="mode ${d.settings.triviaMode !== 'all' ? 'on' : ''}" data-m="turns"><b>🎯 Take turns</b><small>One team at a time. Tap their answer: right = +${d.settings.triviaPoints} and they go again; wrong = ${({ none: 'no penalty', half: '−' + Math.round(d.settings.triviaPoints / 20) * 10, full: '−' + d.settings.triviaPoints })[d.settings.triviaPenalty] || 'no penalty'} and the next team tries.</small></button>
            <button class="mode ${d.settings.triviaMode === 'all' ? 'on' : ''}" data-m="all"><b>👥 Everyone answers</b><small>All teams answer at once. Reveal, then tick every team that got it right.</small></button>
          </div></div>
        <div class="hint">Points per question: ${d.settings.triviaPoints} (change in ☰ Menu → Settings). Scores reset to 0 after each game.</div>
      </div>
      <button class="btn xl pink" id="go">Start! ▶</button>
      <div><button class="link-btn" id="demo">🎬 Watch a demo first</button></div>`
      : `<div class="panel empty">No trivia questions yet.<br><br><button class="btn yellow" id="add">📝 Add some questions</button></div>`}
    </div>`;
  if (!d.trivia.length) { $('#add', el).onclick = () => App.show('editor', 'trivia'); return; }
  $$('.mode', el).forEach(b => b.onclick = () => {
    d.settings.triviaMode = b.dataset.m; App.save();
    $$('.mode', el).forEach(x => x.classList.toggle('on', x === b));
  });
  $('#demo', el).onclick = () => Demo.start('trivia');
  if ($('#resetPlayed', el)) $('#resetPlayed', el).onclick = async () => {
    if (await confirmBox('Clear all the "played" marks so every trivia category shows as fresh again?', 'Reset marks')) { Played.reset(d.trivia); App.show('triviaSetup'); toast('Played marks cleared ✓'); }
  };
  $('#go', el).onclick = () => {
    const cat = $('#cat', el).value;
    const pool = Played.order(d.trivia.filter(q => !cat || (q.category || 'General') === cat));
    Scores.resetAll(); // every new game starts at 0
    const chosen = pool.slice(0, +$('#num', el).value);
    App.playedTrivia = new Set(chosen.map(q => q.id)); // the Final Round picks a question not used here
    App.show(d.settings.triviaMode === 'all' ? 'triviaPlay' : 'triviaTurns', chosen);
  };
};

App.screens.triviaPlay = (el, questions) => {
  App.inGame = true;
  const d = App.data;
  // records[i] = { order, pts, teams:Set } once a question has been revealed
  const records = [];
  let idx = -1, phase, timeLeft, total, timerId, paused, picked, pts, order;
  const R = 52, C = 2 * Math.PI * R;
  App.gameBar({
    pause: { toggle: () => { if (phase !== 'q') return; paused = !paused; $('#timer', el)?.classList.toggle('paused', paused); }, get: () => paused },
    back: () => { if (phase === 'r') applyAward(true); go(idx - 1); },
    next: () => { if (phase === 'r') applyAward(true); go(idx + 1); },
    endTitle: 'Trivia Blitz', endScreen: 'triviaSetup',
  });

  function go(i) {
    clearInterval(timerId);
    if (App.current !== 'triviaPlay' || i < 0) return;
    if (i >= questions.length) { App.endGame('Trivia Blitz', 'triviaSetup'); return; }
    idx = i;
    App.setNavEnabled(idx > 0, true);
    const q = questions[idx];
    Played.mark(q);
    const rec = records[idx];
    order = rec ? rec.order : shuffle([q.answer, ...q.wrong]);
    total = timeLeft = q.time || 20;
    phase = 'q'; paused = false; picked = new Set(rec ? rec.teams : []);
    el.innerHTML = `
      <div class="tq-wrap">
        <div class="tq-top">
          <span class="pill" style="font-size:18px;padding:6px 14px">${esc(q.category || 'General')}</span>
          <span>Question ${idx + 1} of ${questions.length}</span>
          <div class="spacer"></div>
          <div class="timer" id="timer"><svg width="120" height="120"><circle cx="60" cy="60" r="${R}" stroke="rgba(255,255,255,.18)" stroke-width="12" fill="rgba(0,0,0,.25)"/>
            <circle id="ring" cx="60" cy="60" r="${R}" stroke="#ffd23f" stroke-width="12" fill="none" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="0" style="transition:stroke-dashoffset .1s linear"/></svg>
            <div class="num" id="tnum">${timeLeft}</div></div>
        </div>
        <div class="tq-card">${esc(q.question)}</div>
        <div class="answers" id="answers" style="${order.length <= 2 ? 'grid-template-columns:1fr 1fr;max-height:260px' : ''}">
          ${order.map((a, i) => `<div class="ans a${i} ${a === q.answer ? 'right' : 'wrong'}"><div class="shape"><span>${'ABCD'[i]}</span></div><div>${esc(a)}</div></div>`).join('')}
        </div>
        <div class="award" id="award">
          <span class="hint" style="font-size:18px">Teams: lock in your answer!</span><div class="spacer"></div>
          <button class="btn lg yellow" id="reveal">Reveal answer <kbd>Space</kbd></button>
        </div>
      </div>`;
    if (rec) { // revisiting: show the answer and the saved picks, no timer
      $('#timer', el).style.visibility = 'hidden';
      reveal(true);
      return;
    }
    $('#reveal', el).onclick = () => reveal();
    let lastSec = timeLeft;
    timerId = setInterval(() => {
      if (paused) return;
      timeLeft = Math.max(0, timeLeft - 0.1);
      const s = Math.ceil(timeLeft);
      $('#tnum').textContent = s;
      $('#ring').style.strokeDashoffset = C * (1 - timeLeft / total);
      $('#timer').classList.toggle('low', s <= 5);
      if (s !== lastSec) { lastSec = s; if (s <= 5 && s > 0) Sfx.tick(); }
      if (timeLeft <= 0) { Sfx.buzz(); reveal(); }
    }, 100);
  }

  function reveal(revisit) {
    if (phase !== 'q') return;
    clearInterval(timerId);
    phase = 'r';
    if (revisit) pts = records[idx].pts;
    else {
      const bonus = d.settings.speedBonus ? 1 + 0.5 * (timeLeft / total) : 1;
      pts = Math.round((d.settings.triviaPoints * bonus) / 10) * 10;
      records[idx] = { order, pts, teams: new Set() };
      Sfx.reveal();
    }
    $('#answers', el).classList.add('revealed');
    const teams = Scores.teams();
    const last = idx + 1 >= questions.length;
    $('#award', el).innerHTML = `
      <span class="lbl">${revisit ? 'Already scored — fix it if needed:' : 'Who got it right?'} <span style="color:var(--yellow)">+${fmt(pts)}</span></span>
      ${teams.map((t, i) => `<button class="tpick ${picked.has(t.id) ? 'on' : ''}" data-id="${t.id}" style="--tc:${t.color}" title="Key ${(i + 1) % 10}">${esc(t.name)}</button>`).join('')}
      <div class="spacer"></div>
      <button class="btn lg pink" id="nextBtn">${revisit ? (last ? 'Save &amp; finish 🏁' : 'Save &amp; next ▶') : (last ? 'Award &amp; finish 🏁' : 'Award &amp; next ▶')}</button>`;
    $$('.tpick', el).forEach(b => b.onclick = () => toggle(b.dataset.id));
    $('#nextBtn', el).onclick = () => {
      if (phase !== 'r') return;
      const from = idx;
      if (applyAward()) setTimeout(() => { if (idx === from) go(from + 1); }, 700); else go(from + 1);
    };
  }
  function toggle(id) {
    picked.has(id) ? picked.delete(id) : picked.add(id);
    $$('.tpick', el).forEach(b => b.classList.toggle('on', picked.has(b.dataset.id)));
    Sfx.click();
  }
  // Adds points for newly-picked teams and removes them from un-picked ones.
  // Returns true if anyone gained points (to pause for the cheer).
  function applyAward(quiet) {
    if (phase !== 'r') return false;
    phase = 'done';
    const rec = records[idx];
    let gained = false;
    picked.forEach(id => { if (!rec.teams.has(id)) { Scores.add(id, rec.pts); gained = true; } });
    rec.teams.forEach(id => { if (!picked.has(id)) Scores.add(id, -rec.pts); });
    rec.teams = new Set(picked);
    if (gained && !quiet) Sfx.correct();
    return gained && !quiet;
  }
  const onKey = e => {
    if (Modal.stack.length || e.target.tagName === 'INPUT') return;
    if (e.code === 'Space' || e.key === 'Enter') { e.preventDefault(); if (phase === 'q') reveal(); else if (phase === 'r') $('#nextBtn', el)?.click(); }
    const n = e.key === '0' ? 10 : parseInt(e.key, 10);
    if (phase === 'r' && n >= 1 && n <= Scores.teams().length) toggle(Scores.teams()[n - 1].id);
  };
  document.addEventListener('keydown', onKey);
  go(0);
  return () => { clearInterval(timerId); document.removeEventListener('keydown', onKey); };
};

// 🎯 Take-turns mode: the team whose turn it is taps an answer.
// Right = +points, and that same team starts the next question.
// Wrong = −points, that answer is crossed out, and the next team tries;
// if nobody gets it, the team after the last wrong guess starts the next one.
App.screens.triviaTurns = (el, questions) => {
  App.inGame = true;
  const d = App.data, teams = Scores.teams(), pts = d.settings.triviaPoints;
  // wrong-answer penalty: none / half / full (☰ Menu → Settings)
  const penalty = ({ none: 0, half: Math.round(pts / 20) * 10, full: pts })[d.settings.triviaPenalty] ?? 0;
  const lostTxt = name => penalty ? `✗ ${esc(name)} −${fmt(penalty)}.` : `✗ Not quite, ${esc(name)}!`;
  const records = [];
  let idx = -1, turn = 0, phase, timeLeft, total, timerId, paused, rec, advanceT, countT;
  const R = 52, C = 2 * Math.PI * R;
  const team = () => teams[turn % teams.length];
  App.gameBar({
    pause: { toggle: () => { if (phase !== 'q') return; paused = !paused; $('#timer', el)?.classList.toggle('paused', paused); }, get: () => paused },
    back: () => go(idx - 1),
    next: () => go(idx + 1),
    endTitle: 'Trivia Blitz', endScreen: 'triviaSetup',
  });

  function stopTimers() { clearInterval(timerId); clearTimeout(advanceT); clearInterval(countT); }

  function go(i) {
    stopTimers();
    if (App.current !== 'triviaTurns' || i < 0) return;
    if (rec && !rec.done && rec.log.length) rec.done = true; // left mid-question after some guesses
    if (i >= questions.length) { App.endGame('Trivia Blitz', 'triviaSetup'); return; }
    idx = i;
    App.setNavEnabled(idx > 0, true);
    const q = questions[idx];
    Played.mark(q);
    rec = records[idx] ||= { order: shuffle([q.answer, ...q.wrong]), out: [], tried: new Set(), log: [], done: false };
    el.innerHTML = `
      <div class="tq-wrap">
        <div class="tq-top">
          <span class="pill" style="font-size:18px;padding:6px 14px">${esc(q.category || 'General')}</span>
          <span>Question ${idx + 1} of ${questions.length}</span>
          <div class="spacer"></div>
          <span class="turn-pill" id="turnPill"></span>
          <div class="timer" id="timer"><svg width="120" height="120"><circle cx="60" cy="60" r="${R}" stroke="rgba(255,255,255,.18)" stroke-width="12" fill="rgba(0,0,0,.25)"/>
            <circle id="ring" cx="60" cy="60" r="${R}" stroke="#ffd23f" stroke-width="12" fill="none" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="0" style="transition:stroke-dashoffset .1s linear"/></svg>
            <div class="num" id="tnum"></div></div>
        </div>
        <div class="tq-card">${esc(q.question)}</div>
        <div class="answers turns" id="answers" style="${rec.order.length <= 2 ? 'grid-template-columns:1fr 1fr;max-height:260px' : ''}">
          ${rec.order.map((a, i) => `<button class="ans a${i} ${a === q.answer ? 'right' : 'wrong'}" data-i="${i}"><div class="shape"><span>${'ABCD'[i]}</span></div><div class="atext">${esc(a)}<div class="who"></div></div></button>`).join('')}
        </div>
        <div class="award" id="award">
          <span class="lbl" id="tstatus"></span><div class="spacer"></div>
          <span id="tbtns"></span>
        </div>
      </div>`;
    $$('.ans', el).forEach(b => b.onclick = () => pick(+b.dataset.i));
    rec.out.forEach(markOut);
    if (rec.done) { finish(null, true); return; }
    startTurn(`${esc(team().name)}, pick an answer!`);
  }

  function markOut(o) {
    const b = $(`.ans[data-i="${o.i}"]`, el);
    if (!b) return;
    b.classList.add('out');
    const t = teams.find(x => x.id === o.team);
    $('.who', b).textContent = t ? '✗ ' + t.name : '✗';
  }

  function setTurnUI() {
    const t = team();
    const pill = $('#turnPill', el);
    pill.style.setProperty('--tc', t.color);
    pill.textContent = `🎯 ${t.name}`;
    pill.classList.remove('pop'); void pill.offsetWidth; pill.classList.add('pop');
    Scores.setActive(t.id);
  }

  function startTurn(msg) {
    const q = questions[idx];
    phase = 'q'; paused = false;
    setTurnUI();
    $('#tstatus', el).innerHTML = msg;
    $('#tbtns', el).innerHTML = `<button class="btn yellow" id="giveUp" title="Show the answer, no points">Reveal answer</button>`;
    $('#giveUp', el).onclick = () => { turn++; finish(`Answer revealed — no points.`); };
    total = timeLeft = q.time || 20;
    $('#timer', el).style.visibility = '';
    $('#tnum').textContent = Math.ceil(timeLeft);
    $('#ring').style.strokeDashoffset = 0;
    $('#timer').classList.remove('low');
    clearInterval(timerId);
    let lastSec = Math.ceil(timeLeft);
    timerId = setInterval(() => {
      if (paused) return;
      timeLeft = Math.max(0, timeLeft - 0.1);
      const s = Math.ceil(timeLeft);
      $('#tnum').textContent = s;
      $('#ring').style.strokeDashoffset = C * (1 - timeLeft / total);
      $('#timer').classList.toggle('low', s <= 5);
      if (s !== lastSec) { lastSec = s; if (s <= 5 && s > 0) Sfx.tick(); }
      if (timeLeft <= 0) timeUp();
    }, 100);
  }

  function pick(i) {
    if (phase !== 'q' || rec.out.some(o => o.i === i)) return;
    clearInterval(timerId);
    const q = questions[idx], t = team();
    rec.tried.add(t.id);
    if (rec.order[i] === q.answer) {
      Scores.add(t.id, pts);
      rec.log.push(`✓ ${t.name} +${fmt(pts)}`);
      Sfx.correct();
      // correct team keeps control and starts the next question
      finish(`<span style="color:var(--green)">✓ Correct!</span> ${esc(t.name)} +${fmt(pts)} — they start the next question!`, false, true);
      return;
    }
    if (penalty) Scores.add(t.id, -penalty);
    rec.log.push(penalty ? `✗ ${t.name} −${fmt(penalty)}` : `✗ ${t.name}`);
    const o = { i, team: t.id };
    rec.out.push(o); markOut(o);
    Sfx.wrong();
    turn++;
    const left = rec.order.length - rec.out.length;
    if (left <= 1 || rec.tried.size >= teams.length) {
      finish(`<span style="color:#ffb3bb">${lostTxt(t.name)}</span> ${left <= 1 ? 'Only one answer left' : 'Every team has tried'} — here it is!`);
      return;
    }
    startTurn(`<span style="color:#ffb3bb">${lostTxt(t.name)}</span> ${esc(team().name)}, your turn!`);
  }

  function timeUp() {
    clearInterval(timerId);
    const t = team();
    Sfx.buzz();
    rec.tried.add(t.id);
    rec.log.push(`⏰ ${t.name} ran out of time`);
    turn++;
    if (rec.tried.size >= teams.length) { finish(`⏰ Time's up for ${esc(t.name)} — every team has tried!`); return; }
    startTurn(`⏰ Time's up for ${esc(t.name)}. ${esc(team().name)}, your turn!`);
  }

  // Show the answer, then move on (automatically after a correct answer).
  function finish(msg, revisit, auto) {
    stopTimers();
    phase = 'done';
    rec.done = true;
    $('#answers', el).classList.add('revealed');
    $('#timer', el).style.visibility = 'hidden';
    if (!revisit) Sfx.reveal();
    Scores.setActive(null);
    const pill = $('#turnPill', el);
    pill.style.setProperty('--tc', team().color);
    pill.textContent = `Next up: ${team().name}`;
    const last = idx + 1 >= questions.length;
    $('#tstatus', el).innerHTML = revisit ? (rec.log.length ? rec.log.map(esc).join(' &nbsp;·&nbsp; ') : 'Answer revealed — no points.') : msg;
    $('#tbtns', el).innerHTML = `<span class="hint" id="countdown" style="margin-right:10px"></span><button class="btn lg pink" id="nextQ">${last ? 'Final scores 🏁' : 'Next question ▶'}</button>`;
    $('#nextQ', el).onclick = () => go(idx + 1);
    if (auto) {
      let n = 4;
      const tickDown = () => { const c = $('#countdown', el); if (c) c.innerHTML = `Next in ${n}… <a href="#" id="stay" style="color:var(--cyan)">stay here</a>`; const st = $('#stay', el); if (st) st.onclick = e => { e.preventDefault(); clearInterval(countT); c.textContent = ''; }; };
      tickDown();
      countT = setInterval(() => { n--; if (n <= 0) { clearInterval(countT); go(idx + 1); } else tickDown(); }, 1000);
    }
  }

  const onKey = e => {
    if (Modal.stack.length || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
    const k = e.key.toLowerCase();
    const i = 'abcd'.indexOf(k) >= 0 ? 'abcd'.indexOf(k) : ['1', '2', '3', '4'].indexOf(k);
    if (i >= 0 && i < rec.order.length) pick(i);
    if ((e.code === 'Space' || e.key === 'Enter') && phase === 'done') { e.preventDefault(); go(idx + 1); }
  };
  document.addEventListener('keydown', onKey);
  go(0);
  return () => { stopTimers(); document.removeEventListener('keydown', onKey); Scores.setActive(null); };
};
