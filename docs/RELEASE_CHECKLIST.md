# カコマレ 公開確認チェックリスト

> 拡張の現行計画は[v2.0](EXPANSION_IMPLEMENTATION_PLAN.md)、進行・検査結果・未達の正本は[EXPANSION_PROGRESS.md](EXPANSION_PROGRESS.md)です。本書の過去工程の状態は当時の履歴です。

## V7 main公開確認（2026-09-12）

対象branchは `codex/v7-final-verification-20260911`（提出時）。基準mainはPR #24のマージコミット `5cc40b1f9abf8101a85bd1ff39cf0be72ab365b8`。Draft [PR #25](https://github.com/chameleonjp-lab/kakomare/pull/25) の最終提出commitは `a4df4613abc1013d4e6136c7afc021804d34c586`、ユーザーによるマージcommitは `7f6456cb50157e6fa87a50d0c6daeb662897209d`。V7は最終本戦・性能・公開前のゲーム側検査を提出する工程であり、こちらからmainへ直接push・自動マージは行っていない。本番DB／Supabase RPC／実験場登録の変更・有効化も行っていない。競技ルール版は `expansion-v7-runtime`、manifestクライアント版は `kakomare-web-v7` とする。
公開確認の文書追補は `codex/v7-public-verification-20260912` からDraft [PR #26](https://github.com/chameleonjp-lab/kakomare/pull/26) として提出し、最終head `dee85d96ffec6f26939a74ff6c84f40f2f47426e` の [Quality #77](https://github.com/chameleonjp-lab/kakomare/actions/runs/34681392782) で全job・全step成功を確認した。

- [x] 基本武器50・補助20・全1,000組・相乗効果をV5から維持（12・25を完成扱いにしない）
- [x] 競技得点から生存時間・残HPを除外し、通常モードの旧式得点を回帰で確認
- [x] `npm run test:v7 -- --testTimeout=900000`（720通常＋60無限＋30／60／120Hz比較、484.660秒）
- [x] V7試行で敵180・味方弾280・敵弾80の共通上限を検査
- [x] 生成文書5ファイル、manifest、release metadataをV7版へ同期
- [x] 最終差分のlint、型、単体／統合（29ファイル・206件）、文書、manifest、build、配布物、独自名称検査（Viteの500 kB超チャンク警告あり）
- [x] PR #25のマージ後も、最終headに対するGitHub Actions [Quality #75](https://github.com/chameleonjp-lab/kakomare/actions/runs/34645194667) の `quality`、`pages-runner-quality`、`v7-final-gates` 全job・全step成功を確認
- [x] PR #25マージ後mainのPages配備 [run 34679314243](https://github.com/chameleonjp-lab/kakomare/actions/runs/34679314243) と正式URL `https://chameleonjp-lab.github.io/kakomare/` のクラウドブラウザ確認（release metadata、名前入力、ホーム、stage-1戦闘、強化候補、一時停止・再開、停止中 `166`→`166`、再開後 `165`）
- [x] 公開確認の文書追補Draft [PR #26](https://github.com/chameleonjp-lab/kakomare/pull/26) と [Quality #77](https://github.com/chameleonjp-lab/kakomare/actions/runs/34681392782)（最終head `dee85d96ffec6f26939a74ff6c84f40f2f47426e`、`quality`、`pages-runner-quality`、`v7-final-gates` 全job・全step成功）
- [ ] iPhone Safari実機、VoiceOver、片手操作、発熱、長時間の実機操作
- [ ] 実験場のRPC署名、登録値、認証、権限、受付側再計算、ランキング有効化（別許可と実環境確認が必要）
- [ ] Sol・Highによる独立レビュー（このセッションでは実施していない）

V7の自動最終ゲートは本番 `BattleScene` の固定更新を検査するが、画面操作・iPhone Safari・本番ランキングの受入を意味しない。未設定ランキングゲートウェイ、結果画面、再戦、共有、ホーム、ローカル記録は維持する。ユーザーのマージ後にのみ公開版・実機・本番受付を再確認する。

## V6 Draft提出ゲート（2026-09-11）

対象branchは `codex/v6-save-result-ranking-20260911`。V6はゲーム側の保存・結果・ランキング送信準備までをDraft PRへ提出する工程であり、mainへのpush・マージ、自動マージ、本番DB／Supabase RPC／実験場登録の変更・有効化は行わない。

- [x] `ranking-manifest.json` の正式URL、game_id、公開版、採点順序、終了種別を検証するスクリプトを追加
- [x] 既定のランキングゲートウェイを未接続にし、公開キー以外の秘密情報をクライアントへ置かない
- [x] start_id／サーバー発行play_id／submission_idを分離し、finish→submitの順序と同一内容再送を実装
- [x] 結果・部品の一回精算とリタイア除外を実装
- [x] 進行保存v3と、敵・弾・候補・容量・乱数・入力台帳を含む途中状態のwrite-ahead保存を実装
- [x] 最終差分のlint、型、単体／統合（28ファイル・201件）、build、配布物、独自名称、manifest検査（Viteの500 kB超チャンク警告あり）
- [x] V6最終提出コミットのGitHub Actions（[Draft PR #24](https://github.com/chameleonjp-lab/kakomare/pull/24)、[Quality #72](https://github.com/chameleonjp-lab/kakomare/actions/runs/34630923501)。両jobの静的・型・単体201件、Chromium32件、WebKit32件、文書・manifest・build・配布物検査が成功）
- [ ] 実験場の実際のRPC署名、登録値、認証、権限、受付側検証（別許可と実環境確認が必要）
- [ ] 公開配備、iPhone Safari実機、VoiceOver、片手操作、発熱、長時間本戦（V7／公開前）

未設定ゲートウェイでランキングへ接続できない場合も、結果画面・再戦・共有・ホーム・ローカル記録を維持し、再送資格を表示する。Draft PRのCI成功を本番公開や実機受入の証拠へ繰り上げない。

PR-Aの公開確認です。コードと自動検査の結果は [QUALITY_A_REPORT.md](QUALITY_A_REPORT.md) を参照します。以前のPRの検査数やActions実行URLは現在の合格根拠に使いません。

対象ブランチ: `codex/quality-a-20260908`
開始時のmain: `e6ca4229156819ccce8b47ef4273b2e0451d4d75`

## 自動検査とレビュー

- [ ] 最新コミットのGitHub Actionsが成功する
- [ ] 依存導入、lint、型検査、単体・結合検査が成功する
- [ ] ChromiumとWebKitのブラウザ検査が成功する
- [ ] 本番ビルド、配信ファイル、独自名称の検査が成功する
- [x] Sol・Highの独立レビューで修正必須の指摘が残らない

公開URLはmainへのマージ後に更新されます。作業ブランチの検査成功を公開版の確認成功として扱いません。問題が見つかった場合は、このPRのブランチで修正します。

## 静的公開

- [ ] `https://chameleonjp-lab.github.io/kakomare/` を直接開ける
- [ ] `/kakomare/`配下のJavaScript、favicon、OGP画像を読み込める
- [ ] ブラウザの戻る、進む、再読込で白画面にならない
- [ ] ホームと結果にカメレオンJPの実験場リンクがある
- [ ] ホーム共有と結果共有の文章が異なる

## iPhone Safari実機

1. 公開URLを新しいタブで開く。
2. 起動画面が8秒以内にホームまたは名前入力へ進む。
3. 名前を入力する。
4. ホームで「カコマレ」が読みやすく表示される。
5. ゲーム開始を押す。
6. 3秒のカウントダウン後、すぐ戦闘が始まる。
7. 画面の任意位置から指を動かし、手動照準できる。
8. 指を離しても、短時間後に自動照準へ戻る。
9. 強化候補を1回タップで選べる。
10. 一時停止し、再開できる。
11. 別アプリへ移動し、戻る。
12. 黒画面にならず、再開カウントダウンが出る。
13. 縦画面から横画面へ回転する。
14. 要素が重ならない。
15. 勝利または敗北して結果へ進む。
16. 結果画面が最上部から表示される。
17. 「もう一度」を押す。
18. 3回以上連続で再戦する。
19. ホーム共有を実行する。
20. 結果共有を実行する。
21. カメレオンJPの実験場を開く。
22. Safariを再読込し、名前と進行が残ることを確認する。
23. 演出量を最小にして再戦する。
24. 音を0にして重要予告が画面だけで読めることを確認する。

## 記録欄

- 公開URL: https://chameleonjp-lab.github.io/kakomare/
- 確認端末 / iOS / Safari:
- 実施日時:
- 対象コミット / 自動検査のActions URL: [QUALITY_A_REPORT.md](QUALITY_A_REPORT.md) を参照
- 未確認事項: マージ後の静的公開、iPhone Safari実機

## PR-Aの実機追加確認

- [ ] 最後の除外後に出た新しい武器と補助を、面ボタン1回で取得する
- [ ] 武器面1→3→2、補助面3→1→2で、戦場と装置一覧が一致する
- [ ] 左向きの照準でも、扇形内の敵を狙える
- [ ] 回転冠の盾の板と、攻撃を防ぐ側が一致して見える
- [ ] 重力に近い敵が逆向きに飛ばない
- [ ] 演出最小でも接近中の敵と敵弾を見失わない

この欄はiPhone実機で確認した日時・OS・Safari・対象コミットとともに記録します。未実施の項目へチェックを入れません。

## PR-B引継ぎ

PR-A（PR #14）のマージ後、PR-Bは `codex/quality-b-20260908` で実装・自動検査を行う。8武器×6補助の適用表、強化候補の狭い画面、結果・図鑑の説明を追加し、GitHub ActionsのChromium/WebKitが成功してから公開確認へ進む。iPhone 17 Pro・Safari実機と公開URLの確認は、PR-BのCI成功とは別に実施する。
