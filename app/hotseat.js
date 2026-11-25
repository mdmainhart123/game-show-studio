// 🪑 Hot Seat — a climb-the-ladder quiz: one contestant (a team, or the whole group) answers
// 10 or 15 multiple-choice questions that get harder, with milestones and three lifelines.
// Uses the Trivia Blitz questions. Our own name, look and sounds — no TV-show branding.
const HS_LADDER = {
  10: [100, 500, 1000, 5000, 10000, 25000, 50000, 100000, 500000, 1000000],
  15: [100, 200, 300, 500, 1000, 2000, 4000, 8000, 16000, 32000, 64000, 125000, 250000, 500000, 1000000],
};
const HS_SAFE = { 10: [5], 15: [5, 10] }; // milestones: answer these and you keep that amount
const HS_LEVELS = ['Easy', 'Intermediate', 'Hard'];

// Question sources: every trivia set, plus "Theme: Easy → Hard" when a theme has level sets
function hsSources() {
  const sets = [...GameFiles.sets('trivia').entries()]; // [name, count]
  const themes = {};
  sets.forEach(([n]) => { const m = n.match(/^(.*) (Easy|Intermediate|Hard)$/); if (m) (themes[m[1]] ||= []).push(m[2]); });
  const out = [{ id: 'all', label: `🎲 All trivia questions (${App.data.trivia.length})` }];
  Object.entries(themes).filter(([, l]) => l.length >= 2).forEach(([t, l]) =>
    out.push({ id: 'ladder:' + t, label: `🪜 ${t}: ${HS_LEVELS.filter(x => l.includes(x)).join(' → ')} (gets harder)` }));
  sets.forEach(([n, c]) => out.push({ id: 'set:' + n, label: `${n} (${c})` }));
  return out;
}
function hsQuestions(src, count) {
  const T = App.data.trivia, inSet = n => q => (q.sets || []).includes(n);
  if (src.startsWith('ladder:')) {
    const t = src.slice(7);
    const pools = HS_LEVELS.map(l => shuffle(T.filter(inSet(`${t} ${l}`)))).filter(p => p.length);
    const per = pools.map((_, i) => Math.floor(count / pools.length) + (i >= pools.length - count % pools.length ? 1 : 0));
    const picked = []; const used = new Set();
    pools.forEach((p, i) => { p.filter(q => !used.has(q.id)).slice(0, per[i]).forEach(q => { picked.push(q); used.add(q.id); }); });
    if (picked.length < count) shuffle(pools.flat()).forEach(q => { if (picked.length < count && !used.has(q.id)) { picked.push(q); used.add(q.id); } });
    return picked.length >= count ? picked : null;
  }
  const pool = src.startsWith('set:') ? T.filter(inSet(src.slice(4))) : T;
  return pool.length >= count ? Played.order(pool).slice(0, count) : null;
}

App.screens.hotseatSetup = (el, opts = {}) => {
  const d = App.data, s = d.settings, teams = d.teams;
  const sources = hsSources();
  const src = sources.find(x => x.id === s.hsSource) ? s.hsSource : (sources[1]?.id || 'all');
  const next = opts.nextTeam ?? 0;
  el.innerHTML = `
    <div class="setup">
      <h1>🪑 Hot Seat</h1>
      ${d.trivia.length >= 10 ? `
      <div class="panel">
        <p style="font-size:20px;margin:0 0 14px">Climb the ladder one question at a time — each is worth more than the last. Pass a <b>🛡 milestone</b> and you keep that amount. Three lifelines, and you can <b>walk away</b> with what you've won at any time.</p>
        <label class="field"><span>Questions from</span><select class="input" id="hSrc">
          ${sources.map(o => `<option value="${esc(o.id)}" ${o.id === src ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select></label>
        <div class="field-row">
          <label class="field"><span>Who's in the hot seat?</span><select class="input" id="hWho">
            ${teams.map((t, i) => `<option value="${t.id}" ${i === next % teams.length ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}
            <option value="group">The whole group (no points)</option></select></label>
          <label class="field"><span>How many questions?</span><select class="input" id="hCount">
            ${[10, 15].map(n => `<option value="${n}" ${(s.hsCount || 15) === n ? 'selected' : ''}>${n} questions — top prize ${fmt(1000000)}</option>`).join('')}</select></label>
        </div>
        <label class="field"><span>Time per question</span><select class="input" id="hTime">
          <option value="0">♾️ No time limit</option>
          ${[30, 45, 60].map(n => `<option value="${n}" ${s.hsTime === n ? 'selected' : ''}>${n} seconds</option>`).join('')}</select></label>
        <div class="hint">Uses your Trivia Blitz questions. Pick a 🪜 theme (like Thanksgiving: Easy → Hard) and the questions get harder as you climb.${opts.cont ? ' Scores carry on from the last contestant.' : ''}</div>
      </div>
      <button class="btn xl pink" id="go">Take a seat! ▶</button>`
      : `<div class="panel empty">Hot Seat needs at least 10 trivia questions.<br><br><button class="btn yellow" id="add">📝 Add some questions</button></div>`}
    </div>`;
  if (d.trivia.length < 10) { $('#add', el).onclick = () => App.show('editor', 'trivia'); return; }
  $('#go', el).onclick = () => {
    const count = +$('#hCount', el).value, source = $('#hSrc', el).value;
    const qs = hsQuestions(source, count);
    if (!qs) { toast(`That choice has fewer than ${count} questions — pick another or choose 10 questions.`, true); return; }
    s.hsSource = source; s.hsCount = count; s.hsTime = +$('#hTime', el).value; App.save();
    if (!opts.cont) Scores.resetAll();
    App.show('hotseatPlay', { qs, count, who: $('#hWho', el).value, time: s.hsTime });
  };
};

App.screens.hotseatPlay = (el, opts) => {
  const ladder = HS_LADDER[opts.count], safe = HS_SAFE[opts.count];
  const teams = Scores.teams();
  const who = teams.find(t => t.id === opts.who);
  App.inGame = !!who;
  if (who) Scores.setActive(who.id);
  let qi = 0, q, answers, pick = null, phase, used = { fifty: false, ask: false, phone: false }, hidden = new Set(), timerId, left, paused = false, sT;
  const L = ['A', 'B', 'C', 'D'];
  const won = () => qi > 0 ? ladder[qi - 1] : 0;
  const banked = () => { const m = safe.filter(n => n <= qi).pop(); return m ? ladder[m - 1] : 0; };

  App.gameBar({
    title: '🪑 Hot Seat',
    extra: who ? `<span class="turn-pill sm" style="--tc:${who.color}">🪑 ${esc(who.name)}</span>` : '',
    ...(opts.time ? { pause: { toggle: () => { if (phase !== 'ask') return; paused = !paused; RingClock.set($('#hClock', el), left, opts.time, paused); }, get: () => paused } } : {}),
    ...(who ? { endTitle: 'Hot Seat', endScreen: 'hotseatSetup' } : {}),
  });

  el.innerHTML = `
    <div class="hs">
      <div class="hs-main">
        <div class="hs-top">
          <div class="hs-lifelines">
            <button class="hs-life" id="hFifty" title="50:50 — remove two wrong answers">50:50</button>
            <button class="hs-life" id="hAsk" title="Ask the Group — everyone votes">👥</button>
            <button class="hs-life" id="hPhone" title="Phone a Peer — 30 seconds with one person">📞</button>
          </div>
          <div class="hs-for" id="hFor"></div>
          <div class="spacer"></div>
          <div id="hClockBox"></div>
          <button class="btn ghost hs-walk" id="hWalk">🚶 Walk away</button>
        </div>
        <div class="hs-q" id="hQ"></div>
        <div class="hs-answers" id="hA"></div>
        <div class="hs-msg" id="hMsg"></div>
        <div class="hs-acts" id="hActs"></div>
        <div class="hs-overlay" id="hOver" hidden></div>
      </div>
      <ol class="hs-ladder" id="hLadder" reversed>${ladder.map((v, i) => `
        <li data-n="${i + 1}" class="${safe.includes(i + 1) ? 'safe' : ''}"><span>${i + 1}</span><b>${safe.includes(i + 1) ? '🛡 ' : ''}${fmt(v)}</b></li>`).reverse().join('')}</ol>
    </div>`;
  const msg = h => { $('#hMsg', el).innerHTML = h; };
  const acts = (h, hs = {}) => { $('#hActs', el).innerHTML = h; Object.entries(hs).forEach(([id, fn]) => { const b = $('#' + id, el); if (b) b.onclick = fn; }); };
  const stopClock = () => { clearInterval(timerId); clearTimeout(sT); };
  function paintLadder() {
    $$('#hLadder li', el).forEach(li => {
      const n = +li.dataset.n;
      li.classList.toggle('done', n <= qi); li.classList.toggle('now', n === qi + 1 && phase !== 'over');
    });
  }
  function lifelines() {
    [['hFifty', 'fifty'], ['hAsk', 'ask'], ['hPhone', 'phone']].forEach(([id, k]) => { const b = $('#' + id, el); b.classList.toggle('used', used[k]); b.disabled = used[k] || phase !== 'ask'; });
    $('#hWalk', el).disabled = phase !== 'ask' || qi === 0;
  }

  // 1. show a question
  function ask() {
    stopClock(); phase = 'ask'; pick = null; hidden = new Set();
    q = opts.qs[qi];
    answers = shuffle([q.answer, ...q.wrong]);
    while (answers.length < 4) answers.push('—');
    HostView.set({ game: '🪑 Hot Seat', meta: `Question ${qi + 1} for ${fmt(ladder[qi])}`, answer: q.answer });
    $('#hFor', el).innerHTML = `Question <b>${qi + 1}</b> of ${ladder.length} · for <b class="hs-gold">${fmt(ladder[qi])}</b>`;
    $('#hQ', el).innerHTML = `<div class="hs-qtext">${esc(q.question)}</div>`;
    drawAnswers();
    msg(qi === 0 ? 'Tap an answer to choose it.' : `🏦 Won so far: <b>${fmt(won())}</b>${banked() ? ` · 🛡 safe: <b>${fmt(banked())}</b>` : ''}`);
    acts('');
    paintLadder(); lifelines();
    $('#hClockBox', el).innerHTML = opts.time ? RingClock.html('hClock', opts.time, 'sm') : '';
    if (opts.time) {
      left = opts.time; paused = false;
      timerId = setInterval(() => {
        if (phase !== 'ask' || paused || !$('#hOver', el).hidden) return;
        left = Math.max(0, left - 0.1); RingClock.set($('#hClock', el), left, opts.time, paused);
        if (left <= 0) { stopClock(); pick = null; reveal(true); }
      }, 100);
    }
  }
  function drawAnswers() {
    $('#hA', el).innerHTML = answers.map((a, i) => `
      <button class="hs-ans${hidden.has(i) ? ' gone' : ''}${pick === i ? ' picked' : ''}" data-i="${i}" ${hidden.has(i) ? 'disabled' : ''}>
        <span class="hs-letter">${L[i]}</span><span class="hs-atext">${hidden.has(i) ? '' : esc(a)}</span></button>`).join('');
    $$('.hs-ans', el).forEach(b => b.onclick = () => choose(+b.dataset.i));
  }
  // 2. "Final answer?"
  function choose(i) {
    if (phase !== 'ask' || hidden.has(i)) return;
    pick = i; Sfx.click(); drawAnswers();
    msg(`<b>${L[i]}: ${esc(answers[i])}</b> — is that your final answer?`);
    acts(`<button class="btn lg yellow" id="hLock">🔒 Final answer!</button><button class="btn lg ghost" id="hChange">Let me think…</button>`, {
      hLock: lock, hChange: () => { pick = null; drawAnswers(); msg('Take your time — tap an answer.'); acts(''); },
    });
  }
  // 3. lock it in, a dramatic pause, then the reveal
  function lock() {
    if (pick === null) return;
    stopClock(); phase = 'lock'; lifelines(); acts('');
    $$('.hs-ans', el).forEach(b => b.disabled = true);
    $(`.hs-ans[data-i="${pick}"]`, el).classList.add('locked');
    msg('🥁 Locked in…');
    let beats = 0;
    const drum = () => { if (beats++ < 6) { Sfx.tick(); sT = setTimeout(drum, 300); } else reveal(false); };
    sT = setTimeout(drum, 300);
  }
  function reveal(timedOut) {
    phase = 'reveal';
    const ci = answers.indexOf(q.answer);
    $$('.hs-ans', el).forEach(b => b.disabled = true);
    $(`.hs-ans[data-i="${ci}"]`, el).classList.add('right');
    if (!timedOut && pick === ci) {
      Played.mark(q);
      qi++; paintLadder(); Sfx.correct();
      if (qi === ladder.length) return gameOver('top');
      const isSafe = safe.includes(qi);
      msg(`<span class="msg-good">✓ Correct!</span> You've won <b class="hs-gold">${fmt(won())}</b>${isSafe ? ' — 🛡 that\'s a milestone, it\'s yours to keep!' : ''}`);
      if (isSafe) confetti(1200);
      acts(`<button class="btn lg pink" id="hNext">Next question for ${fmt(ladder[qi])} ▶</button>`, { hNext: ask });
    } else {
      if (pick !== null) $(`.hs-ans[data-i="${pick}"]`, el).classList.add('wrong');
      Played.mark(q); Sfx.wrong();
      gameOver(timedOut ? 'time' : 'wrong');
    }
  }
  // 4. the end of the climb
  function gameOver(why) {
    stopClock(); phase = 'over';
    const prize = why === 'top' ? ladder[ladder.length - 1] : why === 'walk' ? won() : banked();
    if (who && prize) Scores.add(who.id, prize);
    paintLadder(); lifelines();
    const ci = answers.indexOf(q.answer);
    const head = {
      top: '🏆 TOP OF THE LADDER!',
      walk: '🚶 Walked away!',
      wrong: '❌ That\'s not it!',
      time: '⏰ Out of time!',
    }[why];
    if (why === 'top') { confetti(4000); Sfx.fanfare(); }
    if (why === 'walk') { $(`.hs-ans[data-i="${ci}"]`, el).classList.add('right'); Sfx.ding(); }
    msg(`<span class="${why === 'top' || why === 'walk' ? 'msg-good' : 'msg-bad'}">${head}</span> ${why === 'wrong' || why === 'time' ? `The answer was <b>${L[ci]}: ${esc(q.answer)}</b>. ` : ''}${who ? `<b>${esc(who.name)}</b> takes home` : 'Final total:'} <b class="hs-gold">${fmt(prize)}</b>`);
    const nextIdx = who ? (teams.findIndex(t => t.id === who.id) + 1) : 0;
    acts(`${who ? `<button class="btn lg pink" id="hAgain">Next contestant ▶</button><button class="btn lg ghost" id="hEnd">Final scores 🏁</button>` : `<button class="btn lg pink" id="hAgain">Play again ▶</button>`}`, {
      hAgain: () => App.show('hotseatSetup', { cont: !!who, nextTeam: nextIdx }),
      hEnd: () => App.endGame('Hot Seat', 'hotseatSetup'),
    });
  }

  // Lifelines
  $('#hFifty', el).onclick = () => {
    if (used.fifty || phase !== 'ask') return;
    used.fifty = true; Sfx.ding();
    const ci = answers.indexOf(q.answer);
    shuffle([0, 1, 2, 3].filter(i => i !== ci && !hidden.has(i))).slice(0, 2).forEach(i => hidden.add(i));
    if (hidden.has(pick)) pick = null;
    drawAnswers(); lifelines(); msg('✂️ 50:50 — two wrong answers are gone!');
  };
  $('#hAsk', el).onclick = () => {
    if (used.ask || phase !== 'ask') return;
    used.ask = true; lifelines(); Sfx.ding();
    const votes = [0, 0, 0, 0];
    const over = $('#hOver', el); over.hidden = false;
    const draw = () => {
      const tot = votes.reduce((a, b) => a + b, 0) || 1;
      over.innerHTML = `<div class="hs-pop"><h2>👥 Ask the Group</h2><p>Everyone votes with a show of hands — tap a letter to count each vote.</p>
        <div class="hs-poll">${L.map((l, i) => hidden.has(i) ? '' : `
          <button class="hs-bar" data-i="${i}"><span class="hs-bar-fill" style="height:${Math.round(votes[i] / tot * 100)}%"></span>
          <span class="hs-bar-n">${votes[i]}</span><span class="hs-bar-l">${l}</span></button>`).join('')}</div>
        <div class="hs-pop-btns"><button class="btn ghost" id="hReset">Reset</button><button class="btn lg pink" id="hDone">Done ✓</button></div></div>`;
      $$('.hs-bar', over).forEach(b => b.onclick = () => { votes[+b.dataset.i]++; Sfx.click(); draw(); });
      $('#hReset', over).onclick = () => { votes.fill(0); draw(); };
      $('#hDone', over).onclick = () => { over.hidden = true; const tot = votes.reduce((a, b) => a + b, 0); if (tot) msg(`👥 The group says: ${L.map((l, i) => hidden.has(i) ? '' : `<b>${l}</b> ${Math.round(votes[i] / tot * 100)}%`).filter(Boolean).join(' · ')}`); };
    };
    draw();
  };
  $('#hPhone', el).onclick = () => {
    if (used.phone || phase !== 'ask') return;
    used.phone = true; lifelines(); Sfx.ding();
    const over = $('#hOver', el); over.hidden = false;
    let t = 30, pT;
    over.innerHTML = `<div class="hs-pop"><h2>📞 Phone a Peer</h2><p>Pick one person in the room. You have 30 seconds to talk it over!</p>
      ${RingClock.html('hPhoneClock', 30)}<div class="hs-pop-btns"><button class="btn lg pink" id="hDone">Done ✓</button></div></div>`;
    const end = () => { clearInterval(pT); over.hidden = true; };
    $('#hDone', over).onclick = end;
    pT = setInterval(() => { t = Math.max(0, t - 0.1); RingClock.set($('#hPhoneClock', over), t, 30, false); if (t <= 0) { clearInterval(pT); Sfx.buzz(); setTimeout(end, 900); } }, 100);
  };
  $('#hWalk', el).onclick = () => {
    if (phase !== 'ask' || qi === 0) return;
    confirmBox(`🚶 Walk away and take home ${fmt(won())}?`, 'Walk away').then(ok => { if (ok && phase === 'ask') gameOver('walk'); });
  };

  ask();
  return () => { stopClock(); Scores.setActive(null); };
};
