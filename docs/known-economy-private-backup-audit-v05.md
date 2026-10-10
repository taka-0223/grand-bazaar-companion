# Known Economy v0.5 — 個人バックアップを外部送信しない検証

## 完成した機能

`lib/player-backup-audit.mjs` は、作戦ツールのバックアップまたは生のPlayer Stateを**読み取り専用**で監査する関数です。`tools/audit-player-backup.mjs` はローカルのJSONファイルを開いて結果を標準出力へ表示します。

- 本番PWA、IndexedDB、localStorage、Master、Player Stateは**一切変更しません**。
- バックアップJSON・品名ID・目標タイトル・メモ・数量の現物値は標準出力に含めません。出すのは登録件数と固定の診断コードのみです。
- データをGitHubへアップロードしません。GitHub Actionsでは個人データを使わず、合成のテストデータで動作を検証します。
- `schemaVersion:7`の整合する基本構造だけを受理。旧`schemaVersion:5/6`を現在の保有数とみなしたり、勝手に移行したりしません。
- `schemaVersion:8+`が現れた場合も、v7として無理に解釈しません。

## 実バックアップの取得

アプリを最新版に更新してから、設定 → **「JSONバックアップを書き出す」**で、現在のプレイ記録を端末へ保存します。実際の保存形式は`format:'grand-bazaar-companion-backup', formatVersion:1, appVersion, exportedAt, state`です。

既存の2026-09-28のv0.6／schemaVersion5の初期移行用バックアップは、現在のプレイヤー記録として使いません。

## ローカルで監査

PCなどでリポジトリを取得し、Node.js 20以降で次を実行します。

```bash
node tools/audit-player-backup.mjs "/path/to/grand-bazaar-backup-YYYY-MM-DD.json"
```

ファイルはローカルから読み込むだけです。出力された診断レポートには登録件数と固定コードのみが含まれ、原本を上書きしたりクラウドへアップロードしたりしません。診断レポートを共有する場合も、公開リポジトリに個人バックアップ原本をコミットしないでください。

Android端末だけで利用する場合は、JSONをチャットに**任意で**添付すればこの会話で検証できますが、添付前に個人のメモなどが含まれる可能性を確認してください。**ゲーム内で変化した最新記録を、こちらから端末へ直接取得することはできません。**

## 診断結果の意味

- `schema_7_valid`: v7の**基本構造が検査に適合**。ゲーム内の現在値の正しさ、Master ID照合、収益比較の完成を保証するものではありません。
- `legacy_schema_requires_fresh_export`: v5/6など。アプリが移行した**現在の状態から再書き出し**が必要。旧ファイルを勝手に書き換えない。
- `unsupported_future_schema`: 未対応の新保存スキーマ。
- `invalid_backup_format` / `unsupported_backup_envelope` / `invalid_player_schema`: 不正・想定外の形式。推測変換は行わない。

`crop_state_record_counts.stored_seed_rows_pending_master_mapping` は「個数と保管状態が記録された**種・苗・菌の行数**」であり、収穫物の所持数ではありません。加工中、保管場所未確定、数量未記録は別々に扱います。

`outside_player_state`は、既存の保存形式にないため別途確認が必要な4種類（収穫物の実在庫、所持金、売価、使用可能設備・ルート）を示します。目標と住人のお願いに必要な材料は、手持ちと競合し得ることだけをコードで示し、減算しません。

## ここまででできること・できないこと

- **できる:** 本人が書き出したJSONの形式監査、記録上の不足分類、安全なData側の前処理
- **できない:** 本人のゲーム機にある現在の在庫の自動取得、収穫済みの果実数の自動推定、星品質・天候・装飾品・バザール販売枠込みの正確な利益最大化

次段の受け入れ条件は、本人の**新しいスキーマv7バックアップを共有するかローカルで監査すること**、その結果と実アプリ表示を照合し、既知ルートの利益比較で未確認項目を正しく保留できることです。

## 検証

```bash
node --test tests/*.test.mjs
node tools/validate-request-master.mjs
node tools/validate-bazaar-master.mjs
node tools/validate-bazaar-decor.mjs
```

全テストはダミーのUser Stateを使用し、実際の個人バックアップをGitHub CIに保存しません。
