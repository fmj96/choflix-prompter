# 빌드와 배포

## 1. Mac 에서 준비 (한 번만)

Node.js 18 이상이 필요합니다. 없으면 https://nodejs.org 에서 설치하십시오.

### 배포본만 만들 경우 — 권장

```bash
cd choflix-prompter-web
npm install --ignore-scripts
```

`--ignore-scripts` 는 **Mac 용 Electron 실행 파일을 내려받지 않습니다.**
Windows 배포본을 만드는 데는 필요 없는 파일이고, 이 파일이 macOS 의 보안 검사에
걸리는 경우가 있어 아예 두지 않는 편이 깔끔합니다.

Windows 용 Electron 은 빌드할 때 따로 내려받으므로 이 상태로도 배포본이 만들어집니다.

### Mac 에서 실행해 보려면

```bash
npm install
```

이때 macOS 가 `Electron.app` 을 **악성 코드로 판단해 휴지통으로 옮기는 경우**가 있습니다.
Electron 실행 파일은 서명은 되어 있으나 공증(notarization)은 되어 있지 않아 생기는 일로 알려져 있습니다.

우선 다음을 확인하십시오.

- `npm` 이 공식 저장소(`registry.npmjs.org`)를 보고 있는지 — `npm config get registry`
- 사내 프록시나 미러를 거치고 있지 않은지

확인 후에도 계속 막힌다면, 굳이 Mac 에서 실행할 이유가 없다면
위의 `--ignore-scripts` 방식으로 두고 **Windows PC 에서 확인**하시는 편이 낫습니다.
어차피 실사용 환경이 Windows 입니다.

## 2. 실행해 보기 (선택)

```bash
npm start
```

`--ignore-scripts` 로 설치하셨다면 이 명령은 동작하지 않습니다.
Windows 배포본을 만들어 프롬프터 PC 에서 확인하십시오.

## 3. Windows 배포본 만들기

```bash
npm run build:win
```

`dist/ChoflixPrompter-win32-x64/` 폴더가 만들어집니다.

Electron 공식 Windows 배포본을 내려받아 우리 앱을 넣는 방식이라 **wine 이 필요 없습니다.**
받은 파일은 `.cache/` 에 남으므로 두 번째부터는 내려받지 않습니다.

> **electron-packager 를 쓰지 않는 이유**
>
> electron-packager 는 `package.json` 의 version 을 exe 안에 심으려 합니다.
> 그 작업이 Windows 실행 파일의 리소스를 고쳐 쓰는 일이라 macOS 에서는 wine 을 요구합니다.
> `--icon` 을 빼도 마찬가지입니다.
> 정작 필요한 것은 Electron 배포본에 앱 파일을 넣는 것뿐이라 직접 처리하고,
> 리소스(아이콘 · 버전)는 wine 없이 도는 `resedit` 으로 심습니다.

### Electron 버전 바꾸기

```bash
ELECTRON_VERSION=33.4.11 npm run build:win
```

### 내려받기가 막힐 경우

사내망에서 GitHub 접근이 막혀 있다면, 다른 기기에서
`electron-v33.4.11-win32-x64.zip` 을 직접 받아 프로젝트의 `.cache/` 폴더에 넣으십시오.
스크립트가 그 파일을 그대로 씁니다.

### exe 파일 아이콘

포장할 때 `build/app.ico` (C 로고, 16~256px 7종) 를 exe 안에 심습니다.
탐색기 · 작업표시줄 · 창 제목 모두 C 아이콘으로 나옵니다.

`resedit` 이 Windows 실행 파일의 리소스를 자바스크립트로 직접 고쳐 쓰므로
**이 작업에도 wine 은 필요 없습니다.** 제품명 · 회사명 · 버전 정보도 함께 들어갑니다.

아이콘을 바꾸려면 `build/app.ico` 를 교체하고 다시 포장하면 됩니다.

> **탐색기에서 예전 아이콘이 그대로 보인다면**
>
> Windows 가 아이콘을 캐시해 둔 것입니다. 파일 이름이 같으면 갱신되지 않을 때가 있습니다.
> 폴더를 다른 이름으로 풀거나, 탐색기를 다시 시작하면 반영됩니다.

## 4. 프롬프터 PC 로 옮기기

`dist/ChoflixPrompter-win32-x64/` 폴더를 통째로 압축해 USB 나 NAS 로 옮기고,
프롬프터 PC 에서 풀어 `ChoflixPrompter.exe` 를 실행하십시오.

- 설치 과정이 없습니다
- .NET 런타임 같은 사전 조건이 없습니다
- 폴더 어디에 두어도 됩니다

첫 실행에서 Windows Defender SmartScreen 이 뜰 수 있습니다.
`추가 정보` → `실행` 을 누르시면 됩니다. 서명되지 않은 실행 파일이라 그렇습니다.

## 5. 갱신

수정 후 다시 `npm run build:win` 하고 폴더를 덮어쓰면 됩니다.
설정과 원고는 `%APPDATA%\CHOFLIX PROMPTER\` 에 따로 있어 덮어써도 유지됩니다.

---

## 용량

| 항목 | 크기 |
|---|---|
| 소스 (이 저장소) | 약 100KB |
| `node_modules` | 약 200MB (빌드용, 옮기지 않음) |
| Windows 배포본 | 약 180MB |

Electron 이라 배포본이 큽니다. 프롬프터 PC 에 한 번 두면 되는 것이라
실사용에는 문제가 없지만, 용량이 부담되면 Tauri 로 옮기는 방법이 있습니다
(3~10MB, 대신 Rust 툴체인과 Windows 에서의 빌드가 필요합니다).
