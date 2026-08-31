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
echo "linked → $DIR (pin: $(cat microspec.lock 2>/dev/null || echo none))"
