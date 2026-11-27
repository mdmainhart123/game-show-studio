// 🫙 Gratitude Jar — pull a slip, share, and watch the jar fill up. No scores — just good feelings.
// Printable slips and a jar label are built in. Prompts live in activities-data.js.
App.screens.gratjar = (el) => {
  const S = window.GS_ACTIVITIES.gratitude;
  const COLORS = ['#ffd23f', '#ff8fab', '#7bdff2', '#b2f7a5', '#cdb4ff', '#ffb38a'];
  let deck = shuffle(S.slice()), di = 0, slip = null, filled = [], phase = 'idle';
  el.innerHTML = `
    <div class="gj">
      <div class="gj-left">
        <svg class="gj-jar" viewBox="0 0 240 300" aria-hidden="true">
          <defs><clipPath id="gjClip"><path d="M40 70 Q30 80 30 100 L30 260 Q30 290 60 290 L180 290 Q210 290 210 260 L210 100 Q210 80 200 70 Z"/></clipPath></defs>
          <g clip-path="url(#gjClip)" id="gjSlips"></g>
          <path class="gj-glass" d="M40 70 Q30 80 30 100 L30 260 Q30 290 60 290 L180 290 Q210 290 210 260 L210 100 Q210 80 200 70 Z"/>
          <path class="gj-shine" d="M48 110 L48 250"/>
          <rect class="gj-lid" x="34" y="40" width="172" height="32" rx="8"/>
          <rect class="gj-tag" x="70" y="84" width="100" height="44" rx="8"/>
          <text class="gj-tag-txt" x="120" y="104" text-anchor="middle">Gratitude</text>
          <text class="gj-tag-n" x="120" y="122" text-anchor="middle" id="gjN">0</text>
        </svg>
        <div class="gj-count" id="gjCount">Let’s fill our jar!</div>
      </div>
      <div class="gj-right">
        <div class="gj-slip" id="gjSlip"></div>
        <div class="mf-acts" id="gjActs"></div>
      </div>
    </div>`;
  App.gameBar({ title: '🫙 Gratitude Jar' });
  const acts = (h, hs = {}) => { $('#gjActs', el).innerHTML = h; Object.entries(hs).forEach(([id, fn]) => { const b = $('#' + id, el); if (b) b.onclick = fn; }); };
  function paintJar(dropNew) {
    const g = $('#gjSlips', el);
    // slips stack up from the bottom of the jar, a few per row, tilted a little
    g.innerHTML = filled.map((f, k) => {
      const row = Math.floor(k / 5), col = k % 5;
      const x = 40 + col * 34 + (row % 2 ? 14 : 0), y = 268 - row * 16;
      return `<rect class="gj-s${dropNew && k === filled.length - 1 ? ' drop' : ''}" x="${x}" y="${y}" width="30" height="14" rx="3" fill="${f.c}" transform="rotate(${f.r} ${x + 15} ${y + 7})"/>`;
    }).join('');
    $('#gjN', el).textContent = filled.length;
    $('#gjCount', el).innerHTML = filled.length ? `<b>${filled.length}</b> moment${filled.length === 1 ? '' : 's'} of gratitude today 💛` : 'Let’s fill our jar!';
  }
  function home() {
    phase = 'idle';
    $('#gjSlip', el).className = 'gj-slip idle';
    $('#gjSlip', el).innerHTML = `<div class="gj-big">🫙 ${filled.length ? 'Pull another slip!' : 'Pull a slip!'}</div>
      <div class="gj-sub">Read it out loud, share your answer, then add it to the jar.</div>`;
    acts(`<button class="btn xl pink" id="gjPull">🫙 Pull a slip <kbd>Space</kbd></button>
      ${filled.length ? `<button class="btn lg ghost" id="gjDone">🎉 Look at our jar!</button>` : ''}
      <div class="gf-files gj-print" id="gjPrint"><button class="btn ghost sm gf-toggle">🖨 Print ▾</button>
        <div class="gf-menu" hidden><button class="gf-item" data-p="slips">✂ Slips to cut out</button><button class="gf-item" data-p="label">🏷 Jar label</button></div></div>`,
      { gjPull: pull, gjDone: celebrate });
    const bar = $('#gjPrint', el), menu = $('.gf-menu', bar);
    $('.gf-toggle', bar).onclick = e => { e.stopPropagation(); menu.hidden = !menu.hidden; };
    $$('.gf-item', menu).forEach(b => b.onclick = () => { menu.hidden = true; gjPrint(b.dataset.p); });
  }
  function pull() {
    if (di >= deck.length) { deck = shuffle(S.slice()); di = 0; }
    slip = deck[di++]; phase = 'slip'; Sfx.click();
    const sl = $('#gjSlip', el);
    sl.className = 'gj-slip open'; void sl.offsetWidth;
    sl.innerHTML = `<div class="gj-paper" style="--c:${COLORS[filled.length % COLORS.length]}"><small>Share…</small><div>${esc(slip)}</div></div>`;
    acts(`<button class="btn xl green" id="gjAdd">💛 We shared — add it to the jar! <kbd>Space</kbd></button>
      <button class="btn lg ghost" id="gjSwap">🔁 Different slip</button>`, { gjAdd: add, gjSwap: pull });
  }
  function add() {
    if (phase !== 'slip') return;
    filled.push({ c: COLORS[filled.length % COLORS.length], r: Math.round(Math.random() * 30 - 15) });
    Sfx.ding(); paintJar(true);
    if ([10, 20, 30, 40].includes(filled.length)) confetti(1500);
    $('#gjSlip', el).className = 'gj-slip fly';
    setTimeout(home, 450);
  }
  function celebrate() {
    phase = 'done'; confetti(3000); Sfx.fanfare?.();
    $('#gjSlip', el).className = 'gj-slip idle';
    $('#gjSlip', el).innerHTML = `<div class="gj-big">🎉 Look at our jar!</div>
      <div class="gj-score">${filled.length}</div><div class="gj-sub">moments of gratitude shared today. Be proud of this group — and of yourself! 💛</div>`;
    acts(`<button class="btn lg pink" id="gjMore">🫙 Keep going</button>`, { gjMore: home });
  }
  const onKey = e => {
    if (Modal.stack.length || Menu.isOpen() || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
    if (e.code !== 'Space' && e.key !== 'Enter') return;
    e.preventDefault();
    if (phase === 'idle') pull(); else if (phase === 'slip') add();
  };
  const closeMenu = e => { const b = $('#gjPrint', el); if (b && !b.contains(e.target)) $('.gf-menu', b).hidden = true; };
  document.addEventListener('keydown', onKey); document.addEventListener('click', closeMenu);
  paintJar(); home();
  return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('click', closeMenu); };
};

function gjPrint(what) {
  const S = window.GS_ACTIVITIES.gratitude;
  if (what === 'label') {
    printPage('Gratitude Jar Label', `<div class="pk-label"><div class="pk-label-in"><div class="pk-label-t">🫙 Our Gratitude Jar</div><div class="pk-label-s">Moments we’re thankful for</div><div class="pk-label-d">Started: ____________________</div></div></div>
      <div class="pk-label small"><div class="pk-label-in"><div class="pk-label-t">🫙 Our Gratitude Jar</div><div class="pk-label-s">Moments we’re thankful for</div></div></div>`, 'pk-gj');
    return;
  }
  const blanks = Array(9).fill('I’m grateful for…');
  printPage('Gratitude Slips', `<h1 class="pk-big">🫙 Gratitude Slips</h1><p class="pk-sub">✂ Cut along the dashed lines, fold, and drop them in the jar. Blank slips at the end are for your own!</p>
    <div class="pk-slips">${[...S, ...blanks].map((t, k) => `<div class="pk-slip${k >= S.length ? ' blank' : ''}">${esc(t)}${k >= S.length ? '<span class="pk-blank-line"></span>' : ''}</div>`).join('')}</div>`, 'pk-gj');
}
