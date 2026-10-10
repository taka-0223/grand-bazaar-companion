# Known Economy v0.3 — Player State v7 読み取り接続

## 結論

本変更は、既存の作戦ツールのPlayer State（`schemaVersion:7`）を、Known Economy v0.2のMaster照合・収益比較に**読み取り専用**で接続する基盤です。

**重要：本番UI、`index.html`、`release.json`、Player State保存スキーマは変更しません。** ブラウザー内の所持金や倉庫の全在庫を読み取れるようになったという意味ではありません。必要な未記録情報は、呼び出し元から確認済みの値として明示的に渡す必要があります。

## 現行Stateの意味を調べて確認した点

- `knownEntities` = 知った品目。加工・料理を知ったこととは別の情報。
- `knownRecipes` = 料理レシピの既知ID。アーカイブ済みのレシピは通常の候補生成から除外しますが、知識としての登録は維持。
- `knownProcesses` = 旧外部データの**加工後アイテムID**であり、新Masterの`wmrec_*`レシピIDではない。IDを名前から類推せず、固定したcrosswalkで照合。
- `knownFacts` = 既知の種・苗加工に対する旧Master Fact ID。`MASTER.facts`から発見済みと確認できるレシピにのみ対応。
- `playerState[id].seedCount` = **種・苗・菌の個数**。作物そのもの／収穫済みの果実の数ではない。例えば `playerState.apple.seedCount=13` は「リンゴ13個」ではなく、画面の語義上は「りんごの苗13個」。出荷対象のリンゴ13個は別途確認すること。
- `growingCount` = 栽培中の数で、現在販売できる作物の数量とは扱わない。
- `goals[*]` と `requirements[goal.id][*].need/have` = 計画の必要数と手動進捗。「have」を現物の在庫数として扱わず、`need-have` を機械的に倉庫から減算しない。
- `requests[*].objectives` の未達成アイテム条件も、取り置きが必要か未確定とする。
- 現行のPlayer Stateは**所持金、収穫物全在庫、全店の実売価格・販売枠、リアルタイムの風車空き枠を網羅していない**。不明値を0として補完しない。

## 追加実装

- `lib/app-player-economy-bridge.mjs`：`prepareAppKnownEconomy(master, appState, {scenario,verified})` / `compareAppKnownEconomy(master,appState,{focus_ref,scenario,verified,...})`。
- `lib/legacy-economy-process-crosswalk.mjs`：既存Master版に固定した旧knownProcesses出力ID→加工Recipe ID 222件／knownFacts ID→加工Recipe ID 47件。レシピが追加されても発見済み扱いを勝手に増減させない。
- `tests/app-player-economy-bridge.test.mjs`：現行`index.html`のMASTER_DATAを利用した互換性・ネタバレ・目標保護・在庫の識別・利益差のテスト。
- `.github/workflows/known-economy-player-state.yml`：既存の88件と今回のテストをCIで実行。

## 入力契約

`scenario` には確定した比較期間（`horizon_minutes`）と、前回設計の基準売価・加工費・時間についての仮定を明示する。

`verified` は一部またはすべて手入力・外部確認が必要な情報です。主なフィールド：

| フィールド | 意味 |
|---|---|
| `confirmed_stock_rows: [{ref, quantity}]` | 収穫物・食材などPlayer Stateにない現在在庫の確認済み数量 |
| `confirmed_reserved_rows` | 他の目標用に取り置いた数量（Player Stateの`requirements.have`とは別） |
| `cash_g` | 現在の所持金。省略すると比較を保留 |
| `known_sale_quote_refs` | ゲーム内で売価を確認済みである品目の参照。基準価格をMasterから使うための確認 |
| `known_shop_ids` / `observed_shop_offers` | 実際に確認した店舗／販売オファー。店の存在や`seedling`の参考価格だけから購入可とはしない |
| `known_facility_ids` / `known_resource_ids` / `resource_capacities` | 使用可能な風車や設備、および作業枠 |
| `available_route_ids` | 現時点で使用可能と確認した既知ルートID。未指定は実行しない |
| `review_goal_allocations` / `review_request_materials` | 計画や依頼の材料取り置きが競合しないとユーザーが確認したときだけtrue |
| `confirm_baseline_only` | 星品質・トレンド・装飾品・天候補正を含まない**基準価格シナリオ**と了解した場合だけtrue |

`ref`は`{domain:'entities',id:'apple'}`など正規のMaster参照。文字列から曖昧な日本語名推測はしない。

## 検算例（これは実プレイヤーデータではない）

- `knownEntities:['apple']`, `knownFacts:['process_seedling_apple']` がすでに登録されている。
- 収穫済みリンゴ13個（`entities:apple`）と苗木在庫0個（`entities:apple_seedling`）を**別途確認済み**として渡す。
- 黄風車の使用可、基準売価の利用、加工時間・加工料金なしなどの条件を明示。
- 結果：1個あたり加工前170G→加工後850G、直接売却との差額+680G。仮に13個すべてを加工して売り切ることや、最適なバザール配置が決まったことを意味しない。

## 非開示の保証

- 既存`knownProcesses`には将来レシピを推測させる余地があるため、**将来の追加Masterを横断検索して候補推論しない**。固定crosswalkで登録済みIDにだけつなぐ。
- Master上に未知の同名出力レシピを追加しても、発見済みの加工候補・計算結果は変わらない。
- Player Stateの登録済み料理と未登録料理を区別。料理の材料グループは既知アイテムの範囲だけを候補にする。
- 店舗名・加工方法・売価・未発見情報を「候補数」「順位」「失敗メッセージ」から推測させない。

## 未完了と次の工程

1. 実プレイヤーのローカル保存データにはこのリポジトリからアクセスできないため、テストはAppの実保存スキーマに準拠した**合成データ**で実施。本人の現在のリンゴ・資金を自動取得したわけではない。
2. UIとの接続は【App】側担当。発見済みの状態だけに紐付け、ユーザーに必要な在庫確認・取り置き確認のみ短い入力で補う画面を設計する。
3. 品質・バザール・風・店頭在庫の変化、および全体最適化はまだない。候補は「既知・確定の数値を持つ順次ルート」の**限定比較**である。
4. `legacy-economy-process-crosswalk` を変更する場合、既存の旧IDに紐づくRecipe IDを変更せず、独立した検証とPlayer State互換性テストを通す。

## 実行方法

```bash
node --test tests/*.test.mjs
```
