#!/usr/bin/env bash
# tesla-deep launcher. Creates the venv and installs deps on first run.
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -x .venv/bin/python ]; then
  echo "First run — creating virtualenv and installing dependencies…"
  uv venv .venv
  uv pip install --python .venv/bin/python -q \
    fastapi "uvicorn[standard]" cantools python-can pyserial
fi

exec .venv/bin/python server/app.py "$@"
