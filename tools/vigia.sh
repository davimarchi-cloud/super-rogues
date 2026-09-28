#!/usr/bin/env bash
# Keeps the watcher alive: restarts it if it crashes (exit != 0), stops when it reports work (exit 0).
# Usage (Claude Code, Bash run_in_background): bash tools/vigia.sh
cd "$(dirname "$0")/.."
for i in $(seq 1 50); do
  node --check tools/vigia.js || { echo "ERRO vigia: vigia.js não compila"; exit 1; }
  node tools/vigia.js && exit 0
  echo "$(date -Iseconds) vigia caiu (tentativa $i), reiniciando" >> tools/vigia.log
  sleep 10
done
echo "ERRO vigia: caiu 50 vezes, ver tools/vigia.log"
exit 1
