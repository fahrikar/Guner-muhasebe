#!/usr/bin/env bash
# Web oturumlarında test aracını kurar; uygulamanın kendisi bağımlılıksızdır.
set -euo pipefail
cd "$(dirname "$0")/../.."
[ -d node_modules ] || npm install --no-audit --no-fund >/dev/null 2>&1 || true
