#!/usr/bin/env node
/**
 * 음성 인식에 쓰는 한국어 모델과 Windows 네이티브 모듈을 받아 온다.
 *
 * 둘 다 용량 때문에 저장소에 넣지 않는다 (모델 134MB, 네이티브 22MB).
 * 새 PC 에서 처음 빌드할 때 한 번만 받으면 된다.
 */
import { execFileSync } from 'child_process';
import { existsSync, mkdirSync, rmSync, renameSync, readdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const say = m => console.log(`  ${m}`);

const MODEL = 'sherpa-onnx-streaming-zipformer-korean-2024-06-16';
const MODEL_URL =
  `https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/${MODEL}.tar.bz2`;
const NATIVE = 'sherpa-onnx-win-x64@1.13.8';

console.log('\n  CHOFLIX PROMPTER — 음성 추종 자료 받기\n');

// ── 인식 모델 ────────────────────────────────────────────
const modelDir = path.join(root, 'models', 'ko');
if (existsSync(path.join(modelDir, 'tokens.txt'))) {
  say('인식 모델 — 이미 있음');
} else {
  say(`내려받는 중 — ${MODEL} (약 400MB)`);
  const tmp = path.join(root, '.cache', 'model');
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  execFileSync('curl', ['-L', '-o', path.join(tmp, 'm.tar.bz2'), MODEL_URL], { stdio: 'inherit' });
  execFileSync('tar', ['xjf', path.join(tmp, 'm.tar.bz2'), '-C', tmp], { stdio: 'inherit' });

  // 실제로 쓰는 것은 int8 네 개뿐이다. 나머지는 버린다.
  mkdirSync(modelDir, { recursive: true });
  for (const f of ['encoder-epoch-99-avg-1.int8.onnx', 'decoder-epoch-99-avg-1.onnx',
                   'joiner-epoch-99-avg-1.int8.onnx', 'tokens.txt']) {
    renameSync(path.join(tmp, MODEL, f), path.join(modelDir, f));
  }
  rmSync(tmp, { recursive: true, force: true });
  say('인식 모델 — 완료 (134MB)');
}

// ── Windows 네이티브 모듈 ────────────────────────────────
const vendor = path.join(root, 'vendor', 'sherpa-onnx-win-x64');
if (existsSync(path.join(vendor, 'sherpa-onnx.node'))) {
  say('Windows 네이티브 — 이미 있음');
} else {
  // npm 이 플랫폼으로 막으므로 tarball 을 직접 받아 푼다
  say(`내려받는 중 — ${NATIVE}`);
  const tmp = path.join(root, '.cache', 'native');
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  execFileSync('npm', ['pack', NATIVE], { cwd: tmp, stdio: 'inherit' });
  const tgz = readdirSync(tmp).find(f => f.endsWith('.tgz'));
  mkdirSync(vendor, { recursive: true });
  execFileSync('tar', ['xzf', path.join(tmp, tgz), '-C', vendor, '--strip-components=1']);
  rmSync(tmp, { recursive: true, force: true });
  say('Windows 네이티브 — 완료 (22MB)');
}

console.log('\n  준비 끝. npm run build:win 으로 포장하십시오.\n');
