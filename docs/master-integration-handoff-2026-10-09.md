# Master接続監査・App引き渡し（2026-10-09）

## 対象・検査方法

- 対象: `main` の `index.html` v0.11.7、embedded `MASTER_DATA`。
- ベースの `index.html` blob SHA: `16c9dbeca5aed44688834325518be172ccbcad04`。
- `node tools/audit-master-app-connection.mjs` はinlineアプリJSに出現する**明示的な** `MASTER.<domain>` 参照を数える。動的アクセス・間接アクセスを完全には判定しない。
- Masterにはトップレベル配列25個（`groups` は0件）、アプリJSに直接参照がある配列は5個。

## 現時点のMaster／利用状態

| Master Domain | 登録数 | 現行アプリから直接参照 | 補足 |
|---|---:|---|---|
| `entities` | 124 | あり | 従来の種・作物等を登録するための基本レジストリ |
| `facts` | 63 | あり | 種・苗へ変える風車加工など、旧Domain |
| `requests` | 128 | あり | 進捗移行・ネタバレ境界あり |
| `cooking_effects` | 43 | あり | `recipeEffectLabel` から参照 |
| `cooking_recipes` | 266 | **一部** | `recipeEffectLabel` でのeffect_id取得が主 |
| `cooking_groups` | 77 | なし | 新Masterの食材group補正をUIでは未活用 |
| `cooking_trends` | 11 | なし | トレンド関連情報 |
| `cooking_categories` | 8 | なし | 料理分類 |
| `cooking_utensils` | 3 | なし | 調理器具 |
| `windmill_recipes` | 225 | なし | 加工素材・時間の正本候補 |
| `windmill_items` | 377 | なし | 加工関連アイテムの正本候補 |
| `windmill_groups` | 18 | なし | 加工の代替条件 |
| `windmills` | 3 | なし | 風車の定義 |
| `animals` ほか animal系6配列 | 計72 | なし | animal_関連情報の単純合計 |
| `resource_items` | 31 | なし | 採取物・鉱石・宝石 |
| `flowers` | 20 | なし | 栽培花と野草 |
| `honeycombs` | 4 | なし | 養蜂 |
| `mushrooms` / `mushroom_spores` | 7 / 6 | なし | きのこ |
| `groups` | 0 | なし | 旧配列。新料理groupと混同しない |

**現在のアプリコード**は `window.recipes → RECIPE_ROWS`（料理の材料・表示）、`window.processed_goods → PROCESS_ROWS`（加工情報）という旧データも併用。データ件数だけで「現在の画面に反映済み」と判断しない。

なお、`MASTER.meta.request_master.reference_catalog` は内部参照定義を持つが、アプリJSから直接アクセスしていない。

## 優先順位・引き渡し項目

### A1 — Cooking正本優先（App担当）

- `cooking_recipes.required_slots` を材料の正本候補にする。旧 `window.recipes` をfallbackとしてのみ利用する。
- `cooking_groups` と `required_slots` の `item/group` を区別。アレンジ素材 `adapt_options` は必須材料に数えない。
- 料理の `effect_id` は既にMasterを使うため保全。
- **回帰例**: `ハーブサラダ` の必須ハーブ類×2、`餅` の材料の生米/調理済みご飯を混同しない。
- 未発見の料理名・素材候補を画面に露出しない。

### A2 — Windmill正本優先（App担当）

- `windmill_recipes` → `windmill_items`、`windmill_groups` で入力・出力・加工時間を解決。
- 出力ID `wmitem_*` と旧レシピIDは同一ではない。**表示名の完全一致での無条件移行は不可**。`windmill_items.canonical_ref` / `external_registry` 等を使った安定IDブリッジが必要。
- 料理への接続は `cooking_recipes.required_slots[].ref.domain` を使う。
- **回帰例**: 香辛料の基本売価200G（旧pinnedの260Gを正本として復活させない）、果実ヨーグルト材料はミント＋いちご、餅材料は調理済みご飯。
- 風力係数は既存Masterの0/1=1、2=0.75、3=0.5。青のすてきなどは別レイヤーで適用。

### A3 — Tool Upgrade（今回Data側追加）

- `data/tool-upgrades.v1.json`: 5種類／強化37段階。完成までの所要時間、使用風車、素材の安定IDリンク、前段階の道具を保持。
- `lib/tool-upgrade-plan.mjs`: 手持ち段階→目標段階の累積必要素材・基準加工時間の算出。ネタバレ抑止を初期値に設定。
- 実際のアプリ画面やPlayer Stateは**今回変更していない**。App側で道具の所有段階・発見した強化段階を追加すると利用可能。
- 旧Masterの道具 `sickle.name_ja='鎌'` と攻略サイト表記 `カマ` は同一IDでalias扱い。

### A4 — 住人・進行・店舗（次のData整備候補）

1. `shop` / `bazaar_facility` / `bazaar_object` を独立Domainに分離し、販売品・料金・解放条件・効果を段階的に収集。
2. `resident` の誕生日・好物・好きな色をMasterへ移行。現在のユーザーメモはPlayer Stateに保持。
3. `event` とカレンダーを分離。現行 `CAL_BIRTHDAYS` / `festivalMap` はインライン定義のため重複正本を作らないようにする。

## リリース時の必須条件

- プレイヤー入力（`knownEntities`、`knownRecipes`、`knownProcesses`、登録済みお願い、手書きメモ・進捗）を消去・上書きしない。
- 未発見Master項目を候補一覧や先読み結果に露出させない。登録・発見済み情報だけを優先。
- ソースの曖昧さとプレイヤーの未記録を混同しない。
- Master変更で旧IDが変わる場合、aliasとPlayer State移行の回帰テストを先に作る。
- 静的参照が増えたというだけで「UIから正しく表示できる」とは見なさない。モバイル実機での発見／既知の2パターンを確認。

## 監査上の注意

- `MASTER.meta.status='bootstrap-not-full'` / `meta.note` は古いbootstrap説明のまま。サブドメインの `audited_v1` とは整合していない。**UI開発と競合する巨大なindex.htmlの差分を避けるため、今回更新しない。**
- 新規Tool MasterはJSON別ファイルで段階的に提供。アプリが取り込む際に一本の正本へ統合する。
- `data/tool-upgrades.v1.json` は攻略資料に基づくデータであり、プレイヤーの所有状態ではない。
