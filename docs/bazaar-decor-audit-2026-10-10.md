# バザール装飾品Master v1 — 2026-10-10

## Scope / current outcome

- 通常ゲームの**装飾品159件**を全件登録（GameWith日本語一覧index 1–159、DLCは除外）。
- 装備スロット: テント29、カウンター29、小物46、大物55。
- シリーズ: 9種類（ファーム、花、どうぶつ、虫、山の恵み、川の恵み、レストラン、風車が各16種、コロボックル17種）。無所属14種。
- 取得方法: 風車加工9／初期等イベント3／店頭購入83／ランク解放1／称号30／住人からのお願い9／資料不一致1／品評会6／ハッピーエナジー交換17。
- 効果: 販売数、販売価格、品質、鮮度、トレンド、ハッピーエナジー、おうえんゲージ、売れやすさ、富豪客の9種類（各Lv上限を個別に保持）。
- 風車で作れる装飾品9件は `data/bazaar-decor-crafting.v1.json` に分離。既存 `MASTER.windmill_recipes` は装飾を意図的に除外しているため、二重正本にしない。
- データは独立JSON。**現行 `index.html` と `release.json` およびPlayer Stateを変更しない。**

## Sources / source precedence

| 内容 | 一次・照合資料 |
|---|---|
| 日本語の装飾品名159件、主な入手先 | [GameWith 装飾一覧](https://gamewith.jp/bokumono-grabaza/515009) |
| 英語の系列構成、個別効果レベル | [StratsWiki Bazaar Decoration Catalog](https://stratswiki.com/sos-gb/items/bazaar-decor/) |
| シリーズ9種と3/5/7段階ボーナス | [StratsWiki Bazaar Decor Series](https://stratswiki.com/sos-gb/guides/bazaar-decor-series/) |
| 個別効果の上限・レベル累積 | [StratsWiki Bazaar Decor Effects](https://stratswiki.com/sos-gb/guides/bazaar-decor-effects/) |
| 同シリーズのテント条件 | [公式オンラインマニュアル（バザール）](https://www.marv.jp/onlinemnl/kaze/jp/ps5/03/) |
| レベッカの販売価格・ランク | [StratsWiki Rebecca's Decor](https://stratswiki.com/sos-gb/shops/rebeccas-decor/) |
| 風車加工の素材・加工時間 | [GameWith 装飾一覧](https://gamewith.jp/bokumono-grabaza/515009)、[StratsWiki Windmill Tent](https://stratswiki.com/sos-gb/items/bazaar-decor/windmill-tent/) |
| 設置枠上限・シリーズ効果の資料差 | [こころぐ オブジェ](https://kokorogu.com/bokumono-objects) |

日本語の商品名と旧英語訳の差は別フィールドに保持し、翻訳表示名だけをデータの識別キーにしない。作成した `decor_*` IDはツール内安定IDであり、ゲーム本体の内部IDではない。

## ゲームルールの構造化

1. 設置枠：テント1・カウンター3・小物4・大物3、計11枠（ランク進行で増える途中段階は現時点でモデル化しない）。同じシリーズの**テントを設置**しない限り、シリーズ効果は発動しない。
2. 個別効果は、同じ種類ならLvを合算して効果ごとの上限で制限する。売れやすさは対象商品のシリーズごとに集計する。**装飾を所持しているだけでは発動しない。**
3. 3個：対象商品を売るとハッピーエナジー+20%。5個：おうえんゲージ（具体倍率不確定）。7個：対象商品の販売価格+10%。個別効果とシリーズ効果は併存。
4. 5個のおうえんゲージ: **StratsWiki +10% とこころぐ +20%の差異あり**。`bonus_pct:null` / `candidate_bonus_pct:[10,20]` で保留。価格・ゲージの予測計算に勝手に採用しない。
5. 効果の実際の数値への換算は現行の作戦計算ロジックにはまだ接続していない。保存値はLv・資料記載の到達上限であり、実ゲームの全イベント補正まで保証するものではない。

## 未確定事項（自動計算への混入を禁止）

| 対象 | 競合・留保 | Master上の対策 |
|---|---|---|
| はちみつバルーン3段階（index121–123） | GameWithは「虫」シリーズ、StratsWikiは「山の恵み/Forager」 | `series_id=forager` で仮置き・`probable`。いずれかのシリーズテントと併用されたら読み取り側は `membership_source_conflict` を返して確定ボーナスを示さない |
| タマゴタワー（index73） | GameWith 21,000G / StratsWikiレベッカ 2,100G | `price_g:null`, `price_candidates_g:[2100,21000]`。費用計算不可 |
| 春以外の季節ワゴン（index134–136） | GameWith 4,800,000G / こころぐ 5,600,000G | `price_g:null`, 候補両方保存、費用計算不可 |
| 昆虫相撲のおもちゃ大関（index98） | GameWithはカゲツのお願い報酬、StratsWikiはロイドのお願い報酬とするが、現行128件Request Masterの該当IDの報酬と一致しない | `acquisition.method=source_conflict`、依頼IDを自動解放に使用しない |
| 風車柄のテント（index1） | 鉄鉱石20 vs 10 | GameWith20を暫定採用、`material_confidence=source_conflict` |
| ぴかぴかなアクセサリー台（index6） | 頑丈な木材×5 vs 石材×5 | GameWithを暫定採用、素材差を記録 |
| きらきらなアクセサリー台（index9） | 最高級の木材×10 vs 頑丈な石材×10 | GameWithを暫定採用、素材差を記録 |
| みごとな風車柄のテント（index7） | GameWith/StratsWikiの個別記事は最高級の木材、StratsWiki一覧だけアダマンタイト | 個別資料を優先 |
| 加工時間 | StratsWikiの一覧と個別ページで異なる表記あり | 個別ページの基準時間を採用。風量による短縮やすてき補正は適用前 |
| 調理セットの一部日本語表示 | 日本語と英語でグレードの形容が異なる | カタログindexと効果Lvで対応させ、英語の形容を日本語の正式名とみなさない |

## Master／App接続契約

- `listDiscoveredDecor` は `discoveredDecorIds` のIDだけを返す。
- `evaluateKnownDecorLayout` は `equippedDecorIds`＋`discoveredDecorIds`＋`ownedDecorCounts` を明示して実行。所持数が不明な場合は `ownership_not_recorded`。UIで予測シミュレーションを明示的に有効にした場合だけ `simulationMode:true` を許す。
- `planDiscoveredDecorPurchases` は発見済み店・商品・現在ランク・前段購入済み・隠し条件の確認を要求する。未発見では詳細・名前・価格を返さない。
- 不一致のある価格とシリーズ効果は確定値で計算しない。`source_conflict` をプレイヤーの「未所持」や「売切れ」と取り違えない。
- 既存の `bazaar-shops.v1.json` にある `shop_rebecca`／`shop_sprite` を参照。既存の `MASTER.requests` と報酬一致した9件だけを `request_reward` として接続。
- 今後、UIでテント名や装飾品名を予測入力するなら、**プレイヤーが発見済みの候補だけ**を表示すること。raw master全件をユーザー操作に公開しない。
- 未発見シリーズの数、出現条件、称号をUIから先読みさせない。テンプレートやApp側の自動サジェストにもこの境界を適用する。

## Regression tests

`node tools/validate-bazaar-decor.mjs` は159件全件、スロット、シリーズ件数、効果と段階、解放報酬の一致、店・風車・素材参照、購入価格の不一致保持、所持数・発見情報の秘匿、3/5/7ボーナス、累積Lvを検証する。

従来の `node tools/validate-bazaar-master.mjs` と `node tools/validate-request-master.mjs` も併走する。

## 次工程（Data担当）

1. `source_conflict` の小数項目をゲーム内実測または独立資料で解消できたものだけ昇格する。
2. テントの**実際の段階別設置枠**・品質上限・風力/すてき補正との相互作用を調査し、未解放項目を自動表示せずに計算できるようにする。
3. 装飾品セットから商品カテゴリー別の販売価格・売れやすさへ接続する際、効果Lv→倍率の確定根拠があるものだけ算出する。UI変更は別作業。
