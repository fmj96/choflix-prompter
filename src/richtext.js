/**
 * 색이 들어간 원고를 다룬다.
 *
 * 원본은 '줄마다 인라인 HTML 한 덩이'다. 줄 모델은 그대로 두고 색만 얹는 꼴이라
 * 주행 엔진·시간 계산·음성 추종이 쓰던 줄 단위 구조를 건드리지 않는다.
 *
 *   ['안녕하세요 <span style="color:#F0A020">반갑습니다</span>', '두 번째 줄']
 *
 * 이 파일은 보안 경계이기도 하다. 편집창과 주행 화면이 innerHTML 을 쓰므로,
 * 외부에서 들어온 원고(파일·붙여넣기)는 반드시 여기를 지나야 한다.
 * 살려 두는 것은 색이 지정된 <span> 과 줄바꿈뿐이다.
 */

/** 원고에 쓸 글자색. 표시 설정의 글자색 견본과 같은 값에 강조색을 더했다. */
const RT_COLORS = [
  { hex: '',        name: '기본색' },
  { hex: '#F0A020', name: '주황' },
  { hex: '#E23B34', name: '빨강' },
  { hex: '#7CDA6A', name: '초록' },
  { hex: '#35C6E8', name: '하늘' },
  { hex: '#FFD24B', name: '노랑' },
];

const rtEsc = s => (s || '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

/** style 에서 색만 꺼내 #RRGGBB 로 맞춘다. 그 외 선언은 버린다. */
function rtColor(style) {
  const m = /(?:^|;)\s*color\s*:\s*([^;]+)/i.exec(style || '');
  if (!m) return '';
  const v = m[1].trim();
  let h = /^#([0-9a-f]{6})$/i.exec(v);
  if (h) return '#' + h[1].toUpperCase();
  h = /^#([0-9a-f]{3})$/i.exec(v);
  if (h) return '#' + h[1].split('').map(c => c + c).join('').toUpperCase();
  const r = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(v);
  if (r) return '#' + [1, 2, 3].map(i => (+r[i]).toString(16).padStart(2, '0')).join('').toUpperCase();
  return '';
}

/**
 * 아무 HTML 이나 받아 '줄마다 인라인 HTML' 배열로 만든다.
 * div·p 는 줄을 나누고, br 도 줄을 나눈다. 나머지 태그는 글자만 남긴다.
 */
function rtParse(html) {
  const doc = new DOMParser().parseFromString('<body>' + (html || '') + '</body>', 'text/html');
  const lines = [];
  let cur = '';
  const push = () => { lines.push(cur); cur = ''; };

  (function walk(node, color) {
    for (const n of node.childNodes) {
      if (n.nodeType === 3) {                       // 글자
        const t = rtEsc(n.textContent);
        if (!t) continue;
        cur += color ? `<span style="color:${color}">${t}</span>` : t;
        continue;
      }
      if (n.nodeType !== 1) continue;
      const tag = n.tagName;
      if (tag === 'BR') { push(); continue; }
      if (tag === 'SCRIPT' || tag === 'STYLE') continue;   // 글자조차 버린다
      const block = /^(DIV|P|LI|TR|H[1-6]|SECTION|ARTICLE|BLOCKQUOTE)$/.test(tag);
      if (block && cur) push();
      // 안쪽 색이 바깥 색을 덮는다
      walk(n, rtColor(n.getAttribute && n.getAttribute('style')) || color);
      if (block) push();
    }
  })(doc.body, '');
  if (cur) push();

  // 블록 사이에서 생긴 빈 줄이 끝에 매달리는 것만 정리한다
  while (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
  return lines.length ? lines : [''];
}

/** 인라인 HTML 한 줄에서 글자만 뽑는다. 글자수·시간 계산·음성 추종이 쓴다. */
function rtPlain(line) {
  return (line || '').replace(/<[^>]*>/g, '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ');
}

/** 여러 줄을 편집창에 넣을 HTML 로. 줄마다 div 하나 — 줄 모델을 유지한다. */
const rtToEditor = lines => (lines.length ? lines : [''])
  .map(l => `<div>${l || '<br>'}</div>`).join('');

/** 파일로 저장할 모양. 사람이 열어 봐도 읽히도록 최소한만 감싼다. */
const rtToFile = lines => [
  '<!DOCTYPE html>', '<meta charset="utf-8">',
  '<title>CHOFLIX PROMPTER 원고</title>',
  '<body style="white-space:pre-wrap">',
  ...lines.map(l => `<div>${l || '<br>'}</div>`),
].join('\n') + '\n';

/** 파일에서 읽기. 옛 txt 원고도 그대로 받는다. */
function rtFromFile(content) {
  const s = content || '';
  if (!/<(div|span|br|p|body|html)\b/i.test(s)) {       // 평범한 txt
    return s.replace(/\r\n?/g, '\n').split('\n').map(rtEsc);
  }
  return rtParse(s);
}

/**
 * 인라인 HTML 한 줄을 '글자 토막' 배열로 푼다.
 *   '가<span style="color:#F00">나</span>' → [{t:'가',c:''},{t:'나',c:'#F00'}]
 *
 * 색을 입히고 지우는 일을 글자 위치로 다루기 위한 것이다.
 * 브라우저의 execCommand 로는 걸친 범위에서 결과가 들쭉날쭉했다.
 */
function rtToRuns(line) {
  const doc = new DOMParser().parseFromString('<body>' + (line || '') + '</body>', 'text/html');
  const runs = [];
  (function walk(node, color) {
    for (const n of node.childNodes) {
      if (n.nodeType === 3) { if (n.textContent) runs.push({ t: n.textContent, c: color }); }
      else if (n.nodeType === 1)
        walk(n, rtColor(n.getAttribute && n.getAttribute('style')) || color);
    }
  })(doc.body, '');
  return runs;
}

/** 글자 토막을 다시 인라인 HTML 로. 같은 색끼리 묶는다. */
function rtFromRuns(runs) {
  let out = '', buf = '', cur = null;
  const flush = () => {
    if (!buf) return;
    out += cur ? `<span style="color:${cur}">${rtEsc(buf)}</span>` : rtEsc(buf);
    buf = '';
  };
  for (const r of runs) {
    if (r.c !== cur) { flush(); cur = r.c; }
    buf += r.t;
  }
  flush();
  return out;
}

/**
 * 한 줄의 from~to 글자에 색을 지정한다. color 가 빈 값이면 색을 벗긴다.
 * @returns {string} 새 인라인 HTML
 */
function rtSetColor(line, from, to, color) {
  const runs = rtToRuns(line);
  const out = [];
  let at = 0;
  for (const r of runs) {
    for (const ch of Array.from(r.t)) {
      out.push({ t: ch, c: (at >= from && at < to) ? (color || '') : r.c });
      at++;
    }
  }
  return rtFromRuns(out);
}

if (typeof module !== 'undefined')
  module.exports = { RT_COLORS, rtEsc, rtColor, rtParse, rtPlain, rtToEditor, rtToFile, rtFromFile,
                     rtToRuns, rtFromRuns, rtSetColor };
