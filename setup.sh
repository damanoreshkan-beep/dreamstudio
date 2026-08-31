#!/bin/sh
# DreamStudio ← microspec: link the framework into this tree (packages/, tools/, deploy/ are NEVER content
# of this repo — see README). Locally the link points at the working copy; in CI at the pinned checkout.
#   MICROSPEC_DIR=/path/to/microspec ./setup.sh     (default: ./microspec if present, else /root/microspec)
set -eu
DIR="${MICROSPEC_DIR:-}"
[ -z "$DIR" ] && [ -d ./microspec/packages ] && DIR="$(pwd)/microspec"
[ -z "$DIR" ] && DIR=/root/microspec
[ -d "$DIR/packages" ] || { echo "microspec not found at $DIR (clone it or set MICROSPEC_DIR)"; exit 1; }
for d in packages tools deploy; do ln -sfn "$DIR/$d" "$d"; done

# rt/ is the COMPLETE runtime mirror: OUR domain modules (tide, astrology, the RF families, …) are real,
# committed files here; every framework core file (js/css/json/webp, tests excluded) is symlinked in beside
# them. One directory then IS /_rt/ for every resolver — the gates server, the build, the compat bundler,
# the preflight import map, and the unit tests' relative core imports (rt/tide.js → ./feed.js just works).
# The symlinks are machine-local: they are listed one by one in .git/info/exclude (never a glob — a NEW real
# module must still show up in `git status`).
mkdir -p rt
EXCL=.git/info/exclude
if [ -f "$EXCL" ]; then grep -v '^rt/' "$EXCL" > "$EXCL.tmp" || true; mv "$EXCL.tmp" "$EXCL"; fi
for f in "$DIR"/packages/runtime/*.js "$DIR"/packages/runtime/*.css "$DIR"/packages/runtime/*.json "$DIR"/packages/runtime/*.webp; do
  [ -e "$f" ] || continue
  b=$(basename "$f")
  case "$b" in *_test.js) continue ;; esac
  if [ -f "rt/$b" ] && [ ! -L "rt/$b" ]; then continue; fi   # a real product module wins over a core link
  ln -sf "$f" "rt/$b"
  echo "rt/$b" >> "$EXCL"
done
echo "linked → $DIR (pin: $(cat microspec.lock 2>/dev/null || echo none)); rt/ mirror refreshed"
