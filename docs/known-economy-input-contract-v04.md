# Known Economy v0.4 — 実データ入力・比較前チェック契約

## 目的と範囲

Data側が【App】へ渡す、**ネタバレなし・読み取り専用**の入力チェック機能です。利用者の既知品目から1件を選び、実際のPlayer State v7と手動確認済み事実を合成して、比較に必要な不足項目を返します。

- 新規: `lib/app-economy-input-contract.mjs` の `inspectAppKnownEconomyInputs(master,appState,{focus_ref,scenario,verified})`
- 既存: `prepareAppKnownEconomy(...)` はデータ側の接続、`compareAppKnownEconomy(...)` は比較実行。チェックは比較を実行しません。
- **本番UI・Player State保存スキーマ・index.html・release.jsonは変更しない。**
- 出力は`view.items`と`view.routes`で発見済みと確認された品目・経路に限定。Masterの未発見名・件数・加工可能性を推測して返さない。
- `can_compare=true`は **登録・選択された既知ルートについて評価に進める**意味に限る。すべてのゲーム内ルートを比較済みという意味ではありません。

## 入力の出どころ

| 情報 | 使える出どころ | 禁止する誤解 |
|---|---|---|
| 既知品目・加工・料理 | `knownEntities`/`knownFacts`/`knownProcesses`/`knownRecipes` と固定crosswalk | 品目を知っただけで加工や購入も知った扱いにしない |
| 種・苗・菌の保有数 | `playerState[*].seedCount` のうち、保管状態・保管場所が確定しているもの | `apple.seedCount=13`を収穫済みリンゴ13個と解釈しない |
| 現物・食材の数量 | `verified.confirmed_stock_rows` | 未記録なら数量0とは解釈しない |
| 所持金 | `verified.cash_g` | ゲーム画面以外の推定額で埋めない |
| 取り置き | `verified.confirmed_reserved_rows`、目標・お願いの競合確認 | `requirements.have`を倉庫の在庫数にしない |
| 売価 | `known_sale_quote_refs` / `observed_sale_quotes` | 星・天候・装飾品・トレンドで補正した実売価と混同しない |
| 店舗からの購入 | `known_shop_ids` + `observed_shop_offers` | 商品がMasterにあるだけで今買えるとは推定しない |
| 利用可能な設備・ルート | `known_facility_ids`/`known_resource_ids`/`available_route_ids`/`resource_capacities` | 入力省略を「設備がない」「利用できない」の確定情報にしない |
| 期間 | `scenario.horizon_minutes` | バザール開催までの残時間を勝手に仮定しない |

## 手渡すレスポンス（概要）

```js
{
  version:'v0.4',
  status:'needs_confirmation' | 'ready_for_bounded_comparison' |
    'focus_required' | 'focus_not_discovered' | /* generic preparation error */,
  can_compare:false,
  scope:'discovered_known_only',
  focus:{item_id:'entities:apple',label_ja:'りんご'},
  route_choices:[{route_id:'...',label_ja:'...',kind:'process',selected:false}],
  missing:[
    {code:'known_stock_quantity_not_confirmed',
     field:'confirmed_stock_rows',
     item_id:'entities:apple',
     ref:{domain:'entities',id:'apple'},label_ja:'りんご'}
  ],
  notices:[],
  read_only:true
}
```

`missing`の`code`をApp側で短い日本語文に置換する。商品名は**戻り値の既知ラベルだけ**を表示する。未発見の`focus_ref`は存在の有無にかかわらず`focus_not_discovered`、経路情報・Master候補を返さない。

## App側の想定フロー（今回未実装）

1. 既に発見済みの商品（または登録済みの「やること」「目標」）から対象を選ぶ。未発見品のサジェストはしない。
2. 比較期間・基準価格のみの比較であることを確認する。
3. 使用可能な設備と、今実行できる既知ルートを明示的に確認する。空配列は本人が確認したときのみ送る。
4. `missing`に従って、必要な収穫物在庫・売価・所持金・設備枠・目標用取り置きのみを確認する。未記録と0個を別に扱う。
5. `can_compare`がtrueの場合にのみ`compareAppKnownEconomy`を実行する。結果は「確認した既知候補内での参考比較」と表示する。

### 重要なパフォーマンス制約

2026-10-10の本番アプリは**起動用の軽量Masterと完全版Masterを分離**しています。現行Dataブリッジは完全版Masterを要求します。比較をホーム起動・すべてのタブ描画に組み込むのではなく、App側では機能を開いたときに必要なデータを取得・利用する方式を検討してください。オフライン要件があるため、キャッシュ戦略とサイズ・体感速度を確認するまで無条件の実行時ロードは行いません。

## 新規ガード

- 実行対象に選んだ既知ルートの加工費・加工時間・利用条件が未確定のとき、計算器は`known_route_assumptions_incomplete`を返し、基準直売を「最善」とはしません。
- 対象品そのものの売価が確認できないときも`known_valuation_incomplete`を返す。
- 既知・利用対象の加工ルートや売却・購入ルートの入出力に不明な在庫数量・売価があれば、比較を保留する。未発見レシピはこの判定に参加しない。

## 残る制約と検証

- 今回のテストは完全版Master + 実際の保存形式に準拠した**合成Player State**で実施。利用者の端末内の所持金・収穫物在庫を取得したものではありません。
- 品質・バザール客数・売り切り率・風・季節の機会費用・在庫補充・設備並列化を網羅した最適化ではありません。
- App UI接続前に、実端末のPlayer Stateバックアップ（本人が任意で共有したもの）で非破壊検証し、未知情報の不干渉と表示負荷を確認してください。

```bash
node --test tests/*.test.mjs
node tools/validate-request-master.mjs
node tools/validate-bazaar-master.mjs
node tools/validate-bazaar-decor.mjs
```
