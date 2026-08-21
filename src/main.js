const { app, BrowserWindow, ipcMain, screen, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

// ── 저장 위치 ──────────────────────────────────────────────
const dir = () => app.getPath('userData');
const CONFIG = () => path.join(dir(), 'config.json');
const SCRIPT = () => path.join(dir(), 'last_script.txt');

let consoleWin = null;
let stageWin = null;

// ── 창 ─────────────────────────────────────────────────────
function createConsole() {
  consoleWin = new BrowserWindow({
    width: 1440, height: 900, minWidth: 1024, minHeight: 640,
    backgroundColor: '#0b0d10',
    show: false,
    autoHideMenuBar: true,
    icon: path.join(__dirname, '..', 'build', 'app.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false      // 창이 뒤로 가도 주행이 느려지지 않도록
    }
  });

  consoleWin.loadFile(path.join(__dirname, 'index.html'));
  consoleWin.once('ready-to-show', () => { consoleWin.maximize(); consoleWin.show(); });
  blockReload(consoleWin);

  consoleWin.on('closed', () => { consoleWin = null; closeStage(); });
}

/**
 * 새로고침을 막는다. 방송 중에 F5 가 눌리면 원고가 날아간다.
 * 브라우저로만 쓸 때 가장 위험한 부분이라, 감싸는 첫 번째 이유가 이것이다.
 */
function blockReload(win) {
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    const k = (input.key || '').toLowerCase();
    if (k === 'f5' || ((input.control || input.meta) && k === 'r')) e.preventDefault();
  });
}

function openStage(displayId) {
  closeStage();

  const d = screen.getAllDisplays().find(x => x.id === displayId) || screen.getPrimaryDisplay();
  stageWin = new BrowserWindow({
    x: d.bounds.x, y: d.bounds.y, width: d.bounds.width, height: d.bounds.height,
    frame: false, fullscreen: true, backgroundColor: '#000000',
    skipTaskbar: true, autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  });

  stageWin.loadFile(path.join(__dirname, 'stage.html'));
  blockReload(stageWin);
  stageWin.on('closed', () => {
    stageWin = null;
    consoleWin?.webContents.send('stage:closed');
  });

  // 조작은 운영자 화면에서 한다
  stageWin.on('focus', () => consoleWin?.focus());
  return true;
}

function closeStage() {
  if (stageWin && !stageWin.isDestroyed()) stageWin.close();
  stageWin = null;
}

// ── 통신 ───────────────────────────────────────────────────
ipcMain.handle('displays', () => {
  const primary = screen.getPrimaryDisplay().id;
  return screen.getAllDisplays().map((d, i) => ({
    id: d.id,
    index: i,
    width: d.size.width,
    height: d.size.height,
    scale: d.scaleFactor,
    primary: d.id === primary
  }));
});

ipcMain.handle('stage:open', (_e, displayId) => openStage(displayId));
ipcMain.handle('stage:close', () => { closeStage(); return true; });

// 운영자 화면 → 출력 창
ipcMain.on('stage:send', (_e, msg) => {
  if (stageWin && !stageWin.isDestroyed()) stageWin.webContents.send('stage:msg', msg);
});
// 출력 창 → 운영자 화면
ipcMain.on('stage:report', (_e, msg) => {
  if (consoleWin && !consoleWin.isDestroyed()) consoleWin.webContents.send('stage:report', msg);
});

ipcMain.handle('window:fullscreen', (_e, on) => {
  if (!consoleWin) return false;
  consoleWin.setFullScreen(!!on);
  return consoleWin.isFullScreen();
});

// ── 파일 ───────────────────────────────────────────────────
const readJson = (p, fallback) => {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fallback; }
};

ipcMain.handle('config:load', () => readJson(CONFIG(), null));
ipcMain.handle('config:save', (_e, data) => {
  try {
    fs.mkdirSync(dir(), { recursive: true });
    fs.writeFileSync(CONFIG(), JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch { return false; }
});

ipcMain.handle('script:load', () => {
  try {
    if (!fs.existsSync(SCRIPT())) return null;
    return { text: fs.readFileSync(SCRIPT(), 'utf8'), at: fs.statSync(SCRIPT()).mtimeMs };
  } catch { return null; }
});

/** 쓰다 만 파일이 남지 않도록 임시 파일에 먼저 쓴 뒤 바꿔치운다. */
ipcMain.handle('script:save', (_e, text) => {
  try {
    fs.mkdirSync(dir(), { recursive: true });
    const tmp = SCRIPT() + '.tmp';
    fs.writeFileSync(tmp, text ?? '', 'utf8');
    fs.renameSync(tmp, SCRIPT());
    return true;
  } catch { return false; }
});

ipcMain.handle('script:import', async () => {
  const r = await dialog.showOpenDialog(consoleWin, {
    title: '원고 불러오기',
    filters: [{ name: '텍스트 파일', extensions: ['txt'] }, { name: '모든 파일', extensions: ['*'] }],
    properties: ['openFile']
  });
  if (r.canceled || !r.filePaths[0]) return null;
  try { return fs.readFileSync(r.filePaths[0], 'utf8'); } catch { return null; }
});

ipcMain.handle('script:export', async (_e, text) => {
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
  const r = await dialog.showSaveDialog(consoleWin, {
    title: '원고 저장',
    defaultPath: `prompter_${stamp}.txt`,
    filters: [{ name: '텍스트 파일', extensions: ['txt'] }]
  });
  if (r.canceled || !r.filePath) return false;
  try { fs.writeFileSync(r.filePath, text ?? '', 'utf8'); return true; } catch { return false; }
});

// ── 수명 ───────────────────────────────────────────────────
app.whenReady().then(createConsole);
app.on('window-all-closed', () => app.quit());
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createConsole(); });
