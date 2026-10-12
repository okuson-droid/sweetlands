#!/bin/bash
# 本測定（sim/PLAN.md §6.8）。重みの調整（scripts/tune_all.sh）が終わってから回す。
# 構成：
#   v1-eri-A   v1・追加調整の重み（調整帯 A）      … 頑健さの関門の構成1
#   v1-eri-B   v1・追加調整の重み（調整帯 B）      … 構成2
#   v2-eri-A   v2・v2 用に調整した重み（調整帯 A） … 構成3
#   v1-common-A v1・共通の重み（調整帯 A）         … 追加調整の寄与を見る
#   v1-common-B v1・共通の重み（調整帯 B）。A面だけ … 共通の重みの調整の雑音を見る
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
node $M run --ai v2 --weights $W/v2_eri_A.json --config v2-eri-A --conds all --seeds 1-100 --out $O/games.csv
# 強さの関門の AI 側：シード 1〜5 × AI 乱数 1〜5
for c in v1-eri-A:v1:v1_eri_A v1-eri-B:v1:v1_eri_B v2-eri-A:v2:v2_eri_A; do
  IFS=: read name ai w <<< "$c"
  node $M run --ai $ai --weights $W/$w.json --config $name --conds A --seeds 1-5 --aiseeds 1-5 --out $O/human_ai.csv
done
# 検査（§6.6）を調整後の重みでもう一度
node $M check --ai v1 --weights $W/v1_eri_A.json --games 30 --out $O/checks_v1.json
node $M check --ai v2 --weights $W/v2_eri_A.json --games 30 --leakGames 1 --leakMoves 60 --out $O/checks_v2.json
echo done > $O/DONE
