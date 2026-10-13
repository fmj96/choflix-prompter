#!/usr/bin/env node
/**
 * Windows 배포본 만들기 — wine 없이.
 *
 * electron-packager 는 package.json 의 version 을 exe 안에 심으려 하고,
 * 그 작업이 Windows 실행 파일의 리소스를 고쳐 쓰는 일이라 macOS 에서는 wine 을 요구한다.
 * 정작 필요한 것은 "Electron 공식 Windows 배포본에 우리 앱을 넣는 것"뿐이므로 직접 한다.
 */
import { mkdirSync, existsSync, rmSync, cpSync, renameSync, createWriteStream,
         readFileSync, writeFileSync } from 'fs';
import { execFileSync } from 'child_process';
import { NtExecutable, NtExecutableResource, Resource, Data } from 'resedit';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERSION = process.env.ELECTRON_VERSION || '33.4.11';
const NAME = 'ChoflixPrompter';

const zipName = `electron-v${VERSION}-win32-x64.zip`;
const url = `https://github.com/electron/electron/releases/download/v${VERSION}/${zipName}`;
const cache = path.join(root, '.cache');
const zipPath = path.join(cache, zipName);
const out = path.join(root, 'dist', `${NAME}-win32-x64`);

const say = m => console.log(`  ${m}`);

async function download() {
  if (existsSync(zipPath)) { say(`받아 둔 파일 사용 — ${zipName}`); return; }
  mkdirSync(cache, { recursive: true });
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
  await pipeline(body, createWriteStream(zipPath));
  process.stdout.write('\n');
}

async function main() {
  console.log(`\n  CHOFLIX PROMPTER — Windows 배포본 만들기 (Electron v${VERSION})\n`);

  await download();

  say('풀어내는 중...');
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  execFileSync('unzip', ['-q', zipPath, '-d', out], { stdio: 'inherit' });

  say('앱 넣는 중...');
  rmSync(path.join(out, 'resources', 'default_app.asar'), { force: true });
  const app = path.join(out, 'resources', 'app');
  mkdirSync(app, { recursive: true });
  cpSync(path.join(root, 'src'), path.join(app, 'src'), { recursive: true });
  cpSync(path.join(root, 'build'), path.join(app, 'build'), { recursive: true });
  cpSync(path.join(root, 'package.json'), path.join(app, 'package.json'));

  voice(app);

  const exe = path.join(out, 'electron.exe');
  const target = path.join(out, `${NAME}.exe`);
  if (existsSync(exe)) renameSync(exe, target);

  say('아이콘 · 이름 심는 중...');
  brand(target);

  console.log(`\n  완료 — dist/${NAME}-win32-x64/${NAME}.exe`);
  console.log('  이 폴더를 통째로 압축해 프롬프터 PC 로 옮기십시오.\n');
}

/**
 * 음성 추종에 필요한 것을 넣는다 — 인식 모델과 Windows 네이티브 모듈.
 *
 * 없으면 건너뛴다. 음성 추종을 안 쓰는 배포본도 만들 수 있어야 한다.
 * 모델은 용량 때문에 저장소에 넣지 않으므로(134MB) 빠져 있을 수 있다.
 */
function voice(app) {
  const model = path.join(root, 'models', 'ko');
  const native = path.join(root, 'vendor', 'sherpa-onnx-win-x64');
  const js = path.join(root, 'node_modules', 'sherpa-onnx-node');

  const missing = [
    [model, 'models/ko (인식 모델)'],
    [native, 'vendor/sherpa-onnx-win-x64 (Windows 네이티브)'],
    [js, 'node_modules/sherpa-onnx-node'],
  ].filter(([p]) => !existsSync(p));

  if (missing.length) {
    say('음성 추종 빼고 포장 — 없는 것:');
    missing.forEach(([, n]) => say(`  · ${n}`));
    say('  BUILD.md 의 "음성 추종" 항목을 보십시오.');
    return;
  }

  say('음성 추종 넣는 중...');
  cpSync(model, path.join(app, 'models', 'ko'), { recursive: true });
  // addon.js 가 '../sherpa-onnx-win-x64/sherpa-onnx.node' 를 찾으므로 형제로 둔다
  const nm = path.join(app, 'node_modules');
  cpSync(js, path.join(nm, 'sherpa-onnx-node'), { recursive: true });
  cpSync(native, path.join(nm, 'sherpa-onnx-win-x64'), { recursive: true });
  say('인식 모델 + 네이티브 모듈 포함');
}

/**
 * exe 에 아이콘과 이름을 심는다.
 *
 * electron-packager 가 wine 을 요구하던 바로 그 작업인데,
 * resedit 은 PE 리소스를 자바스크립트로 직접 고쳐 쓰므로 wine 이 필요 없다.
 * 이걸 하지 않으면 작업표시줄과 탐색기에 Electron 기본 아이콘이 그대로 나온다.
 */
function brand(exePath) {
  const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
  const bin = NtExecutable.from(readFileSync(exePath));
  const res = NtExecutableResource.from(bin);

  const icon = Data.IconFile.from(readFileSync(path.join(root, 'build', 'app.ico')));
  Resource.IconGroupEntry.replaceIconsForResource(
    res.entries, 1, 1033, icon.icons.map(i => i.data));   // 1033 = en-US, 리소스 표준 언어

  const [ver] = Resource.VersionInfo.fromEntries(res.entries);
  if (ver) {
    const n = pkg.version.split('.').map(Number);
    ver.setFileVersion(n[0] ?? 0, n[1] ?? 0, n[2] ?? 0, 0);
    ver.setProductVersion(n[0] ?? 0, n[1] ?? 0, n[2] ?? 0, 0);
    ver.setStringValues({ lang: 1033, codepage: 1200 }, {
      FileDescription: 'CHOFLIX PROMPTER',
      ProductName: 'CHOFLIX PROMPTER',
      CompanyName: pkg.author,
      LegalCopyright: `© ${new Date().getFullYear()} ${pkg.author}`,
      OriginalFilename: path.basename(exePath),
      InternalName: NAME
    });
    ver.outputToResourceEntries(res.entries);
  }

  res.outputResource(bin);
  writeFileSync(exePath, Buffer.from(bin.generate()));
  say(`아이콘 ${icon.icons.length}종 · 버전 ${pkg.version}`);
}

main().catch(e => { console.error(`\n  ${e.message}\n`); process.exit(1); });
