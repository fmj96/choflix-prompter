const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

// ══ 기본값 ═══════════════════════════════════════════════
const FONTS = ['맑은 고딕', '나눔고딕', 'Noto Sans KR', '본고딕', '굴림', '바탕', '돋움', 'Segoe UI', 'Arial'];
const INKS  = ['#FFFFFF', '#FFF3C4', '#FFD24B', '#C8F0A0', '#BFE3FF', '#000000'];
const BACKS = ['#000000', '#101010', '#0A0F1E', '#0B1A10', '#FFFFFF'];
const CUES  = ['#F0A020', '#E23B34', '#35C6E8', '#7CDA6A', '#9B9B9B'];

const DEFAULTS = {
  font: '맑은 고딕', size: 76, lineHeight: 1.45, side: 8,
  align: 'center', weight: '700',
  ink: '#FFFFFF', back: '#000000', cue: '#F0A020',
  showCue: true, cuePos: 35, talentTimer: true,
  editorPreview: true, keepAll: true,
  speed: 55, mouseCtl: true,
  output: 'duplicate', displayId: null,
  mirrorBy: 'monitor', mirrorH: false, mirrorV: false,
  showStats: false, logging: false
};

const KEY_DEFS = [
  ['togglePrompter', '프롬프터 (중간부터)', { code: 'F5', shift: true }],
  ['startTop',       '프롬프터 (처음부터)', { code: 'F5' }],
  ['toggleRun',      '시작 / 정지',        { code: 'Space' }],
  ['reset',          '처음으로',           { code: 'F6' }],
  ['speedUp',        '속도 올리기',         { code: 'ArrowDown' }],
  ['speedDown',      '속도 내리기',         { code: 'ArrowUp' }],
  ['nudgeUp',        '위로 미세 이동',      { code: 'ArrowUp', shift: true }],
  ['nudgeDown',      '아래로 미세 이동',    { code: 'ArrowDown', shift: true }],
  ['pageUp',         '반 화면 위로',        { code: 'PageUp' }],
  ['pageDown',       '반 화면 아래로',      { code: 'PageDown' }],
  ['fontSmaller',    '글자 작게',          { code: 'ArrowLeft' }],
  ['fontLarger',     '글자 크게',          { code: 'ArrowRight' }],
  ['toggleBar',      '운영자 바 표시',      { code: 'Tab' }],
  ['exit',           '프롬프터 닫기',       { code: 'Escape' }]
];

const MOUSE_DEFS = [
  ['시작 / 정지', '왼쪽 클릭'],
  ['위아래 이동', '끌기'],
  ['속도 조절 · 주행 중', '휠'],
  ['위아래 이동 · 정지 중', '휠'],
  ['누적 시간 초기화', '누적 숫자 클릭']
];

let S = { ...DEFAULTS };
let KEYS = {};
let text = '';
let promptOpen = false, barShown = false, capturing = null;
let displays = [];

// ══ 표시부 ════════════════════════════════════════════════
const local = new Engine({
  stage: $('#stage'), mirror: $('#mirror'), lines: $('#lines'), cue: $('#cueline'),
  hud: $('#hud'), hudElapsed: $('#hudElapsed'), hudRemain: $('#hudRemain'), fstat: $('#fstat')
});

let remote = false;
let cache = { running: false, elapsed: 0, remain: 0, total: 0, progress: 0, row: 0 };

const send = m => cx.toStage(m);

const stage = {
  apply: s => remote ? send({ t: 'apply', s: { ...s, text } }) : local.apply({ ...s, text }),
  start: () => remote ? send({ t: 'start' }) : local.start(),
  stop:  () => remote ? send({ t: 'stop' })  : local.stop(),
  toggle:() => remote ? send({ t: 'toggle' }): local.toggle(),
  toTop: () => remote ? send({ t: 'toTop' }) : local.toTop(),
  toRow: i => remote ? send({ t: 'toRow', i }) : local.toRow(i),
  nudge: p => remote ? send({ t: 'nudge', p }) : local.nudge(p),
  page:  f => remote ? send({ t: 'page', f })  : local.page(f),
  resetElapsed: () => remote ? send({ t: 'resetElapsed' }) : local.resetElapsed(),
  relayout: () => remote ? send({ t: 'relayout' }) : local.relayout(),
  get running() { return remote ? cache.running : local.running; },
  get row() { return remote ? cache.row : local.centerRow(); }
};

function onReport(r) {
  if (r.kind === 'speed') { setSpeed(S.speed + r.delta); return; }
  if (r.kind === 'stat') { logStat(r); return; }
  cache = r;
  paintClocks(r);
}
local.onReport = onReport;
cx.onReport(onReport);
cx.onStageClosed(() => { if (promptOpen) exitPrompter(); });

// ══ 시간 표시 ═════════════════════════════════════════════
function fmtSec(s) {
  if (!isFinite(s) || s < 0) s = 0;
  const n = Math.floor(s);
  return [Math.floor(n / 3600), Math.floor(n / 60) % 60, n % 60]
    .map(v => String(v).padStart(2, '0')).join(':');
}

function paintClocks(r) {
  $('#elapsed').textContent = $('#opElapsed').textContent = fmtSec(r.elapsed);
  $('#remain').textContent  = $('#opRemain').textContent  = fmtSec(r.remain);
  $('#total').textContent   = fmtSec(r.total);
  $('#progress').style.width = r.progress + '%';
  const on = r.running;
  $('#lamp').classList.toggle('on', on);
  $('#opLamp').classList.toggle('on', on);
  $('#opRun').textContent = on ? '정지' : '시작';
}

// ══ 설정 반영 ═════════════════════════════════════════════
function applyAll() {
  stage.apply(S);
  paintEditor();
  paintHints();
  cx.saveConfig({ settings: S, keys: KEYS });
}

function paintEditor() {
  const t = $('#script');
  if (!S.editorPreview) {
    Object.assign(t.style, {
      fontFamily: '', fontSize: '15px', fontWeight: '400', textAlign: 'left',
      lineHeight: '1.6', color: '', background: '', padding: '14px 18px', wordBreak: 'normal'
    });
    return;
  }
  const scale = Math.max(0.15, Math.min(1, t.clientWidth / Math.max(320, screen.width)));
  const side = t.clientWidth * S.side / 100;
  Object.assign(t.style, {
    fontFamily: S.font,
    fontSize: Math.max(9, S.size * scale) + 'px',
    fontWeight: S.weight,
    textAlign: S.align,
    lineHeight: S.lineHeight,
    color: S.ink,
    background: S.back,
    padding: `14px ${side}px`,
    wordBreak: S.keepAll ? 'keep-all' : 'normal'
  });
}

function paintHints() {
  const multi = displays.length > 1;
  $('#outHint').textContent = S.output === 'extended'
    ? (multi ? '프롬프터 모니터에 전체화면 창이 따로 열립니다. 운영자 화면에는 원고와 제어판이 그대로 남습니다.'
             : '모니터가 하나만 잡혔습니다. 연결을 확인한 뒤 [모니터 다시 검색] 을 누르십시오.')
    : '이 창이 전체화면이 되어 편집 화면은 가려집니다.';

  $('#mirHint').textContent = S.mirrorBy === 'monitor'
    ? '모니터가 화면을 뒤집으므로 이 프로그램은 정방향으로 출력합니다. 소프트웨어 반전을 함께 켜면 두 번 뒤집혀 유리에서 글이 거꾸로 보입니다.'
    : '하프미러 리그는 보통 좌우 반전만 켜면 됩니다. 빔을 아래에서 위로 쏘는 구조라면 상하 반전도 함께 켜십시오.';

  $('#mirH').disabled = $('#mirV').disabled = S.mirrorBy === 'monitor';
  $('#display').disabled = $('#rescan').disabled = S.output !== 'extended';
}

function setSpeed(v) {
  S.speed = Math.max(10, Math.min(220, Math.round(v)));
  $('#speed').value = $('#opSpeed').value = S.speed;
  $('#speedV').value = $('#opSpeedV').value = S.speed + ' px/s';
  applyAll();
}

// ══ 원고 ══════════════════════════════════════════════════
let saveTimer = null, dirty = false;

function setText(v, fromEditor) {
  text = v;
  if (!fromEditor) $('#script').value = v;
  const all = v.length, noSpace = v.replace(/\s/g, '').length, lines = v.split('\n').length;
  const est = noSpace / 330;
  $('#count').textContent =
    `${lines}줄 · ${all.toLocaleString()}자 (공백 제외 ${noSpace.toLocaleString()}자) · ` +
    `낭독 추정 ${String(Math.floor(est)).padStart(2,'0')}:${String(Math.floor(est%1*60)).padStart(2,'0')}`;
  dirty = true;

  // 글자 한 자마다 원고를 다시 만들면 긴 원고에서 타자가 밀린다.
  // 타자가 멈춘 뒤 한 번만 반영한다. 프롬프터를 열 때는 즉시 반영된다.
  clearTimeout(applyTimer);
  applyTimer = setTimeout(() => stage.apply(S), 200);
}
let applyTimer = null;

setInterval(() => { if (dirty) { dirty = false; cx.saveScript(text); } }, 5000);

// ══ 편집창 ↔ 원고 줄 ══════════════════════════════════════
function caretRow() {
  const t = $('#script');
  return t.value.slice(0, t.selectionStart).split('\n').length - 1;
}

/** 지정한 줄이 편집창 중앙보다 살짝 위에 오도록 스크롤한다. */
function editorToRow(row) {
  const t = $('#script');
  const idx = t.value.split('\n').slice(0, row).reduce((n, l) => n + l.length + 1, 0);
  t.focus();
  t.setSelectionRange(idx, idx);

  const m = document.createElement('div');
  const cs = getComputedStyle(t);
  Object.assign(m.style, {
    position: 'absolute', visibility: 'hidden', whiteSpace: 'pre-wrap',
    wordBreak: cs.wordBreak, overflowWrap: 'break-word',
    width: t.clientWidth + 'px', font: cs.font, lineHeight: cs.lineHeight,
    padding: cs.padding, letterSpacing: cs.letterSpacing, textAlign: cs.textAlign
  });
  m.textContent = t.value.slice(0, idx) || ' ';
  document.body.appendChild(m);
  const y = m.scrollHeight;
  m.remove();

  t.scrollTop = Math.max(0, y - t.clientHeight * 0.42);
  $('#notice').textContent = `정지한 위치로 이동했습니다 · ${row + 1}번째 줄`;
}

// ══ 모드 전환 ═════════════════════════════════════════════
async function enterPrompter({ fromTop = false, fromCaret = false } = {}) {
  if (promptOpen) return;
  if (dirty) { dirty = false; cx.saveScript(text); }
  clearTimeout(applyTimer);
  stage.apply(S);

  const row = caretRow();
  remote = S.output === 'extended' && displays.length > 1;

  if (remote) {
    await cx.openStage(S.displayId ?? displays.find(d => !d.primary)?.id ?? displays[0].id);
    setTimeout(() => { stage.apply(S); after(); }, 120);
  } else {
    $('#console').style.display = 'none';
    $('#prompter').style.display = '';
    await cx.fullscreen(true);
    requestAnimationFrame(() => { local.relayout(); after(); });
  }

  function after() {
    if (fromTop) { stage.toTop(); stage.resetElapsed(); }
    else if (fromCaret) stage.toRow(row);
  }

  promptOpen = true;
  barShown = false;
  $('#opbar').classList.remove('on');
  paintButtons();
  logMark(`프롬프터 열기 (${remote ? '확장' : '복제'})`);
}

async function exitPrompter() {
  if (!promptOpen) return;
  const row = stage.row;
  stage.stop();
  logMark('프롬프터 닫기');

  if (remote) await cx.closeStage();
  else {
    $('#prompter').style.display = 'none';
    $('#console').style.display = '';
    await cx.fullscreen(false);
  }

  promptOpen = false;
  remote = false;
  barShown = false;
  $('#opbar').classList.remove('on');
  paintButtons();
  requestAnimationFrame(() => { paintEditor(); editorToRow(row); });
}

function toggleBar() {
  if (!promptOpen || remote) return;
  barShown = !barShown;
  $('#opbar').classList.toggle('on', barShown);
  logMark(barShown ? '운영자 바 표시' : '운영자 바 숨김');
}

function paintButtons() {
  $('#startTop').textContent = promptOpen ? '편집 모드로' + gest('togglePrompter') : '프롬프터 (처음부터)' + gest('startTop');
  $('#startHere').style.display = promptOpen ? 'none' : '';
  $('#startHere').textContent = '프롬프터 (중간부터)' + gest('togglePrompter');
}

// ══ 단축키 ════════════════════════════════════════════════
const NAMES = { ArrowUp:'↑', ArrowDown:'↓', ArrowLeft:'←', ArrowRight:'→', Escape:'Esc',
                PageUp:'PgUp', PageDown:'PgDn', Space:'Space', Tab:'Tab', Enter:'Enter' };

function describe(k) {
  if (!k || !k.code) return '지정 안 됨';
  const p = [];
  if (k.ctrl) p.push('Ctrl'); if (k.alt) p.push('Alt'); if (k.shift) p.push('Shift');
  p.push(NAMES[k.code] || k.code.replace(/^Key|^Digit/, ''));
  return p.join(' + ');
}
const gest = id => KEYS[id]?.code ? `  (${describe(KEYS[id])})` : '';

function match(k, e) {
  return k && k.code === e.code && !!k.shift === e.shiftKey && !!k.ctrl === e.ctrlKey && !!k.alt === e.altKey;
}

function buildKeyList() {
  $('#keyList').replaceChildren(...KEY_DEFS.map(([id, label]) => {
    const row = document.createElement('div');
    row.className = 'k';
    const s = document.createElement('span'); s.textContent = label;
    const b = document.createElement('button'); b.textContent = describe(KEYS[id]);
    b.onclick = () => { capturing = id; b.textContent = '키 입력…';
      $('#keyHint').textContent = `[${label}] 에 지정할 키를 누르십시오. Esc 취소, Delete 해제.`; b.focus(); };
    row.append(s, b);
    return row;
  }));
  paintButtons();
}

$('#mouseList').replaceChildren(...MOUSE_DEFS.map(([l, g]) => {
  const row = document.createElement('div'); row.className = 'k fixed';
  const s = document.createElement('span'); s.textContent = l;
  const b = document.createElement('b'); b.textContent = g;
  row.append(s, b); return row;
}));

addEventListener('keydown', e => {
  // 단축키 지정 중
  if (capturing) {
    if (['ShiftLeft','ShiftRight','ControlLeft','ControlRight','AltLeft','AltRight'].includes(e.code)) { e.preventDefault(); return; }
    if (e.code === 'Escape') { capturing = null; }
    else if (e.code === 'Delete') { KEYS[capturing] = {}; capturing = null; }
    else {
      const k = { code: e.code, shift: e.shiftKey, ctrl: e.ctrlKey, alt: e.altKey };
      for (const [id] of KEY_DEFS) if (id !== capturing && match(KEYS[id], e)) KEYS[id] = {};
      KEYS[capturing] = k; capturing = null;
    }
    $('#keyHint').textContent = '오른쪽 버튼을 누른 뒤 원하는 키를 입력하십시오. Esc 로 취소, Delete 로 지정 해제.';
    buildKeyList(); applyAll(); e.preventDefault(); return;
  }

  // 원고 편집 중에는 기능키와 수식키 조합만 받는다
  const typing = !promptOpen && document.activeElement === $('#script');
  const safe = e.ctrlKey || e.altKey || e.shiftKey || /^F\d+$/.test(e.code);
  if (typing && !safe) return;

  for (const [id] of KEY_DEFS) {
    if (!match(KEYS[id], e)) continue;
    if (act(id)) { e.preventDefault(); return; }
  }
});

function act(id) {
  switch (id) {
    case 'togglePrompter': promptOpen ? exitPrompter() : enterPrompter({ fromCaret: true }); return true;
    case 'startTop':       if (promptOpen) exitPrompter(); enterPrompter({ fromTop: true }); return true;
    case 'toggleRun':      if (!promptOpen) enterPrompter({ fromCaret: true }); else stage.toggle(); return true;
    case 'reset':          stage.stop(); stage.toTop(); return true;
    case 'speedUp':        setSpeed(S.speed + 5); return true;
    case 'speedDown':      setSpeed(S.speed - 5); return true;
    case 'nudgeUp':        if (promptOpen) { stage.nudge(-40); return true; } return false;
    case 'nudgeDown':      if (promptOpen) { stage.nudge(40);  return true; } return false;
    case 'pageUp':         if (promptOpen) { stage.page(-0.5); return true; } return false;
    case 'pageDown':       if (promptOpen) { stage.page(0.5);  return true; } return false;
    case 'fontSmaller':    S.size = Math.max(24, S.size - 4); $('#size').value = S.size; $('#sizeV').value = S.size; applyAll(); return true;
    case 'fontLarger':     S.size = Math.min(180, S.size + 4); $('#size').value = S.size; $('#sizeV').value = S.size; applyAll(); return true;
    case 'toggleBar':      if (promptOpen) { toggleBar(); return true; } return false;
    case 'exit':           if (promptOpen) { exitPrompter(); return true; } return false;
  }
  return false;
}

// ══ 진단 기록 ═════════════════════════════════════════════
function logHeader() {
  const d = displays.map((x, i) =>
    `모니터 ${i + 1}    ${x.width}×${x.height} @ 배율 ${x.scale}${x.primary ? '  (주 화면)' : ''}`).join('\n');
  return [
    'CHOFLIX PROMPTER — 프레임 진단 기록',
    `기록 시작   ${new Date().toLocaleString('ko-KR')}`,
    `엔진        Electron / Chromium`,
    `출력 배치   ${S.output === 'extended' ? '확장' : '복제'}`,
    `글자 크기   ${S.size}   줄 간격 ${S.lineHeight}   어절 줄바꿈 ${S.keepAll ? '켬' : '끔'}`,
    `원고        ${text.length.toLocaleString()}자`,
    d,
    '-'.repeat(78),
    '시각            fps      최대 간격    드롭   속도      상태',
    '-'.repeat(78), ''
  ].join('\n');
}
const stamp = () => new Date().toTimeString().slice(0, 8) + '.' +
  String(new Date().getMilliseconds()).padStart(3, '0');
const logMark = w => { if (S.logging) cx.logLine(`${stamp()}  [조작] ${w}`); };
const logStat = r => {
  if (!S.logging) return;
  const flag = r.dropped > 0 ? '  ← 끊김' : '';
  cx.logLine(`${stamp()}  ${r.fps.toFixed(1).padStart(5)} fps   최대 ${r.worst.toFixed(1).padStart(5)} ms   ` +
             `드롭 ${String(r.dropped).padStart(2)}   ${String(r.speed).padStart(3)} px/s   주행${flag}`);
};

// ══ UI 묶기 ═══════════════════════════════════════════════
function bindRange(id, key, fmt, extra) {
  const el = $('#' + id), out = $('#' + id + 'V');
  el.oninput = () => {
    S[key] = parseFloat(el.value);
    out.value = fmt(S[key]);
    applyAll();
    extra?.();
  };
}

function swatches(host, list, key) {
  $(host).replaceChildren(...list.map(hex => {
    const i = document.createElement('i');
    i.style.background = hex; i.title = hex;
    i.onclick = () => { S[key] = hex; syncInputs(); applyAll(); };
    return i;
  }));
}

function syncInputs() {
  $('#font').value = S.font;
  $('#size').value = S.size; $('#sizeV').value = S.size;
  $('#lh').value = S.lineHeight; $('#lhV').value = S.lineHeight.toFixed(2);
  $('#side').value = S.side; $('#sideV').value = S.side + ' %';
  $('#cuePos').value = S.cuePos; $('#cueV').value = S.cuePos + ' %';
  $('#weight').value = S.weight;
  $('#hexInk').value = S.ink; $('#hexBack').value = S.back;
  $$('input[name=align]').forEach(r => r.checked = r.value === S.align);
  $$('input[name=out]').forEach(r => r.checked = r.value === S.output);
  $$('input[name=mir]').forEach(r => r.checked = r.value === S.mirrorBy);
  $('#showCue').checked = S.showCue;
  $('#talentTimer').checked = S.talentTimer;
  $('#editorPreview').checked = S.editorPreview;
  $('#keepAll').checked = S.keepAll;
  $('#mouseCtl').checked = S.mouseCtl;
  $('#mirH').checked = S.mirrorH; $('#mirV').checked = S.mirrorV;
  $('#showStats').checked = S.showStats;
  $('#logging').checked = S.logging;
  $('#speed').value = $('#opSpeed').value = S.speed;
  $('#speedV').value = $('#opSpeedV').value = S.speed + ' px/s';
}

function bindAll() {
  $('#font').replaceChildren(...FONTS.map(f => new Option(f, f)));
  $('#font').onchange = e => { S.font = e.target.value; applyAll(); };
  $('#weight').onchange = e => { S.weight = e.target.value; applyAll(); };

  bindRange('size', 'size', v => v);
  bindRange('lh', 'lineHeight', v => v.toFixed(2));
  bindRange('side', 'side', v => v + ' %');
  bindRange('cuePos', 'cuePos', v => v + ' %');

  $('#speed').oninput = e => setSpeed(+e.target.value);
  $('#opSpeed').oninput = e => setSpeed(+e.target.value);
  $('#opUp').onclick = () => setSpeed(S.speed + 5);
  $('#opDown').onclick = () => setSpeed(S.speed - 5);

  $$('input[name=align]').forEach(r => r.onchange = () => { S.align = r.value; applyAll(); });
  $$('input[name=out]').forEach(r => r.onchange = () => { S.output = r.value; applyAll(); });
  $$('input[name=mir]').forEach(r => r.onchange = () => {
    S.mirrorBy = r.value;
    if (S.mirrorBy === 'monitor') { S.mirrorH = S.mirrorV = false; syncInputs(); }
    applyAll();
  });

  const chk = (id, key) => $('#' + id).onchange = e => { S[key] = e.target.checked; applyAll(); };
  chk('showCue', 'showCue'); chk('talentTimer', 'talentTimer');
  chk('editorPreview', 'editorPreview'); chk('keepAll', 'keepAll');
  chk('mouseCtl', 'mouseCtl'); chk('mirH', 'mirrorH'); chk('mirV', 'mirrorV');
  chk('showStats', 'showStats');

  $('#logging').onchange = async e => {
    S.logging = e.target.checked;
    if (S.logging) await cx.logStart(logHeader()); else await cx.logStop();
    applyAll();
  };
  $('#openLogs').onclick = () => cx.logOpen();

  swatches('#swInk', INKS, 'ink');
  swatches('#swBack', BACKS, 'back');
  swatches('#swCue', CUES, 'cue');
  $('#hexInk').onchange = e => { S.ink = e.target.value.trim(); applyAll(); };
  $('#hexBack').onchange = e => { S.back = e.target.value.trim(); applyAll(); };
  $('#swap').onclick = () => { [S.ink, S.back] = [S.back, S.ink]; syncInputs(); applyAll(); };

  $('#preset').onclick = () => {
    Object.assign(S, { mirrorBy: 'monitor', mirrorH: false, mirrorV: false,
                       ink: '#FFFFFF', back: '#000000', align: 'center', showCue: true });
    syncInputs(); applyAll();
  };

  $('#rescan').onclick = loadDisplays;
  $('#display').onchange = e => { S.displayId = +e.target.value; applyAll(); };

  $('#startTop').onclick   = () => promptOpen ? exitPrompter() : enterPrompter({ fromTop: true });
  $('#startHere').onclick  = () => enterPrompter({ fromCaret: true });
  $('#opRun').onclick      = () => stage.toggle();
  $('#opTop').onclick      = () => { stage.stop(); stage.toTop(); };
  $('#opExit').onclick     = () => exitPrompter();
  $('#elapsedBox').onclick = () => stage.resetElapsed();
  $('#opElapsedBox').onclick = e => { e.stopPropagation(); stage.resetElapsed(); };

  $('#script').oninput = e => setText(e.target.value, true);
  $('#script').addEventListener('input', () => { $('#notice').textContent = ''; });
  $('#import').onclick = async () => { const t = await cx.importScript(); if (t !== null) setText(t); };
  $('#export').onclick = () => cx.exportScript(text);

  $('#keyReset').onclick = () => {
    KEYS = Object.fromEntries(KEY_DEFS.map(([id, , def]) => [id, { ...def }]));
    buildKeyList(); applyAll();
  };

  addEventListener('resize', () => { paintEditor(); if (!remote) local.relayout(); });
}

async function loadDisplays() {
  displays = await cx.displays();
  $('#display').replaceChildren(...displays.map(d =>
    new Option(`모니터 ${d.index + 1} — ${d.width}×${d.height}${d.primary ? '  (주 화면)' : ''}`, d.id)));
  if (S.displayId == null || !displays.some(d => d.id === S.displayId))
    S.displayId = (displays.find(d => !d.primary) ?? displays[0]).id;
  $('#display').value = S.displayId;
  paintHints();
}

// ══ 시작 ══════════════════════════════════════════════════
(async function init() {
  const saved = await cx.loadConfig();
  if (saved?.settings) S = { ...DEFAULTS, ...saved.settings };
  KEYS = Object.fromEntries(KEY_DEFS.map(([id, , def]) => [id, { ...def }]));
  if (saved?.keys) for (const id in saved.keys) if (id in KEYS) KEYS[id] = saved.keys[id];

  bindAll();
  syncInputs();
  buildKeyList();
  await loadDisplays();

  const prev = await cx.loadScript();
  if (prev?.text) {
    setText(prev.text);
    const d = new Date(prev.at);
    $('#notice').textContent =
      `이전 원고를 복원했습니다 · ${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ` +
      `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  } else setText('');

  dirty = false;
  applyAll();
  if (S.logging) cx.logStart(logHeader());
})();

addEventListener('beforeunload', () => { cx.saveScript(text); cx.saveConfig({ settings: S, keys: KEYS }); });
