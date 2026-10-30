const { app, BrowserWindow, ipcMain, screen, dialog, utilityProcess } = require('electron');
const path = require('path');
const fs = require('fs');
const { createUpdater } = require('./update');

// ── 저장 위치 ──────────────────────────────────────────────
const dir = () => app.getPath('userData');
const CONFIG = () => path.join(dir(), 'config.json');
// 색이 들어간 원고를 담아야 해서 html 로 바꿨다.
// 예전 txt 보존본도 계속 읽는다 — 쓰던 원고가 날아가면 안 된다.
const SCRIPT = () => path.join(dir(), 'last_script.html');
const SCRIPT_OLD = () => path.join(dir(), 'last_script.txt');

let consoleWin = null;
let stageWin = null;
let asr = null;                 // 음성 인식 전담 프로세스

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

  consoleWin.on('closed', () => { consoleWin = null; closeStage(); stopAsr(); });
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

// ── 음성 인식 ──────────────────────────────────────────────
/**
 * 인식을 별도 프로세스에서 돌린다.
 *
 * 주행 화면이 도는 렌더러와 코어를 나눠 쓰게 하려는 것이다.
 * 같은 스레드에 올리면 프레임이 밀려 글이 울컥거린다.
 */
const MODEL_DIR = () => path.join(__dirname, '..', 'models', 'ko');

function toConsole(msg) {
  if (consoleWin && !consoleWin.isDestroyed()) consoleWin.webContents.send('asr:msg', msg);
}

function startAsr(threads) {
  stopAsr();
  if (!fs.existsSync(path.join(MODEL_DIR(), 'tokens.txt'))) {
    toConsole({ t: 'error', message: '인식 모델이 없습니다. models/ko 폴더를 확인하십시오.' });
    return false;
  }
  asr = utilityProcess.fork(path.join(__dirname, 'asr-worker.js'), [], { stdio: 'ignore' });
  asr.on('message', m => toConsole(m));
  // 프로세스가 죽는 것은 '못 알아듣는 것'과 다르다. 시간으로 짐작하지 말고 여기서 알린다.
  asr.on('exit', code => { asr = null; toConsole({ t: 'dead', code }); });
  asr.postMessage({ t: 'start', model: MODEL_DIR(), threads: threads || 2 });
  return true;
}

function stopAsr() {
  if (asr) { try { asr.kill(); } catch {} asr = null; }
}

ipcMain.handle('asr:start', (_e, threads) => startAsr(threads));
ipcMain.handle('asr:stop', () => { stopAsr(); return true; });
ipcMain.on('asr:pcm', (_e, samples) => { if (asr) asr.postMessage({ t: 'pcm', samples }); });
ipcMain.on('asr:reset', () => { if (asr) asr.postMessage({ t: 'reset' }); });

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
  for (const p of [SCRIPT(), SCRIPT_OLD()]) {
    try {
      if (!fs.existsSync(p)) continue;
      return { text: fs.readFileSync(p, 'utf8'), at: fs.statSync(p).mtimeMs };
    } catch { /* 다음 후보로 */ }
  }
  return null;
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
    filters: [{ name: '원고 파일', extensions: ['html', 'htm', 'txt'] },
              { name: '모든 파일', extensions: ['*'] }],
    properties: ['openFile']
  });
  if (r.canceled || !r.filePaths[0]) return null;
  try { return fs.readFileSync(r.filePaths[0], 'utf8'); } catch { return null; }
});

ipcMain.handle('script:export', async (_e, text) => {
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
  const r = await dialog.showSaveDialog(consoleWin, {
    title: '원고 저장',
    defaultPath: `prompter_${stamp}.html`,
    filters: [{ name: '원고 파일 (색 유지)', extensions: ['html'] },
              { name: '텍스트 파일', extensions: ['txt'] }]
  });
  if (r.canceled || !r.filePath) return false;
  try { fs.writeFileSync(r.filePath, text ?? '', 'utf8'); return true; } catch { return false; }
});

// ── 업데이트 ───────────────────────────────────────────────
const updater = createUpdater({ win: () => consoleWin, configDir: dir });
ipcMain.handle('update:version', () => app.getVersion());
ipcMain.handle('update:check', () => updater.check());
ipcMain.handle('update:download', () => updater.download());
ipcMain.handle('update:cancel', () => { updater.cancel(); return true; });
ipcMain.handle('update:pick', () => updater.pickFile());
ipcMain.handle('update:install', () => updater.install());

// ── 수명 ───────────────────────────────────────────────────
app.whenReady().then(createConsole);
app.on('window-all-closed', () => { stopAsr(); app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createConsole(); });
