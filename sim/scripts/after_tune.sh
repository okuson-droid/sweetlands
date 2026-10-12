#!/bin/bash
# 調整の終わりを待って本測定を始める
cd "$(dirname "$0")/.."
while [ ! -f out/tune/DONE ]; do sleep 60; done
scripts/measure_all.sh
