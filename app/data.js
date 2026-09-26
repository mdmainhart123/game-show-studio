// Question data: starter content, import templates, and text-file parsers.
(function (root) {
  const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

  // ================= TEMPLATES =================
  const TEMPLATES = {
    trivia: {
      file: 'trivia-template.txt',
      text: `# =============================================================
#  TRIVIA — question import template  (Game Show Studio)
# =============================================================
#  Each question is a small block of lines:
#
#    Q:  the question                          (required)
#    A:  the CORRECT answer                    (required)
#    W:  a wrong answer — add 1 to 3 of these  (required, at least 1)
#    C:  category                              (optional)
#    T:  seconds on the timer                  (optional, default 20)
#
#  - Leave a blank line between questions.
#  - Answers are shuffled automatically when the game is played,
#    so it's fine that the correct one is always listed first.
#  - For True/False, use  A: True  and  W: False
#  - Lines starting with # are notes and are ignored.
#  - Delete these examples and add your own, then save the file
#    and use "Import from text file" in the Question Manager.
# =============================================================

Q: What planet is known as the Red Planet?
A: Mars
W: Venus
W: Jupiter
W: Saturn
C: Science
T: 20

Q: How many sides does a hexagon have?
A: 6
W: 5
W: 7
W: 8
C: Math

Q: The Great Wall of China is visible from the Moon with the naked eye.
A: False
W: True
C: True or False
T: 15
`,
    },
    board: {
      file: 'quiz-board-template.txt',
      text: `# =============================================================
#  QUIZ BOARD — clue import template  (Game Show Studio)
# =============================================================
#  A board is a grid of categories (columns) and point values.
#
#    BOARD: name of the game board        (starts a new board)
#    CATEGORY: name of the category        (starts a new column)
#    points | clue | answer                 (one clue per line)
#
#  - Up to 6 categories per board and up to 6 clues per category
#    are shown (5 is the classic layout).
#  - Put a | (the "pipe" key, Shift + \\ ) between each part.
#  - Lines starting with # are notes and are ignored.
#  - You can put several boards in one file.
# =============================================================

BOARD: Sample Board

CATEGORY: Animals
100 | This animal is known as the "King of the Jungle" | Lion
200 | The only mammal that can truly fly | Bat
300 | A group of crows is called this | A murder
400 | This animal's fingerprints are almost identical to a human's | Koala
500 | The fastest land animal | Cheetah

CATEGORY: Geography
100 | The largest ocean on Earth | Pacific Ocean
200 | The capital of Canada | Ottawa
300 | This river flows through Egypt | The Nile
400 | The smallest country in the world | Vatican City
500 | This country has the most natural lakes | Canada
`,
    },
    wheel: {
      file: 'spin-and-solve-template.txt',
      text: `# =============================================================
#  SPIN & SOLVE — puzzle import template  (Game Show Studio)
# =============================================================
#  One puzzle per line:
#
#    category | puzzle
#
#  - Letters, numbers, spaces and  ' - & ? ! , . :  are allowed.
#  - The board is 4 rows of 14 squares, so keep puzzles short
#    (about 45 characters max, and no single word over 14 letters).
#  - Lines starting with # are notes and are ignored.
# =============================================================

Phrase | Better late than never
Place | The Grand Canyon
Food & Drink | Peanut butter and jelly sandwich
Thing | A cup of hot cocoa
Before & After | Apple pie in the sky
`,
    },
  };

  // ================= WHEEL LAYOUT =================
  const WHEEL_COLS = 14, WHEEL_ROWS = 4;
  const WHEEL_ALLOWED = /^[A-Z0-9 '\-&?!,.:]+$/;
  function layoutPuzzle(phrase) {
    const text = String(phrase || '').toUpperCase().replace(/\s+/g, ' ').trim();
    if (!text) return { ok: false, error: 'Puzzle is empty' };
    if (!WHEEL_ALLOWED.test(text)) return { ok: false, error: "Only letters, numbers, spaces and ' - & ? ! , . : are allowed" };
    const words = text.split(' ');
    const long = words.find(w => w.length > WHEEL_COLS);
    if (long) return { ok: false, error: `"${long}" is longer than ${WHEEL_COLS} letters` };
    const rows = [];
    let cur = '';
    for (const w of words) {
      if (!cur) cur = w;
      else if ((cur + ' ' + w).length <= WHEEL_COLS) cur += ' ' + w;
      else { rows.push(cur); cur = w; }
    }
    if (cur) rows.push(cur);
    if (rows.length > WHEEL_ROWS) return { ok: false, error: `Too long — it needs ${rows.length} rows but the board has ${WHEEL_ROWS}` };
    if (!/[A-Z]/.test(text)) return { ok: false, error: 'Puzzle needs at least one letter' };
    return { ok: true, rows, text };
  }

  // ================= PARSERS =================
  // Each returns { items: [...], problems: ["Line 4: ..."] }
  function lines(text) { return String(text || '').replace(/\r\n?/g, '\n').split('\n'); }
  const isComment = l => /^\s*(#|\/\/)/.test(l);

  function parseTrivia(text) {
    const items = [], problems = [];
    let cur = null;
    const finish = () => {
      if (!cur) return;
      const where = `Question starting on line ${cur.line}`;
      if (!cur.question) problems.push(`${where}: missing the Q: line`);
      else if (!cur.answer) problems.push(`${where} ("${cur.question.slice(0, 40)}"): missing the A: (correct answer) line`);
      else if (!cur.wrong.length) problems.push(`${where} ("${cur.question.slice(0, 40)}"): needs at least one W: (wrong answer) line`);
      else {
        if (cur.wrong.length > 3) problems.push(`${where}: had ${cur.wrong.length} wrong answers — kept the first 3`);
        items.push({
          id: uid(), question: cur.question, answer: cur.answer, wrong: cur.wrong.slice(0, 3),
          category: cur.category || 'General', time: cur.time || 20,
        });
      }
      cur = null;
    };
    lines(text).forEach((raw, i) => {
      const n = i + 1;
      const l = raw.trim();
      if (!l) { finish(); return; }
      if (isComment(l)) return;
      const m = l.match(/^(q|question|a|answer|correct|w|wrong|c|cat|category|t|time|seconds)\s*[:=]\s*(.*)$/i);
      if (!m) { problems.push(`Line ${n}: didn't understand "${l.slice(0, 50)}" — lines should start with Q:, A:, W:, C: or T:`); return; }
      const key = m[1].toLowerCase()[0] === 's' ? 't' : m[1].toLowerCase()[0];
      const val = m[2].trim();
      if (key === 'q' && cur && cur.question) finish();
      if (!cur) cur = { line: n, question: '', answer: '', wrong: [], category: '', time: 0 };
      if (!val) { problems.push(`Line ${n}: "${m[1]}:" is empty`); return; }
      if (key === 'q') cur.question = val;
      else if (key === 'a') cur.answer = val;
      else if (key === 'w') cur.wrong.push(val);
      else if (key === 'c') cur.category = val;
      else if (key === 't') {
        const t = parseInt(val, 10);
        if (t >= 5 && t <= 120) cur.time = t; else problems.push(`Line ${n}: timer should be 5–120 seconds — used 20`);
      }
    });
    finish();
    return { items, problems };
  }

  function parseBoard(text) {
    const items = [], problems = [];
    let board = '', category = '';
    let usedDefault = false;
    lines(text).forEach((raw, i) => {
      const n = i + 1, l = raw.trim();
      if (!l || isComment(l)) return;
      let m;
      if ((m = l.match(/^board\s*[:=]\s*(.*)$/i))) { board = m[1].trim(); category = ''; return; }
      if ((m = l.match(/^(category|cat)\s*[:=]\s*(.*)$/i))) { category = m[2].trim(); return; }
      const parts = l.split('|').map(s => s.trim());
      if (parts.length < 3) { problems.push(`Line ${n}: expected "points | clue | answer" but got "${l.slice(0, 50)}"`); return; }
      const value = parseInt(parts[0].replace(/[^0-9]/g, ''), 10);
      if (!value) { problems.push(`Line ${n}: "${parts[0]}" isn't a point value`); return; }
      const clue = parts[1], answer = parts.slice(2).join(' | ');
      if (!clue || !answer) { problems.push(`Line ${n}: clue or answer is empty`); return; }
      if (!category) { problems.push(`Line ${n}: clue has no CATEGORY: line above it`); return; }
      if (!board) { board = 'Imported Board'; usedDefault = true; }
      items.push({ id: uid(), board, category, value, clue, answer });
    });
    if (usedDefault) problems.push('No BOARD: line found — clues were put on a board called "Imported Board"');
    // warn about oversize boards
    const boards = {};
    items.forEach(c => { (boards[c.board] ||= {})[c.category] = ((boards[c.board] || {})[c.category] || 0) + 1; });
    Object.entries(boards).forEach(([b, cats]) => {
      const names = Object.keys(cats);
      if (names.length > 6) problems.push(`Board "${b}" has ${names.length} categories — only the first 6 appear in the game`);
      names.forEach(c => { if (cats[c] > 6) problems.push(`"${b}" → "${c}" has ${cats[c]} clues — only 6 fit on the board`); });
    });
    return { items, problems };
  }

  function parseWheel(text) {
    const items = [], problems = [];
    lines(text).forEach((raw, i) => {
      const n = i + 1, l = raw.trim();
      if (!l || isComment(l)) return;
      const parts = l.split('|').map(s => s.trim());
      if (parts.length < 2 || !parts[0] || !parts[1]) { problems.push(`Line ${n}: expected "category | puzzle" but got "${l.slice(0, 50)}"`); return; }
      const lay = layoutPuzzle(parts.slice(1).join(' '));
      if (!lay.ok) { problems.push(`Line ${n}: ${lay.error}`); return; }
      items.push({ id: uid(), category: parts[0], phrase: lay.text });
    });
    return { items, problems };
  }

  // ================= STARTER DATA =================
  function T(question, answer, wrong, category, time = 20) { return { id: uid(), question, answer, wrong, category, time }; }
  function starterData() {
    const trivia = [
      T('What planet is known as the Red Planet?', 'Mars', ['Venus', 'Jupiter', 'Saturn'], 'Science'),
      T('What gas do plants absorb from the air?', 'Carbon dioxide', ['Oxygen', 'Nitrogen', 'Helium'], 'Science'),
      T('How many bones are in the adult human body?', '206', ['186', '226', '306'], 'Science'),
      T('What is the boiling point of water at sea level in Fahrenheit?', '212°F', ['100°F', '180°F', '232°F'], 'Science'),
      T('Which is the largest planet in our solar system?', 'Jupiter', ['Saturn', 'Neptune', 'Earth'], 'Science'),
      T('What is the capital of Australia?', 'Canberra', ['Sydney', 'Melbourne', 'Perth'], 'Geography'),
      T('Which is the longest river in South America?', 'Amazon', ['Orinoco', 'Paraná', 'Magdalena'], 'Geography'),
      T('Mount Everest sits on the border of Nepal and which other country?', 'China', ['India', 'Bhutan', 'Pakistan'], 'Geography'),
      T('How many U.S. states are there?', '50', ['48', '51', '52'], 'Geography', 15),
      T('Which U.S. state is known as the Keystone State?', 'Pennsylvania', ['Ohio', 'New York', 'Virginia'], 'Geography'),
      T('Who painted the Mona Lisa?', 'Leonardo da Vinci', ['Michelangelo', 'Raphael', 'Vincent van Gogh'], 'Arts'),
      T('How many strings does a standard guitar have?', '6', ['4', '5', '7'], 'Arts', 15),
      T('Which instrument has 88 keys?', 'Piano', ['Organ', 'Accordion', 'Harpsichord'], 'Arts'),
      T('How many minutes are in a full day?', '1,440', ['1,200', '1,040', '2,400'], 'Math'),
      T('What is 7 × 8?', '56', ['54', '48', '64'], 'Math', 15),
      T('How many sides does a hexagon have?', '6', ['5', '7', '8'], 'Math', 15),
      T('A tomato is a fruit.', 'True', ['False'], 'True or False', 15),
      T('Lightning never strikes the same place twice.', 'False', ['True'], 'True or False', 15),
      T('Honey never spoils if stored properly.', 'True', ['False'], 'True or False', 15),
      T('In which sport would you perform a "slam dunk"?', 'Basketball', ['Volleyball', 'Tennis', 'Football'], 'Sports', 15),
      T('How many players are on a soccer team on the field at once?', '11', ['9', '10', '12'], 'Sports'),
      T('Which Pittsburgh team plays hockey?', 'Penguins', ['Pirates', 'Steelers', 'Panthers'], 'Sports', 15),
    ];
    const board = parseBoard(`BOARD: Starter Board
CATEGORY: Animals
100 | This animal is known as the "King of the Jungle" | Lion
200 | The only mammal that can truly fly | Bat
300 | A baby kangaroo is called this | A joey
400 | This animal's fingerprints are almost identical to a human's | Koala
500 | The fastest land animal | Cheetah
CATEGORY: Geography
100 | The largest ocean on Earth | Pacific Ocean
200 | The capital of Canada | Ottawa
300 | This river flows through Egypt | The Nile
400 | The smallest country in the world | Vatican City
500 | The only continent with no countries | Antarctica
CATEGORY: Food
100 | The main ingredient in guacamole | Avocado
200 | Pizza originated in this country | Italy
300 | Sushi is traditionally wrapped in this seaweed | Nori
400 | This spice, from a crocus flower, is the most expensive by weight | Saffron
500 | A Reuben sandwich is traditionally made on this bread | Rye
CATEGORY: Music
100 | This instrument has 88 keys | Piano
200 | The number of musicians in a quartet | Four
300 | "The King of Rock and Roll" | Elvis Presley
400 | The note between F and G | F sharp / G flat
500 | This composer kept writing music after losing his hearing | Beethoven
CATEGORY: Around the House
100 | You use this appliance to make toast | Toaster
200 | The number of legs on most chairs | Four
300 | This room is where you'd usually find a bathtub | Bathroom
400 | Fluffy dust collects under this piece of bedroom furniture | The bed
500 | This household item measures temperature | Thermometer`).items;
    const wheel = [
      ['Phrase', 'Better late than never'], ['Phrase', 'Actions speak louder than words'],
      ['Place', 'The Grand Canyon'], ['Place', 'Downtown Pittsburgh'],
      ['Food & Drink', 'Peanut butter and jelly sandwich'], ['Food & Drink', 'A cup of hot cocoa'],
      ['Thing', 'A rainbow after the storm'], ['Thing', 'Fresh chocolate chip cookies'],
      ['Event', 'Family game night'], ['Event', 'Surprise birthday party'],
      ['Before & After', 'Apple pie in the sky'], ['Fun & Games', 'Hide and seek'],
    ].map(([category, p]) => ({ id: uid(), category, phrase: layoutPuzzle(p).text }));
    return { version: 1, trivia, board, wheel };
  }

  const api = { uid, TEMPLATES, parseTrivia, parseBoard, parseWheel, layoutPuzzle, starterData, WHEEL_COLS, WHEEL_ROWS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GSData = api;
})(this);
