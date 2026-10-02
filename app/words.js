// 🔤 Word Guess — guess the hidden five-letter word in six tries.
// Teams take turns, one row each. Green = right letter, right spot;
// yellow = in the word, wrong spot; gray = not in the word.
// Points: solved on row 1 = 600 … row 6 = 100. The solving team starts the next word.
const WG_ROWS = 6, WG_LEN = 5;
const WG_POINTS = r => (WG_ROWS - r) * 100; // r = 0-based row
let WG_DICT = null;
function wgValid(word) {
  if (!WG_DICT) {
    WG_DICT = new Set((window.GS_WORDS5 || '').match(/.{5}/g) || []);
  }
  return WG_DICT.has(word) || App.data.words.some(w => w.word === word);
}
// Standard scoring: greens first, then yellows only for letters still unaccounted for.
function wgScore(guess, target) {
  const res = Array(WG_LEN).fill('x'), left = {};
  for (let i = 0; i < WG_LEN; i++) {
    if (guess[i] === target[i]) res[i] = 'g';
    else left[target[i]] = (left[target[i]] || 0) + 1;
  }
  for (let i = 0; i < WG_LEN; i++) {
    if (res[i] !== 'g' && left[guess[i]]) { res[i] = 'y'; left[guess[i]]--; }
  }
  return res;
}

App.screens.wordsSetup = (el) => {
  const d = App.data;
  el.innerHTML = `
    <div class="setup">
      <h1>🔤 Word Guess</h1>
      ${d.words.length ? `
      <div class="panel">
        <label class="field"><span>How many words?</span>
          <select class="input" id="num">${[1, 3, 5, 10].map(n => `<option value="${n}" ${n === 3 ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
        <label class="field"><span>Hints</span>
          <select class="input" id="hints"><option value="1">Show the hint (like "Animal") when there is one</option><option value="0">No hints — hard mode</option></select></label>
        <div class="hint">Teams take turns guessing, one row each. Solve it sooner for more points: row 1 = 600 … row 6 = 100. Scores reset to 0 after each game.</div>
      </div>
      <button class="btn xl pink" id="go">Start! ▶</button>
      <div><button class="link-btn" id="demo">🎬 Watch a demo first</button></div>`
      : `<div class="panel empty">No words yet.<br><br><button class="btn yellow" id="add">📝 Add some words</button></div>`}
    </div>`;
  if (!d.words.length) { $('#add', el).onclick = () => App.show('editor', 'words'); return; }
  $('#demo', el).onclick = () => Demo.start('words');
  $('#go', el).onclick = () => {
    Scores.resetAll();
    App.playedTrivia = new Set();
    App.show('wordsPlay', shuffle(d.words).slice(0, +$('#num', el).value), { hints: $('#hints', el).value === '1' });
  };
};

App.screens.wordsPlay = (el, words, opts = {}) => {
  App.inGame = true;
  const teams = Scores.teams();
  let wIdx = -1, target, hint, guesses, cur, phase, keys, turn = 0;
  const team = () => teams[turn % teams.length];
  const possessive = n => n + (/s$/i.test(n) ? "'" : "'s");

  App.gameBar({
    extra: `<span class="turn-pill sm" id="wTurn"></span>`,
    back: () => goWord(wIdx - 1),
    next: () => goWord(wIdx + 1),
    backTitle: 'Previous word', nextTitle: 'Next word',
    endTitle: 'Word Guess', endScreen: 'wordsSetup',
  });

  el.innerHTML = `
    <div class="wgame">
      <div class="wg-left"><div class="wg-grid" id="grid"></div></div>
      <div class="wg-right">
        <div class="wg-meta"><span id="wCount"></span><span id="wHint"></span></div>
        <div class="wg-points" id="wPts"></div>
        <div class="status" id="wStatus"></div>
        <div class="wg-kb" id="kb">${['QWERTYUIOP', 'ASDFGHJKL', '+ZXCVBNM-'].map(r => `<div class="kr">${[...r].map(k =>
          k === '+' ? `<button class="k wide" data-k="ENTER">Enter</button>` : k === '-' ? `<button class="k wide" data-k="BACK">⌫</button>` : `<button class="k" data-k="${k}">${k}</button>`).join('')}</div>`).join('')}</div>
        <div class="wh-actions" id="wActions"></div>
      </div>
    </div>`;
  $$('#kb .k', el).forEach(b => b.onclick = () => press(b.dataset.k));

  function setTurn() {
    const t = team(), pill = $('#wTurn');
    Scores.setActive(phase === 'guess' ? t.id : null);
    if (pill) {
      pill.style.setProperty('--tc', t.color);
      pill.textContent = phase === 'guess' ? `🎯 ${possessive(t.name)} guess` : `Next up: ${t.name}`;
      pill.classList.remove('pop'); void pill.offsetWidth; pill.classList.add('pop');
    }
  }
  function status(html) { $('#wStatus', el).innerHTML = html; }
  function actions(html, handlers = {}) {
    $('#wActions', el).innerHTML = html;
    Object.entries(handlers).forEach(([id, fn]) => { const b = $('#' + id, el); if (b) b.onclick = fn; });
  }

  async function goWord(i) {
    if (i < 0) return;
    if (phase === 'guess' && guesses.length && !(await confirmBox('Leave this word unsolved?', 'Leave word'))) return;
    if (i >= words.length) { App.endGame('Word Guess', 'wordsSetup'); return; }
    wIdx = i;
    target = words[i].word; hint = words[i].hint;
    guesses = []; cur = ''; keys = {}; phase = 'guess';
    App.setNavEnabled(wIdx > 0, true);
    $('#wCount', el).textContent = `Word ${wIdx + 1} of ${words.length}`;
    $('#wHint', el).innerHTML = opts.hints && hint ? `<span class="pill wg-hint">💡 ${esc(hint)}</span>` : '';
    drawGrid(); drawKeys(); drawPoints();
    setTurn();
    status(`${esc(team().name)}, your guess! Type a 5-letter word and press <b>Enter</b>.`);
    actions(`<button class="btn ghost" id="giveUp">Reveal the word</button>`, { giveUp: () => { if (phase === 'guess') { turn++; endWord(false, 'Revealed — no points. The word was:'); } } });
  }

  function drawGrid(flipRow = -1) {
    $('#grid', el).innerHTML = Array.from({ length: WG_ROWS }, (_, r) => {
      const g = guesses[r];
      const isCur = r === guesses.length && phase === 'guess';
      const letters = g ? g.word : isCur ? cur : '';
      const t = g ? teams.find(x => x.id === g.team) : null;
      return `<div class="wr ${isCur ? 'cur' : ''}" data-r="${r}">${Array.from({ length: WG_LEN }, (_, c) => {
        const L = letters[c] || '';
        const cls = g ? (r === flipRow ? 'flip pending ' + g.res[c] : g.res[c]) : (L ? 'filled' : '');
        return `<div class="wt ${cls}" style="${r === flipRow ? `animation-delay:${c * 0.28}s` : ''}">${esc(L)}</div>`;
      }).join('')}<span class="wr-team">${t ? `<i style="--tc:${t.color}"></i>${esc(t.name)}` : ''}</span></div>`;
    }).join('');
    if (flipRow >= 0) {
      // swap from blank to coloured halfway through each tile's flip
      $$(`.wr[data-r="${flipRow}"] .wt`, el).forEach((t, c) => setTimeout(() => t.classList.remove('pending'), c * 280 + 250));
    }
  }
  function drawKeys() {
    $$('#kb .k[data-k]', el).forEach(b => {
      const k = b.dataset.k;
      b.classList.remove('g', 'y', 'x');
      if (keys[k]) b.classList.add(keys[k]);
    });
  }
  function drawPoints() {
    const r = guesses.length;
    $('#wPts', el).innerHTML = Array.from({ length: WG_ROWS }, (_, i) => `<span class="${i === r && phase === 'guess' ? 'on' : i < r ? 'gone' : ''}">${WG_POINTS(i)}</span>`).join('');
  }

  function press(k) {
    if (phase !== 'guess') return;
    if (k === 'ENTER') return submit();
    if (k === 'BACK') { cur = cur.slice(0, -1); drawGrid(); return; }
    if (/^[A-Z]$/.test(k) && cur.length < WG_LEN) { cur += k; drawGrid(); Sfx.click(); }
  }
  function shake(msg, extra) {
    const row = $(`.wr[data-r="${guesses.length}"]`, el);
    row?.classList.remove('shake'); void row?.offsetWidth; row?.classList.add('shake');
    status(msg);
    if (extra) extra();
  }
  function submit(force) {
    if (phase !== 'guess') return;
    if (cur.length < WG_LEN) return shake(`Not enough letters — a guess needs ${WG_LEN}.`);
    if (!force && !wgValid(cur)) {
      return shake(`<b>${esc(cur)}</b> isn't in the word list. Try another word${''}`, () => {
        actions(`<button class="btn ghost" id="giveUp">Reveal the word</button><button class="btn orange" id="force">Use ${esc(cur)} anyway</button>`, {
          giveUp: () => { if (phase === 'guess') { turn++; endWord(false, 'Revealed — no points. The word was:'); } },
          force: () => submit(true),
        });
      });
    }
    const t = team(), word = cur, res = wgScore(word, target);
    guesses.push({ word, res, team: t.id });
    cur = '';
    phase = 'flipping';
    drawGrid(guesses.length - 1); drawPoints();
    actions('');
    Sfx.reveal();
    setTimeout(() => {
      if (App.current !== 'wordsPlay') return;
      [...word].forEach((L, i) => {
        const rank = { g: 3, y: 2, x: 1 }, now = keys[L];
        if (!now || rank[res[i]] > rank[now]) keys[L] = res[i];
      });
      drawKeys();
      const row = guesses.length - 1;
      if (res.every(r => r === 'g')) {
        const pts = WG_POINTS(row);
        Scores.add(t.id, pts);
        Sfx.fanfare(); confetti(2500);
        endWord(true, `🎉 <span class="big">${esc(t.name)} got it on row ${row + 1}!</span> +${fmt(pts)} — they start the next word.`);
        return;
      }
      turn++;
      if (guesses.length >= WG_ROWS) { Sfx.wrong(); endWord(false, `Out of guesses — nobody gets the points. The word was:`); return; }
      phase = 'guess';
      drawGrid(); drawPoints(); setTurn();
      status(`${esc(team().name)}, your guess! Worth <b>${fmt(WG_POINTS(guesses.length))}</b>.`);
      actions(`<button class="btn ghost" id="giveUp">Reveal the word</button>`, { giveUp: () => { if (phase === 'guess') { turn++; endWord(false, 'Revealed — no points. The word was:'); } } });
    }, WG_LEN * 280 + 600);
  }
  function endWord(won, msg) {
    phase = 'done';
    drawGrid(); drawPoints(); setTurn();
    status(won ? msg : `${msg}<div class="wg-answer">${[...target].map(L => `<span>${L}</span>`).join('')}</div>`);
    if (!won) Sfx.reveal();
    const last = wIdx + 1 >= words.length;
    actions(`<button class="btn lg pink" id="nextW">${last ? 'Final scores 🏁' : 'Next word ▶'}</button>`, { nextW: () => goWord(wIdx + 1) });
  }

  const onKey = e => {
    if (Modal.stack.length || Menu.isOpen() || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
    if (phase === 'done' && (e.key === 'Enter' || e.code === 'Space')) { e.preventDefault(); $('#nextW', el)?.click(); return; }
    if (e.key === 'Enter') { e.preventDefault(); press('ENTER'); }
    else if (e.key === 'Backspace') { e.preventDefault(); press('BACK'); }
    else if (/^[a-z]$/i.test(e.key) && !e.ctrlKey && !e.metaKey) press(e.key.toUpperCase());
  };
  document.addEventListener('keydown', onKey);
  goWord(0);
  return () => { document.removeEventListener('keydown', onKey); Scores.setActive(null); };
};
