#!/usr/bin/env bash
# Clone the codeweb evaluation corpus at pinned commits and record a manifest.
#
# The repos themselves are gitignored (large, regenerable); only the committed
# bench/corpus.manifest.json pins them by SHA so the experiments reproduce exactly.
# Re-running is idempotent: an already-cloned repo is left untouched and re-recorded.
set -u

CORPUS_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$CORPUS_DIR/../.." && pwd)"
MANIFEST="$ROOT/bench/corpus.manifest.json"

# name url  (one per line) — a broad basket spanning JS, TS, Python, Rust, Go.
REPOS="axios https://github.com/axios/axios.git
express https://github.com/expressjs/express.git
zod https://github.com/colinhacks/zod.git
flask https://github.com/pallets/flask.git
ripgrep https://github.com/BurntSushi/ripgrep.git
gorilla-mux https://github.com/gorilla/mux.git"

tmp="$MANIFEST.tmp"
echo "[" > "$tmp"
first=1
while read -r name url; do
  [ -z "$name" ] && continue
  dir="$CORPUS_DIR/$name"
  if [ ! -d "$dir/.git" ]; then
    echo "[clone] $name <- $url"
    git clone --depth 1 "$url" "$dir" >/dev/null 2>&1 || { echo "[FAIL] $name"; continue; }
  else
    echo "[skip] $name already present"
  fi
  sha=$(git -C "$dir" rev-parse HEAD 2>/dev/null || echo UNKNOWN)
  desc=$(git -C "$dir" describe --tags --always 2>/dev/null || echo UNKNOWN)
  files=$(find "$dir" -type f \( -name '*.js' -o -name '*.mjs' -o -name '*.ts' -o -name '*.py' -o -name '*.rs' -o -name '*.go' \) -not -path '*/node_modules/*' -not -path '*/.git/*' 2>/dev/null | wc -l | tr -d ' ')
  if [ $first -eq 1 ]; then first=0; else echo "," >> "$tmp"; fi
  printf '  {"name":"%s","url":"%s","sha":"%s","describe":"%s","sourceFiles":%s}' "$name" "$url" "$sha" "$desc" "${files:-0}" >> "$tmp"
  echo "[ok]   $name @ $desc ($sha) — ${files:-0} source files"
done <<EOF
$REPOS
EOF
echo "" >> "$tmp"
echo "]" >> "$tmp"
mv "$tmp" "$MANIFEST"
echo "[done] manifest -> $MANIFEST"
