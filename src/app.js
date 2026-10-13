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
  speed: 55,
  output: 'duplicate', displayId: null,
  mirrorBy: 'monitor', mirrorH: false, mirrorV: false,
  follow: false, micId: null
};

const KEY_DEFS = [
  ['startTop',       '프롬프터 (처음부터)', { code: 'F9' }],
  ['togglePrompter', '프롬프터 (중간부터)', { code: 'F9', shift: true }],
  ['toggleRun',      '시작 / 정지',        { code: 'Space' }],
  ['reset',          '처음으로',           { code: 'F10' }],
  ['speedUp',        '속도 올리기',         { code: 'ArrowDown' }],
  ['speedDown',      '속도 내리기',         { code: 'ArrowUp' }],
  ['nudgeUp',        '위로 미세 이동',      { code: 'ArrowUp', shift: true }],
  ['nudgeDown',      '아래로 미세 이동',    { code: 'ArrowDown', shift: true }],
  ['pageUp',         '반 화면 위로',        { code: 'PageUp' }],
  ['pageDown',       '반 화면 아래로',      { code: 'PageDown' }],
  ['fontSmaller',    '글자 작게',          { code: 'ArrowLeft' }],
  ['fontLarger',     '글자 크게',          { code: 'ArrowRight' }],
  ['toggleFollow',   '음성 추종 켜기 / 끄기', { code: 'F8' }],
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
  hud: $('#hud'), hudElapsed: $('#hudElapsed'), hudRemain: $('#hudRemain')
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
  heard: tail => remote ? send({ t: 'heard', tail }) : local.heard(tail),
  setFollow: on => remote ? send({ t: 'follow', on }) : local.setFollow(on),
  get running() { return remote ? cache.running : local.running; },
  get row() { return remote ? cache.row : local.centerRow(); }
};

function onReport(r) {
  if (r.kind === 'speed') { setSpeed(S.speed + r.delta); return; }
  if (r.kind === 'manual') { following = false; paintFollow(); return; }  // 손이 닿으면 수동
  cache = r;
  paintClocks(r);
  if (r.followState !== undefined) paintFollow(r);
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
  $('#progress').style.width = r.progress + '%';
  const on = r.running;
  $('#lamp').classList.toggle('on', on);
  $('#opLamp').classList.toggle('on', on);
  $('#opRun').textContent = on ? '정지' : '시작';

  // 편집 중에는 출력 화면이 감춰져 있어 엔진이 재는 높이가 0 이다.
  // 그동안은 따로 재 둔 추정값으로 채운다.
  if (promptOpen) {
    $('#remain').textContent = $('#opRemain').textContent = fmtSec(r.remain);
    $('#total').textContent  = fmtSec(r.total);
  } else paintEstimate();
}

// ══ 원고 길이 추정 ════════════════════════════════════════
// 프롬프터가 닫혀 있으면 원고를 그리는 곳이 없어 높이를 잴 수 없다.
// 실제로 출력될 모니터와 같은 폭으로 숨은 자리에 한 번 그려서 재고,
// 그 높이를 속도로 나눠 잔여 · 전체 시간을 낸다.
let mBox = null, mRows = [], mHeight = 0, mText = null, mTimer = null;

/** 출력이 나갈 모니터. 복제 배치는 주 화면, 확장 배치는 고른 모니터. */
function targetDisplay() {
  if (!displays.length) return null;
  return (S.output === 'extended'
    ? displays.find(d => d.id === S.displayId)
    : displays.find(d => d.primary)) ?? displays[0];
}

function remeasure() {
  if (!mBox) {
    mBox = document.createElement('div');
    mBox.className = 'lines';
    mBox.style.cssText = 'position:fixed;top:0;left:0;right:auto;visibility:hidden;pointer-events:none';
    document.body.appendChild(mBox);
  }
  const d = targetDisplay();
  Object.assign(mBox.style, {
    width: Math.max(80, (d ? d.width : screen.width) * (1 - S.side * 2 / 100)) + 'px',
    fontFamily: S.font,
    fontSize: S.size + 'px',
    fontWeight: S.weight,
    lineHeight: S.lineHeight,
    textAlign: S.align,
    wordBreak: S.keepAll ? 'keep-all' : 'normal'
  });
  if (mText !== text) {
    mText = text;
    mBox.replaceChildren(...text.replace(/\r\n?/g, '\n').split('\n').map(t => {
      const e = document.createElement('div');
      e.className = 'ln';
      e.textContent = t.length ? t : '\u00a0';
      return e;
    }));
  }
  mRows = [...mBox.children].map(e => e.offsetTop);
  mHeight = mBox.scrollHeight;
}

/** 커서가 놓인 줄을 읽기 시작점으로 보고 잔여 시간을 낸다. */
function paintEstimate() {
  const v = Math.max(1, S.speed);
  const from = mRows[Math.min(caretRow(), mRows.length - 1)] ?? 0;
  $('#total').textContent = fmtSec(mHeight / v);
  $('#remain').textContent = $('#opRemain').textContent = fmtSec(Math.max(0, mHeight - from) / v);
}

function estimate() { clearTimeout(mTimer); remeasure(); paintEstimate(); }

/** 타자나 슬라이더가 이어지는 동안에는 멈춘 뒤 한 번만 잰다. */
function scheduleEstimate() {
  if (promptOpen) return;
  clearTimeout(mTimer);
  mTimer = setTimeout(estimate, 180);
}

// ══ 음성 추종 ═════════════════════════════════════════════
// 인식은 별도 프로세스에서 돈다. 여기서는 소리를 넘기고 글자를 받아
// 엔진에 전달하는 일만 한다 — 주행 프레임을 건드리지 않기 위해서다.
let following = false;        // 지금 자동으로 따라가는 중인가
let asrReady = false;
let asrNote = '';             // 운영자에게 보여 줄 한마디
let heardTail = '';           // 지금까지 들린 말의 꼬리
let micPeak = 0;

const mic = new Mic((pcm, peak) => {
  micPeak = Math.max(micPeak, peak);
  cx.asrPcm(pcm);
});

cx.onAsr(m => {
  if (m.t === 'ready') { asrReady = true; asrNote = ''; }
  else if (m.t === 'text') {
    heardTail = m.redo ? m.w : heardTail + m.w;
    if (norm(heardTail).length >= 8) stage.heard(heardTail);
    // 문장이 길어지면 꼬리만 남긴다. 다음 문장과 섞이지 않게.
    if (norm(heardTail).length > 60) heardTail = heardTail.slice(-40);
  }
  else if (m.t === 'beat') { asrReady = true; }
  else if (m.t === 'error') { asrNote = m.message; following = false; }
  else if (m.t === 'dead') {
    // 못 알아듣는 것과 프로세스가 죽는 것은 다르다. 시간으로 짐작하지 않고 여기서 끊는다.
    asrReady = false; following = false;
    asrNote = '인식 프로세스가 멈췄습니다. 수동으로 운용하십시오.';
  }
  paintFollow();
});

/** 인식을 준비한다. 프롬프터를 열 때 부른다. */
async function followUp() {
  if (!S.follow || mic.on) return;
  try {
    asrNote = '준비 중…';
    paintFollow();
    await cx.asrStart(2);
    await mic.start(S.micId);
    await loadMics();                 // 권한을 받은 뒤에야 장치 이름이 보인다
    following = true;
    stage.setFollow(true);
  } catch (e) {
    asrNote = '마이크를 열지 못했습니다 — ' + (e && e.message || e);
    following = false;
  }
  paintFollow();
}

/** 인식을 내린다. 프롬프터를 닫을 때 부른다. */
async function followDown() {
  following = false;
  asrReady = false;
  heardTail = '';
  stage.setFollow(false);
  await mic.stop();
  await cx.asrStop();
  paintFollow();
}

function toggleFollow() {
  if (!S.follow) { asrNote = '제어판에서 음성 추종을 먼저 켜십시오.'; paintFollow(); return; }
  if (!mic.on) { followUp(); return; }
  following = !following;
  stage.setFollow(following);
  paintFollow();
}

function paintFollow(r) {
  const b = $('#followState'), ob = $('#opFollow');
  let cls = 'off', text = '꺼짐';
  if (asrNote && !asrReady) { cls = 'err'; text = '오류'; }
  else if (!S.follow) { cls = 'off'; text = '사용 안 함'; }
  else if (!mic.on) { cls = 'off'; text = '대기'; }
  else if (!following) { cls = 'off'; text = '수동'; }
  else {
    const st = (r || cache).followState;
    cls = st === 'good' ? 'good' : st === 'weak' ? 'weak' : st === 'lost' ? 'lost' : 'wait';
    text = { good: '추종 중', weak: '추종 중 (약함)', lost: '놓치는 중', wait: '찾는 중' }[cls] || '추종 중';
  }
  b.className = 'badge ' + cls;
  b.textContent = text;
  ob.textContent = following ? '추종 ON' : '추종';
  ob.classList.toggle('go', following);
  $('#followHint').textContent = asrNote;

  // 입력 레벨은 소리가 실제로 들어오는지 눈으로 보려는 것이다
  $('#micLevel').style.width = Math.min(100, micPeak * 140) + '%';
  micPeak *= 0.8;
}
setInterval(() => { if (mic.on) paintFollow(); }, 150);

async function loadMics() {
  try {
    const list = await Mic.devices();
    $('#micPick').replaceChildren(...list.map(d => new Option(d.label, d.id)));
    if (S.micId && list.some(d => d.id === S.micId)) $('#micPick').value = S.micId;
  } catch { /* 권한 전에는 비어 있을 수 있다 */ }
}

// ══ 설정 반영 ═════════════════════════════════════════════
function applyAll() {
  stage.apply(S);
  paintEditor();
  paintHints();
  scheduleEstimate();
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

function setSpeed(v, byHand) {
  // 운영자가 속도를 직접 만지면 자동 추종을 내린다. 사람 손이 우선이다.
  if (byHand && following) { following = false; stage.setFollow(false); paintFollow(); }
  S.speed = Math.max(10, Math.min(220, Math.round(v)));
  $('#speed').value = $('#opSpeed').value = S.speed;
  $('#speedV').value = $('#opSpeedV').value = S.speed + ' px/s';
  applyAll();
}

// ══ 원고 ══════════════════════════════════════════════════
let saveTimer = null, dirty = false;

function setText(v, fromEditor) {
  text = v;
  // 값을 넣으면 커서가 원고 끝으로 가 버린다. 불러온 원고는 처음부터 읽는다.
  if (!fromEditor) { $('#script').value = v; $('#script').setSelectionRange(0, 0); }
  const all = v.length, noSpace = v.replace(/\s/g, '').length, lines = v.split('\n').length;
  const est = noSpace / 330;
  $('#count').textContent =
    `${lines}줄 · ${all.toLocaleString()}자 (공백 제외 ${noSpace.toLocaleString()}자) · ` +
    `낭독 추정 ${String(Math.floor(est)).padStart(2,'0')}:${String(Math.floor(est%1*60)).padStart(2,'0')}`;
  dirty = true;
  scheduleEstimate();

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
}

// ══ 모드 전환 ═════════════════════════════════════════════
async function enterPrompter({ fromTop = false, fromCaret = false } = {}) {
  if (promptOpen) return;
  if (dirty) { dirty = false; cx.saveScript(text); }
  clearTimeout(applyTimer);
  clearTimeout(mTimer);
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
  followUp();                 // 음성 추종을 쓰기로 했다면 여기서 올라온다
}

async function exitPrompter() {
  if (!promptOpen) return;
  const row = stage.row;
  stage.stop();
  followDown();

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
  requestAnimationFrame(() => { paintEditor(); editorToRow(row); estimate(); });
}

function toggleBar() {
  if (!promptOpen || remote) return;
  barShown = !barShown;
  $('#opbar').classList.toggle('on', barShown);
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
    case 'toggleFollow':   toggleFollow(); return true;
    case 'toggleBar':      if (promptOpen) { toggleBar(); return true; } return false;
    case 'exit':           if (promptOpen) { exitPrompter(); return true; } return false;
  }
  return false;
}

// ══ UI 묶기 ═══════════════════════════════════════════════
function bindRange(id, key, fmt, extra) {
  const el = $('#' + id), out = $('#' + id + 'V');
  el.oninput = () => {
    S[key] = parseFloat(el.value);
    applyAll();                    // 반영이 먼저다
    if (out) out.value = fmt(S[key]);
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
  $('#cuePos').value = S.cuePos; $('#cuePosV').value = S.cuePos + ' %';
  $('#weight').value = S.weight;
  $('#hexInk').value = S.ink; $('#hexBack').value = S.back;
  $$('input[name=align]').forEach(r => r.checked = r.value === S.align);
  $$('input[name=out]').forEach(r => r.checked = r.value === S.output);
  $$('input[name=mir]').forEach(r => r.checked = r.value === S.mirrorBy);
  $('#showCue').checked = S.showCue;
  $('#talentTimer').checked = S.talentTimer;
  $('#editorPreview').checked = S.editorPreview;
  $('#keepAll').checked = S.keepAll;
  $('#mirH').checked = S.mirrorH; $('#mirV').checked = S.mirrorV;
  $('#followOn').checked = S.follow;
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

  $('#speed').oninput = e => setSpeed(+e.target.value, true);
  $('#opSpeed').oninput = e => setSpeed(+e.target.value, true);
  $('#opUp').onclick = () => setSpeed(S.speed + 5, true);
  $('#opDown').onclick = () => setSpeed(S.speed - 5, true);

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
  chk('mirH', 'mirrorH'); chk('mirV', 'mirrorV');

  $('#followOn').onchange = e => {
    S.follow = e.target.checked;
    asrNote = '';
    if (!S.follow) followDown(); else if (promptOpen) followUp();
    applyAll(); paintFollow();
  };
  $('#micPick').onchange = async e => {
    S.micId = e.target.value;
    if (mic.on) { await mic.stop(); await mic.start(S.micId); }   // 장치를 바꾸면 다시 연다
    applyAll();
  };
  $('#micRescan').onclick = loadMics;
  $('#opFollow').onclick = () => toggleFollow();

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
  ['click', 'keyup', 'select'].forEach(ev =>
    $('#script').addEventListener(ev, () => { if (!promptOpen) paintEstimate(); }));
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
  estimate();
  loadMics();
  paintFollow();
})();

addEventListener('beforeunload', () => { cx.saveScript(text); cx.saveConfig({ settings: S, keys: KEYS }); });
