/**
 * 마이크를 열고 0.2초짜리 조각을 흘려보낸다.
 *
 * 방송 신호를 그대로 받아야 하므로 브라우저의 자동 보정은 모두 끈다.
 * 에코 제거나 자동 게인이 끼면 인식이 오히려 나빠진다.
 */
class Mic {
  constructor(onChunk) {
    this.onChunk = onChunk;
    this.ctx = null;
    this.stream = null;
    this.node = null;
  }

  get on() { return !!this.ctx; }

  async start(deviceId) {
    if (this.ctx) return;
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: deviceId ? { exact: deviceId } : undefined,
        channelCount: 1,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      }
    });
    // 16kHz 로 열면 리샘플링을 브라우저가 알아서 한다
    this.ctx = new AudioContext({ sampleRate: 16000 });
    await this.ctx.audioWorklet.addModule('mic-worklet.js');
    this.node = new AudioWorkletNode(this.ctx, 'mic-chunker');
    this.node.port.onmessage = e => this.onChunk(e.data.pcm, e.data.peak);
    this.ctx.createMediaStreamSource(this.stream).connect(this.node);
    // 워크릿은 목적지에 이어져야 돌아간다. 소리는 내보내지 않는다.
    const mute = this.ctx.createGain();
    mute.gain.value = 0;
    this.node.connect(mute).connect(this.ctx.destination);
  }

  async stop() {
    this.node?.port && (this.node.port.onmessage = null);
    this.stream?.getTracks().forEach(t => t.stop());
    await this.ctx?.close().catch(() => {});
    this.ctx = this.stream = this.node = null;
  }

  /** 입력 장치 목록. 권한을 받은 뒤에만 이름이 채워진다. */
  static async devices() {
    const all = await navigator.mediaDevices.enumerateDevices();
    return all.filter(d => d.kind === 'audioinput')
              .map(d => ({ id: d.deviceId, label: d.label || '마이크' }));
  }
}
