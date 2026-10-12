#!/bin/bash
# 本測定（sim/PLAN.md 第5版 §6.8）。重みの調整（scripts/tune_all.sh）が終わってから回す。
# 構成：
#   v1-eri-A    v1・追加調整の重み（調整帯 A、選考後）  … 頑健さの関門の構成
#   v1-eri-B    v1・追加調整の重み（調整帯 B、選考後）  … 同上
#   v2-S/M/L    v2・v2 用に調整した重み（v2 中で調整）のまま、探索の量だけを3段階に変える（スキル梯子） … 同上
#   v1-common-A v1・共通の重み（調整帯 A）              … 追加調整の寄与
#   v1-common-B v1・共通の重み（調整帯 B）。A面だけ      … 共通の重みの調整の雑音
set -e
cd "$(dirname "$0")/.."
M=dist/main.cjs
W=reports/pilot/weights
O=out/measure
mkdir -p $O
# P0：版の比較（A面）と決め打ちのフリーアクションの有無
node $M run --ai v0 --config v0 --conds A --seeds 1-100 --out $O/games.csv
node $M run --ai v1 --weights $W/v1_eri_A.json --rules clock=0,prePass=0 --config v1-eri-A-norules --conds A --seeds 1-100 --out $O/games.csv
# P1〜P3：20条件
node $M run --ai v1 --weights $W/v1_eri_A.json --config v1-eri-A --conds all --seeds 1-100 --out $O/games.csv
node $M run --ai v1 --weights $W/v1_eri_B.json --config v1-eri-B --conds all --seeds 1-100 --out $O/games.csv
node $M run --ai v1 --weights $W/v1_common_A.json --config v1-common-A --conds all --seeds 1-100 --out $O/games.csv
node $M run --ai v1 --weights $W/v1_common_B.json --config v1-common-B --conds A --seeds 1-100 --out $O/games.csv
node $M run --ai v2 --ladder M --weights $W/v2_eri_A.json --config v2-M --conds all --seeds 1-100 --out $O/games.csv
node $M run --ai v2 --ladder S --weights $W/v2_eri_A.json --config v2-S --conds all --seeds 1-100 --out $O/games.csv
node $M run --ai v2 --ladder L --weights $W/v2_eri_A.json --config v2-L --conds all --seeds 1-100 --out $O/games.csv
# 強さの関門の AI 側：シード 1〜5 × AI 乱数 1〜5（判定は v2-M、ほかは参考）
node $M run --ai v2 --ladder M --weights $W/v2_eri_A.json --config v2-M --conds A --seeds 1-5 --aiseeds 1-5 --out $O/human_ai.csv
node $M run --ai v2 --ladder S --weights $W/v2_eri_A.json --config v2-S --conds A --seeds 1-5 --aiseeds 1-5 --out $O/human_ai.csv
node $M run --ai v2 --ladder L --weights $W/v2_eri_A.json --config v2-L --conds A --seeds 1-5 --aiseeds 1-5 --out $O/human_ai.csv
node $M run --ai v1 --weights $W/v1_eri_A.json --config v1-eri-A --conds A --seeds 1-5 --aiseeds 1-5 --out $O/human_ai.csv
node $M run --ai v1 --weights $W/v1_eri_B.json --config v1-eri-B --conds A --seeds 1-5 --aiseeds 1-5 --out $O/human_ai.csv
# 検査（§6.6）を調整後の重みでもう一度
node $M check --ai v1 --weights $W/v1_eri_A.json --games 30 --out $O/checks_v1.json
node $M check --ai v2 --ladder M --weights $W/v2_eri_A.json --games 30 --leakGames 1 --leakMoves 60 --out $O/checks_v2.json
echo done > $O/DONE
