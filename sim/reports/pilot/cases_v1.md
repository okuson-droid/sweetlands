# 事例分析：人と AI（v1）で主行動が分かれた局面

AI の評価で「AI の手 − 人の手」の差が大きい局面から、各局で上位を書き出す。評価値は AI の評価関数によるもので、正しさの基準ではない（AI の見落としを探すための材料）。寄与は「重み × 特徴量」（passGain は「いまパスしたら得る得点 × 残りのパスの回数」に重みを掛けたもの）。

## seed1.json（シード 1、主行動が分かれた局面 62件のうち上位 8件）

### 第4ラウンド・181手目（AI の評価の差 50.1）

- 局面：今終わった場合の得点 10、G27 麦23 木7 鉄8 ダイヤ1、収入 G21/麦23/木7/鉄8、手札8枚、ディスク0
- 人の手：area:D｜木材6 → 道駒3個まで（手札1枚）（AI の評価 88.8、うち得点 10）
  - 寄与：portReach -21.7、incWheat 15.1、wheat 12.2、hand 11.3、passGain 11.0、gold 6.9、incGold 5.5、buildings 4.8、openTiles 4.8、roads 4.7、iron 3.3、food 2.9、cities 2.8、unflipped 2.7、clock 2.5、incWood 2.3、industry 2.2、skills 1.2、pros 1.1、incIron 0.8、rabbits 0.7、automated 0.5、diamond 0.5、wood 0.2、played 0.2
- AI の手：area:O｜麦9 → クッキーラビット駒2個まで（手札1枚）（AI の評価 138.8、うち得点 54）
  - 寄与：incWheat 16.4、portReach -15.5、hand 11.3、passGain 11.0、wheat 7.4、gold 6.9、openTiles 6.0、incGold 5.5、buildings 4.8、unflipped 3.8、roads 3.8、iron 3.3、food 3.2、cities 2.8、clock 2.5、incWood 2.3、industry 2.2、wood 1.4、skills 1.2、rabbits 1.2、pros 1.1、incIron 0.8、automated 0.5、diamond 0.5、played 0.2

### 第4ラウンド・194手目（AI の評価の差 48.4）

- 局面：今終わった場合の得点 14、G27 麦24 木3 鉄9 ダイヤ1、収入 G21/麦23/木7/鉄8、手札7枚、ディスク0
- 人の手：area:E｜既定のコスト → 建物駒2個まで（手札1枚）（AI の評価 94.2、うち得点 15）
  - 寄与：portReach -21.7、incWheat 15.7、wheat 12.7、passGain 11.0、hand 9.7、gold 7.9、incGold 5.5、buildings 5.4、roads 5.0、openTiles 4.2、food 3.2、iron 2.9、cities 2.8、clock 2.5、incWood 2.3、industry 2.2、unflipped 1.6、pros 1.4、skills 1.2、incIron 0.8、rabbits 0.7、wood 0.6、automated 0.5、diamond 0.5、played 0.2
- AI の手：area:O｜麦9 → クッキーラビット駒2個まで（手札1枚）（AI の評価 142.6、うち得点 58）
  - 寄与：incWheat 16.4、portReach -15.5、passGain 11.0、hand 9.7、wheat 9.0、gold 6.9、openTiles 6.0、incGold 5.5、buildings 4.8、roads 4.7、iron 3.8、food 3.2、cities 2.8、unflipped 2.7、clock 2.5、incWood 2.3、industry 2.2、pros 1.4、skills 1.2、rabbits 1.2、incIron 0.8、wood 0.6、automated 0.5、diamond 0.5、played 0.2

### 第4ラウンド・191手目（AI の評価の差 47.3）

- 局面：今終わった場合の得点 14、G27 麦23 木1 鉄8 ダイヤ1、収入 G21/麦23/木7/鉄8、手札7枚、ディスク0
- 人の手：flip:s7｜フリップ：麦1・木材1・鉄1＋任意の基礎資源1（AI の評価 94.0、うち得点 14）
  - 寄与：portReach -21.7、incWheat 15.1、wheat 13.3、hand 11.3、passGain 11.0、gold 6.9、incGold 5.5、buildings 4.8、openTiles 4.8、roads 4.7、iron 3.8、food 3.2、cities 2.8、clock 2.5、incWood 2.3、industry 2.2、unflipped 1.6、pros 1.4、skills 1.2、incIron 0.8、rabbits 0.7、automated 0.5、diamond 0.5、wood 0.4、played 0.2
- AI の手：area:O｜麦9 → クッキーラビット駒2個まで（手札1枚）（AI の評価 141.3、うち得点 58）
  - 寄与：incWheat 16.4、portReach -15.5、passGain 11.0、hand 9.7、wheat 8.5、gold 6.9、openTiles 6.0、incGold 5.5、buildings 4.8、roads 4.7、iron 3.3、food 3.2、cities 2.8、unflipped 2.7、clock 2.5、incWood 2.3、industry 2.2、pros 1.4、skills 1.2、rabbits 1.2、incIron 0.8、automated 0.5、diamond 0.5、wood 0.2、played 0.2

### 第2ラウンド・53手目（AI の評価の差 44.2）

- 局面：今終わった場合の得点 -32、G30 麦9 木7 鉄6 ダイヤ2、収入 G20/麦8/木3/鉄4、手札7枚、ディスク0
- 人の手：play:p08-r1c5｜ベネディクト・ビターをプレイ（16ゴールド）（AI の評価 -12.2、うち得点 -36）
  - 寄与：portReach -43.3、incWheat 15.7、incGold 15.6、hand 9.7、wheat 4.8、gold 3.6、incWood 2.9、iron 2.5、openTiles 2.4、wood 1.4、incIron 1.3、buildings 1.2、clock 1.2、unflipped 1.1、diamond 1.0、roads 0.9、skills 0.6、food 0.5、automated 0.4、played 0.2
- AI の手：area:A｜麦6 → 地形タイル3枚まで（手札1枚）（AI の評価 31.9、うち得点 -12）
  - 寄与：portReach -27.8、incWheat 15.7、incGold 15.6、hand 9.7、gold 7.7、openTiles 4.2、incWood 2.9、unflipped 2.7、iron 2.5、wheat 1.6、wood 1.4、clock 1.3、incIron 1.3、roads 1.3、buildings 1.2、diamond 1.0、skills 0.6、food 0.5、automated 0.4、played 0.1

### 第4ラウンド・226手目（AI の評価の差 43.5）

- 局面：今終わった場合の得点 40、G15 麦18 木2 鉄5 ダイヤ0、収入 G21/麦23/木8/鉄8、手札4枚、ディスク1
- 人の手：play:p11-r3c4｜イザベル・アイシングをプレイ（7ゴールド）（AI の評価 120.7、うち得点 38）
  - 寄与：incWheat 15.1、portReach -12.4、passGain 12.0、wheat 9.5、openTiles 6.6、buildings 6.0、incGold 5.5、roads 5.3、hand 4.8、iron 3.8、unflipped 3.3、food 3.2、cities 2.8、incWood 2.6、clock 2.5、industry 2.2、pros 2.2、gold 2.0、skills 1.8、incIron 0.8、discs 0.8、rabbits 0.7、automated 0.7、wood 0.4、played 0.3
- AI の手：area:A:disc｜麦6 → 地形タイル3枚まで（アクションディスク使用）（AI の評価 164.2、うち得点 65）
  - 寄与：incWheat 15.1、passGain 13.0、openTiles 9.0、hand 6.5、wheat 6.4、roads 6.3、buildings 6.0、incGold 5.5、unflipped 4.9、gold 4.8、iron 3.3、industry 3.3、food 3.2、portReach -3.1、cities 2.8、incWood 2.6、clock 2.5、pros 2.2、skills 1.8、incIron 0.8、rabbits 0.7、automated 0.7、wood 0.6、played 0.2

### 第3ラウンド・159手目（AI の評価の差 42.8）

- 局面：今終わった場合の得点 -24、G15 麦9 木1 鉄2 ダイヤ2、収入 G18/麦21/木5/鉄8、手札4枚、ディスク0
- 人の手：play:p11-r3c3｜ゲイリー・グラノーラをプレイ（12ゴールド）（AI の評価 59.3、うち得点 -27）
  - 寄与：incWheat 27.5、passGain 22.5、portReach -21.7、incGold 10.9、hand 4.8、buildings 4.8、openTiles 4.8、wheat 4.8、roads 3.8、incWood 3.3、food 2.9、cities 2.8、unflipped 2.7、clock 2.5、incIron 1.7、industry 1.4、skills 1.2、pros 1.1、diamond 1.0、iron 0.8、automated 0.8、gold 0.8、played 0.3、rabbits 0.2、wood 0.2
- AI の手：area:A｜麦6 → 地形タイル3枚まで（手札1枚）（AI の評価 102.1、うち得点 6）
  - 寄与：incWheat 27.5、passGain 22.5、portReach -12.4、incGold 9.4、openTiles 6.0、hand 4.8、buildings 4.8、unflipped 3.8、gold 3.8、roads 3.8、incWood 3.3、food 2.9、cities 2.8、clock 2.5、incIron 1.7、wheat 1.6、industry 1.4、skills 1.2、pros 1.1、diamond 1.0、iron 0.8、automated 0.8、rabbits 0.2、wood 0.2、played 0.2

### 第4ラウンド・178手目（AI の評価の差 41.9）

- 局面：今終わった場合の得点 10、G27 麦23 木7 鉄8 ダイヤ1、収入 G21/麦23/木7/鉄8、手札7枚、ディスク0
- 人の手：area:J｜市民カードを2枚引く（手札1枚）（AI の評価 90.7、うち得点 10）
  - 寄与：portReach -21.7、incWheat 15.1、hand 12.9、wheat 12.2、passGain 11.0、gold 6.9、incGold 5.5、buildings 4.8、openTiles 4.8、roads 3.8、iron 3.3、food 2.9、cities 2.8、unflipped 2.7、clock 2.5、incWood 2.3、industry 2.2、wood 1.4、skills 1.2、pros 1.1、incIron 0.8、rabbits 0.7、automated 0.5、diamond 0.5、played 0.2
- AI の手：area:C｜麦4 → クッキーラビット駒1個（手札1枚）（AI の評価 132.6、うち得点 47）
  - 寄与：incWheat 16.4、portReach -15.5、passGain 11.0、wheat 10.1、hand 9.7、gold 6.9、openTiles 6.0、incGold 5.5、buildings 4.8、unflipped 3.8、roads 3.8、iron 3.3、food 3.2、cities 2.8、clock 2.5、incWood 2.3、industry 2.2、wood 1.4、skills 1.2、pros 1.1、rabbits 1.0、incIron 0.8、automated 0.5、diamond 0.5、played 0.2

### 第3ラウンド・166手目（AI の評価の差 41.3）

- 局面：今終わった場合の得点 -28、G4 麦9 木0 鉄2 ダイヤ1、収入 G21/麦21/木5/鉄8、手札3枚、ディスク0
- 人の手：fa3｜4ゴールド → 任意の基礎資源1（AI の評価 57.5、うち得点 -28）
  - 寄与：incWheat 27.5、passGain 22.5、portReach -21.7、incGold 10.9、wheat 5.3、hand 4.8、buildings 4.8、openTiles 4.8、roads 3.8、incWood 3.3、food 2.9、cities 2.8、unflipped 2.7、clock 2.5、incIron 1.7、industry 1.4、skills 1.2、automated 1.1、pros 1.1、iron 0.8、diamond 0.5、rabbits 0.2、played 0.2
- AI の手：area:A｜麦6 → 地形タイル3枚まで（手札1枚）（AI の評価 98.7、うち得点 3）
  - 寄与：incWheat 27.5、passGain 22.5、portReach -12.4、incGold 12.0、openTiles 6.6、buildings 4.8、roads 4.1、unflipped 3.8、incWood 3.3、hand 3.2、food 2.9、cities 2.8、clock 2.5、gold 2.0、incIron 1.7、wheat 1.6、industry 1.4、skills 1.2、automated 1.1、pros 1.1、iron 0.8、diamond 0.5、rabbits 0.2、played 0.2

