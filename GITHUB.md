# GitHub 배포 절차

`choflix-prompter-web-v3.0.zip` 안에 **커밋까지 마친 Git 저장소**가 들어 있습니다.
압축을 풀면 `.git` 폴더가 함께 나오므로 원격만 연결해 올리면 됩니다.

> 프롬프터 PC 는 인터넷이 없으므로 **Mac 에서 진행**하십시오.

---

## 1. GitHub 에 빈 저장소 만들기

github.com → New repository

| 항목 | 값 |
|---|---|
| Repository name | `choflix-prompter` |
| 공개 범위 | Private (또는 Public) |
| Initialize this repository | **아무것도 체크하지 마십시오** |

README·.gitignore·license 를 함께 만들면 첫 푸시에서 충돌이 납니다.

## 2. 압축 풀고 원격 연결

```bash
cd ~/projects
unzip choflix-prompter-web-v3.0.zip
cd choflix-prompter-web

git remote add origin git@github.com:<계정>/choflix-prompter.git
git push -u origin main
```

SSH 키를 쓰지 않으신다면 HTTPS 로도 됩니다.

```bash
git remote add origin https://github.com/<계정>/choflix-prompter.git
```

## 3. 확인

```bash
git remote -v
git log --oneline
```

커밋 작성자는 `CHOFLIX <fmj1996@gmail.com>` 로 지정해 두었습니다.
다른 이름으로 올리시려면 푸시 전에 바꾸십시오.

```bash
git config user.name  "이름"
git config user.email "메일주소"
git commit --amend --reset-author --no-edit
```

---

## 4. 릴리스 등록 (선택)

배포본(exe)을 함께 올리시려면 Releases 를 쓰십시오. 빌드 산출물은
`.gitignore` 로 제외되어 있어 저장소에는 소스만 들어갑니다.

1. Mac 에서 `npm run build:win` 실행
2. `dist/ChoflixPrompter-win32-x64/` 폴더를 압축
3. GitHub → Releases → Draft a new release
   - Tag: `v3.0`
   - Title: `CHOFLIX PROMPTER v3.0`
   - 본문: `CHANGELOG.md` 의 해당 버전 부분을 붙여넣기
   - 압축한 배포본 첨부

## 5. 이후 작업 흐름

```bash
# Mac 에서 코드 수정 후
git add -A
git commit -m "설명"
git push
npm run build:win

# 만들어진 dist/ChoflixPrompter-win32-x64/ 를 USB 나 NAS 로 옮겨 실행
```

프롬프터 PC 에는 인터넷이 없으므로 빌드는 항상 Mac 에서 합니다.

---

## 저장소에 들어가는 것 / 안 들어가는 것

| 포함 | 제외 (`.gitignore`) |
|---|---|
| `src/` · `scripts/` · `build/` | `node_modules/` |
| `package.json` | `dist/` |
| `README.md` · `CLAUDE.md` · `BUILD.md` · `CHANGELOG.md` | `.cache/` |

## 라이선스

라이선스 파일은 넣지 않았습니다. 공개 저장소로 올리실 계획이면
사용 조건을 정해 `LICENSE` 파일을 추가하십시오.
사내용으로만 쓰신다면 Private 저장소로 두고 넘어가셔도 됩니다.
