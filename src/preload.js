const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('cx', {
  // 화면
  displays:    ()          => ipcRenderer.invoke('displays'),
  openStage:   (id)        => ipcRenderer.invoke('stage:open', id),
  closeStage:  ()          => ipcRenderer.invoke('stage:close'),
  fullscreen:  (on)        => ipcRenderer.invoke('window:fullscreen', on),

  // 창 사이 통신
  toStage:     (msg)       => ipcRenderer.send('stage:send', msg),
  onStageMsg:  (fn)        => ipcRenderer.on('stage:msg', (_e, m) => fn(m)),
  report:      (msg)       => ipcRenderer.send('stage:report', msg),
  onReport:    (fn)        => ipcRenderer.on('stage:report', (_e, m) => fn(m)),
  onStageClosed: (fn)      => ipcRenderer.on('stage:closed', () => fn()),

  // 저장
  loadConfig:  ()          => ipcRenderer.invoke('config:load'),
  saveConfig:  (d)         => ipcRenderer.invoke('config:save', d),
  loadScript:  ()          => ipcRenderer.invoke('script:load'),
  saveScript:  (t)         => ipcRenderer.invoke('script:save', t),
  importScript:()          => ipcRenderer.invoke('script:import'),
  exportScript:(t)         => ipcRenderer.invoke('script:export', t),

  // 음성 인식
  asrStart:    (n)         => ipcRenderer.invoke('asr:start', n),
  asrStop:     ()          => ipcRenderer.invoke('asr:stop'),
  asrPcm:      (s)         => ipcRenderer.send('asr:pcm', s),
  asrReset:    ()          => ipcRenderer.send('asr:reset'),
  onAsr:       (fn)        => ipcRenderer.on('asr:msg', (_e, m) => fn(m))
});
