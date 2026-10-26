#!/usr/bin/env bash
# 배포본 화면 코드 압축: 사이트 폴더(대전·세종·서울)마다 static 의 *.js·*.css 에서 설명 주석을 지우고
# 이름을 줄여, 그대로 가져다 읽거나 고쳐 쓰기 어렵게 합니다. 저장소의 원본은 그대로 두고 배포할 파일만 바꿉니다.
# 파일 맨 위에는 권리 표시를 붙입니다. 한글 문구는 그대로 둡니다(--charset=utf8, 안 그러면 \uXXXX 로 늘어남).
# 쓰는 법: scripts/minify_site.sh <사이트 폴더> [esbuild 명령]
set -euo pipefail
root="$1"
esb="${2:-npx --yes esbuild@0.24.2}"
banner='/*! © 2026 아파트 지수. All rights reserved. 무단 복제·재배포·리버스 엔지니어링을 금지합니다 (terms.html) */'
find "$root" -type d -name static | while read -r d; do
  files=$(find "$d" -maxdepth 1 \( -name '*.js' -o -name '*.css' \) | sort)
  [ -n "$files" ] || continue
  before=$(cat $files | wc -c)
  # shellcheck disable=SC2086
  $esb $files --minify --charset=utf8 --legal-comments=none --outdir="$d" --allow-overwrite \
    --banner:js="$banner" --banner:css="$banner" --log-level=warning
  echo "압축: $d $(echo $files | wc -w)개 파일 $((before / 1024))KB → $(($(cat $files | wc -c) / 1024))KB"
done
