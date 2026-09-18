# カコマレ 本番公開・ランキング連携記録

更新日：2026-09-18

## 公開先

- ゲーム：https://chameleonjp-lab.github.io/kakomare/
- 実験場ランキング：https://chameleonjp-lab.github.io/chameleonjp_lab/ranking.html?game=kakomare
- Supabaseプロジェクト：`chameleonJP-Lab`
- ゲーム識別子：`kakomare`

## 連携内容

無限モードの開始時に `start_game_play_v1` を呼び、発行された `play_id` を結果送信まで保持します。結果確定時は `finish_game_play_v1` を一度呼び、その後 `submit_score_idempotent_v1` で得点を送ります。

Supabaseの関数が受け付ける実際の引数名・返り値に合わせ、開始・終了・得点送信の3段階を接続しています。応答が失われた場合は、同じ開始識別子・プレイ識別子・送信識別子・得点を使って再送します。リタイアはランキングへ送信しません。

カコマレには個別の波がないため、終了時の生存時間を5分ごとの危険度へ変換して、実験場の共通項目 `reached_wave` へ渡します。ランキングの順位は得点の高い順です。

ブラウザへ置くのはSupabaseのPublishable keyだけです。サービスキーや秘密キーは使用しません。ローカルの自動テスト環境から本番ランキングへ送信しないよう、ローカルホストでは送信機能を無効にしています。

## 確認結果

- Supabaseのゲーム登録を`kakomare`として有効化。
- 公開URL、タイトル、説明、得点単位、順位順を登録。
- 実際の開始→終了→得点送信を確認。
- 初回得点・最高得点・プレイ回数の取得RPCを確認。
- 接続確認用の一時記録は削除し、カコマレの本番ランキングは0件から開始。
