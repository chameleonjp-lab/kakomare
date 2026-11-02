# カコマレ：共有表示と実画面 SNS 画像

## 対象と変更範囲
- 基点：main `8e4ed3db2346b57a60a815d43a2435a8d83143e2`。
- 共有文の本文・成績・言語を維持して `#カコマレ #ゲーム制作` を追加し、最後に正式 URL を置く。X・クリップボード・手動コピー fallback に同じ整形を使用する。
- 独立したコピー専用ボタンは元からない。X が開けない場合の手動コピー欄とそのフォーカス制御は残す。
- ホーム・結果の X ボタンは hover / active でも黒背景・白文字を維持する。元の共通 button の hover より優先し、他ボタンの見た目は変えない。
- 得点、ルール、識別値、既存参加者、保存形式、ランキング、音、ゲームの描画・出現・時計は変更しない。

## 再現と検証の区別
- 初期 head `a6d2a57f6aebc2b12a9093b989cdd5fbdbe20e2a` の CI `41439410748` は、native job `125257209398` / container job `125257209606` で X の押下色検査が失敗。共通 `.button:hover:not(:disabled)` が共有ボタンの黒指定に勝ち、180 ms の背景遷移中にも黒以外になることを実 PNG・計算色・実 CSS で確認した。
- 同じ実行の V7 final gates は成功。旧実行の失敗を消したり、新しい CSS 修正が成功済みだと読み替えない。
- 修正後の回帰は既存の有界なレイアウト安定待ちで hover と pressed の最終色を別に検査する。黒判定の閾値緩和、強制 animation 終了、ゲーム時計変更はない。
- 新しい共有受入は 15 言語、代表 ja/en/de の縦 393×852 / 横 852×393 / 短高 393×600。祖先の非表示・透明度の対照、44 px 以上、遮蔽、文字切れ、黒白、通常 tap と X intent の本文・2タグ・URL・結果得点を検査する。
- 結果受入は既存 local-only `test=1&outcome=defeat` の実結果画面経路。退却結果で代用しないが、本番の自然な戦闘終了の受入とは区別する。言語変更 UI が結果にはないため、各言語で別の敗北 fixture を開始する。
- 既存 core / language 回帰を残す。ブラウザ context に独立ネットワーク境界を適用し、loopback の静的 GET/HEAD 以外・リダイレクト・WebSocket を拒否、Service Worker を無効化する。新共有・素材テストでは拒否された通信試行も 0 であることを確認し、旧意図的失敗ケースとは分離する。
- ローカル browser / サーバーは起動せず、ブラウザは既存 CI だけ。最終の native / container 両エンジンと V7 終端は PR 本文で固定 head とともに報告する。

## 実素材と画像
- 素材は共有受入と別 context で、`test` / `outcome` / `seed` を付けない通常の匿名開始から取得した実 Canvas。強制出現や状態変更はない。
- 上記初期 CI の native artifact `13138496297` 内 `actual-normal-game-canvas.png`。660×660、52,297 bytes、SHA-256 `d8d387b0f19bb3ece00b28a7ab86576916c91e965da11a70943af565b4cbbe22`。
- 中心コア・六角装置・弾・敵を実見。盤面の「32」は実ゲーム中のダメージ表示であり、成績 HUD や個人名ではないため消さず保持した。
- `docs/share-assets/kakomare-og-v2.svg` はこの Canvas 全体の等比配置と事実に沿う題字・説明のみ。既存 Inkscape による native 組版で、外部画像参照・架空要素の追加・新しい依存導入はない。
- `public/og-image-v2.png` は 1200×630、87,162 bytes、SHA-256 `6f1b3cee0ec8e8a825e2aa87eb33adbcdd88ce4ffe5af399b5471aca8cd71366`。元画像と紹介画像を独立に実見し、整合・文字切れなしを確認した。
- 従来の `public/og-image.png` と生成 script は保持する。新しい画像は別名なので旧正常版を上書きしない。OG / Twitter は v2 を参照し、既存の静的配備検査で PNG の実構造・寸法・出力存在を確認する。
- 素材取得 helper は `KAKOMARE_CAPTURE_SHARE_MATERIAL=1` の明示時だけ。最終 workflow は自動素材設定を外し、通常受入に撮影を重ねない。

## 適用順と残る受入
本人が Draft PR を確認・マージ → 既存 Pages 配備 → 正式 URL `https://chameleonjp-lab.github.io/kakomare/` の metadata と `og-image-v2.png` の応答を確認 → X カードと実 iPhone の表示 / tap を確認する。
本番配備・実投稿・実機成功はまだ確認していない。作業 branch 限定の Quality 起動を追加するが、公開 main 条件・既存 concurrency・権限・runner・timeout・V7 検査は維持する。
本 PR を revert すると元の共有文・CSS・画像参照へ戻せる。旧画像・生成 script・基点 commit を保持し、完全削除や権限変更は行わない。
