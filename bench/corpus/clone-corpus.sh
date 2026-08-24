#!/usr/bin/env bash
# Clone the codeweb evaluation corpus AT THE COMMITTED PINS and record a manifest.
#
# The repos themselves are gitignored (large, regenerable); only the committed
# bench/corpus.manifest.json pins them by SHA so the experiments reproduce exactly.
#
# The manifest is the SOURCE OF TRUTH, not an output. When a repo is already pinned there this
# script fetches and checks out that exact SHA and leaves the manifest alone. It only writes the
# manifest when it had to pin something new (a repo with no recorded SHA) — so re-running can no
# longer silently unpin the corpus to today's default-branch HEAD and dirty a tracked file, which
# is what made "reproduce the benchmarks" quietly measure different revisions.
#
#   bash bench/corpus/clone-corpus.sh            # clone/checkout every repo at its pinned SHA
#   bash bench/corpus/clone-corpus.sh --repin    # deliberately re-pin every repo to current HEAD
#
# Re-running without --repin is idempotent: an already-pinned checkout is verified, not touched.
set -u

CORPUS_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$CORPUS_DIR/../.." && pwd)"
MANIFEST="$ROOT/bench/corpus.manifest.json"

REPIN=0
for arg in "$@"; do
  case "$arg" in
    --repin) REPIN=1 ;;
    *) echo "[FAIL] unknown argument: $arg (usage: clone-corpus.sh [--repin])"; exit 2 ;;
  esac
done

# name url  (one per line) — a broad basket spanning JS, TS, Python, Rust, Go.
REPOS="axios https://github.com/axios/axios.git
express https://github.com/expressjs/express.git
zod https://github.com/colinhacks/zod.git
flask https://github.com/pallets/flask.git
ripgrep https://github.com/BurntSushi/ripgrep.git
gorilla-mux https://github.com/gorilla/mux.git"

# Read the pinned SHA for a repo out of the committed manifest ('' when absent). node is already a
# hard requirement for every benchmark here, so parse the JSON properly rather than by regex.
pinned_sha() {
  [ -f "$MANIFEST" ] || return 0
  node -e '
    const fs = require("fs");
    try {
      const m = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
      const e = (Array.isArray(m) ? m : []).find((x) => x && x.name === process.argv[2]);
      if (e && typeof e.sha === "string" && /^[0-9a-f]{7,40}$/.test(e.sha)) process.stdout.write(e.sha);
    } catch { /* unreadable manifest -> treat as unpinned */ }
  ' "$MANIFEST" "$1" 2>/dev/null
}

wrote_new_pin=0
tmp="$MANIFEST.tmp"
echo "[" > "$tmp"
first=1
while read -r name url; do
  [ -z "$name" ] && continue
  dir="$CORPUS_DIR/$name"
  want=""
  [ "$REPIN" -eq 1 ] || want="$(pinned_sha "$name")"

  if [ ! -d "$dir/.git" ]; then
    if [ -n "$want" ]; then
      # Fetch only the pinned commit. Some servers refuse by-SHA fetches; fall back to a full clone.
      echo "[clone] $name <- $url @ $want"
      git init -q "$dir" >/dev/null 2>&1 && git -C "$dir" remote add origin "$url" >/dev/null 2>&1
      if ! git -C "$dir" fetch -q --depth 1 origin "$want" >/dev/null 2>&1; then
        rm -rf "$dir"
        git clone -q "$url" "$dir" >/dev/null 2>&1 || { echo "[FAIL] $name (clone)"; continue; }
      fi
    else
      echo "[clone] $name <- $url (unpinned: recording today's HEAD)"
      git clone -q --depth 1 "$url" "$dir" >/dev/null 2>&1 || { echo "[FAIL] $name (clone)"; continue; }
    fi
  fi

  if [ -n "$want" ]; then
    if [ "$(git -C "$dir" rev-parse HEAD 2>/dev/null)" != "$want" ]; then
      git -C "$dir" cat-file -e "${want}^{commit}" 2>/dev/null || git -C "$dir" fetch -q --depth 1 origin "$want" >/dev/null 2>&1 || git -C "$dir" fetch -q origin >/dev/null 2>&1
      if ! git -C "$dir" checkout -q --detach "$want" >/dev/null 2>&1; then
        echo "[FAIL] $name: pinned $want not reachable — delete $dir and re-run, or --repin deliberately"
        continue
      fi
      echo "[pin]  $name -> $want"
    else
      echo "[ok]   $name already at pinned $want"
    fi
  else
    wrote_new_pin=1
  fi

  sha=$(git -C "$dir" rev-parse HEAD 2>/dev/null || echo UNKNOWN)
  desc=$(git -C "$dir" describe --tags --always 2>/dev/null || echo UNKNOWN)
  files=$(find "$dir" -type f \( -name '*.js' -o -name '*.mjs' -o -name '*.ts' -o -name '*.py' -o -name '*.rs' -o -name '*.go' \) -not -path '*/node_modules/*' -not -path '*/.git/*' 2>/dev/null | wc -l | tr -d ' ')
  if [ $first -eq 1 ]; then first=0; else echo "," >> "$tmp"; fi
  printf '  {"name":"%s","url":"%s","sha":"%s","describe":"%s","sourceFiles":%s}' "$name" "$url" "$sha" "$desc" "${files:-0}" >> "$tmp"
  echo "       $name @ $desc ($sha) — ${files:-0} source files"
done <<EOF
$REPOS
EOF
echo "" >> "$tmp"
echo "]" >> "$tmp"

if [ "$REPIN" -eq 1 ] || [ "$wrote_new_pin" -eq 1 ]; then
  mv "$tmp" "$MANIFEST"
  echo "[done] manifest WRITTEN -> $MANIFEST (review the diff: this changes which revisions every benchmark measures)"
else
  rm -f "$tmp"
  echo "[done] every repo verified at its committed pin; manifest left untouched"
fi
