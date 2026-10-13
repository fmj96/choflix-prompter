// 브라우저 미리보기용 임시 통로. Electron 의 preload(cx) 를 흉내만 낸다.
// 배포본에는 들어가지 않는다 — 이 폴더는 포장 대상이 아니다.
const SAMPLE = Array.from({ length: 54 }, (_, i) =>
  `${i + 1}번째 줄입니다. 안녕하십니까, 오늘 뉴스를 전해 드리겠습니다. ` +
  `방송용 프롬프터 원고는 어절 단위로 줄이 바뀌어야 읽기 편합니다.`).join('\n');

window.cx = {
  // 프롬프터 모니터(1360×768) 한 대가 붙어 있는 것으로 본다
  displays: async () => [{ id: 1, index: 0, width: 1360, height: 768, scale: 1, primary: true }],
  openStage: async () => true, closeStage: async () => true, fullscreen: async () => true,
  toStage() {}, onStageMsg() {}, report() {}, onReport() {}, onStageClosed() {},
  loadConfig: async () => null, saveConfig: async () => true,
  loadScript: async () => ({ text: SAMPLE, at: Date.now() }), saveScript: async () => true,
  importScript: async () => null, exportScript: async () => true,

  // 음성 인식 — 브라우저에서는 흉내만 낸다
  asrStart: async () => { setTimeout(() => _asr && _asr({ t: 'ready' }), 300); return true; },
  asrStop:  async () => true,
  asrPcm:   () => {},
  asrReset: () => {},
  onAsr:    fn => { _asr = fn; }
};
let _asr = null;

/** 미리보기에서 추종을 시험하려면 콘솔에서 이걸 부른다. */
window.fakeHeard = t => _asr && _asr({ t: 'text', w: t, redo: true });
