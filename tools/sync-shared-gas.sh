#!/usr/bin/env bash
# tools/sync-shared-gas.sh - salin shared/gas/*.gs ke setiap apps/<modul>/gas/ (IPD task 1.8).
# Projek dikira "aktif" jika folder gas ada appsscript.json.
# Jalankan selepas edit apa-apa dalam shared/gas/, kemudian commit.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
n=0
for dir in "$ROOT"/apps/*/gas; do
  [ -f "$dir/appsscript.json" ] || continue
  for src in "$ROOT"/shared/gas/*.gs; do
    cp "$src" "$dir/$(basename "$src")"
  done
  n=$((n + 1))
  echo "sync: ${dir#$ROOT/}"
done
echo "Siap: $n projek"
