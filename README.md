# カコマレ

「カコマレ」は、六方向から迫る敵を防ぎながら、六角形の装置を組み上げるブラウザ防衛ゲームです。

画面中央のコアは動きません。装置が自動で攻撃するため、プレイヤーは危険な方向をドラッグして短時間だけ手動照準し、敵を倒したときの強化候補を1回タップで選びます。ステージをクリアすると次のステージが解放され、ステージ3の後は無限モードへ進めます。画面を拡大する二重タップ、長押し、ピンチはゲーム操作に使いません。

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

GitHub Pagesの公開パスは `/kakomare/` です。`main`へのpushだけが公開処理を起動します。Pull Requestでは品質検査だけを実行します。

公開前の静的ファイル、favicon、OGP画像、公開サブパスは `npm run verify:dist` で確認します。公開後のiPhone Safari確認は [公開確認手順](docs/RELEASE_CHECKLIST.md) の順番で行います。

ゲーム画面は画像素材に依存せず、Phaserの図形描画とWeb Audio APIで生成します。名前、進行、研究、記録、設定は端末の保存領域だけに保存し、外部データベースへ送信しません。保存データは版を持ち、旧版からの変換と破損データの退避に対応します。

## 関連文書

- [実装計画](docs/IMPLEMENTATION_PLAN.md)
- [ゲームルール](docs/GAME_RULES.md)
- [検査チェックリスト](docs/TEST_CHECKLIST.md)
- [公開確認手順](docs/RELEASE_CHECKLIST.md)
