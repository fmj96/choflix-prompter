#!/usr/bin/env node
/**
 * Windows 배포본 만들기 — wine 없이.
 *
 * electron-packager 는 package.json 의 version 을 exe 안에 심으려 하고,
 * 그 작업이 Windows 실행 파일의 리소스를 고쳐 쓰는 일이라 macOS 에서는 wine 을 요구한다.
 * 정작 필요한 것은 "Electron 공식 Windows 배포본에 우리 앱을 넣는 것"뿐이므로 직접 한다.
 */
import { mkdirSync, existsSync, rmSync, cpSync, renameSync, createWriteStream } from 'fs';
import { execFileSync } from 'child_process';
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

  const exe = path.join(out, 'electron.exe');
  if (existsSync(exe)) renameSync(exe, path.join(out, `${NAME}.exe`));

  console.log(`\n  완료 — dist/${NAME}-win32-x64/${NAME}.exe`);
  console.log('  이 폴더를 통째로 압축해 프롬프터 PC 로 옮기십시오.\n');
}

main().catch(e => { console.error(`\n  ${e.message}\n`); process.exit(1); });
