# 文献調査：スイーツランドのプレイAI開発に効く文献（v1／v2・重み調整・2つの関門への示唆）

- 作成：2026-10-13（Cowork の調査タスクの報告書を収録したもの）
- 対象：`sim/PLAN.md` 第4版
- 位置づけ：Web 上の資料に基づく調査報告であり、参考資料として扱う。本文の推奨は計画書にはまだ反映していない。反映する場合は、計画書の改訂としてマスターの承認を経る（特に、関門1の扱いは第4版で承認済みの判定式と食い違う）。
- 注意：根拠の多くは、スイーツランドとは別のゲーム（Hero Academy、Tetris、SameGame、Splendor、Dominion など）からの類推である。全文を確認できていない文献、査読のない資料（GitHub、企業のプレスリリース、個人ブログ）を含む（末尾「注意事項」を参照）。

---

## 要約

第4版の骨格（評価関数つきの手番・ラウンド単位の計画探索、重みの自動調整、共通乱数による対比較、強さの異なる探索器で結論の安定性を確かめること）は、文献の主流とほぼ一致する。直すべき点として、次の3つが挙がった。

1. 山札の決定化を「1つの並びで計画する」形のまま使わない。
2. 重み調整で、ノイズのある目的関数への対策（評価局数、ノイズ注入、レーシング、別シードでの再評価）を明示する。
3. 「AI が弱いとバランスの結論が歪む」ことを、計算予算を段階的に増やして結論が収束するかで確かめる「スキル梯子」を関門に加える。

ユーロゲームそのもの（Agricola、Caylus、Wingspan、Ark Nova など）を対象に、探索手法と人間上級者を比べた査読研究はほとんど見つからなかった。

### 要点

- v2（ラウンド末までの自分の行動列をビームサーチ＋評価関数）は妥当である。1手番に複数の行動を束ねて評価関数で探索する Online Evolutionary Planning は、Hero Academy で MCTS に98%、1行動ずつの貪欲法（Greedy Action）に90.0%の勝率を記録した（Justesen ら 2016、各100局）。単一プレイヤー探索では、Schadd ら（2012）が「探索時間を初手にすべて投入するより、連続する各局面に均等に配る方がよい」と結論している。ただし山札の決定化は、複数の並びで「最初の主行動」の平均を比べる形にする。1つの並びに対して計画を最適化すると、未来のドローを知っている前提の計画（strategy fusion）になる。
- 重み調整（CMA-ES／CEM）はノイズで崩れやすい。Tetris の線形評価関数では、Szita & Lőrincz（2006）が CEM に減衰するノイズを注入して早すぎる収束を防ぎ、22特徴量で平均348,895ラインに達した（抄録では従来の強化学習を「ほぼ2桁」上回る）。少ない評価回数で離散パラメータを調整するなら NTBEA が有力である（Planet Wars で 0.54±0.02、比較手法では最良）。共通乱数で候補どうしを比べたうえで、最終候補は別シード帯で再評価する。
- バランス評価で「AI の強さ不足が結論を歪める」ことは実測されている。TAG の研究では、ゲーム固有の評価関数を持たない弱い MCTS だと、Catan の盤面ランダム性の影響が検出されなかった。強い価値関数を入れると影響が現れた。また、技能が上がるほどシードの影響が大きくなった。

---

## 計画への示唆と推奨変更

### 1. v1（主行動候補ごとに解決まで仮進行＋細かい選択は貪欲）

- TAG フレームワークの基準エージェント OSLA（One Step Look Ahead）とほぼ同じ構造である。TAG の初期評価では OSLA より MCTS が強く、MCTS は6つの対戦ゲームのうち5つで最高勝率だった（全体の平均勝率45.5%）。v1 は「基準線」と位置づけ、バランスの結論を v1 だけで出すべきではない。
- 細かい選択（地形タイルの置き場所など）を1手ずつ貪欲に選ぶ部分は、Hero Academy 研究の「Greedy Action」に当たる。手番内の5つの行動が相互作用するこのゲームでは、手番全体を探索する方法が大きく上回った（5プライの深さ優先探索 Greedy Turn でも Greedy Action に64.0%、Online Evolution は90.0%。Justesen ら 2016、表2）。スイーツランドでもタイル配置が都市形成・港の接続・建物の置き場所に後で効くなら、上位 k 候補だけを残す小さなビームを手番内に入れる価値がある（類推、未検証）。

### 2. v2（ラウンド末までのビームサーチ、毎手番やり直し、局面ハッシュで合流）

- 支持する文献：Online Evolutionary Planning（Justesen ら）、SP-MCTS（Schadd ら 2012）、MCTS 文献で標準的なトランスポジションによる合流。
- 推奨変更①（決定化の方式）：Long ら（2010）の分析では、完全情報モンテカルロ（決定化）が弱くなるのは「葉の相関が低い」とき、つまり終盤まで自分の選択で結果が大きく変わるゲームである。スイーツランドの1人プレイは非公開情報が山札の並びだけで相手もいないため、決定化の害は比較的小さいと推測される。ただし「ラウンド末までの行動列」を1つの並びに対して最適化すると、引くカードを知っている前提の計画になる。推奨は次の2点である。
  - 複数（例：4〜8）の並びで、それぞれビームサーチする。
  - 「最初の主行動」ごとの葉評価の平均で手を決める。
  - ISMCTS の研究（Cowling ら）では、決定化の数より1決定化あたりの反復数の方が効いた例がある（LOTR:C で、1決定化×10,000反復が 40決定化×250反復を22.9%上回った）。並びの数を増やすより、ビーム幅を確保する配分から始める。
- 推奨変更②（地平線）：「ロールアウトなし、ラウンド末で評価関数」は評価関数の質に強く依存する。評価関数を v2 の葉で使う前提で調整し直すこと（「重みは探索器ごとに測り直す」）は文献とも整合する。

### 3. 重み調整（20〜30個、CMA-ES／CEM）

- 線形評価関数の重みを CEM や CMA-ES で調整して成功した代表例は Tetris である。
  - Szita & Lőrincz（2006）：CEM に減衰するノイズを注入し、22特徴量で平均348,895ライン。
  - Thiery & Scherrer（2009）：BCTS で平均3,500万ライン。
  - Boumaza（2009）：CMA-ES で3,500万ライン。
- どの文献も「得点の分散が大きく、評価に多数の局が要る」ことを強調している。Boumaza は評価回数を減らすためにレーシング（見込みのない候補を早めに打ち切る）を使った。
- 推奨：
  - CMA-ES の既定の集団サイズは λ=4+⌊3 ln n⌋ で、n=25 なら λ=13。1候補あたりの評価局数は少数から始め、上位候補だけ追加評価する（レーシング）。
  - 世代内では共通乱数（全候補で同じシード集合）で順位をつけ、シード集合は世代ごとに入れ替えてシードへの過学習を防ぐ。
  - 最終候補は別シード帯で再評価する。
  - パラメータが少なく離散的な部分（ビーム幅、地平線など）は NTBEA の方が評価効率が高い可能性がある。
- 計算予算の試算（仮定に基づく概算）：1局の主手番を約60、1手番あたり候補約30、候補1つの解決に約10回の applyMove と仮定すると、v1 の1局は約18,000回×0.2ms＝約3.6秒。λ=13、1候補30局なら1世代は約23分（1コア）、100世代で約40時間。v2 で同じことをすると桁が1〜2つ増える見込み。重み調整は v1 で行い、v2 では共通部分の微調整か検証だけにするのが現実的。必ず実測で置き換えること。

### 4. 2つの関門

- 関門1（人間5局との対比較）：5局では統計的な検出力がほぼない。「AI が明らかな悪手を打っていないか」を見る健全性チェックとして使い、局ごとの差と、人が選んで AI が選ばなかった手の事例分析を記録する形を勧める。合否の閾値に使うのは避ける。
- 関門2（v1 と v2 で結論が変わらないか）：文献の方向性と一致する。ただし Seeding for Success（Goodman ら）では、技能が上がるほどシードの影響が大きくなり、予算を増やすと一時的に有利・不利が反転する「非単調なシード」も Dominion で17%あった。v1 と v2 の2点だけでなく、v2 のビーム幅を2〜3段階変えた「スキル梯子」で順位が収束しているかを見る方が頑健である。

### 5. 将来の多人数版

- 低予算では、相手を明示的に読み込まない手法（「自分に集中する」型）か、規則ベースの相手予測が有力である。根拠は次の3つ。
  - Baier & Kaisers の「focus on yourself」。
  - TAG の MultiTree／SelfOnly MCTS。
  - Goodman & Lucas：RHEA は相手モデルの精度に敏感、MCTS は不正確なモデルにも頑健。
- v2 のような「自分の行動列の計画」は RHEA に近い性質を持つ。相手モデルを入れるなら、精度の検証が必要である。

---

## テーマ別文献リスト

### 1. ユーロゲーム／エンジンビルド系の AI 先行研究・実装

**Gaina, Balla, Dockhorn, Montoliu, Perez-Liebana (2020) "TAG: A Tabletop Games Framework", EXAG@AIIDE 2020**（https://tabletopgames.ai/ ／ https://github.com/GAIGResearch/TabletopGames ／ https://rdgain.github.io/assets/pdf/papers/gaina2020tag.pdf）

- 分かること：Java の研究用フレームワーク。Dominion、7 Wonders、Puerto Rico、Power Grid、Terraforming Mars、Catan などのユーロ系を実装済み。基準エージェントは Random、OSLA、RHEA（行動列 L=10 を進化）、MCTS。初期評価では MCTS が6つの対戦ゲームのうち5つで最高平均勝率（全体45.5%）。パラメータ調整（NTBEA）用のドキュメントがあり、IEEE CoG 2026 でゲームバランス調整コンペを予告している。
- 効き方：Puerto Rico、Power Grid、Terraforming Mars の実装は「選択待ち」型ルールエンジンと行動分解の参考になる。v1 は OSLA、v2 は RHEA／計画探索に当たり、比較の物差しになる。
- 注意点：評価軸は勝率で、1人プレイの得点最大化ではない。基準エージェントはゲーム汎用で、強さの絶対値は参考にならない。

**Goodman, Perez-Liebana, Lucas (2025) "Seeding for Success: Skill and Stochasticity in Tabletop Games"**（arXiv:2503.02686、https://arxiv.org/pdf/2503.02686）

- 分かること：
  - TAG の15ゲームで、シードを固定したときの勝率分布からランダム性の影響を定量化（200シード×1000局、MCTS 50ms）。
  - 技能を Random から 2/10/50/250ms まで変えると、多くのゲームで技能が上がるほどシードの影響が増す。
  - Dominion ではシードの17%が予算に対して非単調。
  - Catan では、汎用 MCTS では盤面ランダム性の影響が検出されなかった（著者は初版でエージェントの弱さが理由と推測）。エキスパート反復で学習した価値関数を入れると影響が現れた。
  - 開発中の商業ゲーム「Theme Park」では、この分析を受けて出版社が初期カードを事前定義セットに変更した。
  - 乱数を「ゲーム事象」「再決定化」「エージェント」の3系統に分けている。
- 効き方：関門2の設計（スキル梯子、非単調シード）、共通乱数の実装（乱数系統の分離）、「AI の強さ不足で結論が歪む」ことの実測根拠。
- 注意点：勝ち負けの二値では、鏡像対局で95%区間が縮んだのは0.1〜0.4ポイント程度（Poker のみほぼ半減）。得点のような連続値での対比較の効果は実測されていない。スイーツランドの得点差で共通乱数がどれだけ効くかは自分で相関を測る必要がある。

**Bravi, Perez-Liebana, Lucas, Liu (2019) "Rinascimento: Optimising Statistical Forward Planning Agents for Playing Splendor"**（arXiv:1904.01883）、**Bravi & Lucas** の event-value function 論文（arXiv:2006.05894）と behaviour space 論文（arXiv:2106.08371）

- 分かること：Splendor 風のゲームで BMRH・SRH・MCTS のハイパーパラメータを NTBEA で調整（最良設定の適合度は BMRH 0.924、MCTS 0.918、SRH 0.882）。得点が疎な問題を「イベント価値関数」（ゲーム中の出来事に価値を割り当てる）で緩和し、その重みで AI の戦略を制御・探索している。behaviour space 論文は、AI プレイテストで設計上の「退化した振る舞い」を発見している。
- 効き方：エンジンビルド系で評価関数と探索のパラメータを同時に調整した最も近い事例。イベント価値関数は「残りパス回数×パス時得点」のような見込み項の設計に応用できる。
- 注意点：目的は対戦の勝率で、人間上級者との比較はない。

**seal256/splendor**（GitHub、MCTS＋方策ネットワーク、https://github.com/seal256/splendor）

- 分かること：2人 Splendor で、MCTS 500反復→2000反復の改善は +115 Elo にとどまる（MCTS 500反復はランダムより約750 Elo 上）。分岐が大きいため強い枝刈りが効くとし、最終モデルも「経験者には安定して勝てない」と記す。
- 効き方：予算を増やしたときの逓減の目安。
- 注意点：個人プロジェクト、査読なし。

**Race for the Galaxy の AI（Keldon Jones、Temple Gates Games のブログと GDC 2018 講演）**（https://www.templegatesgames.com/dominion-ai/ ほか）

- 分かること：TD 学習のニューラルネットで評価関数を自己対戦から学習し（同社ブログによれば3万局以上の訓練局）、拡張・人数別に24個のネットワークを出荷。Temple Gates Games の2018年5月1日のプレスリリースは「最難度に設定すると、このAIはプレイヤーの上位97パーセンタイルを上回る」と述べる。
- 効き方：手作りの線形評価関数の次の段階として、自己対戦の TD 学習で評価関数を学ぶ道筋。キャラクター・地図別に評価関数を持つ発想は「キャラ別の追加調整」に対応する。
- 注意点：強さの数値は開発会社のプレスリリースで、独立した検証はない。

**k8rthik/bgai**（GitHub、Terra Mystica、2026、https://github.com/k8rthik/bgai）と **Perez "Mastering Terra Mystica"**（Stanford 学生プロジェクト、arXiv:2102.10540）

- 分かること：bgai は人間大会棋譜からの模倣学習＋MCTS＋自己対戦 RL で最終得点を報告（自作の最良が約111、外部のヒューリスティック AI「tmai ai_lode」が97〜99）。教訓は「自作ベースラインに対する順位は甘く出るが、最終得点は嘘をつかない」と、「探索が方策と同程度の強さだと自己対戦でかえって弱くなった（探索を深くして初めて改善が積み上がった）」の2点。Perez は、既存の TM 用 AI が深さ制限 α-β と手作りの評価関数で作られていると述べる。
- 効き方：得点を評価軸に使う方針の補強。将来の学習導入時の落とし穴。
- 注意点：どちらも査読なし。

**Agricola（査読研究は見つからず）**（https://meadowparty.com/blog/2013/06/15/agricola-ios-app/ ／ https://jlericson.com/2022/01/22/agricola_solo.html）

- 分かること：Playdek 版 iOS アプリの AI について、「経験者は最上級 AI にも毎回勝つ」という利用者の証言（ブログのコメント、逸話）。個人ブログ「Solving Agricola: Family Edition」は、ソロで手プレイ70点、手順を詰めた計画で78点を示し、得点上限の分析を試みている。
- 効き方：商業アプリの AI でも上級者に届かないことが多いという傍証。1人プレイで「理論上の到達点」を手計算で詰める作業は、人間との比較の代わりの基準線になる。
- 注意点：根拠は弱い（逸話・個人ブログ）。Caylus、Lords of Waterdeep、Gaia Project、Wingspan、Ark Nova、Azul、Through the Ages は、探索手法の比較を報告した一次資料に到達できなかった。

**Chaslot, Bakkes, Szita, Spronck (2008) "Monte-Carlo Tree Search: A New Framework for Game AI", AIIDE**（https://ojs.aaai.org/index.php/AIIDE/article/view/18700）

- MCTS を古典ボードゲーム・現代ボードゲーム・ビデオゲームに共通の枠組みとして提案した初期の論文（Settlers of Catan 応用を含む）。歴史的な位置づけとして読む。

### 2. 1人プレイ（単一エージェント）の得点最大化探索

**Schadd, Winands, Tak, Uiterwijk (2012) "Single-Player Monte-Carlo Tree Search for SameGame", Knowledge-Based Systems 34:3–11**（https://dke.maastrichtuniversity.nl/m.winands/documents/KNOSYS_SameGame.pdf）

- 分かること：1人用に選択式と逆伝播を変えた SP-MCTS で、当時の標準テストセットで最高得点。ランダム再始動を併用し、パラメータを CEM で調整（「CEM は手動調整より良いパラメータ値を見つけられる」）。結論の一つは「探索時間を初手にすべて投入するより、連続する各局面に均等に配る方がよい」。
- 効き方：毎手番やり直す v2 の時間配分を支持。パラメータ調整に CEM を使った前例。
- 注意点：SameGame は確定的で、山札の不確実性はない。

**Rosin (2011) "Nested Rollout Policy Adaptation for Monte Carlo Tree Search", IJCAI**（https://chrisrosin.com/rosin-ijcai11.pdf）、Cazenave の Nested Monte Carlo Search、Beam NRPA、Stabilized NRPA（arXiv:2101.03563）

- 分かること：NRPA はロールアウト方策の重みを最良系列へ勾配上昇で寄せる入れ子探索で、Morpion Solitaire（5D）で82手の世界記録（NMCS は80手）。Beam NRPA も82手に並んだが超えていない。
- 効き方：確定的な1人パズルの記録更新には最強級。
- 使えない点：大量のロールアウトが前提。山札が確率的なゲームでは最良系列が「その並び」に過学習する。2コア・1手0.2ms の条件では毎手番の意思決定に向かない。オフラインで「特定シードでの到達可能得点の上限」を推定する用途なら有用で、人間比較の代わりの基準線として「同シードで NRPA がどこまで出せるか」を測るのは一案（推測）。

**Long, Sturtevant, Buro, Furtak (2010) "Understanding the Success of Perfect Information Monte Carlo Sampling in Game Tree Search", AAAI-10**（https://cdn.aaai.org/ojs/7562/7562-13-11092-1-2-20201228.pdf）

- 分かること：決定化（PIMC）の誤差の源として strategy fusion と non-locality を挙げ、ゲームの3性質（葉の相関 lc、偏り b、曖昧さの解消速度 df）と PIMC の性能の関係を合成木で測定。葉の相関が低いときに PIMC は最悪になり、df が1に近づく（情報が早く明らかになる）と大きく改善する。Skat と Hearts は lc 0.8〜1.0、df 約0.6 の「PIMC が効く領域」にある。
- 効き方：1人プレイでは相手の情報集合がないため、主な問題は「未来のドローを知った前提の計画」（strategy fusion に相当）。複数の並びの平均で最初の手を決める方式を勧める根拠。
- 注意点：対象は2人ゼロサムの合成木とトリックテイキングで、1人プレイへの当てはめは類推。

**Cowling, Powley, Whitehouse (2012) "Information Set Monte Carlo Tree Search", IEEE TCIAIG 4(2):120–143**（https://eprints.whiterose.ac.uk/id/eprint/75048/1/CowlingPowleyWhitehouse2012.pdf）

- 分かること：深い探索が要る LOTR:C と、strategy fusion の害が大きい Phantom (4,4,4) では ISMCTS が決定化 UCT を上回り、Dou Di Zhu では互角。LOTR:C では「1決定化×10,000反復」が「40決定化×250反復」を22.9%上回った。固定の初期配置を使って実験の分散を下げている。
- 効き方：並びの数とビーム幅の配分の初期値。将来の多人数版（他人の手札が非公開）での ISMCTS の検討材料。
- 注意点：論文中の個別の勝率表は取得できず、著者による要約に依拠している。

**Perez-Liebana ら (2013) RHEA**（TAG の基準エージェント、L=10）

- 行動列を進化させ、先頭の行動だけを実行する手法。TAG では MCTS より弱い結果。分岐が小さい場合は一様列挙のビームサーチの方が効率的という既存の助言と整合する。

**（未検証の追加候補）** hindsight optimization や sample average approximation（複数の未来シナリオで最適化して平均する確率的計画）は、「複数の並びで計画し、最初の手を平均で選ぶ」方式の理論的な背景に当たる。一次文献は確認できていない。

### 3. 組み合わせ行動空間（1手番に多数の小さな選択）

**Justesen, Mahlmann, Togelius (2016) "Online Evolution for Multi-Action Adversarial Games", EvoApplications**（https://link.springer.com/chapter/10.1007/978-3-319-31204-0_38）、**Justesen, Mahlmann, Risi, Togelius (2018) "Playing Multi-Action Adversarial Games: Online Evolutionary Planning versus Tree Search", IEEE TCIAIG**（https://sebastianrisi.com/wp-content/uploads/justesen_tciaig17.pdf）

- 分かること：1手番に5つの行動を取る Hero Academy で、手番内の行動列を状態評価関数を適合度として進化（OEP）。2016年版の表2（各ペア100局、1手番6秒）では、Online Evolution の勝率は Greedy Action に90.0%、Greedy Turn に80.5%、標準 MCTS に98%。2018年版では分岐を抑えた MCTS の変種とも比較。
- 効き方：細かい選択の貪欲法（v1）より手番全体の組み合わせを評価する方がよいという直接の根拠。v2 のビームサーチは OEP の「進化」を「列挙」に置き換えたものとみなせる。
- 注意点：2人対戦ゲームであり、選択の相互作用の強さはゲームによって違う。

**Ontañón (2013) "The Combinatorial Multi-Armed Bandit Problem and Its Application to Real-Time Strategy Games", AIIDE**、**Ontañón (2017) JAIR 58:665–702**（https://www.semanticscholar.org/paper/Combinatorial-Multi-armed-Bandits-for-Real-Time-Onta%C3%B1%C3%B3n/08eda51118455347ee3ceb51deddb2bca8f65aba）

- 分かること：行動を要素（ユニットごとの行動）に分解し、局所バンディットと全体バンディットを組み合わせる Naive Sampling（NaiveMCTS）。分岐が大きくなるほど他の標本化戦略を上回る。
- 効き方：主行動とタイル配置などの副選択を「要素」とみなす分解の考え方。
- 注意点：分岐が非常に大きい RTS 向け。スイーツランドの分岐が列挙できる規模なら、v2 の一様列挙で十分な可能性が高い。

**Portfolio Online Evolution in StarCraft（Wang ら、AIIDE 2016）**

- 分かること：原子的な行動ではなく、スクリプト（小さな方策）の組を進化させるマクロ行動化で分岐を減らす。
- 効き方：「港へ道を伸ばす」「建物を置ける場所を広げる」といったスクリプトを副選択の候補生成に使えば、ビーム幅を節約できる（類推）。

### 4. 評価関数の重みの自動調整（ノイズのある目的関数）

**Szita & Lőrincz (2006) "Learning Tetris Using the Noisy Cross-Entropy Method", Neural Computation 18(12):2936–2941**

- 分かること：CEM は準最適に早期収束しがちで、各世代の分散に減衰するノイズを足して防いだ。22特徴量で平均348,895ライン（原論文表1「CE+RL, decreasing noise」）。抄録は従来の RL を「ほぼ2桁」上回るとする。
- 効き方：CEM を使うなら、ノイズ注入（分散の下限）は必須。
- 注意点：全文を取得できず、一部の設定（評価局数など）は二次情報。

**Thiery & Scherrer (2009) "Building Controllers for Tetris"／"Improvements on Learning Tetris with Cross Entropy", ICGA Journal 32**（https://www.semanticscholar.org/paper/Improvements-on-Learning-Tetris-with-Cross-Entropy-Thiery-Scherrer/7bea02dfd7225cb47689ccae90a5383444294a32）

- CEM で調整した BCTS が平均3,500万ライン、2008年の RL Competition で優勝。ノイズの影響を論じている。評価局数の具体値は確認できていない。

**Boumaza (2009) "On the evolution of artificial Tetris players", IEEE CIG**、**Boumaza "Reducing the Learning Time of Tetris in Evolution Strategies"（Springer LNCS）**（https://link.springer.com/chapter/10.1007/978-3-642-35533-2_17）

- CMA-ES でも3,500万ラインに達し、得られた重みは手作りの Dellacherie の重みに近かった。適合度が確率的で評価が高価なため、レーシングで評価回数を削減。CMA-ES＋レーシングは2コアの予算への現実的な対策になる。

**Hansen, Niederberger, Guzzella, Koumoutsakos (2009) "A Method for Handling Uncertainty in Evolutionary Optimization...", IEEE TEC 13(1):180–197（UH-CMA-ES）**、**Heidrich-Meisner & Igel (2009) GECCO と ICML（UH-CMA-ES for RL、Hoeffding／Bernstein races）**（https://dl.acm.org/doi/10.1145/1553374.1553426）

- 順位に基づく選択の不確実性を定量化し、評価回数や探索幅を調整する。races は「順位づけに足りるだけの局数」を候補ごとに適応的に配分し、学習速度と頑健性の両方を改善した。「1候補何局か」を固定せず適応的に決める方法を与える。

**Lucas, Liu, Perez-Liebana (2018) "The N-Tuple Bandit Evolutionary Algorithm for Game Agent Optimisation", IEEE CEC**（arXiv:1802.05991）、**Lucas ら (2019) "Efficient Evolutionary Methods for Game Agent Optimisation: Model-Based is Best"**（arXiv:1901.00723）

- 分かること：1候補1局という極めてノイズの多い評価でも、N-タプルの統計と UCB で再評価を自動配分する。Planet Wars で 0.54±0.02（グリッド探索 −0.53、SWcGA 0.39）、Asteroids で 8,756±41 と比較手法中で最良。後続論文は「目的関数がノイズを含むときは特にモデルベースが効率的」と結論。
- 効き方：ビーム幅・地平線・決定化の数などの離散ハイパーパラメータの調整。
- 注意点：連続値の重み20〜30個を同時に調整するには離散化が必要。

**共通乱数（CRN）の扱い**

- ゲームエージェントの重み調整に CRN を明示的に使った古典的な一次文献は見つからなかった。近い実践として、Strategy Card Game AI 競技の総括（arXiv:2305.11814、「全エージェント対で同じゲームシードを使い、全手番位置で回す」）、Seeding for Success（乱数系統の分離）、ISMCTS 論文（固定の初期配置で分散を下げる）がある。
- 推測としての注意：世代内で全候補に同じシード集合を使うと順位の比較は安定するが、シード集合に特化した重みが選ばれる危険がある。世代ごとにシード集合を入れ替え、最終候補は別シード帯で評価する。

### 5. AI によるゲームバランス評価・非対称キャラクターの比較

**Mahlmann, Togelius, Yannakakis (2012) "Evolving Card Sets Towards Balancing Dominion", IEEE CEC**（https://www.researchgate.net/publication/235974383_Evolving_card_sets_towards_balancing_dominion）

- 技能の異なる3種のエージェントによる3つの適合度でバランスの取れたカードセットを進化させた。「技能や振る舞いに関係なくバランスをもたらすカード」がある一方、進化が「エージェントがうまく扱えないカード」を突くセットを見つけてしまった例も報告している。
- 効き方：「AI の弱点がバランスの結論を歪める」直接の実例。キャラクター能力が AI の不得意な使い方を要求すると過小評価される危険を示す。複数の技能で評価する手法の原型。

**de Mesentier Silva, Canaan, Lee, Fontaine, Togelius, Hoover (2019) "Evolving the Hearthstone Meta", IEEE CoG**（arXiv:1907.01623）

- カード属性の変更を進化させ、デッキ間の勝率を50%に近づけた（最良個体の適合度0.0062）。NSGA-II で「バランス」と「変更量の最小化」を同時に最適化。
- 効き方：キャラクター能力の調整案を「到達得点の分散を最小化しつつ、変更を最小限に」という多目的探索として定式化するヒント（第2段階以降）。
- 注意点：固定デッキと固定 AI が前提で、調整後に戦略が適応する効果は入っていない。

**de Mesentier Silva ら (2017) "AI-based playtesting of contemporary board games", FDG（Ticket to Ride、4種のヒューリスティックエージェント）**、**"Exploring Gameplay With AI Agents"**（arXiv:1811.06962）

- ゲームに合わせた複数のヒューリスティックエージェント（プレイスタイル別）で、ルールの穴や戦略の偏りを発見。
- 効き方：「得点最大化 AI」1種類だけでなく、プレイスタイルの異なる複数の評価関数（例：港重視、都市重視）でキャラクター順位が変わるかを見る、ペルソナ型の検証に応用できる。

**Zook, Harrison, Riedl（技能の異なる MCTS によるバランス検査、二次文献経由）**、**Jaffe ら (2012) "Evaluating Competitive Game Balance with Restricted Play"**（https://homes.cs.washington.edu/~zoran/jaffe2012ecg.pdf）、**Volz ら (2016) "Demonstrating the Feasibility of Automatic Game Balancing"**（arXiv:1603.03795）

- 同じ技能なら勝率が均等、技能差があれば差が出る、という基準でバランスを判定する。能力を制限したエージェントの勝率で要素の強さを測る。シミュレーションで人間のプレイテストを代替できる規模を示す。
- 効き方：「キャラクター能力を使わない／制限した版」との到達得点の差を、能力の価値として測る手法（restricted play の1人版）が直接使える。

### 6. 実験の統計手法

- 乱数系統の分離と対比較（Seeding for Success）：ゲーム事象・再決定化・エージェントの乱数を分けると、同シードでの再現と対比較ができる。勝敗の二値では対比較の効果は小さいが、得点では未検証。パイロットでまず「同シードの2条件の得点相関」を測り、相関 ρ から分散削減率（1−ρ）を見積もって必要局数を決めるのが合理的（一般的な統計の考え方で、個別の文献は確認していない）。
- 多重比較・順位の安定性：多数の比較では、族ごとの誤り率を制御する Holm 法か、偽発見率を制御する Benjamini-Hochberg 法を使う。順位の安定性はシード単位のブートストラップで順位の信頼区間を出し、v1／v2 間や予算段階間の順位を Kendall のτで比べるのが標準的（一般的な統計手法で、ゲーム AI 分野の特定文献は確認していない）。計画にある「別シード帯で追試」はこの文脈で妥当。
- 局数の決め方：NTBEA の検証は100局、Seeding for Success は1シードあたり1000局。必要局数は得点の標準偏差と検出したい差で決まるため、パイロットで標準偏差を測ってから決める。

### 7. 将来の多人数戦向け

**Schadd & Winands (2011) "Best Reply Search for Multiplayer Games", IEEE TCIAIG 3(1):57–66**（https://cris.maastrichtuniversity.nl/en/publications/best-reply-search-for-multiplayer-games/）、**Nijssen & Winands "An Overview of Search Techniques in Multi-Player Games"**（https://dke.maastrichtuniversity.nl/pim.nijssen/pub/cgw.pdf）、**Esser ら (2013) "Improving Best-Reply Search"**

- BRS（相手のうち最も害の大きい1人だけが応手する）は、Chinese Checkers・Focus・Rolit で maxn を上回り、Chinese Checkers と Focus では Paranoid も上回った。比較研究では BRS が α-β 系で概ね最良、MCTS は maxn の木構造で最良。低予算では BRS や Paranoid が MCTS より良いという報告もある。BRS+ は四人チェスで、maxn と Paranoid に対する勝率を8.3〜11.1ポイント上げた。
- 注意点：いずれも完全情報・確定的な抽象ゲームで、ワーカープレイスメントでの比較は見つからなかった。

**Goodman, Perez-Liebana, Lucas (2022) "MultiTree MCTS in Tabletop Games", IEEE CoG**（https://ieee-cog.org/2022/assets/papers/paper_91.pdf）、**Goodman ら (2024) "Skill Depth in Tabletop Board Games"**（https://qmro.qmul.ac.uk/xmlui/bitstream/handle/123456789/99481/Goodman2024SkillAnalysis.pdf）

- TAG の11ゲームで、全員を1本の木で扱う標準 MCTS、プレイヤーごとの木（MultiTree）、自分だけをモデル化し他者をランダムとみなす SelfOnly を比較。多くのゲームで MultiTree は標準と同等以上で、低予算でのみ有利なゲームもあった。Puerto Rico、Dominion などで技能の深さも分析している。
- 効き方：取り合いがアクションスペース程度なら、まず SelfOnly 型（相手は単純な規則方策）から始めるのが妥当。

**Goodman & Lucas (2020) "Does it matter how well I know what you're thinking? Opponent Modelling in an RTS game", IEEE WCCI**（arXiv:2006.08659）

- MCTS は不正確な相手モデルでも概ね良好だが、RHEA は相手モデルの精度に大きく左右される。相手が未知で予算が小さいとき、RHEA では明示的なモデルを使わない方がよい。
- 効き方：v2 の多人数版で相手の行動を規則で予測するなら、予測を外したときの劣化を必ず測る。

**Baier & Kaisers (2020)**（MCTS レビュー arXiv:2103.04931 経由）

- 多人数ゲームでは自分の行動の影響が相手予測より大きいことが多いとし、相手の手を抽象化する手法で6つのゲームで勝率を改善した。

### 8. フレームワーク

- TAG：前掲。ユーロ系の実装と、MCTS／RHEA／OSLA の比較、NTBEA によるパラメータ調整、バランス調整コンペがある。今回の調査では最も近い参照先。
- Ludii：Soemers ら (2024, arXiv:2406.09242) が、1494ゲーム・61エージェント・268,386局で MCTS 変種の向き不向きを特徴づけるデータセットを作成。抽象ゲーム中心。
- OpenSpiel／boardgame.io：ユーロゲームでの手法比較の一次資料は確認できていない。

---

## 推奨（優先順位つき）

1. 決定化を「複数の並びで計画し、最初の主行動を平均評価で選ぶ」方式に変える（v2 の変更）。並びの数は少なめ（4前後）から始め、ビーム幅を優先する。
2. 重み調整は v1 上で、CMA-ES（λ≈13）か、ノイズを注入した CEM で行う。世代内は共通乱数、世代間でシード集合を入れ替え、上位候補だけ追加評価（レーシング）、最終は別シード帯で評価する。ビーム幅などの離散パラメータは NTBEA で調整する。
3. 関門2を「スキル梯子」に拡張する。v1、v2（ビーム幅を小・中・大）で、キャラクター・地図・スキルの順位を Kendall のτとブートストラップの信頼区間で比べる。予算を上げても順位が動き続けるなら結論を保留する。
4. 関門1は健全性チェックに格下げする。5局は合否の閾値に使わず、人と AI で手が分かれた局面の事例集を作り、評価関数の特徴量追加に使う。
5. 能力の価値の測定に「能力なし／制限版」との到達得点差を併用する（restricted play の1人版）。キャラ間の比較より交絡の少ない指標になる。
6. 複数のペルソナ評価関数で順位の頑健性を見る（Ticket to Ride の AI プレイテストの方式）。AI が苦手な使い方を要する能力が過小評価されていないかを確かめる。
7. 多人数版は SelfOnly／規則ベースの相手予測から始め、BRS や MultiTree は後で比較する。

## 注意事項

- ユーロゲーム（特にワーカープレイスメントとタイル配置の複合）での探索手法の比較や人間上級者との比較について、査読された一次資料はほとんど見つからなかった。推奨の多くは Hero Academy・Tetris・SameGame・Splendor・Dominion などからの類推である。
- Race for the Galaxy の「上位97パーセンタイル」は Temple Gates Games の2018年5月1日のプレスリリースの記述、Agricola アプリの評価は利用者の逸話、Terra Mystica と Splendor の GitHub は査読なしの個人プロジェクトである。
- ISMCTS の個別勝率、Szita & Lőrincz と Thiery & Scherrer の評価局数などの詳細は、全文を取得できず、要約や二次情報に依拠している。
- 計算時間の試算（1世代約23分など）は、手番数・候補数に関する仮定に基づく概算である。実測で置き換えること。
- 統計手法（Holm、BH、Kendall のτ、ブートストラップ）は一般的な手法として挙げたもので、ゲーム AI 分野の特定文献での検証は確認していない。

## 出典一覧

1. https://arxiv.org/pdf/1802.05991
2. https://rdgain.github.io/assets/pdf/papers/gaina2020tag.pdf
3. https://sebastianrisi.com/wp-content/uploads/justesen_tciaig17.pdf
4. https://link.springer.com/chapter/10.1007/978-3-319-31204-0_38
5. https://cdn.aaai.org/ojs/7562/7562-13-11092-1-2-20201228.pdf
6. https://eprints.whiterose.ac.uk/id/eprint/75048/1/CowlingPowleyWhitehouse2012.pdf
7. https://arxiv.org/pdf/1905.01652
8. https://arxiv.org/pdf/2503.02686
9. https://arxiv.org/pdf/2103.04931
10. https://qmro.qmul.ac.uk/xmlui/bitstream/handle/123456789/99481/Goodman2024SkillAnalysis.pdf
11. https://deepai.org/publication/does-it-matter-how-well-i-know-what-you-re-thinking-opponent-modelling-in-an-rts-game
12. https://ieeexplore.ieee.org/document/9185512/
13. https://tabletopgames.ai/
14. https://arxiv.org/pdf/1904.01883
15. https://arxiv.org/pdf/2006.05894
16. https://arxiv.org/abs/2106.08371
17. https://github.com/seal256/splendor
18. https://www.templegatesgames.com/dominion-ai/
19. https://github.com/k8rthik/bgai
20. https://ar5iv.arxiv.org/html/2102.10540
21. https://meadowparty.com/blog/2013/06/15/agricola-ios-app/
22. https://jlericson.com/2022/01/22/agricola_solo.html
23. https://ojs.aaai.org/index.php/AIIDE/article/view/18700
24. https://dke.maastrichtuniversity.nl/m.winands/documents/KNOSYS_SameGame.pdf
25. https://ojs.aaai.org/index.php/AAAI/article/view/26459/26231
26. https://arxiv.org/pdf/2006.07970
27. https://lup.lub.lu.se/search/publication/c9df9472-81f7-4873-b5f4-eba203d44526
28. https://www.semanticscholar.org/paper/Combinatorial-Multi-armed-Bandits-for-Real-Time-Onta%C3%B1%C3%B3n/08eda51118455347ee3ceb51deddb2bca8f65aba
29. https://www.semanticscholar.org/paper/Improvements-on-Learning-Tetris-with-Cross-Entropy-Thiery-Scherrer/7bea02dfd7225cb47689ccae90a5383444294a32
30. https://link.springer.com/chapter/10.1007/978-3-642-35533-2_17
31. https://dl.acm.org/doi/10.1145/1553374.1553426
32. https://arxiv.org/pdf/1901.00723
33. https://arxiv.org/pdf/2305.11814
34. https://www.researchgate.net/publication/235974383_Evolving_card_sets_towards_balancing_dominion
35. https://www.semanticscholar.org/paper/Evolving-card-sets-towards-balancing-dominion-Mahlmann-Togelius/7bdabe68414b24b5ee0626abd902d7a0857bfe95
36. https://www.um.edu.mt/library/oar/handle/123456789/22933
37. https://www.alphaxiv.org/@fernando-de-mesentier-silva
38. https://ar5iv.labs.arxiv.org/html/1907.01623
39. https://www.researchgate.net/publication/333827307_Evolving_the_Hearthstone_Meta
40. https://arxiv.org/pdf/1811.06962
41. https://arxiv.org/pdf/2212.03387
42. https://homes.cs.washington.edu/~zoran/jaffe2012ecg.pdf
43. https://arxiv.org/pdf/1603.03795
44. https://cris.maastrichtuniversity.nl/en/publications/best-reply-search-for-multiplayer-games/
45. https://arxiv.org/pdf/2202.05773
46. https://dke.maastrichtuniversity.nl/pim.nijssen/pub/cgw.pdf
47. https://cris.maastrichtuniversity.nl/en/publications/improving-best-reply-search/
48. https://ieee-cog.org/2022/assets/papers/paper_91.pdf
49. https://arxiv.org/abs/2406.09242
