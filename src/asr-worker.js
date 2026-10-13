/**
 * 음성 인식 전담 프로세스.
 *
 * 주행 화면이 도는 렌더러와 떨어뜨려 놓는 것이 이 파일의 존재 이유다.
 * v3 으로 옮긴 이유가 '주행 부드러움' 하나였는데, 인식을 같은 스레드에
 * 올리면 프레임이 밀려 그 떨림이 다시 보인다.
 *
 * 하는 일은 소리를 받아 글자를 내보내는 것뿐이다.
 * 대본과 맞추는 일(tracker)과 속도 조절(follow)은 렌더러에서 한다 — 거의 공짜다.
 */
const path = require('path');

let rec = null, stream = null, said = '';
let frames = 0, busyMs = 0;

const send = m => process.parentPort.postMessage(m);

function start(modelDir, threads) {
  const sherpa = require('sherpa-onnx-node');
  rec = new sherpa.OnlineRecognizer({
    featConfig: { sampleRate: 16000, featureDim: 80 },
    modelConfig: {
      transducer: {
        encoder: path.join(modelDir, 'encoder-epoch-99-avg-1.int8.onnx'),
        decoder: path.join(modelDir, 'decoder-epoch-99-avg-1.onnx'),
        joiner:  path.join(modelDir, 'joiner-epoch-99-avg-1.int8.onnx'),
      },
      tokens: path.join(modelDir, 'tokens.txt'),
      numThreads: threads, provider: 'cpu',
    },
    decodingMethod: 'greedy_search',
    enableEndpoint: true,
    rule1MinTrailingSilence: 2.4,
    rule2MinTrailingSilence: 1.0,
    rule3MinUtteranceLength: 300,
  });
  stream = rec.createStream();
  said = '';
}

function feed(samples) {
  if (!rec) return;
  const t0 = Date.now();
  stream.acceptWaveform({ sampleRate: 16000, samples });
  while (rec.isReady(stream)) rec.decode(stream);

  const now = rec.getResult(stream).text;
  if (now !== said) {
    // 앞부분이 수정되는 경우가 있어, 늘어난 만큼만 보낼지 통째로 보낼지 구분한다
    const grew = now.startsWith(said) && now.length > said.length;
    send({ t: 'text', w: grew ? now.slice(said.length) : now, redo: !grew });
    said = now;
  }
  if (rec.isEndpoint(stream)) { rec.reset(stream); said = ''; }

  busyMs += Date.now() - t0;
  if (++frames % 25 === 0) {                 // 5초마다 살아 있음을 알린다
    send({ t: 'beat', frames, load: busyMs / (frames * 200) });
    busyMs = 0; frames = 0;
  }
}

process.parentPort.on('message', e => {
  const m = e.data;
  try {
    if (m.t === 'start') { start(m.model, m.threads || 2); send({ t: 'ready' }); }
    else if (m.t === 'pcm') feed(Float32Array.from(m.samples));
    else if (m.t === 'reset') { if (rec && stream) { rec.reset(stream); said = ''; } }
  } catch (err) {
    send({ t: 'error', message: String(err && err.message || err) });
  }
});
