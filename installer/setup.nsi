; CHOFLIX PROMPTER 설치 파일
;
; scripts/pack-setup.mjs 가 makensis 로 만든다. Mac 용 makensis 가 그대로 돌아서 wine 이 필요 없다.
; 넘겨받는 값: VERSION · SRC(dist 의 배포본 폴더) · OUTFILE · ICON
;
; 사용자 폴더(%LOCALAPPDATA%\Programs)에 설치한다. 관리자 권한을 묻지 않으므로
; 방송 PC 에서 IT 담당 없이도 설치 · 업데이트가 된다.
;
; 업데이트는 프로그램이 이 파일을 /S /RUN 으로 돌린다.
;   /S    창 없이 설치 (NSIS 기본)
;   /RUN  설치가 끝나면 프로그램을 다시 띄운다
; 설치 위치는 지난번 위치를 레지스트리에서 읽어 그대로 쓴다.

Unicode true
ManifestDPIAware true
SetCompressor /SOLID lzma
SetCompressorDictSize 64

!include "MUI2.nsh"
!include "FileFunc.nsh"

!define NAME   "CHOFLIX PROMPTER"
!define EXE    "ChoflixPrompter.exe"
!define REGKEY "Software\ChoflixPrompter"
!define UNKEY  "Software\Microsoft\Windows\CurrentVersion\Uninstall\ChoflixPrompter"

Name "${NAME} ${VERSION}"
OutFile "${OUTFILE}"
InstallDir "$LOCALAPPDATA\Programs\${NAME}"
InstallDirRegKey HKCU "${REGKEY}" "InstallDir"
RequestExecutionLevel user
BrandingText "CHOFLIX AI Lab"

!define MUI_ICON   "${ICON}"
!define MUI_UNICON "${ICON}"
!define MUI_ABORTWARNING
!define MUI_FINISHPAGE_RUN      "$INSTDIR\${EXE}"
!define MUI_FINISHPAGE_RUN_TEXT "CHOFLIX PROMPTER 실행"

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "Korean"

VIProductVersion "${VERSION}.0"
VIAddVersionKey /LANG=${LANG_KOREAN} "ProductName"     "${NAME}"
VIAddVersionKey /LANG=${LANG_KOREAN} "FileDescription" "${NAME} 설치"
VIAddVersionKey /LANG=${LANG_KOREAN} "CompanyName"     "CHOFLIX AI Lab"
VIAddVersionKey /LANG=${LANG_KOREAN} "FileVersion"     "${VERSION}"
VIAddVersionKey /LANG=${LANG_KOREAN} "ProductVersion"  "${VERSION}"
VIAddVersionKey /LANG=${LANG_KOREAN} "LegalCopyright"  "© CHOFLIX AI Lab · MIT"

; 실행 중이면 파일이 잠겨 덮어쓸 수 없다.
; 업데이트(/S)는 프로그램이 스스로 닫히는 중이므로 잠깐 기다린 뒤 남은 것만 정리한다.
; 손으로 설치할 때는 방송 중일 수 있으므로 닫기 전에 묻는다.
!macro CloseApp ID
  IfSilent 0 +3
    Sleep 2000
    Goto kill_${ID}
  ; find 는 찾으면 0 을 돌려준다
  nsExec::Exec 'cmd /c tasklist /FI "IMAGENAME eq ${EXE}" /NH | find /I "${EXE}"'
  Pop $0
  StrCmp $0 "0" 0 done_${ID}
  MessageBox MB_OKCANCEL|MB_ICONEXCLAMATION "CHOFLIX PROMPTER 가 실행 중입니다.$\n$\n확인을 누르면 프로그램을 닫고 계속합니다. (원고는 자동 보존되어 있습니다)" IDOK kill_${ID}
  Abort
  kill_${ID}:
  nsExec::Exec 'taskkill /F /IM "${EXE}"'
  Pop $0
  Sleep 800
  done_${ID}:
!macroend

Section "Install"
  !insertmacro CloseApp inst

  SetOutPath "$INSTDIR"
  ; 이전 버전 파일이 남지 않게 앱 자리를 비운다. 설정 · 원고는 %APPDATA% 에 있어 상관없다.
  RMDir /r "$INSTDIR\resources"
  RMDir /r "$INSTDIR\locales"
  File /r "${SRC}/*"

  WriteUninstaller "$INSTDIR\Uninstall.exe"

  CreateShortcut "$SMPROGRAMS\${NAME}.lnk" "$INSTDIR\${EXE}"
  ; 업데이트 때 바탕화면 바로가기를 되살리지 않는다 — 지웠다면 지운 대로 둔다
  IfSilent +2
    CreateShortcut "$DESKTOP\${NAME}.lnk" "$INSTDIR\${EXE}"

  WriteRegStr HKCU "${REGKEY}" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "${UNKEY}" "DisplayName"     "${NAME}"
  WriteRegStr HKCU "${UNKEY}" "DisplayVersion"  "${VERSION}"
  WriteRegStr HKCU "${UNKEY}" "DisplayIcon"     "$INSTDIR\${EXE}"
  WriteRegStr HKCU "${UNKEY}" "Publisher"       "CHOFLIX AI Lab"
  WriteRegStr HKCU "${UNKEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${UNKEY}" "UninstallString" '"$INSTDIR\Uninstall.exe"'
  WriteRegStr HKCU "${UNKEY}" "QuietUninstallString" '"$INSTDIR\Uninstall.exe" /S'
  WriteRegStr HKCU "${UNKEY}" "URLInfoAbout"    "https://github.com/fmj96/choflix-prompter"
  WriteRegDWORD HKCU "${UNKEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNKEY}" "NoRepair" 1
  ${GetSize} "$INSTDIR" "/S=0K" $0 $1 $2
  IntFmt $0 "0x%08X" $0
  WriteRegDWORD HKCU "${UNKEY}" "EstimatedSize" $0
SectionEnd

Function .onInstSuccess
  ${GetParameters} $R0
  ClearErrors
  ${GetOptions} $R0 "/RUN" $R1
  IfErrors +2
    Exec '"$INSTDIR\${EXE}"'
FunctionEnd

; 지우는 것은 설치한 것만. 사용자가 고른 폴더에 다른 파일이 있을 수 있어 통째로 지우지 않는다.
; 설정 · 원고(%APPDATA%\CHOFLIX PROMPTER)도 남긴다 — 다시 설치하면 그대로 이어 쓴다.
Section "Uninstall"
  !insertmacro CloseApp uninst

  Delete "$SMPROGRAMS\${NAME}.lnk"
  Delete "$DESKTOP\${NAME}.lnk"

  RMDir /r "$INSTDIR\resources"
  RMDir /r "$INSTDIR\locales"
  Delete "$INSTDIR\${EXE}"
  Delete "$INSTDIR\*.dll"
  Delete "$INSTDIR\*.pak"
  Delete "$INSTDIR\*.bin"
  Delete "$INSTDIR\*.dat"
  Delete "$INSTDIR\*.json"
  Delete "$INSTDIR\LICENSE"
  Delete "$INSTDIR\LICENSES.chromium.html"
  Delete "$INSTDIR\version"
  Delete "$INSTDIR\Uninstall.exe"
  RMDir "$INSTDIR"

  DeleteRegKey HKCU "${UNKEY}"
  DeleteRegKey HKCU "${REGKEY}"
SectionEnd
