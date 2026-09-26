# Game Show Studio

A Windows desktop game-show app for groups, run on one projected host screen.

- **Trivia Blitz**: multiple choice with a timer, speed bonus, and host-awarded points
- **Quiz Board**: a category × point-value board with ✓/✗ judging per team
- **Spin & Solve**: a spinning wheel, a letter board, vowel buying, and solve bonuses
- 2–10 teams with a shared scoreboard across games
- Question Manager: add, edit and delete questions, import from text templates, and back up or restore

Built with Electron (HTML/CSS/JS). There's no internet requirement and no install step.

## Project layout
```
main.js / preload.js   Windows app shell (window, saving, file dialogs)
app/                   The whole interface (index.html, styles.css, *.js)
  data.js              Starter questions, text templates, import parsers
  core.js              Teams, scoreboard, sounds, pop-ups, home screen
  editor.js            Question Manager
  trivia.js board.js wheel.js   The three games
templates/             Blank import templates (.txt)
build/                 Icon + Windows build script
```

## Run and build (needs Node.js 20+ from nodejs.org)
```
npm install
npm start            # run the app in a window for testing
npm run build:win    # make dist/Game Show Studio-win32-x64/Game Show Studio.exe
```
You can also open `app/index.html` in Chrome or Edge to try changes quickly. In the browser, questions save to that browser instead of to a file.

## Data
Questions, teams and settings are saved to `%APPDATA%\Game Show Studio\questions.json`
(and a `.bak` of the previous save sits next to it).

## Going further
- **Installer (.exe setup wizard):** add `electron-builder` and run it on a Windows PC.
- **Remove the "Windows protected your PC" warning:** sign the .exe with a code-signing
  certificate (for example Azure Trusted Signing or a certificate from a standard vendor).

## Web version (Netlify)
The `app/` folder is a complete website. `netlify.toml` tells Netlify to publish it as-is:
- Build command: none
- Publish directory: `app`

Every push to GitHub redeploys the site automatically. On the web, questions save in the
browser you use (nothing is uploaded), so use **Back up everything / Restore backup** to move
them between computers.
