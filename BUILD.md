# 빌드와 배포

## 1. Mac 에서 준비 (한 번만)

Node.js 18 이상이 필요합니다. 없으면 https://nodejs.org 에서 설치하십시오.

```bash
cd choflix-prompter-web
npm install
```

`node_modules` 가 만들어지며 200MB 정도 받습니다. 인터넷이 필요한 유일한 단계입니다.

## 2. 실행해 보기

```bash
npm start
```

Mac 에서도 그대로 동작합니다. 기능 확인은 여기서 하시는 게 빠릅니다.

## 3. Windows 배포본 만들기

```bash
npm run build:win
```

`dist/ChoflixPrompter-win32-x64/` 폴더가 만들어집니다.

> Mac 에서 Windows 배포본을 만들 수 있습니다.
> Electron 의 Windows 실행 파일을 내려받아 앱 파일을 얹는 방식이라 Wine 같은 것이 필요 없습니다.

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
