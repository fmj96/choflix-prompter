/**
 * 업데이트 — 두 가지 길.
 *
 *  1. 인터넷이 되면 GitHub Releases 의 최신 설치 파일을 받는다.
 *  2. 인터넷이 없으면(실제 프롬프터 PC) USB · NAS 에 둔 설치 파일을 고른다.
 *
 * 어느 쪽이든 마지막은 같다 — 설치 파일을 조용히(/S) 돌리고 프로그램을 닫는다.
 * 설치 파일이 끝나면 프로그램을 다시 띄운다(/RUN). 설치 위치는 설치 파일이
 * 레지스트리에서 이전 위치를 읽어 그대로 쓴다.
 *
 * 저절로 받거나 설치하지 않는다. 방송 PC 에서 250MB 를 몰래 받거나
 * 갑자기 닫히면 안 된다. 시작할 때 새 버전이 있는지만 확인해 알리고,
 * 받기 · 설치는 운영자가 누를 때만 한다.
 */
const { app, net, dialog, shell } = require('electron');
const { spawn } = require('child_process');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

const REPO = 'fmj96/choflix-prompter';
const SETUP_RE = /^ChoflixPrompter-Setup-(\d+\.\d+\.\d+)\.exe$/i;

/** '3.10.0' > '3.9.2' 처럼 숫자로 비교한다. 글자로 비교하면 틀린다. */
function newer(a, b) {
  const x = String(a).replace(/^v/, '').split('.').map(Number);
  const y = String(b).replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0);
  }
  return false;
}

function createUpdater({ win, configDir }) {
  const PREFS = () => path.join(configDir(), 'update.json');
  const send = m => { const w = win(); if (w && !w.isDestroyed()) w.webContents.send('update:msg', m); };

  let latest = null;          // { version, url, size, sha256, notes, page }
  let downloaded = null;      // 받아 둔 설치 파일 경로
  let abort = null;

  const prefs = () => { try { return JSON.parse(fs.readFileSync(PREFS(), 'utf8')); } catch { return {}; } };
  const savePrefs = p => { try { fs.writeFileSync(PREFS(), JSON.stringify({ ...prefs(), ...p }, null, 2)); } catch {} };

  /** GitHub 에 새 버전이 있는지 본다. 인터넷이 없으면 조용히 '확인 불가' 로 끝난다. */
  async function check() {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 8000);
    try {
      const res = await net.fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
        headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'ChoflixPrompter' },
        signal: ctl.signal
      });
      if (!res.ok) throw new Error(`GitHub 응답 ${res.status}`);
      const r = await res.json();
      const asset = (r.assets || []).find(a => SETUP_RE.test(a.name));
      const version = String(r.tag_name || '').replace(/^v/, '');
      latest = asset ? {
        version,
        url: asset.browser_download_url,
        size: asset.size,
        sha256: /^sha256:/.test(asset.digest || '') ? asset.digest.slice(7).toLowerCase() : null,
        notes: r.body || '',
        page: r.html_url
      } : null;
      const has = !!latest && newer(version, app.getVersion());
      return { ok: true, current: app.getVersion(), latest: latest?.version ?? version, available: has,
               size: latest?.size ?? 0, page: r.html_url };
    } catch (e) {
      return { ok: false, current: app.getVersion(),
               error: e.name === 'AbortError' ? '응답 없음 (인터넷 연결 없음)' : '인터넷에 연결할 수 없습니다' };
    } finally { clearTimeout(t); }
  }

  /** 받은 설치 파일이 GitHub 이 알려 준 것과 같은지 sha256 으로 확인한다. */
  async function download() {
    if (!latest) return { ok: false, error: '먼저 업데이트를 확인하십시오.' };
    const file = path.join(app.getPath('temp'), `ChoflixPrompter-Setup-${latest.version}.exe`);
    abort = new AbortController();
    const out = fs.createWriteStream(file + '.part');
    const hash = crypto.createHash('sha256');
    try {
      const res = await net.fetch(latest.url, { signal: abort.signal });
      if (!res.ok) throw new Error(`내려받기 실패 (${res.status})`);
      const total = Number(res.headers.get('content-length')) || latest.size || 0;
      let got = 0, last = 0;
      const reader = res.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        hash.update(value);
        if (!out.write(value)) await new Promise(ok => out.once('drain', ok));
        got += value.length;
        const now = Date.now();
        if (now - last > 200) { last = now; send({ t: 'progress', got, total }); }
      }
      await new Promise((ok, fail) => out.end(e => e ? fail(e) : ok()));
      send({ t: 'progress', got, total });

      const sum = hash.digest('hex');
      if (latest.sha256 && sum !== latest.sha256) throw new Error('받은 파일이 손상되었습니다 (sha256 불일치). 다시 받으십시오.');
      fs.renameSync(file + '.part', file);
      downloaded = file;
      return { ok: true, version: latest.version, verified: !!latest.sha256 };
    } catch (e) {
      out.destroy();
      try { fs.unlinkSync(file + '.part'); } catch {}
      return { ok: false, error: e.name === 'AbortError' ? '취소했습니다.' : e.message };
    } finally { abort = null; }
  }

  function cancel() { abort?.abort(); }

  /** USB · NAS 에 둔 설치 파일을 고른다. 지난번 고른 폴더에서 연다. */
  async function pickFile() {
    const r = await dialog.showOpenDialog(win(), {
      title: '업데이트 설치 파일 고르기',
      defaultPath: prefs().dir || app.getPath('downloads'),
      filters: [{ name: 'CHOFLIX PROMPTER 설치 파일', extensions: ['exe'] }],
      properties: ['openFile']
    });
    if (r.canceled || !r.filePaths[0]) return { ok: false, canceled: true };
    const file = r.filePaths[0];
    savePrefs({ dir: path.dirname(file) });
    const m = SETUP_RE.exec(path.basename(file));
    if (!m) return { ok: false, error: `CHOFLIX PROMPTER 설치 파일이 아닙니다.\n(파일 이름: ChoflixPrompter-Setup-버전.exe)` };
    downloaded = file;
    return { ok: true, version: m[1], current: app.getVersion(), newer: newer(m[1], app.getVersion()) };
  }

  /** 설치 파일을 조용히 돌리고 닫는다. 설치가 끝나면 설치 파일이 프로그램을 다시 띄운다. */
  function install() {
    if (!downloaded || !fs.existsSync(downloaded)) return { ok: false, error: '설치 파일이 없습니다.' };
    if (process.platform !== 'win32') {         // 개발용 Mac 에서는 폴더만 열어 준다
      shell.showItemInFolder(downloaded);
      return { ok: false, error: 'Windows 에서만 설치할 수 있습니다.' };
    }
    spawn(downloaded, ['/S', '/RUN'], { detached: true, stdio: 'ignore' }).unref();
    setTimeout(() => app.quit(), 300);
    return { ok: true };
  }

  return { check, download, cancel, pickFile, install };
}

module.exports = { createUpdater, newer };
