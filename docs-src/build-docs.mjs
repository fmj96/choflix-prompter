#!/usr/bin/env node
/**
 * 사용설명서 PDF · 단축키 스티커 JPG 만들기.
 *
 * 문서 원본을 HTML 로 둔 것은, 프로그램 화면과 같은 방식으로 손볼 수 있고
 * 조판 도구를 따로 설치하지 않아도 되기 때문이다. 인쇄는 headless Chrome 이 한다.
 *
 *   node docs-src/build-docs.mjs [출력폴더]
 *
 * 기본 출력 폴더는 저장소 바깥의 ../문서 이다.
 * 만들어진 PDF·JPG 는 저장소에 넣지 않는다 (원본 HTML 로 언제든 다시 만든다).
 */
import { execFileSync, spawn } from 'child_process';
import { mkdirSync, existsSync, rmSync, readFileSync, writeFileSync, statSync } from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const VERSION = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const out = path.resolve(process.argv[2] || path.join(root, '..', '문서'));

const CHROME = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser'
].find(existsSync);
if (!CHROME) throw new Error('Chrome 을 찾지 못했습니다. 이 스크립트는 Chrome 으로 인쇄합니다.');

/*
 * 작업 폴더는 반드시 로컬 디스크에 둔다.
 * 이 저장소가 NAS(SMB) 위에 있을 때 Chrome 의 프로파일을 거기에 두면
 * GPU 프로세스가 뜨지 못해 화면 촬영이 통째로 실패한다.
 */
const tmp = path.join(os.tmpdir(), 'choflix-docs');
rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });
mkdirSync(out, { recursive: true });

const say = m => console.log(`  ${m}`);

/**
 * Chrome 은 인쇄를 마치고도 곱게 끝나지 않는다.
 * 시간 제한에 걸리거나 SIGTRAP 으로 죽는 일이 흔하다.
 * 그래서 종료 코드가 아니라 파일이 나왔는지로 성공을 판단한다.
 */
const wait = ms => new Promise(r => setTimeout(r, ms));

/**
 * Chrome 은 인쇄를 마치고도 곱게 끝나지 않는다 — 그냥 남아 있기도 하고
 * SIGTRAP 으로 죽기도 한다. 그래서 프로세스가 아니라 결과 파일을 기다린다.
 * 크기가 두 번 연속 같아지면 다 쓴 것으로 본다.
 *
 * 프로파일 폴더는 호출마다 새로 준다. 앞의 Chrome 이 아직 붙들고 있으면 다음이 못 뜬다.
 */
let run = 0;
async function chrome(target, args) {
  const proc = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars',
    '--no-first-run', '--no-default-browser-check',
    `--user-data-dir=${path.join(tmp, 'profile' + ++run)}`, ...args
  ], { stdio: 'ignore', detached: true });

  let last = -1;
  try {
    for (let i = 0; i < 120; i++) {          // 최대 60초
      await wait(500);
      if (!existsSync(target)) continue;
      const size = statSync(target).size;
      if (size > 0 && size === last) return;
      last = size;
    }
    throw new Error('시간 안에 파일이 나오지 않았습니다.');
  } finally {
    try { process.kill(-proc.pid); } catch { try { proc.kill(); } catch {} }
  }
}

async function manual() {
  const raw = path.join(tmp, 'manual.pdf');
  say('사용설명서 인쇄 중...');
  await chrome(raw, ['--no-pdf-header-footer', `--print-to-pdf=${raw}`,
                     '--virtual-time-budget=10000', `file://${path.join(here, 'manual.html')}`]);

  // 쪽 번호는 CSS 로 넣을 수 없어 인쇄한 뒤에 얹는다 (표지 제외)
  const doc = await PDFDocument.load(readFileSync(raw));
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const pages = doc.getPages();
  // 꼬리말과 쪽 번호는 CSS 로 넣을 수 없어 인쇄한 뒤에 얹는다. 표지는 건너뛴다.
  const grey = rgb(.62, .65, .69);
  pages.forEach((p, i) => {
    if (i === 0) return;
    const n = String(i + 1);
    p.drawText(`CHOFLIX PROMPTER  ·  v${VERSION}`,
               { x: 45, y: 24, size: 7.5, font, color: grey });
    p.drawText(n, { x: p.getWidth() - 45 - font.widthOfTextAtSize(n, 7.5),
                    y: 24, size: 7.5, font, color: grey });
  });
  doc.setTitle('CHOFLIX PROMPTER 사용설명서');
  doc.setAuthor('CHOFLIX AI LAB');
  doc.setSubject(`방송용 프롬프터 사용설명서 v${VERSION}`);

  const dest = path.join(out, `CHOFLIX_PROMPTER_사용설명서_v${VERSION}.pdf`);
  writeFileSync(dest, await doc.save());
  say(`사용설명서 ${pages.length}쪽 → ${path.basename(dest)}`);
}

async function sticker() {
  // 7 × 7 cm @ 600dpi = 1653 px. 551px 로 그리고 3배로 찍는다.
  const png = path.join(tmp, 'sticker.png');
  say('스티커 인쇄 중...');
  await chrome(png, ['--window-size=551,551', '--force-device-scale-factor=3',
                     `--screenshot=${png}`, '--virtual-time-budget=8000',
                     `file://${path.join(here, 'sticker.html')}`]);

  const dest = path.join(out, `CHOFLIX_PROMPTER_단축키_7x7cm_v${VERSION}.jpg`);
  execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '95',
                        '-s', 'dpiWidth', '600', '-s', 'dpiHeight', '600',
                        png, '--out', dest], { stdio: 'ignore' });
  const size = execFileSync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', dest]).toString();
  say(`스티커 ${size.match(/pixelWidth: (\d+)/)[1]}×${size.match(/pixelHeight: (\d+)/)[1]}px @600dpi → ${path.basename(dest)}`);
}

console.log(`\n  CHOFLIX PROMPTER — 문서 만들기 (v${VERSION})\n`);
await manual();
await sticker();
rmSync(tmp, { recursive: true, force: true });
console.log(`\n  완료 — ${out}\n`);
