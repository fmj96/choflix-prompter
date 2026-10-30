#!/usr/bin/env node
/**
 * Windows 설치 파일 만들기 — dist 의 배포본 폴더를 NSIS 로 감싼다.
 *
 * Mac 용 makensis 가 그대로 돌아서 wine 이 필요 없다 (brew install makensis).
 * 먼저 pack-win.mjs 로 배포본 폴더를 만들어 두어야 한다 — npm run build:setup 이 둘을 잇는다.
 *
 * 결과물 이름(ChoflixPrompter-Setup-버전.exe)을 바꾸지 마십시오.
 * 프로그램의 업데이트 기능이 이 이름으로 설치 파일을 알아보고 버전을 읽습니다.
 */
import { existsSync, readFileSync, statSync } from 'fs';
import { execFileSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const src = path.join(root, 'dist', 'ChoflixPrompter-win32-x64');
const out = path.join(root, 'dist', `ChoflixPrompter-Setup-${pkg.version}.exe`);

const say = m => console.log(`  ${m}`);

console.log(`\n  CHOFLIX PROMPTER — 설치 파일 만들기 (v${pkg.version})\n`);

try { execFileSync('makensis', ['-VERSION'], { stdio: 'ignore' }); }
catch { console.error('  makensis 가 없습니다. brew install makensis 로 설치하십시오.\n'); process.exit(1); }

if (!existsSync(path.join(src, 'ChoflixPrompter.exe'))) {
  console.error('  배포본 폴더가 없습니다. 먼저 npm run build:win 을 하십시오.\n');
  process.exit(1);
}

// 폴더의 버전이 package.json 과 다르면 예전 배포본을 감싸게 된다
const inside = JSON.parse(readFileSync(path.join(src, 'resources', 'app', 'package.json'), 'utf8')).version;
if (inside !== pkg.version) {
  console.error(`  배포본 폴더는 v${inside} 입니다 (package.json 은 v${pkg.version}). npm run build:win 을 다시 하십시오.\n`);
  process.exit(1);
}

say('압축하는 중... (수 분 걸립니다)');
execFileSync('makensis', [
  '-V2', '-INPUTCHARSET', 'UTF8',
  `-DVERSION=${pkg.version}`,
  `-DSRC=${src}`,
  `-DOUTFILE=${out}`,
  `-DICON=${path.join(root, 'build', 'app.ico')}`,
  path.join(root, 'installer', 'setup.nsi')
], {
  stdio: 'inherit',
  // Mac 용 makensis 는 로캘이 UTF-8 이 아니면(ko_KR 포함) 한글 스크립트를 'Bad text encoding' 으로 거부한다
  env: { ...process.env, LC_ALL: 'en_US.UTF-8' }
});

say(`완료 — dist/${path.basename(out)} (${(statSync(out).size / 1048576).toFixed(0)}MB)\n`);
