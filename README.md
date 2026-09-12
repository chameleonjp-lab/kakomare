# カコマレ

「カコマレ」は、六方向から迫る敵を防ぎながら、六角形の装置を組み上げるブラウザ防衛ゲームです。

画面中央のコアは動きません。「プレイする」から制限時間のない無限モードへ直接進み、1プレイの得点を競います。装置が自動で攻撃するため、危険な方向をドラッグして短時間だけ手動照準し、ランダムな強化候補から選びます。装備の配置・交換は番号付きの見本で確認できます。画面を拡大する二重タップ、長押し、ピンチはゲーム操作に使いません。

## 開発

```bash
npm ci
npm run dev
```

検査は次でまとめて実行します。

```bash
npm run check
```

## 公開

GitHub Pagesの公開パスは `/kakomare/` です。`main`へのpush、または`main`を対象にした手動実行だけが公開処理を起動します。Pull Requestでは品質検査だけを実行し、公開前にも同じ検査を再実行します。

公開前の静的ファイル、favicon、OGP画像、公開サブパスは `npm run verify:dist` で確認します。公開後のiPhone Safari確認は [公開確認手順](docs/RELEASE_CHECKLIST.md) の順番で行います。

ゲーム画面は画像素材に依存せず、Phaserの図形描画とWeb Audio APIで生成します。名前・設定・途中状態を端末へ保存し、旧進行データも保持しますが、研究・記録・保存データ管理の画面は表示しません。ランキングはゲーム側の送信処理まで用意しており、本番受付は未接続です。接続前に別途、実験場の契約・権限・登録を確認します。

## 関連文書

- [拡張実装計画 v2.0](docs/EXPANSION_IMPLEMENTATION_PLAN.md)
- [拡張の進行記録](docs/EXPANSION_PROGRESS.md)
- [初回実装計画（履歴）](docs/IMPLEMENTATION_PLAN.md)
- [ゲームルール](docs/GAME_RULES.md)
- [無限専用化・説明と操作の監査](docs/ENDLESS_USABILITY_REVIEW.md)
- [武器一覧（現行表示と設計の区別）](docs/WEAPON_CATALOG.md)
- [補助一覧](docs/SUPPORT_CATALOG.md)
- [検査チェックリスト](docs/TEST_CHECKLIST.md)
- [公開確認手順](docs/RELEASE_CHECKLIST.md)
