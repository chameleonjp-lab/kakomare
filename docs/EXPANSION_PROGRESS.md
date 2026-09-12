# カコマレ 拡張実装進行記録

更新日：2026-09-12（UTC）。[計画v2.0](EXPANSION_IMPLEMENTATION_PLAN.md) に従い、このファイルを唯一の進行正本とする。旧PR-1の変更・失敗・成功記録は [履歴](history/EXPANSION_PROGRESS_PR16.md) に保存し、現在の成功判定へ流用しない。

## 現在の作業：V7の最終本戦・性能・公開前ゲート（PR #25マージ・main公開確認済み）

- V6の [PR #24](https://github.com/chameleonjp-lab/kakomare/pull/24) はユーザーによりマージ済み。`git fetch origin main --prune` で確認した最新mainはマージコミット `5cc40b1f9abf8101a85bd1ff39cf0be72ab365b8`（PR #24 head `69abd6024471b47d044d378d9f044dd03bb51001`）で、作業開始時のopen PRは0件だった。このmainから作業branch `codex/v7-final-verification-20260911` を作成した。
- V7では、計画第17章の通常720試行（6ステージ×開始値20×選択方針3×研究状態2）、競技無限60試行（開始値10×選択方針3×自動／危険対象照準2）、代表試行の30／60／120回描画比較を、本番の`BattleScene`固定更新経路で実行する。基本武器50・補助20・全1,000組はV5から維持し、12・25種類を完成数へ戻さない。
- 監査で、競技ルールの`timeAndHpAreResultFields=true`に反して、`RunRecorder`の結果計算とHUDスナップショットが生存時間×5＋残HP×20を競技得点へ加えていたため修正した。競技は撃破・危険段階・ボス・達成危険の台帳だけを得点とし、通常モードの旧式得点は維持する。ルール版を`expansion-v7-runtime`、manifestのクライアント版を`kakomare-web-v7`へ分離し、V6途中状態を新規則へ黙って読み替えない。
- V7の試行記述を`FinalGateProtocol`へ定義し、選択方針・研究状態・照準方針・開始値・観測上限を重複なく列挙する。上限は敵180、味方弾280、敵弾80で、固定時計・候補選択・実戦終了を省略しない。専用`npm run test:v7`とCIの`v7-final-gates` jobを追加し、通常品質jobで長時間検査を二重実行しない。
- Draft [PR #25](https://github.com/chameleonjp-lab/kakomare/pull/25) を `codex/v7-final-verification-20260911` から提出した。コード提出時のコミットは `2669a784df52621ce9e5195eb4c2a5780b532a06`、[Quality #74](https://github.com/chameleonjp-lab/kakomare/actions/runs/34644134706) は `quality`、`pages-runner-quality`、`v7-final-gates` の全job・全step成功である。その後、ユーザーがPR #25をマージしたことをGitHub APIと `git fetch origin main --prune` の双方で確認した。最終headは `a4df4613abc1013d4e6136c7afc021804d34c586`、マージコミットは `7f6456cb50157e6fa87a50d0c6daeb662897209d`、文書追補後の [Quality #75](https://github.com/chameleonjp-lab/kakomare/actions/runs/34645194667) も全job・全step成功である。
- PR #25マージ後の公開確認を `codex/v7-public-verification-20260912` で追補し、文書3ファイルのみを含むDraft [PR #26](https://github.com/chameleonjp-lab/kakomare/pull/26) をmain（`7f6456cb50157e6fa87a50d0c6daeb662897209d`）へ提出した。最終提出headは `dee85d96ffec6f26939a74ff6c84f40f2f47426e`、[Quality #77](https://github.com/chameleonjp-lab/kakomare/actions/runs/34681392782) は `quality`、`pages-runner-quality`、`v7-final-gates` の全job・全step成功である。PR #26はopen/Draftを維持し、mainへの直接push・マージ・自動マージは行っていない。

### V7の検査状態（CI確認済み・main公開確認済み）

- `npm run test:v7 -- --testTimeout=900000` は1ファイル・3テスト、720通常＋60無限＋30／60／120Hz比較の全件に成功した（合計484.660秒。内訳：通常720＝153.882秒、無限60＝213.158秒、描画頻度比較＝117.085秒）。各試行は実際の`BattleScene.step`と`FixedStepClock`を使い、敗北または観測上限まで進め、固定更新コールバック内で上限超過を検査した。
- `npm test -- --run --testTimeout=30000` は29ファイル・206件が成功した。競技／通常得点の分離、V7試行行列の重複なし、V6の保存・精算・ランキング契約、既存の保留・停止・武器50・補助20回帰を含む。
- `tests/v7-final-gates.test.ts`は描画を作らないNode検査だが、テスト専用の戦闘計算ではなく、esbuildした本番`BattleScene`の更新・候補確定・終了経路を呼ぶ。画面の実操作、iPhone Safari、実験場受付側の再計算とは別の証拠として扱う。
- `npm ci --ignore-scripts --no-audit --no-fund`（162パッケージ）、`npm run lint`、`npm run typecheck`、`npm test -- --run --testTimeout=30000`（29ファイル・206件）、`npm run verify:expansion-docs`、`npm run verify:ranking-manifest`、`git diff --check`、`npm run build`、`npm run verify:dist`、`npm run verify:originality`を最終差分で成功させた。Viteの500 kB超チャンク警告は継続しているが、検査失敗とは扱わない。
- PR #25マージ後のmainについて、[Deploy GitHub Pages run 34679314243](https://github.com/chameleonjp-lab/kakomare/actions/runs/34679314243) がhead `7f6456cb50157e6fa87a50d0c6daeb662897209d`で成功した。クラウドブラウザで正式URL `https://chameleonjp-lab.github.io/kakomare/` を開き、release metadata `kakomare-20260911-v7`、名前入力→ホーム→ステージ選択→stage-1戦闘→実際の強化候補→一時停止→再開を確認した。強化候補には完全停止の説明が表示され、一時停止中の残り時間は1.2秒前後で `166` のまま、再開後は約1.2秒で `165` へ進んだ。公開mainの配備commitとURLの一致、戦闘画面・停止・再開のクラウドブラウザ確認を記録したもので、iPhone Safari実機の証拠ではない。
- 未確認：ローカルPlaywright実行ファイルを用いたChromium／WebKit本体（この環境では実行ファイル不在）、iPhone Safari・VoiceOver・片手操作・発熱・長時間操作、独立Sol・Highレビュー、実験場のRPC署名・登録値・認証・権限・受付側再計算、本番ランキング有効化。これらを自動試行やクラウドブラウザの成功へ繰り上げない。

### V7の変更境界

|項目|V7で行うこと|行わないこと|
|---|---|---|
|競技得点|競技経路で生存時間・残HPを得点へ加えず、通常得点と結果情報を分離。ルール版をV7へ更新|本番ランキング登録、既存V6記録の上書き、得点係数の無断変更|
|最終本戦|720通常、60無限、30／60／120Hz代表比較を同一BattleScene経路で実行。敵・弾の共通上限を検査|失敗試行の除外、短縮シミュレーションの成功扱い、永久生存の保証|
|内容|基本50武器・補助20・1,000組・相乗効果を維持し、V7で到達・撃破・上限を観測|50武器の縮小、12／25武器で完成扱い、補助・相乗効果の検査省略|
|公開前|manifest・release metadata・生成文書・CI jobをV7へ同期|mainへの直接push、マージ、自動マージ、保護設定変更、実験場の有効化|

PR #25はこの差分の検査・文書更新後に作成され、ユーザーのマージまで完了した。提出head、マージcommit、main配備run、クラウドブラウザの公開確認を本節へ記録した。実機・本番受付・ランキング有効化は別許可と実環境確認が必要である。

## V6の保存・結果・ランキング連携（履歴）

- PR #23（V5）はユーザーによりマージ済み。`git fetch origin main` で確認した現在のmain先端はマージコミット `65801a7c9619aa988f787890716252d1342d923b`（PR #23のhead `e51b779...`）で、作業開始時のopen PRは0件だった。このmainから作業branch `codex/v6-save-result-ranking-20260911` を作成した。
- V6では、進行保存v3への移行（v1/v2を保持）、安全な更新境界での途中保存と再開、敵・弾・候補・配置・容量・乱数・入力台帳の復元、結果の一回精算、無限モード結果のゲーム側ランキングアダプター、manifest検査、結果画面の送信状態を実装する。基本武器50・補助20・全1,000組はV5の内容を維持し、V6で縮小しない。
- ランキングは既定では未接続ゲートウェイ。接続時も、ゲーム生成の `start_id` →受付発行の `play_id` → `finish_game_play_v1` →一つの `submission_id` による `submit_score_idempotent_v1` の順で、応答喪失後は同じ識別子・確定得点・内訳を再送する。本番Supabase／実験場の登録、RPC署名・権限・認証・受付動作は未確認であり、DB変更・ランキング有効化は行わない。
- `ResultLedger` は `resultId` ごとに部品・記録の精算を一回に限定し、リタイアをランキングへ送らない。ルール版・コンテンツ版・クライアント版を保存と結果で区別する。

### V6の検査状態（Draft提出済み・CI確認済み）

- `npm test -- --run --testTimeout=30000` は28ファイル・201件が成功。保存v3移行、途中状態のwrite-ahead復元、入力・時計・結果台帳、ランキングの開始再送・得点内訳固定・未設定ゲートウェイ、manifest検証、完全なBuildGraph／runtime検証を含む。
- `npm run lint`、`npm run typecheck`、`npm run generate:expansion-docs`、`npm run verify:expansion-docs`、`npm run verify:ranking-manifest`、`npm run build`、`npm run verify:dist`、`npm run verify:originality`、`git diff --check` は成功（Viteの500 kB超チャンク警告は継続）。
- 途中保存は runSeed、固定時計、入力台帳、目的別乱数、出現状態、敵・弾・機雷・重力領域・子機・予告・候補・配置・容量を一体で検証し、無限モードの制限時間は保存時だけ有限の0へ正規化する。BuildGraphの重複ノード・親・接続、runtimeの入れ子・map・候補も復元前に拒否し、正規キーの読み戻しを確認する。
- ローカル `npm run test:e2e:chromium`／`npm run test:e2e:webkit` は、Playwright実行ファイル（Chromium `chromium_headless_shell-1234`、WebKit `webkit-2336/pw_run.sh`）不在により起動前に失敗し、テスト本体は未実施。提出コミットのGitHub Actions結果とiPhone Safari実機を別に記録する。
- [Draft PR #24](https://github.com/chameleonjp-lab/kakomare/pull/24) を `codex/v6-save-result-ranking-20260911` から提出した。最終提出コミットは `16452821650d281c2e962d3e766ebf845bfe1f7d`（ローカル対応コミット `a6f7efd`）で、基準main `65801a7c9619aa988f787890716252d1342d923b` から3コミット先である。PRはopen/Draft、mainへの直接push・マージ・自動マージ・保護設定変更・本番DB／実験場設定変更は行っていない。
- 初回 [Quality #69](https://github.com/chameleonjp-lab/kakomare/actions/runs/34630146610) は、BattleSceneの大きなblobが転送出力上限で切断され、静的検査の構文解析で失敗した。完全なblobへ置き換えた [Quality #71](https://github.com/chameleonjp-lab/kakomare/actions/runs/34630528950) は、既存E2Eのリタイア検査で、V6のルール版バケット初期化が未確定記録を変更していたため失敗した。いずれも失敗を隠さず同じbranchで修正した。
- 最終提出コミットに対する [Quality #72](https://github.com/chameleonjp-lab/kakomare/actions/runs/34630923501) は、`quality`／`pages-runner-quality` の両jobで静的・型・単体201件、Chromium32件、WebKit32件、文書・manifest・build・配布物検査の全step成功を確認した。これはGitHub Actionsの自動検査であり、iPhone Safari実機、長時間本戦、実験場本番受入を意味しない。
- 未確認：iPhone Safari・VoiceOver・片手操作・発熱、通常720試行／無限60試行、30/60/120回描画比較、実験場本番受付・DB・公開URL。これらをV6のゲーム側検査成功へ繰り上げない。

### V6の変更境界

|項目|V6で行うこと|行わないこと|
|---|---|---|
|保存|進行v3移行、途中run save、安全境界の復元、破損退避|既存データの削除、任意時点の無検証復元|
|結果|`resultId`単位の一回精算、個体別結果、終了種別の保持|リタイアの部品・ランキング加点|
|ランキング|manifest、ゲーム側adapter、start/play/submission識別、再送状態|本番DB／RPC登録・権限変更・有効化|
|内容|V5の基本50武器・補助20・相乗効果・敵編成を維持|武器・補助・敵の削減、V7本戦の前倒し|

## V5の基本50武器・補助20・追加面とボス（履歴）

- PR #22（V4）はユーザーによりマージ済み。V5開始時のmain先端はマージコミット `4bb667784e6e7553034ca7682b088f027d95a118`、開始時のopen PRは0件だった。これを基準に作業branch `codex/v5-content-complete-20260911` を作成した。
- V5では、V1で確定した設計台帳をruntimeへ移し、基本武器を50種類、補助を20種類へ拡張した。全50武器は8レベル、Lv3/Lv5分岐、Lv8発展を持ち、補助との適用表は50×20=1,000組を維持する。登録数は完成証明ではなく、抽選到達・相乗効果・個体別記録を別に検査する。
- V5の戦闘経路には、追加25武器の個体別発射、破砕・導電・誘爆・背水・定着・薄幕・脈動・蓄勢・格子・軌道・触媒の有限効果、追加ステージ4〜6、射線門・織り手・三相炉を接続した。stage-3クリア時は従来の無限解放を保ちつつ、stage-4を分岐解放する。無限ボスは6種を循環させる。
- V5の範囲外は、V6の保存v3・途中再開・結果精算・ランキング受付、本番DB／実験場設定変更、V7の長時間本戦・独立レビュー・iPhone Safari実機・公開受入である。これらをV5の成功へ繰り上げない。

### V5の検査状態（提出済み・CI確認済み）

- V5固有の単体・統合検査として、基本50・補助20・1,000組、全武器のレベル／分岐／発展、追加ステージの敵、stage-4〜6の専用ボス循環、追加25武器の個体別発射元を確認するテストを追加した。局所検査は `tests/unit/spawn-and-simulation.test.ts` と `tests/integration/battle-quality.test.ts` で実行済み。
- 誘爆環は印または燃焼の有効時間内の撃破だけを条件とし、同じ敵IDへ一度だけ誘爆することを統合検査へ追加した。印・燃焼はスナップショット上でも色に依存しない輪郭記号で示す。
- `npm ci --ignore-scripts --no-audit --no-fund`（162パッケージ）、`npm run lint`、`npm run typecheck`、`npm test -- --run --testTimeout=30000`（24ファイル・181件）、`npm run generate:expansion-docs`、`npm run verify:expansion-docs`、`npm run build`、`npm run verify:dist`、`npm run verify:originality`、`git diff --check` はこのV5作業ツリーで成功した。Viteの500 kB超チャンク警告は継続しているが、検査失敗とは扱わない。
- `npm run test:e2e:chromium` は32件すべて起動前に失敗した（`/root/.cache/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-linux64/chrome-headless-shell` が存在しない）。`npm run test:e2e:webkit` も32件すべて起動前に失敗した（`/root/.cache/ms-playwright/webkit-2336/pw_run.sh` が存在しない）。テスト本体の失敗ではなくローカル環境未実施として扱い、提出コミットのGitHub Actions結果と分ける。
- ローカルPlaywright実行ファイルの有無、GitHub Actionsの提出コミット、iPhone Safari実機は別々に記録する。未実施のブラウザ本体検査や実機検査を、既存V4の成功runから流用しない。通常720試行、無限60試行、30/60/120回描画比較、保存v3、ランキング受付・本番DB、独立レビューも未確認である。
- 初回提出コミット `e034157e8d8f5e0492d4a0a2499afa8b6a765e48` の [Quality #65](https://github.com/chameleonjp-lab/kakomare/actions/runs/34611107511) は、静的・単体は成功したが、Chromium 32件中31件成功・1件失敗で停止した。失敗は `tests/e2e/core.spec.ts:179` の候補装着検査が、V5で補助候補も追加された後に「武器面2」を固定していたためである。WebKitと後続build検査を未実行のまま成功扱いにせず、同じブランチで候補タイトルと実際の新規装着面を照合する条件へ修正した。
- 修正コミット `34189758d957426b4848f203503e66495b1470be` では、上記E2Eの固定武器名を廃し、`aria-disabled` の新規候補カードから候補名を取得して、装着後の構成一覧に同じ名前が現れることを確認する。修正後に静的・型・単体／統合検査（24ファイル・181件）を再実行した。
- 修正後提出コミットに対する [Quality #66](https://github.com/chameleonjp-lab/kakomare/actions/runs/34611876158) は、公式Playwrightコンテナ `quality` とPages同条件 `pages-runner-quality` の両jobで全step成功した。各jobで静的・単体24ファイル181件、Chromium 32件、WebKit 32件、文書生成・整合性、build、`verify:dist`、`verify:originality` を確認した。これはGitHub Actionsの自動検査であり、iPhone Safari実機、長時間本戦、V6の保存・ランキング本番受入を意味しない。
- [PR #23](https://github.com/chameleonjp-lab/kakomare/pull/23) は `e51b779...` をheadとしてユーザーによりマージ済み。マージコミットは `65801a7c9619aa988f787890716252d1342d923b`、提出head対応の [Quality #68](https://github.com/chameleonjp-lab/kakomare/actions/runs/34613473599) は静的・単体／統合181件、Chromium32件、WebKit32件、文書・build・配布物検査の全step成功を確認した。これはV5のCI証拠であり、V6の保存・ランキング受入ではない。

## V4の25武器・競技無限進行・敵コンテンツ

- PR #21（V3）はユーザーによりマージ済み。GitHub上のmain先端はマージコミット `5da26b1fd5f79057af919c16d475f1baa8d3cf4f`、open PRは0件である。これを基準にV4ブランチ `codex/v4-endless-enemy-20260911` を開始した。
- V4では、既存12武器へ設計済み13武器（分光弾、曲射砲、拘束索、脈動砲、散弾幕、固定杭、閃光弾、横断刃、導標弾、爆縮核、牽引槍、旋回渦、守護灯）を追加し、runtime registryを基本25武器へ拡張した。補助は8種を維持し、補助20種・50武器は最終工程まで未完成として扱う。
- 突進体・護衛体・修復体・造兵体を追加し、予告、限定盾、回復対象上限、召喚子4体上限、召喚由来の報酬除外を実装した。無限モードは45秒テーマ切替、15分以後の特殊敵比率、ボスをecho→crown→designerの順で循環させる。
- 競技ルール版を `expansion-v4-runtime` に更新した。採点は撃破・脅威コスト・ボス・節目を基礎とし、ランキング送信や本番DB変更は行わない。

### V4の検査状態

- `npm run typecheck`、`npm run lint`、`npm test -- --testTimeout=30000`（24ファイル・178件）、`npm run generate:expansion-docs` は成功した。既存テストの12→25武器、8→12敵、25×8=200組への更新を含む。
- `npm run build`、`npm run verify:dist`、`npm run verify:originality`、`git diff --check` も成功した（Viteの500 kB超チャンク警告は継続）。ローカルChromium/WebKitは実行ファイル不足で未実施だが、提出コミットの [Quality #63](https://github.com/chameleonjp-lab/kakomare/actions/runs/34594754202) は公式PlaywrightコンテナとPages同条件runnerの両jobで全step成功した。静的・単体24ファイル178件、Chromium32件、WebKit32件、文書・build・配布物検証を含む。
- iPhone Safari、長時間本戦、無限60試行、補助20全件、全50×20実戦網羅、保存v3、ランキング受付・本番DBはV4の完了条件ではなく未確認のまま残す。

## V3の12武器・8補助・発展と配置変更（履歴）

- ユーザーのV2マージ指示を受け、GitHub上でPR #20の実際のマージ状態を再確認した。PR #20はclosed・merged、headは `90e73d95bbb463b9a48d64505c7c42dde4b8e1b1`、`git fetch origin main` 後の最新 `origin/main` はマージコミット `353295475354c145b06cb836543f9c5fd20b6141` と一致する。open PRは開始時点で0件だったため、このV3用Draft PRを新規に作成する。V2のQuality結果はV3の検査へ繰り越さない。
- V3の作業branchは `codex/v3-weapons-synergy-20260911`。この工程では、既存8武器の通常Lv1〜8・Lv3/Lv5分岐・Lv8発展、追加4武器（迎撃格子・軌道機雷・蓄圧槍・追尾子機）、追加2補助（継電環・整備環）、敵状態の輪郭・記号表示、停止中の移設・同種入替を実装する。V4以降の新敵・無限進行・採点再構成、V5の追加ステージ、V6の保存v3・ランキング通信・本番DB変更は対象外とする。
- V3の実装数は基本武器12、補助8。これは最終要件の基本武器50・補助S=20のうち、設計済み内容を戦闘へ移した最初の検証地点であり、完成数ではない。設計専用の残り38武器・12補助は `docs/WEAPON_CATALOG.md` と `docs/SUPPORT_CATALOG.md` で未実装として保持し、本番候補・図鑑・公開レジストリへ混ぜない。V1で確定した50×20=1,000セルの適用表と各武器2方向の相乗効果は、V3で追加内容の基本実装を検証し、全件の実戦検査はV5〜V7へ残す。
- 既存の個体ID・nodeID・BuildGraph・稼働容量・目的別乱数・入力台帳をV2から引き継ぐ。移設は空いた同種の面へ、入替は同種の個体間だけに制限し、レベル・分岐・発展形・発射待ち時間を保持する。追加武器は個別の攻撃経路・対象選択・上限を持ち、発展形は基本武器の複製として数えない。

### V3の実装・検査状態

- `npm ci --ignore-scripts --no-audit --no-fund`、`npm run lint`、`npm run typecheck`、`npm run test -- --testTimeout=30000`（24ファイル・178件）、`npm run verify:expansion-docs`（生成文書5ファイル）は、V3変更を含むローカル作業ツリーで成功した。V3追加検査は、4武器の実戦オブジェクト生成、迎撃格子の敵弾処理、機雷の一回爆発、停止中の移設・入替と入力台帳、Lv8発展候補、敵状態の非色表現である。
- `tests/e2e/core.spec.ts` へ「一時停止→装置を確認→移設→再開」の画面操作検査を追加した。ローカルで `npm run test:e2e:chromium` と `npm run test:e2e:webkit` を実行したが、Chromium 32件は `chromium_headless_shell-1234`、WebKit 32件は `webkit-2336/pw_run.sh` の実行ファイル不在により、いずれもテスト本体へ到達せず起動前に失敗した。これは環境未実施であり、コードの画面検査成功とは数えない。Draft PRのGitHub Actionsで提出commitに対する実行結果を確認する。内部メソッドを直接呼ぶ統合検査は、画面操作の成功とは別に記録する。
- `npm run build`、`npm run verify:dist`、`npm run verify:originality`、`git diff --check` をこの差分で順番に再実行し、すべて成功した（Viteの500 kB超チャンク警告は継続）。ビルド完了前に並行実行した `verify:dist` は `dist/index.html` 不在となったため、失敗を隠さず記録し、ビルド完了後に再実行して成功を確認した。以前のV2成功runは流用していない。
- V3で未確認の範囲は、25/50武器、補助20全件、全50×20組の実戦適用、各武器の2方向相乗効果の本戦、敵・無限モードの再構成、通常720試行・無限60試行、30/60/120回描画比較、保存v3、ランキング受付・本番DB、iPhone Safari実機・VoiceOver・片手操作・発熱である。12武器・8補助の自動検査を最終完成として報告しない。

### V3の提出状態

- [Draft PR #21](https://github.com/chameleonjp-lab/kakomare/pull/21) を作成し、作業branch `codex/v3-weapons-synergy-20260911` の先端 `4836434484c9629e9c434f6bae79a216091ccce0` を公開した。基準mainから1コミット先で、PRはopen/Draft、mainへの直接push・マージ・自動マージ・保護設定の緩和・本番DB変更・実験場の有効化は行っていない。
- 初回提出先端の [Quality #59](https://github.com/chameleonjp-lab/kakomare/actions/runs/34579750317) は、静的・単体は成功したが、既存E2Eのseed依存の武器名固定がV3の候補拡張に追随せずChromium 1件で失敗した。失敗を隠さず同じbranchで検査条件を修正し、`武器面2`へ現在カタログの具体的なLv1武器が入ることを画面で確認する条件へ更新した。
- 修正後先端に対する [Quality #60](https://github.com/chameleonjp-lab/kakomare/actions/runs/34580152005) は、公式PlaywrightコンテナとPages同条件native Ubuntuの両jobで全step成功。各jobのログは静的・単体24ファイル178件、Chromium 32件、WebKit 32件、文書整合性、ビルド・配布物・独自名称検査を含む。これは提出commitの自動検査であり、iPhone Safari実機・長時間本戦・50武器完成・ランキング本番受入を意味しない。
- ローカルのChromium/WebKitは実行ファイル不足でテスト本体へ到達しなかったままだが、提出commitのGitHub Actionsで同スイートが成功した。自動ブラウザ検査、ローカル環境未実施、実機未確認を混同しない。次工程V4は、このPRをユーザーがマージした後に最新mainを再確認して開始する。
- Quality #60確認後に進行記録・検査チェックリストだけを追補し、追補先端 `6ec81b257f22066f30f923cea307cefb29a3ad56` に対する [Quality #61](https://github.com/chameleonjp-lab/kakomare/actions/runs/34580740464) も両jobの全step成功を確認した。各ログは静的・単体24ファイル178件、Chromium 32件、WebKit 32件、文書整合性、ビルド・配布物・独自名称検査を含む。追補でコード範囲・実機確認・最終50要件の状態は変えていない。

## V2の提出履歴（前工程）

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

- [Draft PR #20](https://github.com/chameleonjp-lab/kakomare/pull/20) を作成した時点の提出記録。機能・文書提出headは `b2ff3b0c6f10f3481c6d9690bc048c03e62cb912`、末尾空行補正後の最終コードheadは `f4bfb4b6a85fd9374cd098691d4e81a01bd1005f` で、当時はopen/Draftだった。その後、ユーザーのマージ指示を受けてPR #20のmerged状態と `origin/main` のマージコミット `353295475354c145b06cb836543f9c5fd20b6141` を確認した。mainへの直接push・自動マージ・保護設定の緩和・本番DB変更・実験場の有効化は行っていない。機能headの [Quality #55](https://github.com/chameleonjp-lab/kakomare/actions/runs/34569409258) と最終コードheadの [Quality #57](https://github.com/chameleonjp-lab/kakomare/actions/runs/34569996494) は、静的・単体172件、Chromium31件、WebKit31件、ビルド・配布物検証を含めて成功した。これはV2の自動検査であり、iPhone実機・本戦・本番連携の完了を意味しない。
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
| V6 | 実装済み・Draft提出済み・CI確認済み | 保存v3/途中復元/結果一回精算/ランキングゲーム側契約。実機・本番は未確認 |
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
| A14 | 途中保存 | V2/V6 | V6の安全境界保存・復元を実装。長時間・実機は未確認 |
| A15 | 未使用結果一覧 | V6 | 使用個体を先に表示し、未使用一覧を詳細へ折りたたむ実装。画面実機は未確認 |
| A16 | 新旧点比較 | V1/V6 | ルール版・競技結果を分離して保存。新旧本戦比較は未実施 |
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
