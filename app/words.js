// 🔤 Word Guess — guess the hidden five-letter word in six tries.
// Everyone plays together — no teams, no points. Green = right letter, right spot;
// yellow = in the word, wrong spot; gray = not in the word.
const WG_ROWS = 6, WG_LEN = 5;
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
        <p style="font-size:20px;margin:0 0 14px">Everyone plays together! Shout out guesses — find the hidden <b>5-letter word</b> in <b>6 tries</b>.</p>
        <label class="field"><span>Hints</span>
          <select class="input" id="hints"><option value="1">Show the hint (like "Animal") when there is one</option><option value="0">No hints — hard mode</option></select></label>
      </div>
      <button class="btn xl pink" id="go">Start! ▶</button>
      <div><button class="link-btn" id="demo">🎬 Watch a demo first</button></div>`
      : `<div class="panel empty">No words yet.<br><br><button class="btn yellow" id="add">📝 Add some words</button></div>`}
    </div>`;
  if (!d.words.length) { $('#add', el).onclick = () => App.show('editor', 'words'); return; }
  $('#demo', el).onclick = () => Demo.start('words');
  $('#go', el).onclick = () => App.show('wordsPlay', shuffle(d.words), { hints: $('#hints', el).value === '1' });
};

// Simple, whole-room game: no teams, no points.
App.screens.wordsPlay = (el, words, opts = {}) => {
  let wIdx = -1, target, hint, guesses, cur, pos, phase, keys; // cur = the 5 letters being typed, pos = selected square
  App.gameBar({
    back: () => goWord(wIdx - 1),
    next: () => goWord(wIdx + 1),
    backTitle: 'Previous word', nextTitle: 'Next word', title: '🔤 Word Guess',
  });

  el.innerHTML = `
    <div class="wgame">
      <div class="wg-left"><div class="wg-grid" id="grid"></div></div>
      <div class="wg-right">
        <div class="wg-meta"><span id="wCount"></span><span id="wHint"></span></div>
        <div class="status" id="wStatus"></div>
        <div class="wg-kb" id="kb">${['QWERTYUIOP', 'ASDFGHJKL', '+ZXCVBNM-'].map(r => `<div class="kr">${[...r].map(k =>
          k === '+' ? `<button class="k wide" data-k="ENTER">Enter</button>` : k === '-' ? `<button class="k wide del" data-k="BACK" title="Delete a letter (Backspace)">⌫ Delete</button>` : `<button class="k" data-k="${k}">${k}</button>`).join('')}</div>`).join('')}</div>
        <div class="wh-actions" id="wActions"></div>
      </div>
    </div>`;
  $$('#kb .k', el).forEach(b => b.onclick = () => press(b.dataset.k));

  function status(html) { $('#wStatus', el).innerHTML = html; }
  function actions(html, handlers = {}) {
    $('#wActions', el).innerHTML = html;
    Object.entries(handlers).forEach(([id, fn]) => { const b = $('#' + id, el); if (b) b.onclick = fn; });
  }
  const playing = () => actions(`<button class="btn ghost" id="giveUp">Reveal the word</button>`, { giveUp: () => phase === 'guess' && endWord(false, 'The word was:') });

  function goWord(i) {
    if (i < 0) return;
    if (i >= words.length) { words = shuffle(words); i = 0; } // loop forever through the list
    wIdx = i;
    target = words[i].word; hint = words[i].hint;
    guesses = []; cur = Array(WG_LEN).fill(''); pos = 0; keys = {}; phase = 'guess';
    App.setNavEnabled(wIdx > 0, true);
    $('#wCount', el).textContent = `Word ${wIdx + 1}`;
    $('#wHint', el).innerHTML = opts.hints && hint ? `<span class="pill wg-hint">💡 ${esc(hint)}</span>` : '';
    drawGrid(); drawKeys();
    status('Shout out a 5-letter word! Type it in and press <b>Enter</b>. Tap a square to change a letter.');
    playing();
  }

  function drawGrid(flipRow = -1) {
    $('#grid', el).innerHTML = Array.from({ length: WG_ROWS }, (_, r) => {
      const g = guesses[r];
      const isCur = r === guesses.length && phase === 'guess';
      const letters = g ? g.word : isCur ? cur : '';
      return `<div class="wr ${isCur ? 'cur' : ''}" data-r="${r}">${Array.from({ length: WG_LEN }, (_, c) => {
        const L = letters[c] || '';
        const cls = g ? (r === flipRow ? 'flip pending ' + g.res[c] : g.res[c]) : (L ? 'filled' : '') + (isCur && c === pos ? ' sel' : '');
        return `<div class="wt ${cls}" ${isCur ? `data-c="${c}"` : ''} style=""${r === flipRow ? `animation-delay:${c * 0.28}s` : ''}">${esc(L)}</div>`;
      }).join('')}</div>`;
    }).join('');
    // tap a square in the current row to pick it — the next letter typed replaces it
    $$('.wr.cur .wt', el).forEach(t => t.onclick = () => { if (phase === 'guess') { pos = +t.dataset.c; drawGrid(); } });
    if (flipRow >= 0) $$(`.wr[data-r="${flipRow}"] .wt`, el).forEach((t, c) => setTimeout(() => t.classList.remove('pending'), c * 280 + 250));
  }
  function drawKeys() {
    $$('#kb .k[data-k]', el).forEach(b => {
      b.classList.remove('g', 'y', 'x');
      if (keys[b.dataset.k]) b.classList.add(keys[b.dataset.k]);
    });
  }

  function press(k) {
    if (phase !== 'guess') return;
    if (k === 'ENTER') return submit();
    if (k === 'BACK') { // clear the selected square, or the one before it if it's already empty
      if (!cur[pos] && pos > 0) pos--;
      cur[pos] = ''; drawGrid(); return;
    }
    if (k === 'LEFT') { pos = Math.max(0, pos - 1); drawGrid(); return; }
    if (k === 'RIGHT') { pos = Math.min(WG_LEN - 1, pos + 1); drawGrid(); return; }
    if (/^[A-Z]$/.test(k)) {
      cur[pos] = k;
      // jump to the next empty square (or just the next one)
      const nextEmpty = cur.findIndex((x, i) => i > pos && !x);
      pos = nextEmpty >= 0 ? nextEmpty : Math.min(WG_LEN - 1, pos + 1);
      drawGrid(); Sfx.click();
    }
  }
  function shake(msg) {
    const row = $(`.wr[data-r="${guesses.length}"]`, el);
    row?.classList.remove('shake'); void row?.offsetWidth; row?.classList.add('shake');
    status(msg);
  }
  function submit(force) {
    if (phase !== 'guess') return;
    if (cur.some(x => !x)) return shake(`Not enough letters — a guess needs ${WG_LEN}.`);
    const typed = cur.join('');
    if (!force && !wgValid(typed)) {
      shake(`<b>${esc(typed)}</b> isn't in the word list. Tap a square to change a letter, or try another word.`);
      actions(`<button class="btn ghost" id="giveUp">Reveal the word</button><button class="btn orange" id="force">Use ${esc(typed)} anyway</button>`, {
        giveUp: () => phase === 'guess' && endWord(false, 'The word was:'),
        force: () => submit(true),
      });
      return;
    }
    const word = typed, res = wgScore(word, target);
    guesses.push({ word, res });
    cur = Array(WG_LEN).fill(''); pos = 0; phase = 'flipping';
    drawGrid(guesses.length - 1);
    actions('');
    Sfx.reveal();
    setTimeout(() => {
      if (App.current !== 'wordsPlay') return;
      [...word].forEach((L, i) => {
        const rank = { g: 3, y: 2, x: 1 }, now = keys[L];
        if (!now || rank[res[i]] > rank[now]) keys[L] = res[i];
      });
      drawKeys();
      if (res.every(r => r === 'g')) {
        Sfx.fanfare(); confetti(2500);
        const n = guesses.length;
        endWord(true, `🎉 <span class="big">You got it in ${n}${n === 1 ? ' — amazing!' : n <= 3 ? ' — great job!' : '!'}</span>`);
        return;
      }
      if (guesses.length >= WG_ROWS) { Sfx.wrong(); endWord(false, 'Out of guesses! The word was:'); return; }
      phase = 'guess';
      drawGrid();
      status(`${WG_ROWS - guesses.length} ${WG_ROWS - guesses.length === 1 ? 'guess' : 'guesses'} left — keep going!`);
      playing();
    }, WG_LEN * 280 + 600);
  }
  function endWord(won, msg) {
    phase = 'done';
    drawGrid();
    status(won ? msg : `${msg}<div class="wg-answer">${[...target].map(L => `<span>${L}</span>`).join('')}</div>`);
    if (!won) Sfx.reveal();
    actions(`<button class="btn lg pink" id="nextW">Next word ▶</button>`, { nextW: () => goWord(wIdx + 1) });
  }

  const onKey = e => {
    if (Modal.stack.length || Menu.isOpen() || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
    if (phase === 'done' && (e.key === 'Enter' || e.code === 'Space')) { e.preventDefault(); $('#nextW', el)?.click(); return; }
    if (e.key === 'Enter') { e.preventDefault(); press('ENTER'); }
    else if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); press('BACK'); }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); press(e.key === 'ArrowLeft' ? 'LEFT' : 'RIGHT'); }
    else if (/^[a-z]$/i.test(e.key) && !e.ctrlKey && !e.metaKey) press(e.key.toUpperCase());
  };
  document.addEventListener('keydown', onKey);
  goWord(0);
  return () => document.removeEventListener('keydown', onKey);
};
