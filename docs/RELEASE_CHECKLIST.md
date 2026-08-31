# カコマレ 公開確認チェックリスト

#3マージ後の是正PRについて、自動検査と公開後のiPhone Safari確認を同じ順番で記録します。問題が一つでもある場合は、是正PRをマージせず `fix/post-release-completion` で修正します。

## 自動検査

- [x] `npm ci`
- [x] `npm run lint`
- [x] `npm run typecheck`
- [x] `npm run test`（14ファイル、89件）
- [x] `npm run test:e2e:chromium`（24件）
- [x] `npm run test:e2e`相当（Actionsで順次実行）
- [x] `npm run build`
- [x] `npm run verify:dist`
- [x] `npm run verify:originality`
- [x] `npm run check`相当（Actionsで各検査を順次実行）
- [x] GitHub ActionsのChromiumとWebKit

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
- 自動検査のActions URL: https://github.com/chameleonjp-lab/kakomare/actions/runs/33353475007
- 未確認事項: マージ後の静的公開、iPhone Safari実機
