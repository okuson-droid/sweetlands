#!/bin/bash
# 重みの調整（sim/PLAN.md §6.4）。規約は全キャラクター共通に固定する：
#   共通の重み：14キャラクター × A面を混ぜ、CEM（反復15・候補16・上位4・1候補8局・初期の幅 0.5）
#   追加調整：共通の重みから、対象キャラクターだけで CEM（反復10・候補16・上位4・1候補8局・初期の幅 0.25）
#   v2：v1 の共通の重み（調整帯 A）を出発点に、v2 で同じ規約を回し直す（候補12・1候補6局・反復10。計算量のため）
set -e
cd "$(dirname "$0")/.."
M=dist/main.cjs
W=reports/pilot/weights
mkdir -p $W out/tune
node $M tune --ai v1 --band A --chars all --init default --iters 15 --pop 16 --elite 4 --games 8 --sigma 0.5 --out $W/v1_common_A.json > out/tune/v1_common_A.log
node $M tune --ai v1 --band A --chars target --init $W/v1_common_A.json --iters 10 --pop 16 --elite 4 --games 8 --sigma 0.25 --rngseed 15001 --out $W/v1_eri_A.json > out/tune/v1_eri_A.log
node $M tune --ai v1 --band B --chars all --init default --iters 15 --pop 16 --elite 4 --games 8 --sigma 0.5 --out $W/v1_common_B.json > out/tune/v1_common_B.log
node $M tune --ai v1 --band B --chars target --init $W/v1_common_B.json --iters 10 --pop 16 --elite 4 --games 8 --sigma 0.25 --rngseed 25001 --out $W/v1_eri_B.json > out/tune/v1_eri_B.log
node $M tune --ai v2 --band A --chars all --init $W/v1_common_A.json --iters 10 --pop 12 --elite 3 --games 6 --sigma 0.25 --rngseed 17001 --out $W/v2_common_A.json > out/tune/v2_common_A.log
node $M tune --ai v2 --band A --chars target --init $W/v2_common_A.json --iters 8 --pop 12 --elite 3 --games 6 --sigma 0.2 --rngseed 18001 --out $W/v2_eri_A.json > out/tune/v2_eri_A.log
echo done > out/tune/DONE
