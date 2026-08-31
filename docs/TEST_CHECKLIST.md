# カコマレ 検査チェックリスト

## #3マージ後の是正PR実行記録

対象ブランチ: `fix/post-release-completion`

ローカル実施日: 2026-08-31（UTC）

この文書はコマンドと画面経路を確認するための記録です。公開前の最終確認項目は [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md) に分けています。

## コマンド

- [x] `npm ci`
- [x] `npm run lint`
- [x] `npm run typecheck`
- [x] `npm run test`（14ファイル、89件）
- [x] `npm run test:e2e:chromium`（24件）
- [x] `npm run test:e2e`相当（ActionsでChromium、WebKitを順番に実施）
- [x] `npm run build`
- [x] `npm run verify:dist`
- [x] `npm run verify:originality`
- [x] `npm run check`相当（Actionsで各検査を順番に実施）

## 画面

- [x] 初回起動で名前入力が表示される
- [x] 空文字、制御文字、13文字以上が拒否される
- [x] 名前確定後にホームが表示される
- [x] ステージ1を選べる
- [x] 3、2、1のカウントダウン中に戦闘が進まない
- [x] 開始直後に一時停止にならない
- [x] 強化候補を1回タップで選べる
- [x] 一時停止、再開、リタイアが動く
- [x] 勝利と敗北の両方が結果画面へ進む
- [x] 結果画面は最上部から表示される
- [x] ステージ1、2、3を順に勝利して無限モードを解放できる

## 表示幅

- [x] 320 × 568
- [x] 375 × 667
- [x] 390 × 844
- [x] 402 × 874
- [x] 430 × 932
- [x] 844 × 390
- [x] 932 × 430
- [x] 1280 × 720
- [x] 1920 × 1080

各幅で横スクロール、ボタンの重なり、文字切れがないことを確認します。

## ライフサイクルと負荷

- [x] `visualViewport`の高さ変更で戦闘画面が収まる
- [x] 画面回転時に戦闘が停止し、再開できる
- [x] 非表示から復帰しても黒画面にならない
- [x] 長押し、二重タップ、指を戦場外へ出して離す操作が破綻しない
- [x] 演出量の自動調整が標準、少ない、最小の順で制限を強める
- [ ] 危険予告と敵弾が通常の演出より前面に表示される
- [x] 敵、弾、粒子、演出の上限を超えて増え続けない

## 共有と公開

- [x] ホーム共有と結果共有で文章が異なる
- [x] ネイティブ共有またはクリップボードが使えない場合に画面内コピー欄が出る
- [x] 破損保存から初期画面へ復帰し、退避データを確認できる
- [x] favicon、OGP、canonical、GitHub Pagesサブパスが `npm run verify:dist` で確認できる
- [x] GitHub ActionsのChromiumとWebKitが成功する（[Quality run #11](https://github.com/chameleonjp-lab/kakomare/actions/runs/33353475007)）
