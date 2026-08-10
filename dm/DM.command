#!/bin/zsh
# Double-click to run the DM table. Starts dm/server.py (or, if one is
# already running, just opens a new browser tab against it) and shows the
# address any device on the wifi can point at for the television.
cd "$(dirname "$0")/.."
exec python3 dm/server.py
