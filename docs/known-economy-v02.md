# 牧場物語 風のグランドバザール — Known Economy v0.2

> **本番アプリには未接続の、独立した計算・Master接続モジュールです。**
> ユーザーのPlayer Stateを書き換えず、画面にも未発見情報を表示しません。

このv0.2はv0.1の64テスト合格の計算核を維持しつつ、Masterの実スキーマと
明示的な発見記録をつなぐアダプター、既知経路だけをたどる深さ制限付き候補生成器を追加します。

## 実装済み

- `lib/known-economy.mjs` — 素材の機会費用、購入・栽培・加工・料理・売却、時刻・設備・資金・取り置き制約の計算核。
- `lib/grand-bazaar-master-adapter.mjs` — 明示的な発見IDとMasterの`canonical_ref`を結合。風車の加工レシピ、料理の必須材料と材料グループ、確認済みの店頭購入・栽培ロット・販売条件を評価用Routeに変換。
- `lib/known-economy-candidate-generator.mjs` — **順番に**実行する深さ3（設定可）の実行可能な計画を列挙・比較。最適性は保証しない。
- `tests/grand-bazaar-adapter.test.mjs` — 21件の新規テスト（将来情報の不干渉、原料から苗木、確認済み店買い、材料混合、費用、栽培、売却による資金調達を含む）。
- `tests/actual-master-smoke.test.mjs` — 現行GitHubの埋め込み`index.html`のMasterを読む3件の接続テスト。standalone ZIPでは`index.html`がなければ自動スキップ。

## テスト

```bash
node --test tests/*.test.mjs
node tests/demo-master-adapter.mjs
```

ローカルでは v0.1 64件 + v0.2 21件の計85件がすべて合格。
`index.html`が存在するGitHub版ではさらに実Master接続の3件を検証します。

## 不確実性の扱い

- 売価はMasterの基準品質・未補正価格を起点とし、ユーザーに現物品質を反映した実売価とは主張しません。
- 風車の0G追加費用、基準加工時間、料理の待ち時間・出力数量は、比較側が明示的にシナリオ仮定を与えたときだけ確定Routeになります。
- 店頭の購入経路は**プレイヤーが実際に確認した**offerだけを追加します。Masterの種袋参考価格だけから販売中・即時購入可能と断定しません。
- 栽培は収穫バッチの観測・確認がある場合にのみ生成します。売上が未確定のものを勝手に0Gにはしません。
- 風量、品質変換、アレンジ素材の価値、客数・在庫の売り切り、店舗入荷条件は未モデル化。
- 生成した候補は順次処理の深さ・件数の制限内の比較結果であり、全経路の厳密最適解ではありません。

## Master接続

基本ルールは「アイテムを知っている≠レシピや購入先を知っている」です。
`known_item_refs`, `known_windmill_recipe_ids`, `known_cooking_recipe_ids`,
`known_sale_quote_refs`, `known_shop_ids`, `known_facility_ids`,
`observed_shop_offers` を別に受け取ります。
発見済みとして明示されていない情報を候補数、売上、失敗メッセージにも反映しません。

App統合時はまず発見記録・在庫の実スキーマと接続し、全画面の漏洩監査を実施してください。
**このモジュールを現在の画面へそのまま組み込まないでください。**