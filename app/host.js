// 🖥️ Host window — shows the current question AND its answer on the host's own screen.
// The main game window sends updates over a BroadcastChannel (with localStorage as a backup).
(function () {
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let lastTs = 0;
  function render(s) {
    if (!s || s.ts < lastTs) return;
    lastTs = s.ts;
    document.body.className = s.look === 'recovery' ? 'theme-recovery' : s.look === 'playful' ? '' : 'theme-classic';
    $('game').textContent = s.game || 'Game Show Studio';
    const t = $('team');
    if (s.team) { t.classList.remove('hidden'); t.textContent = s.team; t.style.setProperty('--tc', s.teamColor || '#555'); }
    else t.classList.add('hidden');
    $('main').innerHTML = s.answer
      ? `${s.meta ? `<div class="meta">${esc(s.meta)}</div>` : ''}
         ${s.prompt ? `<div class="prompt">${esc(s.prompt)}</div>` : ''}
         <div class="ans-box"><div class="lbl">${esc(s.answerLabel || 'Answer')}</div><div class="ans">${esc(s.answer)}</div></div>
         ${s.note ? `<div class="note">${esc(s.note)}</div>` : ''}`
      : `<div class="idle">${esc(s.idle || 'Nothing to answer right now.')}</div>`;
    $('scores').innerHTML = (s.scores || []).map(x => `<span class="sc ${x.on ? 'on' : ''}" style="--tc:${esc(x.color)}">${esc(x.name)} · ${esc(x.score)}</span>`).join('');
  }
  try { render(JSON.parse(localStorage.getItem('gss-host') || 'null')); } catch (e) {}
  if ('BroadcastChannel' in window) new BroadcastChannel('gss-host').onmessage = e => render(e.data);
  window.addEventListener('storage', e => { if (e.key === 'gss-host') try { render(JSON.parse(e.newValue)); } catch (err) {} });
})();
