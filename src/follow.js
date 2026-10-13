/**
 * 음성이 가리키는 자리로 주행 속도를 맞춘다.
 *
 * 위치를 끌어다 놓지 않는다. 속도만 밀고 당긴다 — 글이 튀면 읽을 수 없다.
 * 아래 값들은 실제 강의 녹음 두 편(6분 32초 / 11분 49초)으로 맞춘 것이다.
 */
const FOLLOW = {
  KP: 0.45,         // 오차 1px 당 속도 보정. 키우면 정확하지만 속도가 출렁인다
  ACCEL: 15,        // 1초에 바꿀 수 있는 속도 폭. 화면 부드러움을 좌우한다
  MIN: -30,         // 자동 주행 속도 하한 — 음수인 이유는 아래 참고
  MAX: 220,
  CONF: 0.55,       // 이 아래 닮음은 '못 알아들었다'
  BASE: 55,
};

/*
 * 하한이 왜 음수인가
 *
 * 화면이 강사보다 앞서 나간 상태에서는 멈추거나 되돌아가야 따라잡힌다.
 * 하한이 양수면 '더 느리게 앞으로'밖에 못 가서 영영 못 따라잡는다.
 * 잡담으로 20초만 비어도 오차가 계속 벌어진다.
 *
 * 실측(NG 3회 들어간 강의, 11분 49초):
 *   하한 +10 → 읽는 줄이 화면 안에 있는 비율 80.2%, 최대 오차 13.8줄
 *   하한   0 → 87.1%
 *   하한 -30 → 95.9%, 최대 오차 6.7줄
 */

class Follower {
  constructor(opt = {}) {
    Object.assign(this, FOLLOW, opt);
    this.reset();
  }

  reset(speed = this.BASE) {
    this.speed = speed;       // 지금 내보내는 속도
    this.rate = this.BASE;    // 강사가 실제로 읽어 나가는 속도 (앞먹임)
    this.target = null;       // 마지막으로 확인된 읽는 자리 (px)
    this.conf = 0;
    this.prevY = null;
    this.prevT = 0;
    this.lastOk = 0;
    this.live = false;        // 한 번이라도 자리를 잡았는가
  }

  /**
   * 음성이 가리키는 자리를 알려 준다.
   * @param {number} y    대본에서 읽고 있는 지점의 세로 위치 (px)
   * @param {number} conf 그 판단의 확신도 0~1
   * @param {number} now  초 단위 시각
   */
  mark(y, conf, now) {
    this.conf = conf;
    if (conf < this.CONF) return;

    // 강사의 실제 읽기 속도를 천천히 따라간다
    if (this.prevY !== null && now > this.prevT) {
      const r = (y - this.prevY) / (now - this.prevT);
      if (r > 0 && r < this.MAX) this.rate = this.rate * 0.9 + r * 0.1;
    }
    this.prevY = y;
    this.prevT = now;
    this.target = y;
    this.lastOk = now;
    this.live = true;
  }

  /**
   * 한 프레임 분 속도를 낸다.
   *
   * 못 알아듣는 동안에는 '마지막으로 확인된 자리'를 지킨다.
   * 대본에서 벗어난 말은 곧 같은 자리로 돌아오기 때문이다.
   * (계속 전진시키면 NG 구간에서 4~8줄을 앞질러 버린다 — 실측)
   *
   * @param {number} offset 지금 화면 위치 (px)
   * @param {number} dt     지난 프레임부터의 경과 (초)
   */
  step(offset, dt) {
    if (!this.live || this.target === null) return this.speed;
    let want = this.rate + this.KP * (this.target - offset);
    want = Math.min(this.MAX, Math.max(this.MIN, want));
    const lim = this.ACCEL * dt;
    this.speed += Math.max(-lim, Math.min(lim, want - this.speed));
    return this.speed;
  }

  /** 운영자에게 보여 줄 상태. */
  state(now) {
    if (!this.live) return 'wait';                       // 아직 못 잡음
    if (now - this.lastOk > 3) return 'lost';            // 놓치는 중
    return this.conf >= 0.8 ? 'good' : 'weak';
  }
}

if (typeof module !== 'undefined') module.exports = { Follower, FOLLOW };
