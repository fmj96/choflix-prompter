#!/usr/bin/env node
/**
 * Mac(Apple Silicon) 배포본 — dmg 만들기.
 *
 * pack-win.mjs 와 같은 방식이다. Electron 공식 darwin-arm64 배포본을 받아
 * Contents/Resources/app 에 우리 앱을 넣고, 이름 · 아이콘 · 버전을 고친 뒤 dmg 로 싼다.
 *
 * 조립은 반드시 로컬 디스크(임시 폴더)에서 한다. 이 저장소는 NAS(SMB) 위에 있는데,
 * SMB 는 .app 안의 심볼릭 링크와 서명 정보를 제대로 담지 못해 앱이 깨진다.
 * 다 만든 dmg 만 dist/ 로 옮긴다.
 *
 * 서명은 ad-hoc(-) 이다. Apple Silicon 은 서명 없는 코드를 아예 돌리지 않으므로
 * 내용을 고친 뒤 반드시 다시 서명해야 한다. 공증(notarization)은 개발자 계정이 있어야 해서
 * 하지 않았다 — 처음 열 때 Gatekeeper 가 막으면 BUILD.md 의 안내대로 연다.
 */
import { mkdirSync, existsSync, rmSync, cpSync, renameSync, createWriteStream,
         readFileSync, readdirSync, symlinkSync, copyFileSync, statSync } from 'fs';
import { execFileSync } from 'child_process';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const VERSION = process.env.ELECTRON_VERSION || '33.4.11';
const APP = 'CHOFLIX PROMPTER';
const BUNDLE_ID = 'com.choflix.prompter';

const zipName = `electron-v${VERSION}-darwin-arm64.zip`;
const url = `https://github.com/electron/electron/releases/download/v${VERSION}/${zipName}`;
const zipPath = path.join(root, '.cache', zipName);
const work = path.join(os.tmpdir(), 'choflix-prompter-mac');      // 로컬 디스크
const app = path.join(work, 'stage', `${APP}.app`);
// 이 이름을 바꾸지 마십시오 — 업데이트 기능이 이 이름으로 릴리스 첨부 파일을 찾습니다
const dmg = path.join(root, 'dist', `ChoflixPrompter-${pkg.version}-mac-arm64.dmg`);

const say = m => console.log(`  ${m}`);
const run = (cmd, args) => execFileSync(cmd, args, { stdio: ['ignore', 'ignore', 'inherit'] });

async function download() {
  if (existsSync(zipPath)) { say(`받아 둔 파일 사용 — ${zipName}`); return; }
  mkdirSync(path.dirname(zipPath), { recursive: true });
  say(`내려받는 중 — ${url}`);
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`내려받기 실패 (${res.status}). 인터넷 연결을 확인하십시오.`);
  const total = Number(res.headers.get('content-length') || 0);
  let got = 0;
  const body = Readable.fromWeb(res.body);
  body.on('data', c => {
    got += c.length;
    if (total) process.stdout.write(`\r  ${(got / 1048576).toFixed(1)} / ${(total / 1048576).toFixed(1)} MB`);
  });
  await pipeline(body, createWriteStream(zipPath + '.part'));
  renameSync(zipPath + '.part', zipPath);
  process.stdout.write('\n');
}

async function main() {
  console.log(`\n  CHOFLIX PROMPTER — Mac 배포본 만들기 (v${pkg.version}, Electron v${VERSION} arm64)\n`);
  if (process.platform !== 'darwin') throw new Error('Mac 에서만 만들 수 있습니다 (codesign · hdiutil).');

  await download();

  say('풀어내는 중...');
  rmSync(work, { recursive: true, force: true });
  mkdirSync(path.dirname(app), { recursive: true });
  run('ditto', ['-x', '-k', zipPath, path.join(work, 'x')]);       // 심볼릭 링크를 지키려면 ditto
  renameSync(path.join(work, 'x', 'Electron.app'), app);

  say('앱 넣는 중...');
  const res = path.join(app, 'Contents', 'Resources');
  rmSync(path.join(res, 'default_app.asar'), { force: true });
  const dst = path.join(res, 'app');
  mkdirSync(dst, { recursive: true });
  cpSync(path.join(root, 'src'), path.join(dst, 'src'), { recursive: true });
  cpSync(path.join(root, 'build'), path.join(dst, 'build'), { recursive: true });
  copyFileSync(path.join(root, 'package.json'), path.join(dst, 'package.json'));
  voice(dst);

  say('아이콘 · 이름 심는 중...');
  icon(path.join(res, 'electron.icns'));
  plist(path.join(app, 'Contents', 'Info.plist'));

  say('서명하는 중 (ad-hoc)...');
  sign();

  say('dmg 만드는 중...');
  const stage = path.join(work, 'stage');
  symlinkSync('/Applications', path.join(stage, 'Applications'));  // 끌어다 놓을 자리
  const tmpDmg = path.join(work, path.basename(dmg));
  run('hdiutil', ['create', '-volname', APP, '-srcfolder', stage, '-fs', 'APFS',
                  '-format', 'UDZO', '-ov', tmpDmg]);
  mkdirSync(path.dirname(dmg), { recursive: true });
  copyFileSync(tmpDmg, dmg);
  rmSync(work, { recursive: true, force: true });

  say(`완료 — dist/${path.basename(dmg)} (${(statSync(dmg).size / 1048576).toFixed(0)}MB)\n`);
}

/** 음성 추종 — Windows 판과 같되, 네이티브 모듈만 darwin-arm64 것을 넣는다. */
function voice(dst) {
  const model = path.join(root, 'models', 'ko');
  const js = path.join(root, 'node_modules', 'sherpa-onnx-node');
  const native = path.join(root, 'node_modules', 'sherpa-onnx-darwin-arm64');
  const missing = [[model, 'models/ko'], [js, 'node_modules/sherpa-onnx-node'],
                   [native, 'node_modules/sherpa-onnx-darwin-arm64']].filter(([p]) => !existsSync(p));
  if (missing.length) {
    say('음성 추종 빼고 포장 — 없는 것: ' + missing.map(([, n]) => n).join(', '));
    return;
  }
  cpSync(model, path.join(dst, 'models', 'ko'), { recursive: true });
  // addon.js 가 '../sherpa-onnx-darwin-arm64/sherpa-onnx.node' 를 찾으므로 형제로 둔다
  cpSync(js, path.join(dst, 'node_modules', 'sherpa-onnx-node'), { recursive: true });
  cpSync(native, path.join(dst, 'node_modules', 'sherpa-onnx-darwin-arm64'), { recursive: true });
  say('인식 모델 + 네이티브 모듈 포함');
}

/** build/icon.png(512px) 로 icns 를 만든다. 없으면 Dock 에 Electron 아이콘이 그대로 나온다. */
function icon(target) {
  const set = path.join(work, 'app.iconset');
  mkdirSync(set, { recursive: true });
  const src = path.join(root, 'build', 'icon.png');
  for (const s of [16, 32, 128, 256, 512]) {
    run('sips', ['-z', String(s), String(s), src, '--out', path.join(set, `icon_${s}x${s}.png`)]);
    if (s <= 256) run('sips', ['-z', String(s * 2), String(s * 2), src, '--out', path.join(set, `icon_${s}x${s}@2x.png`)]);
  }
  run('iconutil', ['-c', 'icns', set, '-o', target]);
}

function plist(p) {
  const set = (k, v) => run('plutil', ['-replace', k, '-string', v, p]);
  set('CFBundleName', APP);
  set('CFBundleDisplayName', APP);
  set('CFBundleIdentifier', BUNDLE_ID);
  set('CFBundleShortVersionString', pkg.version);
  set('CFBundleVersion', pkg.version);
  set('NSHumanReadableCopyright', `© ${new Date().getFullYear()} ${pkg.author} · MIT`);
  // 음성 추종이 마이크를 쓴다. 이 문구가 없으면 macOS 가 묻지도 않고 막는다.
  set('NSMicrophoneUsageDescription', '음성 추종 — 강의자가 읽는 자리에 맞춰 주행 속도를 맞추는 데 마이크를 씁니다.');
}

/** 안쪽부터 서명한다. --deep 은 Resources 안의 .node · .dylib 까지는 챙기지 않는다. */
function sign() {
  const loose = [];
  const walk = d => readdirSync(d, { withFileTypes: true }).forEach(e => {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(node|dylib)$/.test(e.name)) loose.push(p);
  });
  walk(path.join(app, 'Contents', 'Resources', 'app'));
  for (const f of loose) run('codesign', ['--force', '--sign', '-', f]);
  run('codesign', ['--force', '--deep', '--sign', '-', app]);
  run('codesign', ['--verify', '--deep', '--strict', app]);
}

main().catch(e => { console.error(`\n  ${e.message}\n`); process.exit(1); });
