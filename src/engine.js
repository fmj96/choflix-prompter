/**
 * 주행 엔진.
 *
 * 매 프레임 소수점 단위로 위치를 써 넣는다.
 * 브라우저는 소수점 픽셀 위치에 글자를 제대로 그리므로,
 * 속도가 주사율의 배수가 아니어도 균일하게 흐른다.
 * (WPF 는 글자를 픽셀 격자에 맞춰 그려서 이 지점에서 떨림이 생겼다)
 */
class Engine {
  constructor(el) {
    this.el = el;                       // { lines, cue, hud, hudElapsed, hudRemain, mirror, stage }
    this.offset = 0;
    this.maxReach = 0;                  // 지금까지 읽어 내려간 가장 먼 지점 (엔지 재독 판별)
    this.running = false;
    this.netSeconds = 0;                // 누적 진행 — 새로 읽은 분량만
    this.runSeconds = 0;                // 실주행 시간
    this.rows = [];                     // 줄별 세로 위치
    this.s = null;
    this.onReport = () => {};

    this._raf = null;
    this._last = 0;
    this._uiT = 0;
    this._drag = null;

    this._bindMouse();
  }

  // ── 설정 ────────────────────────────────────────────
  apply(s) {
    const first = !this.s;
    const prev = this.s;
    this.s = s;

    const L = this.el.lines;
    L.style.fontFamily = s.font;
    L.style.fontSize   = s.size + 'px';
    L.style.lineHeight = s.lineHeight;
    L.style.fontWeight = s.weight;
    L.style.textAlign  = s.align;
    L.style.color      = s.ink;
    L.style.wordBreak  = s.keepAll ? 'keep-all' : 'normal';
    L.style.left = L.style.right = s.side + '%';
    this.el.stage.style.background = s.back;

    this.el.mirror.style.transform =
      `scale(${s.mirrorH ? -1 : 1}, ${s.mirrorV ? -1 : 1})`;

    this.el.cue.style.background = this._fade(s.cue, .3);
    this.el.cue.querySelectorAll('i').forEach(i => {
      i.style.borderLeftColor = i.classList.contains('l') ? s.cue : 'transparent';
      i.style.borderRightColor = i.classList.contains('r') ? s.cue : 'transparent';
    });
    this.el.hud.style.color = this._fade(s.cue, .35);
    this.el.hud.style.display = s.talentTimer ? '' : 'none';

    const rebuilt = first || !prev || prev.text !== s.text;
    if (rebuilt) this._build();
    this._layout(!rebuilt && prev && (prev.size !== s.size || prev.lineHeight !== s.lineHeight
                                      || prev.side !== s.side || prev.font !== s.font));
  }

  _fade(hex, a) {
    const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex || '#f0a020');
    if (!m) return `rgba(240,160,32,${a})`;
    return `rgba(${parseInt(m[1],16)},${parseInt(m[2],16)},${parseInt(m[3],16)},${a})`;
  }

  _build() {
    const lines = (this.s.text || '').replace(/\r\n?/g, '\n').split('\n');
    this.el.lines.replaceChildren(...lines.map(t => {
      const d = document.createElement('div');
      d.className = 'ln';
      d.textContent = t.length ? t : '\u00a0';
      return d;
    }));
  }

  /** 글자 크기처럼 전체 높이가 달라지면 읽던 지점의 진행 비율을 유지한다. */
  _layout(keepRatio) {
    const ratio = keepRatio && this.max() > 0 ? this.offset / this.max() : null;

    const h = this.el.stage.clientHeight;
    const cueY = h * (this.s.cuePos / 100);
    this.el.cue.style.top = cueY + 'px';
    this.el.cue.style.display = this.s.showCue ? '' : 'none';

    this.rows = [...this.el.lines.children].map(d => d.offsetTop);

    if (ratio !== null) this.offset = Math.min(this.max(), ratio * this.max());
    this.offset = Math.max(0, Math.min(this.max(), this.offset));
    this._draw();
    this._report(true);
  }

  relayout() { if (this.s) this._layout(true); }

  // ── 위치 ────────────────────────────────────────────
  max()  { return Math.max(0, this.el.lines.scrollHeight); }
  cueY() { return this.el.stage.clientHeight * (this.s.cuePos / 100); }
  _draw(){ this.el.lines.style.transform = `translate3d(0,${(this.cueY() - this.offset).toFixed(3)}px,0)`; }

  /** 손으로 옮긴 구간은 읽은 것이 아니므로 시간에 더하지 않되, 도달 지점은 끌어올린다. */
  moveTo(y, newFrontier = false) {
    this.offset = Math.max(0, Math.min(this.max(), y));
    if (newFrontier || this.offset > this.maxReach) this.maxReach = this.offset;
    this._draw();
    this._report(true);
  }

  nudge(px)  { this.moveTo(this.offset + px); }
  page(f)    { this.moveTo(this.offset + this.el.stage.clientHeight * f); }
  toTop()    { this.maxReach = 0; this.moveTo(0, true); }
  toRow(i)   { this.moveTo(this.rows[Math.max(0, Math.min(this.rows.length - 1, i))] ?? 0, true); }

  /** 화면 한가운데 놓인 줄. 편집 모드로 나갈 때의 기준. */
  centerRow() {
    const target = this.offset + (0.5 - this.s.cuePos / 100) * this.el.stage.clientHeight;
    let hit = 0;
    for (let i = 0; i < this.rows.length; i++) { if (this.rows[i] > target) break; hit = i; }
    return hit;
  }

  resetElapsed() { this.netSeconds = 0; this.runSeconds = 0; this.maxReach = this.offset; this._report(true); }

  // ── 주행 ────────────────────────────────────────────
  start() {
    if (this.running) return;
    if (this.max() - this.offset <= 1) return;
    this.running = true;
    this._last = performance.now();
    const step = now => {
      if (!this.running) return;
      const dt = (now - this._last) / 1000;
      this._last = now;

      const before = this.offset;
      this.offset = Math.min(this.max(), this.offset + this.s.speed * dt);
      this._draw();

      this.runSeconds += dt;
      if (this.offset > this.maxReach) {
        const gained = this.offset - Math.max(this.maxReach, before);
        if (gained > 0) this.netSeconds += gained / Math.max(1, this.s.speed);
        this.maxReach = this.offset;
      }

      if (now - this._uiT >= 200) { this._uiT = now; this._report(false); }

      if (this.offset >= this.max()) { this.stop(); return; }
      this._raf = requestAnimationFrame(step);
    };
    this._raf = requestAnimationFrame(step);
    this._report(true);
  }

  stop() {
    if (!this.running) return;
    this.running = false;
    cancelAnimationFrame(this._raf);
    this._raf = null;
    this._report(true);
  }

  toggle() { this.running ? this.stop() : this.start(); }

  _report(force) {
    const max = this.max();
    const remain = Math.max(0, (max - this.offset) / Math.max(1, this.s.speed));
    const total = max / Math.max(1, this.s.speed);
    this.el.hudElapsed.textContent = fmt(this.netSeconds);
    this.el.hudRemain.textContent = fmt(remain);
    this.onReport({
      kind: 'state', running: this.running, offset: this.offset,
      elapsed: this.netSeconds, running_s: this.runSeconds,
      remain, total, progress: max > 0 ? this.offset / max * 100 : 0,
      row: this.centerRow(), force: !!force
    });
  }

  // ── 마우스 ──────────────────────────────────────────
  _bindMouse() {
    const st = this.el.stage;

    st.addEventListener('mousedown', e => {
      if (e.button !== 0) return;
      this._drag = { y: e.clientY, from: this.offset, moved: false };
    });

    addEventListener('mousemove', e => {
      if (!this._drag) return;
      const dy = e.clientY - this._drag.y;
      if (!this._drag.moved) {
        if (Math.abs(dy) < 6) return;
        this._drag.moved = true;
        st.style.cursor = 'ns-resize';
      }
      const dir = this.s.mirrorV ? -1 : 1;   // 상하 반전 시 손이 가는 방향과 맞춘다
      this.moveTo(this._drag.from - dy * dir);
    });

    addEventListener('mouseup', () => {
      if (!this._drag) return;
      const clicked = !this._drag.moved;
      this._drag = null;
      st.style.cursor = 'pointer';
      if (clicked) this.toggle();          // 화면 왼쪽 클릭은 기본 동작이다
    });

    st.addEventListener('wheel', e => {
      if (this.running) {                    // 주행 중에는 속도, 멈춰 있으면 위치
        this.onReport({ kind: 'speed', delta: e.deltaY > 0 ? 5 : -5 });
        return;
      }
      this.nudge(e.deltaY * 0.8);
    }, { passive: true });
  }
}

function fmt(sec) {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const s = Math.floor(sec);
  return [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60]
    .map(n => String(n).padStart(2, '0')).join(':');
}
