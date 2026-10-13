/**
 * 마이크 입력을 0.2초씩 모아 보내는 오디오 워크릿.
 *
 * 오디오 전용 스레드에서 돌기 때문에 주행 화면에 영향을 주지 않는다.
 * 128샘플짜리 콜백을 그대로 넘기면 초당 125번 오가게 되므로 여기서 모은다.
 */
const CHUNK = 3200;          // 16kHz 기준 0.2초

class MicChunker extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buf = new Float32Array(CHUNK);
    this.n = 0;
    this.peak = 0;
  }

  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    for (let i = 0; i < ch.length; i++) {
      const v = ch[i];
      if (v > this.peak) this.peak = v; else if (-v > this.peak) this.peak = -v;
      this.buf[this.n++] = v;
      if (this.n === CHUNK) {
        // 복사본을 넘긴다. 버퍼는 계속 쓰므로 소유권을 넘기면 안 된다.
        this.port.postMessage({ pcm: this.buf.slice(0), peak: this.peak });
        this.n = 0;
        this.peak = 0;
      }
    }
    return true;
  }
}

registerProcessor('mic-chunker', MicChunker);
