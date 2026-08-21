# GitHub 올리기

이 폴더가 이미 **커밋까지 마친 Git 저장소**입니다. 원격만 연결하면 됩니다.

> 프롬프터 PC 는 인터넷이 없으므로 **Mac 에서 진행**하십시오.

---

## 1. 인증 — 먼저 해야 합니다

이 Mac 에는 지금 GitHub 인증 수단이 없습니다. 둘 중 하나를 고르십시오.

### 방법 A — SSH 키 등록 (권장)

키는 이미 만들어져 있습니다. 공개키만 GitHub 에 붙여 넣으면 됩니다.

```bash
cat ~/.ssh/id_ed25519.pub
```

출력된 한 줄을 복사해 **github.com → Settings → SSH and GPG keys → New SSH key** 에 붙여 넣고 저장합니다.
Title 은 아무거나(예: `macbook-musetalk`) 넣으면 됩니다.

확인:

```bash
ssh -T git@github.com
```

`Hi <계정>! You've successfully authenticated...` 가 나오면 됩니다.

### 방법 B — GitHub CLI

```bash
brew install gh
gh auth login
```

브라우저가 열리면 로그인하고 안내를 따릅니다.

---

## 2. 빈 저장소 만들기

github.com → **New repository**

| 항목 | 값 |
|---|---|
| Repository name | `choflix-prompter` |
| 공개 범위 | Private (사내용) 또는 Public |
| Initialize this repository | **아무것도 체크하지 마십시오** |

README·.gitignore·license 를 함께 만들면 첫 푸시에서 충돌이 납니다.

`gh` 를 설치하셨다면 명령으로도 됩니다.

```bash
gh repo create choflix-prompter --private --source=. --remote=origin --push
```

이 명령 하나로 저장소 생성부터 푸시까지 끝나므로 3번은 건너뛰어도 됩니다.

## 3. 원격 연결하고 올리기

```bash
git remote add origin git@github.com:<계정>/choflix-prompter.git
git push -u origin main
```

HTTPS 를 쓰신다면 주소만 바꿉니다.

```bash
git remote add origin https://github.com/<계정>/choflix-prompter.git
```

## 4. 확인

```bash
git remote -v
git log --oneline -5
```

커밋 작성자는 `CHOFLIX <fmj1996@gmail.com>` 입니다.
다른 이름으로 올리시려면 푸시 **전에** 바꾸십시오.

```bash
git config user.name  "이름"
git config user.email "메일주소"
```

---

## 5. 릴리스 등록 (선택)

배포본(exe)은 `.gitignore` 로 제외되어 저장소에는 소스만 들어갑니다.
실행 파일을 함께 올리시려면 Releases 를 쓰십시오.

1. `npm run build:win`
2. `dist/ChoflixPrompter-win32-x64/` 폴더를 압축
3. GitHub → Releases → Draft a new release
   - Tag: `v3.0.1`
   - Title: `CHOFLIX PROMPTER v3.0.1`
   - 본문: `CHANGELOG.md` 의 해당 버전 부분
   - 압축한 배포본 첨부

`gh` 를 쓰신다면 한 줄입니다.

```bash
gh release create v3.0.1 ChoflixPrompter-win32-x64.zip --title "CHOFLIX PROMPTER v3.0.1" --notes-file CHANGELOG.md
```

## 6. 이후 작업 흐름

```bash
# Mac 에서 코드 수정 후
git add -A
git commit -m "설명"
git push
npm run build:win

# 만들어진 dist/ChoflixPrompter-win32-x64/ 를 USB 나 NAS 로 옮겨 실행
```

빌드는 항상 Mac 에서 합니다. 프롬프터 PC 에는 인터넷이 없습니다.

---

## 저장소에 들어가는 것 / 안 들어가는 것

| 포함 | 제외 (`.gitignore`) |
|---|---|
| `src/` · `scripts/` · `build/` | `node_modules/` |
| `dev/` · `docs-src/` | `dist/` |
| `package.json` · `package-lock.json` | `.cache/` |
| `README.md` · `CLAUDE.md` · `BUILD.md` · `CHANGELOG.md` | `.claude/settings.local.json` |

사용설명서 PDF 와 스티커 JPG 는 저장소 바깥 `../문서/` 에 있습니다.
원본 HTML(`docs-src/`)만 저장소에 두고, `npm run build:docs` 로 언제든 다시 만듭니다.

## 라이선스

라이선스 파일은 넣지 않았습니다. 공개 저장소로 올리실 계획이면
사용 조건을 정해 `LICENSE` 파일을 추가하십시오.
사내용으로만 쓰신다면 Private 저장소로 두고 넘어가셔도 됩니다.
