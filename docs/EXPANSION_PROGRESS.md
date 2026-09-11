# カコマレ 拡張実装進行記録

更新日：2026-09-11（UTC）。[計画v2.0](EXPANSION_IMPLEMENTATION_PLAN.md) に従い、このファイルを唯一の進行正本とする。旧PR-1の変更・失敗・成功記録は [履歴](history/EXPANSION_PROGRESS_PR16.md) に保存し、現在の成功判定へ流用しない。

## 現在の作業：V2の競技基盤と制約付き設置拡張

- ユーザーのV1マージ指示を受け、GitHub上でPR #19のマージ済み状態を再確認した。PR #19のheadは `11ec1a66870a3b06e3332737d0611f5527117bc6`、マージコミットは `edb84e0800d9ed657206c246241f9fafe5fe0014` で、`git fetch origin main` 後の `origin/main` と一致する。PR #19はclosed・mergedで、Draftではない。V1のQuality #52成功は設計工程の証拠であり、V2の検査結果へ繰り越さない。
- V2の作業branchは `codex/v2-competitive-foundation-20260911`。基準mainは上記 `edb84e0800d9ed657206c246241f9fafe5fe0014`。この工程では既存runtimeの8武器・6補助を使い、個体識別、接続図、6→12→18層、容量、発射元・境界、競技初期条件の検証フック、乱数分離、実効値計算、入力台帳の基礎を実装する。V3以降の新武器・新補助・敵・採点・保存v3・ランキング通信は追加しない。
- 競技初期条件は `BattleSceneOptions.competitive=true` のローカル実行フックで適用する。コア100、基準能力、初期武器、初期3＋3面、容量6、引き直し2、除外2を `COMPETITIVE_RULES` から参照する。AppControllerからこのフラグを常時有効化せず、ランキング送信・本番DB・実験場設定は変更していない。
- BuildGraphは各層に武器3面＋補助3面を持ち、層1の6面から層2の12面、層3の18面へ順に開放する。BuildCapacityは表示可能な面数と別に、個体ごとの稼働コスト（現工程は1、容量6/12/18）を管理する。スナップショット、HUD、停止中の装置一覧へ個体ID・nodeID・容量を渡す。
- 攻撃は武器個体ID・生成時の発射元・生成時の境界半径を保持する。通常の射撃・光線・範囲・連鎖・円盤・重力点は設置面の原点を使い、反発輪・周回刃はコア中心の防衛攻撃として維持する。層拡張後も飛翔中の旧弾を新境界へ移さず、実効値は `CombatStats` の共通計算経路から取得する。
- 乱数は敵出現、候補抽選、戦闘効果、表示用に分離した。競技フックでは候補抽選が敵出現列を進めない。通常モードはV0のseed互換性を保持するため従来のシーン乱数列を維持し、競技モードだけ目的別ストリームを使う。
- 結果へルール版、入力の正規化台帳、武器個体別与ダメージ、BuildGraph/Capacityスナップショットを追加した。入力台帳は角度を正規化し更新tickを単調に記録するが、途中保存・分割送信・受付側検証はV6の対象である。

### V2の実装・検査状態

- 追加した主な構造は `src/game/build/BuildGraph.ts`、`src/game/build/BuildCapacity.ts`、`src/game/systems/ArenaGeometry.ts`、`CombatStats.ts`、`RandomStreams.ts`、`InputRecorder.ts`、`src/types/build.ts` と `tests/unit/v2-foundation.test.ts`。既存の `Weapon`、`SupportModule`、`Projectile`、`BattleScene`、`RunRecorder`、HUD/描画へ個体・層・境界情報を接続した。
- `npm ci --ignore-scripts --no-audit --no-fund`（162パッケージ）、`npm run lint`、`npm run typecheck`、`npm run test -- --testTimeout=30000`（24ファイル・172件）は、V2変更後の作業ツリーで成功した。V2単体7件は、層・接続・容量、乱数独立性、入力正規化、実効値、原点・反射、設計専用カタログ非混入を確認する。
- `npm run test:e2e:chromium` はローカルPlaywright実行ファイルが存在せず、31件すべて起動前に失敗した（`/root/.cache/ms-playwright/.../chrome-headless-shell` 不在）。続けて `npm run test:e2e:webkit` も同じ理由で31件すべて起動前に失敗した（`/root/.cache/ms-playwright/webkit-2336/pw_run.sh` 不在）。テストコードの失敗ではなく環境未実施として扱う。V2の提出headに対するGitHub Actionsのブラウザ結果は、公開後に対象commitとrunを追記する。
- V2で測定していないものは、6→12→18の長時間本戦バランス、18面最大負荷、30/60/120描画比較、保存からの完全復元、iPhone Safari/VoiceOver/片手操作、通常720試行・無限60試行、ランキング受付・本番DBである。V2は基盤のコード検査までで、競技性や実機受入を完了扱いにしない。

### V2の提出状態

- Draft PRはコード・文書・検査を確定してから作成する。作成前のためURLは未確定。mainへの直接push、マージ、自動マージ、保護設定の緩和、本番DB変更、実験場の有効化は行わない。
- V2のA項目はA06（設置拡張）、A07（個体識別）、A08（発射元・境界）、A12（接敵猶予の基盤）、A13（弾割当の個体化の基礎）を「実装中・検査待ち」とする。公平性の本戦測定と弾枠の全武器監査はV7へ残す。A14（途中保存）は設計用の入力台帳までで、保存実装はV6で行う。A20は本節追加で進行記録をV2へ同期した。

## V1完了記録（履歴）

- V0の補正Draft PR #18は2026-09-11T02:08:01Zにマージ済み。GitHub APIと `git fetch origin main` の双方で、現在のmainが `7ba253c4304cf719b96c738974af5fe821236371` であることを確認した。PR #18の [Quality #50](https://github.com/chameleonjp-lab/kakomare/actions/runs/34552685647) は公式PlaywrightコンテナとPages同条件native Ubuntuの両jobで成功し、V0の配備検査補正を完了とする。Pagesの公開結果、iPhone Safari、本番ランキングは別の未確認事項である。
- V1作業branchは `codex/v1-competitive-catalog-20260911`。基準mainは上記 `7ba253c4`。この工程では設計台帳、型、検証器、競技ルール案、生成文書だけを追加し、設計のみの武器・補助を戦闘・図鑑・抽選の実行時登録へ混ぜない。
- 設計数は基本武器50（現行実装8＋最初の追加4＋残る新規38）、補助S=20（現行実装6＋設計14）、武器×補助の適用セル1,000、各武器2方向の相乗効果100件。現行runtime registryは武器8・補助6のままで、50種類を実装済みとは数えない。
- 追加した主な成果物は `src/types/expansion.ts`、`src/data/expansionCatalog.ts`、`src/data/competitiveRules.ts`、`src/validation/expansionCatalog.ts`、`tests/unit/expansion-catalog.test.ts`、`scripts/generate-expansion-docs.mjs` と、生成された `WEAPON_CATALOG.md`、`SUPPORT_CATALOG.md`、`SYNERGY_MATRIX.md`、`COMPETITIVE_RULES.md`、`BALANCE_REPORT.md`。文書は台帳データから生成し、`verify:expansion-docs` で同期を検査する。Qualityの両runnerへ同検査を追加した。
- D01〜D07（50/S、通常Lv8・分岐・特別発展の出発点、容量6、候補重み、採点案、敵・負荷の観測基準、ランキング版・識別子・送信境界）は `docs/BALANCE_REPORT.md` と `docs/COMPETITIVE_RULES.md` に根拠付きで記録した。D08（長時間の数値範囲・性能予算・保存頻度）はV2で決める。
- [Draft PR #19](https://github.com/chameleonjp-lab/kakomare/pull/19) を作成。カタログ提出headは `9899ab6e129559a528c349fe235df4e40ff802b2`、進行記録追補headは `f7af609e7d74c83d3cf9b6c17f668964ce4e834c`。PRはDraft/openを維持し、mainへのpush・マージ・自動マージは行っていない。

### V1の検査状態

- `npm ci --ignore-scripts --no-audit --no-fund` は162パッケージで成功。`npm run lint`、`npm run typecheck`、`npm run test`（23ファイル・165件）、`npm run verify:expansion-docs`（5ファイル）、`npm run build`、`npm run verify:dist`、`npm run verify:originality`、`git diff --check` は、提出差分を含む作業ツリーで成功した。Viteの500kB超チャンク警告は残るが、V1の設計検証失敗とは扱わない。
- ローカルのPlaywrightブラウザ一覧は空で、Chromium/WebKitの画面検査は未実行。ただし進行記録追補head `f7af609e` に対する [Quality #52](https://github.com/chameleonjp-lab/kakomare/actions/runs/34555509964) は成功した。公式Playwrightコンテナのjob `103127252840` とPages同条件native Ubuntuのjob `103127252800` は、各23ファイル・165件、Chromium31件、WebKit31件、文書整合性、静的、ビルド、配布物、独自名称の全stepに成功している。これは自動ブラウザ検査であり、iPhone 17 Pro Safari、VoiceOver、片手操作、発熱、公開配備一致、本番DB・受付・ランキングの確認ではない。
- V1の受入境界は、設計済み台帳・適用表・相乗効果・競技契約・検証器が揃うこと。50武器の戦闘実装、抽選到達、容量実測、長時間本戦、ランキング送信、DB変更はV2〜V7へ残す。mainへのpush/マージ、自動マージ、保護緩和、本番DB・実験場の有効化は行わない。

進行記録自身のSHAを自己参照で更新し続けないため、以後のdocs-only追補とそのCIの最新状態はPR #19のChecksと本文へ記載する。ユーザーのV1マージ後に、計画どおりV2の競技基盤へ進む。

## V0の配備検査失敗を補正した履歴（PR #18）

- PR #17は2026-09-10T18:57:20Zにマージ済み。現在のmainは `46b1a5680f00f9d689c008820e24c659861ed165`。再開時点のopen PRと#17コメントは0件。
- PR最終head `068d38e7d7a02677e06ad1aeabc2584ddacb2d08` の [Quality #48](https://github.com/chameleonjp-lab/kakomare/actions/runs/34510063115) は成功済み。ただしマージ後の [Deploy GitHub Pages](https://github.com/chameleonjp-lab/kakomare/actions/runs/34517482475) は失敗しており、公開完了ではない。
- 失敗job `103006427054` は単体・結合161件成功、Chromium30件成功・1件失敗。320×568・文字200%のパネル下端が584.546875px、許容下端569pxを超過。初回・retry1・retry2で同値。WebKit・ビルド・アップロード・配備は未実行（skip）であり、成功には数えない。
- Qualityは公式Playwrightコンテナ、Pagesはnative Ubuntu runnerだった。環境差は確認事実だが、フォントだけが原因であるとはログだけで断定しない。
- 作業branch：`codex/v0-pages-recovery-20260911`。既存のローカルV0作業コピーは未コミット差分を保持して別worktreeで最新mainから開始した。#17はマージ済みのため、修正は新しい補正Draft PRで提出する。V1の制作工程を増やすものではない。
- 範囲：小画面・文字拡大時のHUD/戦場レイアウト、回帰検査、配備と同じnative runnerのPR検査追加、進行同期。主要48px・文字サイズ・検査閾値・保留契約を弱めない。V1以降、新武器/補助/採点/保存/DBは変更しない。
- 禁止事項は維持。mainへのpush/マージ/自動マージ/保護緩和、本番DB・実験場設定の変更、Pages配備の手動起動は行わない。配備確認は補正PRのユーザーマージ後に行う。

### 今回の検査・担当・提出

修正：600px以下の縦画面では、HUDの自然高をGridのauto行へ確保し、残りの行をsize containerとして戦場の正方形を収める。従来のviewportから固定remを引く計算だけではHUD実寸の差を吸収できなかった。320×568・文字200%は従来の既定フォント条件を残し、monospace条件・正方形・保留ボタン48pxも追加。既存の240px最小戦場と下端569pxの閾値を維持する。

`npm ci` 成功（162パッケージ）。修正後の `npm run lint`、`npm run typecheck`、`npm run test`（22ファイル161件）、`npm run build`、`npm run verify:dist`、`npm run verify:originality`、`git diff --check` は成功。Viteの500kB超警告は残る。ローカルPlaywrightのブラウザ一覧は空で、Chromium取得は配布元502により失敗し、ローカルブラウザ検査は未実行。PRでは既存コンテナ検査に加えてPagesと同じnative Ubuntu/Node24/ブラウザ導入の検査jobを追加した。配備処理・権限は追加しない。
Luna・Maxがレイアウト修正/回帰検査、親セッションが環境差確認/CI/文書/統合/提出、別のSol・Highがread-only独立レビューを担当した。独立レビューで「viewport内でも親shellでHUDが切れ得る」と指摘され、shell/layout下端との比較を追加した。静的レビューの他のblockerはなく、追加した厳密な判定も両環境のE2Eで成功。iPhone実機は未確認。

[Draft PR #18](https://github.com/chameleonjp-lab/kakomare/pull/18) を作成。コード提出 `2ab16aadfe2adffa62245c1cf946f882e8f3509a` の [Quality #49](https://github.com/chameleonjp-lab/kakomare/actions/runs/34552188622) は成功。通常git pushはローカルのGitHub認証未設定で失敗したため、接続済みGitHub APIで同じ差分を作業branchへ反映した。ローカルcommit `cefb95f` とコード提出commitのtreeはともに `2270027fad702e8c1289b7e4ea160d89d90b3c4f` で一致する。

| Quality #49環境 | job / ログ | 単体・結合 | Chromium | WebKit | 静的・build・公開物検査 |
|---|---|---|---|---|---|
| 公式Playwrightコンテナ | [103117226737](https://github.com/chameleonjp-lab/kakomare/actions/runs/34552188622/job/103117226737) | 22ファイル161成功 | 31成功 | 31成功 | 全成功 |
| Pages同条件native Ubuntu | [103117226540](https://github.com/chameleonjp-lab/kakomare/actions/runs/34552188622/job/103117226540) | 22ファイル161成功 | 31成功 | 31成功 | 全成功 |

両jobのログに失敗・flaky・retryの記録なし。既存X01～X10/P16-01～08を含む全スイートを維持して実行した。旧Pages失敗をこの成功で消さず、公開配備完了とは扱わない。本記録だけを追加した提出headのCIも再確認し、正確な最終headとrunはPR #18本文・Checksへ記載する（自己参照SHAを文書へ書くための無限更新はしない）。次はユーザーの#18マージ後に最新mainとPages配備結果を確認する、という状態だった（V1開始前の履歴）。

## V0初回提出時の確認状態（履歴）

- 対象：V0「PR #16の未達修正と計画の更新」。V1以降はユーザーのマージ後。
- 基準main：c34d1910e53ca7b75ff858cb1135070723d438a7。
- 作業branch：codex/expansion-v0-20260910。
- 開始時：PR #16は2026-09-10T02:19:51Zにマージ済み。最終head 00b92d2e906932818102b5f2aa629238433fa804、[Quality #45](https://github.com/chameleonjp-lab/kakomare/actions/runs/34389234782)全step成功。open PRなし、関連remote branchesもmainへ取り込み済み。同等V0の先行実装なし。
- AGENTS.md/CLAUDE.mdはリポジトリになし。ユーザー提示v2.0と添付「実装組織図.txt」を読んだ。

提出コミット・Draft PR・現コミット検査は提出欄へ記録する。main直接push・マージ・自動マージ・保護緩和・本番DB変更・実験場有効化は行わない。

## 工程とF要件（V0完了時点の履歴）

| 工程 | 状態 | 次の境界 |
|---|---|---|
| V0 | #17マージ済み・配備検査失敗の補正中 | 上記の小画面修正と同環境検査。V1へは進まない |
| V1 | 未着手（当時） | V0残件対応後、開始指示に従い全50設計/S/50×S/各2方向/D01～D07/型と定義検証器 |
| V2 | 未着手 | 8武器6補助で個体接続容量配置/乱数/入力基盤 |
| V3 | 未着手 | 12武器/対応補助/連動弱点/初期混成。12は最終でない |
| V4 | 未着手 | 25武器/補助/敵/競技無限採点/本戦初回 |
| V5 | 未着手 | 基本50/S/全連動/追加面ボス/全形態と抽選到達 |
| V6 | 未着手 | 保存結果共有/実験場契約。本番は別許可 |
| V7 | 未着手 | 最終本戦/負荷/独立レビュー/実機/公開受入 |

| F | V0現在と最終受入 |
|---|---|
| F01 | 基本8を保持、追加0。V1設計/V5基本50実装/V7受入。分岐進化色違い除外 |
| F02 | 補助6を保持。最終S未決、V1で50×S、V5/V7全検査 |
| F03 | 全50各2方向は未設計/未検査。V1/V3～V5/V7 |
| F04 | 既存候補/継続出口維持、重み合法分布はV1/V3～V5 |
| F05 | 6箇所維持。容量と6→12→18はV1/V2 |
| F06 | 現行無限保持、新競技は未実装。V1/V2/V4/V6/V7 |
| F07 | 敵8・3面維持。V3～V5内容/V7本戦 |
| F08 | V0保留画面再開/停止/終了優先。V6保存復帰を含め維持 |
| F09 | V0ブラウザ検査、iPhone未確認。V7実機 |
| F10 | 保存型/キー/移行変更なし。V6完全復帰/精算 |
| F11 | V0対象外、本番未確認。V6契約・別許可後V7 |
| F12 | 対象commit・実結果・担当を区別し各工程/V7へ |

8は現行定義数で、v2の全形態/連動/競技ゲートを8種類完了した意味ではない。v2最終公開受入済みは0種類。設計済み/実装済み/検査済み/公開受入済みを別計数し、12/25で完成にしない。

## A01～A20の移管

| ID | 不足 | 工程 | 状態・残り |
|---|---|---|---|
| A01 | 候補不足停止 | V0/V1/V3 | PR16通常保持/継続補完を回帰 |
| A02 | 上限後成長 | V0/V1/V3～V5 | 安全策維持、競技成長未着手 |
| A03 | 成長保留拡張表示 | V0/V2/V3 | 旧完了を訂正。数値だけで再開不足、V0修正、拡張は後続 |
| A04 | 説明中進行 | V0/全工程 | 完全停止維持、60秒実更新へ検査強化 |
| A05 | 停止情報積重ね | V0/V2/V6 | 内容切替維持、複合停止/結果復帰検査 |
| A06 | 設置拡張 | V2 | 未着手 |
| A07 | 種個体混同 | V2 | 未着手 |
| A08 | 起点境界中心前提 | V2 | 未着手 |
| A09 | 発展移設入替 | V1/V3～V5 | 未着手 |
| A10 | 撃破順意味 | V3～V5/V7 | 本戦未着手 |
| A11 | 無限変化整備 | V4 | 未着手 |
| A12 | 接敵猶予 | V2/V7 | 未着手 |
| A13 | 弾割当偏り | V2以後/V7 | 未着手 |
| A14 | 途中保存 | V2/V6 | 未着手 |
| A15 | 未使用結果一覧 | V6 | 未着手 |
| A16 | 新旧点比較 | V1/V6 | 未着手 |
| A17 | 研究成長枝 | V1/V3～V5 | 未着手、競技恒久能力なし |
| A18 | 追加通常面 | V5 | 未着手 |
| A19 | 長時間枯渇 | 各工程/V7 | V0停止成長回帰のみ。本戦360/720・無限60未着手 |
| A20 | 文書実態差 | V0/各提出 | #16 merged/#45へ訂正、旧完了精査/v2移管 |

旧B01～B07/W01～W04/E01～E05/S01～S04/U01～U03と追加C01～C22は計画20章に残す。W02は96組から最終50×Sへ拡張し全分岐/複数連動を別軸で検査する。部分成功を全拡張完了へ繰り越さない。

## V0仕様変更と維持

| 項目 | 旧 | 新 | 理由・保存影響 |
|---|---|---|---|
| 保留 | 数値のみ、追加撃破で再要求 | 明示保留を保持、撃破で自動再表示なし | 意図した保留を守る。永続形式変更なし |
| 再開 | 公開操作なし、旧試験はopenUpgrade直呼び | 実ボタン→GameHost→BattleScene→安全更新境界 | 追加撃破不要、古い/重複入力を照合 |
| 停止/終了検査 | 1秒停止、事前HP0 | 60秒実更新、同更新実撃破＋致死 | X08/X09要求に検査を合わせる |
| 計画 | v1の12武器/96組/6工程 | v2基本50/S/50×S/連動競技/V0～V7 | 旧全文/記録をhistoryに保持し未決Dを継承 |

XP式とX05、継続候補、3回休止、選択番号で一度確定、完全停止、終了優先、通常確定に毎回3秒を付けないことを維持。
新武器/補助/敵、容量、競技採点、研究、保存v3、ランキング通信はV0対象外。

## 検査と失敗記録

修正前：mainを隔離展開し、新しい「保留中の撃破」検査から新フィールド存在確認だけを外して実行。Lv1/XP154→3回確定→保留→撃破処理→次更新で選択通知が5から6に増え、expected5/got6で失敗した。同試験は作業コードで成功。
これは内部処理での再現であり画面操作成功とは別。-tで1件だけに絞った再現の他17件対象外表示は、テストへskipを追加したものではない。最終では全件を実行する。

環境履歴：
- npm ci成功（162パッケージ）。
- npx playwright install chromium webkitはCDNの502/timeoutでブラウザ導入失敗。この時点のローカル画面検査は未実行（後のActionsでの実行は下記）。
- その後、作業環境がexec-server transport disconnected、409 environment_offlineとなり再接続も失敗。承認拒否ではなく環境切断。
- 切断前の途中確認ではtypecheckと対象3ファイル39件（独立レビュー担当確認）が成功したが、後続修正を含む最終証拠へ流用しない。
- GitHub接続が稼働しているため、基準mainのファイルを再取得し修正をGitHub APIで再構成して作業branchへ反映。提出コードの静的/単体/画面/ビルド検査は既存Actions公式Playwrightコンテナで実行し、下記のコミット別ログで確認した。

提出結果は下の提出欄に記録した。ローカル環境失敗とActionsでの成功は区別する。

## 担当と未確認

Luna・Maxの別エージェントが切断前の実装/調査/検査を担当。環境切断後の提出コードは親セッションがGitHubの基準mainから再構成し、計画反映/統合/提出も担当。Sol・Highの別エージェントが独立レビューを実施。自分の再検査とは区別する。
初回レビューの前play入力runId照合、公開境界、X08実同時発生、P16-04実状態保持、P16-05/06候補/乱数復帰、文書の会話履歴依存は対応済み。最終の別担当Sol・Highによるread-onlyコードレビュー（7be9990と4b5e57a）でblocker/actionable bugなし。別のSol・High文書監査でも0～21章・全要求/検査ID・50/S/連動/競技契約と旧全文履歴の保持を確認。これらはソース/文書レビューで、iPhone実機操作ではない。
Sol・Extra Highは今回使用していない。作品採否/iPhone実機/マージはユーザー。

iPhone 17 Pro Safari、VoiceOver/片手/発熱/長時間識別、公開ページと配備一致、本番DB/受付/ランキングは未確認。WebKit自動検査は実機Safariではない。
本戦360/720・競技60・広い未使用seed・30/60/120描画比較・18枠最大負荷は後続へ残す。D01～D07はV1、D08はV2設計待ち。V0に本番許可待ちの実施物はない。

## 提出記録・再開

- 初回Draft PR：[#17](https://github.com/chameleonjp-lab/kakomare/pull/17)（2026-09-10にマージ済み、上記再開記録参照）。
- 基準main：c34d1910e53ca7b75ff858cb1135070723d438a7。
- 実装コードコミット：7be999050b4ae379eaedb8b2ff11856d9f9cad99。
- 検査強化コミット：4b5e57a13c456cd2db8872d95e0745a4a4bfcc59（本番コード変更なし）。
- [Quality #46](https://github.com/chameleonjp-lab/kakomare/actions/runs/34508421433)、job 102976208763：7be9990に対し全step成功。22ファイル160件、Chromium30件、WebKit30件。
- [Quality #47](https://github.com/chameleonjp-lab/kakomare/actions/runs/34509395413)、job 102979472696：4b5e57aに対し全step成功。22ファイル161件、Chromium31件、WebKit31件。前run入力/3回再戦/非zero停止状態の追加検査とgit diff --checkを含む。
- 本記録の同期後の最終head/CIはPR #17の最新headとChecksで照合する。本記録自身のSHAを自己参照で更新し続けない。最終headの検査状態はPR説明にも記録する。
- 実行コマンド：npm ci / npm run lint / npm run typecheck / npm run test / npm run test:e2e:chromium / npm run test:e2e:webkit / npm run build / npm run verify:dist / npm run verify:originality / git diff --check。最後のコマンドはCIのcheckout作業ツリーで実行。旧履歴の原文にあるMarkdown改行用末尾空白は保持。
- Viteの500kB超チャンク警告は残る。処理負荷/実機性能の合格を意味しない。Quality46の成功を後続変更の成功へ読み替えない。

| 条件 | 実行証拠・範囲 |
|---|---|
| P16-01 | core.spec.ts：ローカル限定testXp=154を開始準備に使い、3回選択→保留→HUD再開→最後の選択をDOMボタンで実行。Lv5/XP0/次61、残0無効。追加撃破なし |
| P16-02 | battle-quality.test.ts：保留中100回の撃破通知で経験値/回数増、選択は自動表示されない。内部撃破通知の結合検査で、画面からの敵撃破実績とは区別 |
| P16-03 | 再開連打、古い選択番号、同じ番号を持つ前run、終了後入力。実GameHost公開APIと3回再戦後の旧DOMを別検査 |
| P16-04 | 同じ本番stepを1/60秒×3600回。HP・敵・弾・非zero攻撃待ち・重力・複数予告・時間・候補・乱数・出現処理を比較 |
| P16-05 | 強化画面の非表示/回転/復帰で同じ候補とXP。画面から確定し、一時停止→明示再開。Safari実機ではない |
| P16-06 | 保留/再開2巡、無効番号/重複要求/一時停止は候補・乱数を変えない。再抽選操作の新ルールはV1対象 |
| P16-07 | 装置確認/戻る/一時停止/再開/強化/リタイア/結果/再戦。結果の背後へ候補を残さない |
| P16-08 / X01～04 | 既存upgrade.test.tsの通常候補1/2枚・全上限・全除外を全件実行 |
| X05 | progression.test.ts：Lv27/XP3085/次259→10確定→Lv37/XP90/次349。式/収入は無変更 |
| X06～07 | battle-quality.test.ts：重複番号/古い候補/無効配置の消費・取得・記録を防止 |
| X08 | 事前HP0を廃止。HP1から同じstep内に味方弾が敵を撃破、敵弾がコアへ致死。経験値獲得と敗北を確認し候補0 |
| X09～10 | P16-04/05と既存回転/非表示のUI検査で維持 |

画面検査は本番ビルドをローカルpreviewで動かすChromium/WebKit。320×568、375×667、390×844、402×874、430×932/横画面、320×480、文字200%の既存検査も残し全件実行する。新テストのUI操作にBattleScene内部メソッドは使用していない。
まずgit status、git log -1、本記録、PR状態/コメント/最新Actionsを読む。環境復旧時は未提出ローカルコピーをそのままpushせずGitHubの作業branchを取得し差分を照合する。
V0の初回提出はマージ済みだが配備検査が失敗したため、現在は冒頭の補正作業を優先する。V1の全50台帳/S/適用連動/D01～D07/定義検証器はまだ開始していない。
