#!/bin/bash
# 重みの調整（sim/PLAN.md 第5版 §6.4）。規約は全キャラクター共通に固定する：
#   CEM。同じ反復の候補は同じシード・同じキャラクターで比べ（共通乱数）、シードは反復ごとに入れ替える。
#   分散の下限 0.05。反復ごとの上位2候補を記録し、最後に select で最終選考帯の50局で選び直す
#   （最終の平均＋最後の3反復の上位候補から計5本）。
#   共通の重み：14キャラクター × A面を混ぜる（反復15・候補16・上位4・1候補8局・初期の幅 0.5）
#   追加調整：選考後の共通の重みから、対象キャラクターだけ（反復10・候補16・上位4・1候補8局・初期の幅 0.25）
#   v2：v2（中）で、選考後の v1 共通の重み（調整帯 A）を出発点に調整し直す（反復10・候補12・上位3・1候補6局・初期の幅 0.25）、
#       追加調整（反復8・候補12・上位3・1候補6局・初期の幅 0.2）
# シード（台帳 sim/seeds.md）：調整帯 A 10001〜18999、B 20001〜28999、最終選考帯 A 19001〜19999、B 29001〜29999
set -e
cd "$(dirname "$0")/.."
M=dist/main.cjs
W=reports/pilot/weights
T=out/tune
mkdir -p $W $T
node $M tune --ai v1 --band A --seedStart 10001 --chars all --init default --iters 15 --pop 16 --elite 4 --games 8 --sigma 0.5 --rngseed 10001 --out $T/v1_common_A_raw.json > $T/v1_common_A.log
node $M select --weights $T/v1_common_A_raw.json --chars all --seedStart 19001 --games 50 --out $W/v1_common_A.json > $T/v1_common_A_select.log
node $M tune --ai v1 --band A --seedStart 11001 --chars target --init $W/v1_common_A.json --iters 10 --pop 16 --elite 4 --games 8 --sigma 0.25 --rngseed 11001 --out $T/v1_eri_A_raw.json > $T/v1_eri_A.log
node $M select --weights $T/v1_eri_A_raw.json --chars target --seedStart 19101 --games 50 --out $W/v1_eri_A.json > $T/v1_eri_A_select.log
node $M tune --ai v1 --band B --seedStart 20001 --chars all --init default --iters 15 --pop 16 --elite 4 --games 8 --sigma 0.5 --rngseed 20001 --out $T/v1_common_B_raw.json > $T/v1_common_B.log
node $M select --weights $T/v1_common_B_raw.json --chars all --seedStart 29001 --games 50 --out $W/v1_common_B.json > $T/v1_common_B_select.log
node $M tune --ai v1 --band B --seedStart 21001 --chars target --init $W/v1_common_B.json --iters 10 --pop 16 --elite 4 --games 8 --sigma 0.25 --rngseed 21001 --out $T/v1_eri_B_raw.json > $T/v1_eri_B.log
node $M select --weights $T/v1_eri_B_raw.json --chars target --seedStart 29101 --games 50 --out $W/v1_eri_B.json > $T/v1_eri_B_select.log
node $M tune --ai v2 --ladder M --band A --seedStart 12001 --chars all --init $W/v1_common_A.json --iters 10 --pop 12 --elite 3 --games 6 --sigma 0.25 --rngseed 12001 --out $T/v2_common_A_raw.json > $T/v2_common_A.log
node $M select --weights $T/v2_common_A_raw.json --ladder M --chars all --seedStart 19201 --games 50 --out $W/v2_common_A.json > $T/v2_common_A_select.log
node $M tune --ai v2 --ladder M --band A --seedStart 13001 --chars target --init $W/v2_common_A.json --iters 8 --pop 12 --elite 3 --games 6 --sigma 0.2 --rngseed 13001 --out $T/v2_eri_A_raw.json > $T/v2_eri_A.log
node $M select --weights $T/v2_eri_A_raw.json --ladder M --chars target --seedStart 19301 --games 50 --out $W/v2_eri_A.json > $T/v2_eri_A_select.log
echo done > $T/DONE
