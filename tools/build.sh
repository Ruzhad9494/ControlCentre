#!/usr/bin/env bash
# tools/build.sh - susun output Cloudflare Pages ke dist/ (IPD task 0.3, 0.4).
#
# Tiada npm, tiada bundler: hanya salin fail statik ke laluan URL yang betul.
# Sebab ada langkah ni: jika output dir = root repo, fail apps/*/gas, docs/,
# config/ dan .github/ semuanya boleh dibaca orang awam di cc.voltake.com.
#
# Cloudflare Pages:  Build command = bash tools/build.sh   Output dir = dist
# Folder functions/ di root repo dikesan terus oleh Pages (bukan dari dist/).

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="${1:-$ROOT/dist}"

rm -rf "$OUT"
mkdir -p "$OUT"

copy_dir() {
  # copy_dir <sumber> <destinasi>: salin kandungan, buang .gitkeep
  local src="$1" dst="$2"
  [ -d "$src" ] || return 0
  mkdir -p "$dst"
  cp -R "$src"/. "$dst"/
  find "$dst" -name '.gitkeep' -delete
}

# 1. Portal teras di /
copy_dir "$ROOT/apps/portal" "$OUT"

# 2. Frontend setiap modul di /<modul>/  (access tiada UI)
for web in "$ROOT"/apps/*/web; do
  [ -d "$web" ] || continue
  mod="$(basename "$(dirname "$web")")"
  if [ "$mod" = "portal" ] || [ "$mod" = "access" ]; then continue; fi
  if [ -z "$(find "$web" -type f ! -name '.gitkeep' -print -quit)" ]; then continue; fi
  copy_dir "$web" "$OUT/$mod"
done

# 3. Kod kongsi frontend
copy_dir "$ROOT/shared/ui"  "$OUT/shared/ui"
copy_dir "$ROOT/shared/lib" "$OUT/shared/lib"
copy_dir "$ROOT/shared/vendor" "$OUT/shared/vendor"

# 4. Halaman public
for p in "$ROOT"/public-pages/*/; do
  [ -d "$p" ] || continue
  name="$(basename "$p")"
  if [ -z "$(find "$p" -type f ! -name '.gitkeep' -print -quit)" ]; then continue; fi
  copy_dir "$p" "$OUT/public/$name"
done

# 5. Fail root Cloudflare / PWA (jika wujud). _routes.json hadkan Functions ke /auth, /api, /public/api
#    supaya fail statik tak guna kuota 100,000 request Functions sehari.
for f in _headers _redirects _routes.json manifest.webmanifest sw.js robots.txt; do
  [ -f "$ROOT/$f" ] && cp "$ROOT/$f" "$OUT/$f"
done

# 6. Jaring keselamatan: gagal jika fail sensitif tersalin
if find "$OUT" \( -name '*.gs' -o -name '.clasp*' -o -name '*.md' -o -name '.env*' -o -name '*.key' -o -name 'appsscript.json' \) -print | grep -q .; then
  echo "RALAT: fail backend/dokumen/secret dijumpai dalam $OUT" >&2
  find "$OUT" \( -name '*.gs' -o -name '.clasp*' -o -name '*.md' -o -name '.env*' -o -name '*.key' -o -name 'appsscript.json' \) -print >&2
  exit 1
fi

echo "Build siap: $OUT ($(find "$OUT" -type f | wc -l | tr -d ' ') fail)"
