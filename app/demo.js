// 🎬 Self-playing demos. Each one plays a real round of a game with captions,
// using random questions from the question bank. It uses copies of the teams,
// never saves anything, and puts real teams, scores and settings back afterward.
const Demo = {
  running: false, paused: false, aborted: false,

  async start(game) {
    if (this.running) return;
    const d = App.data;
    const saved = { teams: d.teams, settings: { ...d.settings } };
    this.running = true; this.paused = false; this.aborted = false;
    // demo copies of up to 3 teams, starting at 0
    d.teams = saved.teams.slice(0, 3).map(t => ({ ...t, id: 'demo-' + t.id, score: 0 }));
    this.mountUI();
    try {
      await this.scripts[game].call(this);
      await this.say('🎉 That\'s how it works! Now it\'s your turn to play.', 3500);
    } catch (e) {
      if (e !== Demo.ABORT) console.error(e);
    } finally {
      this.running = false;
      Modal.stack.slice().forEach(m => m.close());
      d.teams = saved.teams;
      d.settings = saved.settings;
      this.unmountUI();
      App.show('home');
      App.save(true);
    }
  },
  ABORT: { demo: 'aborted' },

  // ---------- on-screen bits ----------
  mountUI() {
    // a caption strip between the top bar and the game (so it never covers anything)
    const strip = document.createElement('div');
    strip.id = 'demoStrip';
    strip.className = 'demo-strip';
    strip.innerHTML = `<span class="demo-tag">🎬 DEMO</span><div class="demo-caption" id="demoCap"></div>
      <button class="btn sm ghost" id="demoPause">⏸ Pause</button>
      <button class="btn sm red" id="demoExit">✖ Exit demo</button>`;
    $('#app').insertBefore(strip, $('#screen'));
    const ui = document.createElement('div');
    ui.id = 'demoUI';
    ui.innerHTML = `<div class="demo-block"></div><div class="demo-ring" id="demoRing"></div>`;
    document.body.appendChild(ui);
    document.body.classList.add('demo');
    $('#demoPause').onclick = () => {
      this.paused = !this.paused;
      $('#demoPause').textContent = this.paused ? '▶ Resume' : '⏸ Pause';
      const p = App.nav?.pause; if (p && p.get() !== this.paused) p.toggle(); // keep the trivia clock in step
    };
    $('#demoExit').onclick = () => { this.aborted = true; this.paused = false; };
  },
  unmountUI() { $('#demoUI')?.remove(); $('#demoStrip')?.remove(); document.body.classList.remove('demo'); },

  async wait(ms) {
    let left = ms;
    while (left > 0) {
      if (this.aborted) throw Demo.ABORT;
      await new Promise(r => setTimeout(r, 100));
      if (!this.paused) left -= 100;
    }
    if (this.aborted) throw Demo.ABORT;
  },
  async say(html, ms = 2600) {
    const c = $('#demoCap');
    if (c) { c.innerHTML = html; c.classList.remove('show'); void c.offsetWidth; c.classList.add('show'); }
    await this.wait(ms);
  },
  // Wait until something appears (or a condition is true)
  async until(test, ms = 15000) {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      if (this.aborted) throw Demo.ABORT;
      const r = typeof test === 'string' ? $(test) : test();
      if (r) return r;
      await new Promise(r => setTimeout(r, 120));
    }
    throw new Error('Demo step timed out: ' + test);
  },
  // Pulse a ring around an element, then click it
  async tap(target, pause = 900) {
    const el = typeof target === 'string' ? await this.until(target) : target;
    const r = el.getBoundingClientRect(), ring = $('#demoRing');
    Object.assign(ring.style, { left: r.left - 8 + 'px', top: r.top - 8 + 'px', width: r.width + 16 + 'px', height: r.height + 16 + 'px' });
    ring.classList.remove('on'); void ring.offsetWidth; ring.classList.add('on');
    await this.wait(pause);
    ring.classList.remove('on');
    el.click();
    await this.wait(250);
  },
  async type(input, value) {
    const el = typeof input === 'string' ? await this.until(input) : input;
    el.value = '';
    for (const ch of String(value)) { el.value += ch; await this.wait(110); }
  },
  pickRandom(a) { return a[Math.floor(Math.random() * a.length)]; },

  // ---------- Final Round (shared by Trivia and Quiz Board) ----------
  async finalRound() {
    await this.until(() => App.current === 'finalRound');
    await this.say('🏆 Every game ends with a <b>Final Round</b>. First you see the category…', 3200);
    await this.say('Each team <b>secretly</b> writes down a bet. The host types them in — they stay hidden 🔒', 3200);
    for (const inp of $$('.wg input')) {
      const t = Scores.teams().find(x => x.id === inp.dataset.id);
      const cap = Math.max(t.score, 1000);
      await this.type(inp, Math.max(100, Math.round((cap * (0.3 + Math.random() * 0.6)) / 100) * 100));
    }
    await this.tap('#lock');
    await this.say('One last question! Every team writes their answer before the 30-second clock runs out.', 3800);
    await this.tap('#fReveal');
    await this.say('Reveal the answer, then mark each team ✓ or ✗. Their bet is shown as you go…', 3000);
    const rows = $$('.fj');
    for (let i = 0; i < rows.length; i++) {
      await this.tap($(i % 2 === 0 ? '.ok' : '.no', rows[i]), 700);
      await this.wait(700);
    }
    await this.say('Right answers win their bet, wrong answers lose it — big comebacks happen here!', 3000);
    await this.tap('#fDone');
    await this.say('🏆 The podium shows the winner. Scores reset to 0 for the next game.', 3800);
  },

  // ---------- the three demos ----------
  scripts: {
    async trivia() {
      const d = App.data;
      Object.assign(d.settings, { triviaMode: 'turns', finalRound: true });
      App.show('triviaSetup');
      await this.say('⚡ <b>Trivia Blitz</b> — pick a category and how many questions, then press Start.', 3200);
      const qs = shuffle(d.trivia.filter(q => q.wrong.length >= 2)).slice(0, 2).map(q => ({ ...q, time: 45 }));
      App.playedTrivia = new Set(qs.map(q => q.id));
      Scores.resetAll();
      App.show('triviaTurns', qs);
      await this.say('Teams take turns. The badge at the top (and the glowing score box) shows whose turn it is.', 3600);
      await this.say('The team says their answer — the host taps it on screen.', 2600);
      await this.tap($('.ans.wrong:not(.out)'));
      await this.say('❌ Wrong! That answer is crossed out, they lose a few points, and the <b>next team</b> tries.', 3800);
      await this.tap($('.ans.right'));
      $('#stay')?.click(); // demo moves on by itself
      await this.say('✅ Correct! They earn the points <b>and</b> start the next question.', 3200);
      await this.tap('#nextQ');
      await this.say('New question — same team, since they got the last one right.', 2800);
      await this.tap($('.ans.right'));
      $('#stay')?.click();
      await this.say('✅ Another one! Use ◀ ▶ at the top to move between questions. End game is in the ☰ Menu.', 3600);
      await this.tap('#nextQ');
      await this.finalRound();
    },

    async board() {
      const d = App.data;
      Object.assign(d.settings, { finalRound: true });
      App.show('boardSetup');
      await this.say('🎯 <b>Quiz Board</b> — choose a board and press Start.', 2800);
      const names = boardNames();
      const sel = $('#bd'); sel.value = this.pickRandom(names);
      await this.tap('#go');
      await this.say('The highlighted team picks a <b>category</b> and a <b>point value</b>. Bigger points = harder clue.', 3800);
      const name = names.find(n => $('#topActions').textContent.includes(n)) || sel.value;
      const dd = App.boardDD?.[name] || new Set();
      const normal = $$('.tile[data-id]').filter(t => !dd.has(t.dataset.id) && /^[23]00$/.test(t.textContent.replace(/,/g, '')));
      await this.tap(this.pickRandom(normal.length ? normal : $$('.tile[data-id]').filter(t => !dd.has(t.dataset.id))));
      await this.say('Read the clue out loud. Any team can answer.', 2800);
      await this.tap($('.jt:nth-child(1) .no'));
      await this.say('❌ Wrong answers lose the points (you can turn that off in ☰ Menu → Settings)…', 3000);
      await this.tap('#show');
      await this.say('Show the answer whenever you\'re ready.', 2200);
      await this.tap($('.jt:nth-child(2) .ok'));
      await this.say('✅ Correct earns the points — and that team picks next.', 3200);
      await this.until(() => !$('.clue-view'));
      const ddTile = $$('.tile[data-id]').find(t => dd.has(t.dataset.id));
      if (ddTile) {
        await this.say('Somewhere on every board is a hidden surprise…', 2400);
        await this.tap(ddTile);
        await this.say('🎲 <b>DAILY DOUBLE!</b> It belongs to the team whose pick it was.', 3200);
        await this.say('They bet as much as they want — up to their score or the board\'s top value.', 3200);
        await this.tap($('.dd-wager .btn.orange'));
        await this.say('All in! 😱', 1600);
        await this.tap('#wGo');
        await this.say('Only that team answers…', 2400);
        await this.tap('#show');
        await this.tap($('.jt .ok'));
        await this.say('✅ They nailed it and win the whole bet!', 3000);
        await this.until(() => !$('.clue-view'));
      }
      await this.say('Play until the board is empty, or press 🏁 End game whenever you like.', 3000);
      await this.say('The host controls live in the <b>☰ Menu</b> — End game, Quit to Home, fixing a score, settings and more.', 3600);
      Menu.open(); await this.wait(900);
      await this.tap('#mEnd');
      await this.tap('.modal .btn.pink', 600);
      await this.finalRound();
    },

    async wheel() {
      const d = App.data;
      Object.assign(d.settings, { finalRound: false });
      App.show('wheelSetup');
      await this.say('🎡 <b>Spin &amp; Solve</b> — choose how many puzzles and press Start.', 2800);
      $('#num').value = '1';
      await this.tap('#go');
      await this.say('The first team spins. The category is under the puzzle board.', 3000);
      let missed = false, letters = 0, vowelDone = false, mysteryShown = false;
      const hidden = () => $$('.cell.l.hide').map(c => c.textContent);
      const bestConsonant = () => {
        const counts = {}; hidden().filter(x => 'BCDFGHJKLMNPQRSTVWXYZ'.includes(x)).forEach(x => counts[x] = (counts[x] || 0) + 1);
        return Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
      };
      for (let spin = 0; spin < 10; spin++) {
        const consLeft = [...new Set(hidden())].filter(L => 'BCDFGHJKLMNPQRSTVWXYZ'.includes(L));
        if (letters >= 3 || !consLeft.length || $('#spin').disabled) break;
        if (letters >= 1 && !mysteryShown) App.wheelForce = 8; // land on a 🎁 Mystery wedge once
        await this.tap('#spin', 700);
        await this.until(() => !/Spinning/.test($('#status').textContent), 9000);
        const st = $('#status').textContent;
        if (/BANKRUPT/.test(st)) { await this.say('💥 BANKRUPT! They lose what they earned on this puzzle, and the turn passes.', 3800); continue; }
        if (/LOSE A TURN/.test(st)) { await this.say('😬 Lose a turn — next team!', 3200); continue; }
        if (/MYSTERY/.test(st)) {
          mysteryShown = true;
          await this.say('🎁 A <b>MYSTERY</b> wedge! It\'s worth 1,000 for each letter…', 3000);
          await this.tap($(`#letters button[data-l="${bestConsonant()}"]`));
          await this.until('.flip-card', 8000);
          await this.say('The big choice: <b>keep</b> the points, or give them up and <b>flip the card</b> — 50/50 for a +2,500 JACKPOT or BANKRUPT!', 4400);
          await this.tap('.modal .btn.pink');
          await this.wait(3900);
          const res = $('#status').textContent;
          await this.say(/JACKPOT/.test(res) ? '💰 JACKPOT! The gamble paid off!' : '💥 BANKRUPT! The gamble didn\'t pay off — next team.', 3200);
          letters++;
          continue;
        }
        await this.say('It landed on points! The team calls a <b>consonant</b>…', 2600);
        let L;
        if (!missed) {
          L = [...'QZXJVKWYBP'].find(x => !hidden().includes(x) && !$(`#letters button[data-l="${x}"]`).disabled);
          missed = true;
        }
        if (L) {
          await this.tap($(`#letters button[data-l="${L}"]`));
          await this.say(`No ${L}'s — the turn passes to the next team.`, 3000);
          continue;
        }
        L = bestConsonant();
        await this.tap($(`#letters button[data-l="${L}"]`));
        await this.say(`Every ${L} lights up, and they earn the points <b>for each one</b> — straight onto the scoreboard.`, 3600);
        letters++;
        await this.until(() => $('#aSolve'), 6000);
        const vowelBtn = $('#aVowel');
        if (!vowelDone && vowelBtn && !vowelBtn.disabled) {
          const v = [...'EAOIU'].find(x => hidden().includes(x));
          if (v) {
            await this.say('They can also <b>buy a vowel</b> with their points…', 2400);
            await this.tap(vowelBtn);
            await this.tap($(`#letters button[data-l="${v}"]`));
            await this.say(`Bought an ${v}!`, 2600);
            vowelDone = true;
            await this.until(() => $('#aSolve'), 6000);
          }
        }
      }
      const answer = $$('.cell.l.hide').map(c => c.textContent);
      const typeIn = async letters => { for (const L of letters) { $(`#letters button[data-l="${L}"]`).click(); await this.wait(260); } };
      await this.say('Think you know it? Press <b>Solve it!</b> and have the team say it out loud…', 3000);
      await this.tap(await this.until('#aSolve', 8000));
      await this.say('…then type their answer into the empty squares.', 2000);
      const wrongL = answer.length ? (answer[answer.length - 1] === 'E' ? 'A' : 'E') : 'E';
      await typeIn([...answer.slice(0, -1), wrongL]);
      await this.tap('#sCheck');
      await this.say('✗ Not quite! The guess is cleared and the <b>next team</b> gets a turn.', 3400);
      await this.until('#aSolve', 8000);
      await this.say('The next team knows it! Solve it!', 2200);
      await this.tap('#aSolve');
      await typeIn(answer);
      await this.say('Press <b>Check answer</b>…', 1800);
      await this.tap('#sCheck');
      await this.say('🎉 Solved! They get a 500-point bonus. The team with the most points starts the next puzzle.', 4200);
      await this.tap('#aNext');
      await this.say('🏆 Final scores! (Spin &amp; Solve, Trivia and Quiz Board all end with the podium.)', 3600);
    },

    async words() {
      const d = App.data;
      App.show('wordsSetup');
      await this.say('🔤 <b>Word Guess</b> — everyone plays together. No teams, no points!', 3000);
      const withHint = d.words.filter(w => w.hint);
      const pick = this.pickRandom(withHint.length ? withHint : d.words);
      App.show('wordsPlay', [pick], { hints: true });
      await this.say('Find the hidden <b>5-letter word</b> in 6 tries.' + (pick.hint ? ' The hint 💡 gives a clue.' : ''), 3200);
      const typeWord = async w => { for (const L of w) { $(`#kb .k[data-k="${L}"]`).click(); await this.wait(230); } };
      await this.say('Someone shouts out a word, and the host types it in…', 2600);
      await typeWord('ABCDE');
      await this.tap($('#kb .k[data-k="ENTER"]'));
      await this.say('Only real words count! (If a real word is missing, press "Use it anyway".)', 3400);
      for (let i = 0; i < 5; i++) { $('#kb .k[data-k="BACK"]').click(); await this.wait(90); }
      const starters = ['STORM', 'PLANT', 'HOUSE', 'LIGHT', 'BRICK', 'CHAMP'].filter(w => w !== pick.word && wgValid(w));
      await typeWord(starters[0]);
      await this.tap($('#kb .k[data-k="ENTER"]'));
      await this.wait(2400);
      await this.say('🟩 <b>Green</b> = right letter, right spot. 🟨 <b>Yellow</b> = in the word, wrong spot. ⬛ <b>Gray</b> = not in the word.', 4600);
      await this.say('The keyboard keeps track of the colors too. Next guess…', 2800);
      await typeWord(starters[1]);
      await this.tap($('#kb .k[data-k="ENTER"]'));
      await this.wait(2400);
      await this.say('Somebody\'s got it…', 2000);
      await typeWord(pick.word);
      await this.tap($('#kb .k[data-k="ENTER"]'));
      await this.wait(2600);
      await this.say('🎉 Solved! Press <b>Next word</b> to keep playing.', 3400);
    },
  },
};

// Saving is switched off while a demo runs.
const _realSave = App.save.bind(App);
App.save = function (now) { if (Demo.running) return; return _realSave(now); };
