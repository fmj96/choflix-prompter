// 확장 배치에서 프롬프터 모니터를 차지하는 출력 창.
// 주행 엔진은 이 창에서 돌고, 상태만 운영자 화면으로 되돌려 보낸다.
const el = id => document.getElementById(id);

const engine = new Engine({
  stage: el('stage'), mirror: el('mirror'), lines: el('lines'), cue: el('cueline'),
  hud: el('hud'), hudElapsed: el('hudElapsed'), hudRemain: el('hudRemain'), fstat: el('fstat')
});

engine.onReport = r => cx.report(r);

cx.onStageMsg(m => {
  switch (m.t) {
    case 'apply':        engine.apply(m.s); break;
    case 'start':        engine.start(); break;
    case 'stop':         engine.stop(); break;
    case 'toggle':       engine.toggle(); break;
    case 'toTop':        engine.toTop(); break;
    case 'toRow':        engine.toRow(m.i); break;
    case 'nudge':        engine.nudge(m.p); break;
    case 'page':         engine.page(m.f); break;
    case 'resetElapsed': engine.resetElapsed(); break;
    case 'relayout':     engine.relayout(); break;
  }
});

addEventListener('resize', () => engine.relayout());
