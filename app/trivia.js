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
          <select class="input" id="cat"><option value="">🎲 All categories (${d.trivia.length})</option>
          ${cats.map(c => `<option value="${esc(c)}">${esc(c)} (${d.trivia.filter(q => (q.category || 'General') === c).length})</option>`).join('')}</select></label>
        <label class="field"><span>How many questions?</span>
          <select class="input" id="num">${[5, 10, 15, 20, 30].map(n => `<option value="${n}" ${n === 10 ? 'selected' : ''}>${n}</option>`).join('')}<option value="9999">All of them</option></select></label>
        <label class="field" style="display:flex;align-items:center;gap:10px;color:#fff"><input type="checkbox" id="reset" style="width:22px;height:22px"> Start everyone at 0 points</label>
        <div class="hint">Worth ${d.settings.triviaPoints} points each${d.settings.speedBonus ? ', plus up to 50% bonus when you reveal early' : ''}. Change this in Teams &amp; Scores.</div>
      </div>
      <button class="btn xl pink" id="go">Start! ▶</button>`
      : `<div class="panel empty">No trivia questions yet.<br><br><button class="btn yellow" id="add">📝 Add some questions</button></div>`}
    </div>`;
  if (!d.trivia.length) { $('#add', el).onclick = () => App.show('editor', 'trivia'); return; }
  $('#go', el).onclick = () => {
    const cat = $('#cat', el).value;
    const pool = shuffle(d.trivia.filter(q => !cat || (q.category || 'General') === cat));
    if ($('#reset', el).checked) Scores.resetAll();
    App.show('triviaPlay', pool.slice(0, +$('#num', el).value));
  };
};

App.screens.triviaPlay = (el, questions) => {
  App.inGame = true;
  const d = App.data;
  let idx = -1, phase, timeLeft, total, timerId, paused, picked, pts, order;
  const R = 52, C = 2 * Math.PI * R;
  App.setTopActions(`<button class="btn sm ghost" id="tPause">⏸ Pause</button><button class="btn sm ghost" id="tSkip">Skip ⏭</button><button class="btn sm ghost" id="tEnd">End game</button>`, {
    tPause: () => { if (phase !== 'q') return; paused = !paused; $('#tPause').textContent = paused ? '▶ Resume' : '⏸ Pause'; },
    tSkip: () => next(),
    tEnd: async () => { if (await confirmBox('End the game now and show final scores?', 'End game')) App.show('results', 'Trivia Blitz', 'triviaSetup'); },
  });

  function next() {
    clearInterval(timerId);
    if (App.current !== 'triviaPlay') return;
    idx++;
    if (idx >= questions.length) { App.show('results', 'Trivia Blitz', 'triviaSetup'); return; }
    const q = questions[idx];
    order = shuffle([q.answer, ...q.wrong]);
    total = timeLeft = q.time || 20;
    phase = 'q'; paused = false; picked = new Set();
    $('#tPause') && ($('#tPause').textContent = '⏸ Pause');
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
    $('#reveal', el).onclick = reveal;
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

  function reveal() {
    if (phase !== 'q') return;
    clearInterval(timerId);
    phase = 'r';
    const bonus = d.settings.speedBonus ? 1 + 0.5 * (timeLeft / total) : 1;
    pts = Math.round((d.settings.triviaPoints * bonus) / 10) * 10;
    $('#answers', el).classList.add('revealed');
    Sfx.reveal();
    const teams = Scores.teams();
    $('#award', el).innerHTML = `
      <span class="lbl">Who got it right? <span style="color:var(--yellow)">+${fmt(pts)}</span></span>
      ${teams.map((t, i) => `<button class="tpick" data-id="${t.id}" style="--tc:${t.color}" title="Key ${(i + 1) % 10}">${esc(t.name)}</button>`).join('')}
      <div class="spacer"></div>
      <button class="btn lg pink" id="nextBtn">${idx + 1 >= questions.length ? 'Award &amp; finish 🏁' : 'Award &amp; next ▶'}</button>`;
    $$('.tpick', el).forEach(b => b.onclick = () => toggle(b.dataset.id));
    $('#nextBtn', el).onclick = award;
  }
  function toggle(id) {
    picked.has(id) ? picked.delete(id) : picked.add(id);
    $$('.tpick', el).forEach(b => b.classList.toggle('on', picked.has(b.dataset.id)));
    Sfx.click();
  }
  function award() {
    if (phase !== 'r') return;
    phase = 'done';
    picked.forEach(id => Scores.add(id, pts));
    if (picked.size) Sfx.correct();
    setTimeout(next, picked.size ? 700 : 0);
  }
  const onKey = e => {
    if (Modal.stack.length || e.target.tagName === 'INPUT') return;
    if (e.code === 'Space' || e.key === 'Enter') { e.preventDefault(); phase === 'q' ? reveal() : award(); }
    const n = e.key === '0' ? 10 : parseInt(e.key, 10);
    if (phase === 'r' && n >= 1 && n <= Scores.teams().length) toggle(Scores.teams()[n - 1].id);
  };
  document.addEventListener('keydown', onKey);
  next();
  return () => { clearInterval(timerId); document.removeEventListener('keydown', onKey); };
};
