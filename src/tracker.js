/**
 * 들린 말을 대본 위치에 맞춘다 — 음성 추종의 심장.
 *
 * 받아쓰기가 아니라 '대본 어디쯤인지' 찾는 문제다.
 * 대본을 이미 알고 있으므로 인식이 절반쯤 틀려도 자리는 찾을 수 있다.
 * (실측: 인식 글자가 상당히 깨져도 줄 단위 정확도 98~100%)
 */

/** 한글 음절과 숫자만 남긴다. 띄어쓰기·문장부호는 인식 결과마다 다르다. */
const norm = s => (s || '').replace(/[^가-힣0-9]/g, '');

/**
 * 읽지 않는 줄인가.
 *
 * 교안에는 화면 넘김 큐나 페이지 번호가 섞여 있다.
 * 출연자는 보지만 소리 내어 읽지는 않으므로 맞추기 대상에서 뺀다.
 * 빼지 않으면 그 자리에서 매칭이 헛돈다.
 */
const CUE_ONLY = /^\s*(?:[/(\[]\s*(?:넘김|클릭|슬라이드)\s*\.?\s*[/)\]]|\d+\s*(?:페이지|번째)|\d+)\s*$/;
const isCue = t => !t.trim() || CUE_ONLY.test(t);

/** 줄 맨 앞에 붙은 큐 표시를 떼어낸다. 뒤의 말은 읽는다. */
const stripCue = t => t.replace(/^\s*\(?\s*클릭\s*\)\s*/, '');

/**
 * 두 글자열이 얼마나 닮았는지 0~1 로 돌려준다.
 * 최장 공통 부분수열 기준 — 글자가 빠지거나 바뀌어도 견딘다.
 */
function ratio(a, b) {
  const n = a.length, m = b.length;
  if (!n || !m) return 0;
  let prev = new Uint16Array(m + 1), cur = new Uint16Array(m + 1);
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1]);
    }
    [prev, cur] = [cur, prev];
    cur.fill(0);
  }
  return 2 * prev[m] / (n + m);
}

class Tracker {
  /**
   * @param {string[]} lines  대본 — 읽는 말만 담긴 줄 배열
   */
  constructor(lines, {
    back = 120,      // 뒤로 이만큼까지만 찾는다 (되감기 허용 폭)
    ahead = 400,     // 앞으로 이만큼까지 (건너뛰기 허용 폭)
    buf = 24,        // 최근 들은 말을 몇 글자나 들고 비교할지
    floor = 0.55,    // 이 아래 닮음은 '못 찾았다'로 본다
  } = {}) {
    this.opt = { back, ahead, buf, floor };
    this.setScript(lines);
  }

  setScript(lines) {
    this.lines = lines || [];
    this.text = '';
    this.owner = [];        // 글자마다 몇 번째 줄인지
    this.lineStart = [];    // 줄마다 몇 번째 글자에서 시작하는지
    this.lineLen = [];
    for (let i = 0; i < this.lines.length; i++) {
      // 큐 표시뿐인 줄은 글자를 넣지 않는다 — 읽히지 않으므로 맞출 대상이 아니다
      const t = isCue(this.lines[i]) ? '' : norm(stripCue(this.lines[i]));
      this.lineStart.push(this.text.length);
      this.lineLen.push(Math.max(1, t.length));
      this.text += t;
      for (let k = 0; k < t.length; k++) this.owner.push(i);
    }
    this.reset();
  }

  reset(pos = 0) {
    this.pos = pos;
    this.heard = '';
    this.conf = 0;
  }

  /** 지금까지 들린 말의 꼬리를 넣는다. 돌려주는 값은 {pos, conf}. */
  feed(tail) {
    this.heard = norm(tail).slice(-this.opt.buf);
    if (this.heard.length < 8) return { pos: this.pos, conf: 0 };

    const n = this.heard.length;
    const lo = Math.max(0, this.pos - this.opt.back);
    const hi = Math.min(this.text.length, this.pos + this.opt.ahead);
    let best = 0, bestEnd = this.pos;
    for (let st = lo; st + 1 <= Math.max(lo + 1, hi - n + 1); st++) {
      const r = ratio(this.heard, this.text.substr(st, n));
      if (r > best) { best = r; bestEnd = st + n; }
    }
    if (best >= this.opt.floor) this.pos = bestEnd;
    this.conf = best;
    return { pos: this.pos, conf: best };
  }

  /** 지금 읽고 있는 줄. pos 는 맞춘 구간의 '끝'이라 한 글자 앞을 본다. */
  lineAt(pos = this.pos) {
    if (!this.owner.length) return 0;
    return this.owner[Math.min(Math.max(pos - 1, 0), this.owner.length - 1)];
  }

  /**
   * 글자 위치를 화면 세로 위치로 바꾼다.
   * 대본 한 줄이 화면에서 17줄까지 접히므로 줄 번호만으로는 너무 거칠다.
   * 줄 안에서 몇 번째 글자인지까지 보고 비례로 나눈다.
   * @param {number[]} rows    줄별 화면 세로 위치 (engine 의 rows)
   * @param {number[]} heights 줄별 화면 높이
   */
  yAt(rows, heights, pos = this.pos) {
    const i = this.lineAt(pos);
    if (rows[i] === undefined) return 0;
    const frac = (pos - this.lineStart[i]) / this.lineLen[i];
    return rows[i] + Math.min(1, Math.max(0, frac)) * (heights[i] ?? 0);
  }
}

if (typeof module !== 'undefined') module.exports = { Tracker, norm, ratio, isCue };
