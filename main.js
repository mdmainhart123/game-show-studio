// Game Show Studio — Electron main process
// Handles the window, saving questions to disk, and file open/save dialogs.
const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require('electron');
const path = require('path');
const fs = require('fs');

const DATA_FILE = () => path.join(app.getPath('userData'), 'questions.json');
let win;

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
  });
}

function createWindow() {
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    backgroundColor: '#24084f',
    title: 'Game Show Studio',
    icon: path.join(__dirname, 'app', 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  Menu.setApplicationMenu(null);
  win.loadFile(path.join(__dirname, 'app', 'index.html'));
  win.maximize();
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());

// ---------- data ----------
ipcMain.handle('data:load', () => {
  try {
    if (fs.existsSync(DATA_FILE())) return JSON.parse(fs.readFileSync(DATA_FILE(), 'utf8'));
  } catch (e) {
    // Keep the broken file so nothing is lost, then start fresh.
    try { fs.copyFileSync(DATA_FILE(), DATA_FILE() + '.broken-' + Date.now()); } catch (_) {}
  }
  return null;
});

ipcMain.handle('data:save', (_e, data) => {
  const file = DATA_FILE();
  const tmp = file + '.tmp';
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  if (fs.existsSync(file)) fs.copyFileSync(file, file + '.bak');
  fs.renameSync(tmp, file);
  return true;
});

ipcMain.handle('data:folder', () => shell.openPath(path.dirname(DATA_FILE())));

// ---------- files ----------
ipcMain.handle('file:openText', async (_e, opts = {}) => {
  const res = await dialog.showOpenDialog(win, {
    title: opts.title || 'Choose a file',
    properties: ['openFile'],
    filters: opts.filters || [{ name: 'Text files', extensions: ['txt'] }, { name: 'All files', extensions: ['*'] }],
  });
  if (res.canceled || !res.filePaths.length) return null;
  const p = res.filePaths[0];
  let text = fs.readFileSync(p, 'utf8');
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // strip Notepad BOM
  return { name: path.basename(p), text };
});

ipcMain.handle('file:saveText', async (_e, { defaultName, text, filters }) => {
  const res = await dialog.showSaveDialog(win, {
    title: 'Save file',
    defaultPath: path.join(app.getPath('documents'), defaultName),
    filters: filters || [{ name: 'Text files', extensions: ['txt'] }],
  });
  if (res.canceled || !res.filePath) return null;
  fs.writeFileSync(res.filePath, text, 'utf8');
  return res.filePath;
});

// ---------- window ----------
ipcMain.handle('win:fullscreen', () => {
  win.setFullScreen(!win.isFullScreen());
  return win.isFullScreen();
});
