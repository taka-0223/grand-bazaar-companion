# Request Master 再監査メモ — 2026-10-09

対象: `main` の `index.html` 内 `MASTER_DATA.requests` と `meta.request_master` / `reference_catalog`。本メモの集計・構造検証は当該ソースを直接読み取って実施。

## 結論

- **128 / 128件**が `detailStatus: audited_v2`（監査版 `2026-10-07-v2`）として登録済み。依頼人 **38人**。未登録ID、インデックス欠番、重複なし。
- **達成条件155項目**：`item_quantity` 121、`action_count` 19、`check` 12、`money_amount` 3。
- **選択肢を持つ条件44項目**、参照先の選択肢231件、個別のアイテム参照121件。選択肢とObjectiveの表示名称・件数の不一致なし。
- 品質制約のあるObjectiveは計71項目（`quality` を持つ70項目と、選択肢個別の `quality` のみを持つ1項目）。品質条件の表示ラベルのみへの埋め込みは検出されず。
- 参照辞書：内部補完entity 184、カテゴリ定義57。**検査可能な内部参照切れ0件**（外部に読み込む `rickychiki` の全体内容まで実行時照合したわけではない）。
- 文言の空欄、指定素材が不明な旧ラベル、非正整数の目標値、リンク不整合など、今回の静的検証では **エラー0件**。
- 個別の `provenance.confidence` は confirmed 127 / probable 1。これは**前回の資料監査の評価結果**であり、今回新たに全128件のゲーム内実測が完了したという意味ではない。

自動回帰テスト：`node tools/validate-request-master.mjs`。新しい依頼が追加される場合、既定の128件アサーションを意図的に更新すること。

## 重点照合（今回、外部情報も直接再確認）

| ID | 照合結果 | 採用判断 | 根拠 |
|---|---|---|---|
| `rqm_miguel_02` | 頑丈な石材・頑丈な木材・銀、各1個／品質2 | **現行Masterは正しい**。旧 `check` は解消 | [GameWith個別](https://gamewith.jp/bokumono-grabaza/517905)、[石材](https://gamewith.jp/bokumono-grabaza/515595)、[木材](https://gamewith.jp/bokumono-grabaza/515594) |
| `rqm_felix_03` | 銅（品質3）×10 + 最高級の石材・木材（品質3）×各1 | **現行Masterは正しい**。GameCalc側の銅×1は不採用 | [GameWith個別](https://gamewith.jp/bokumono-grabaza/518014)、[GameCalc](https://www.gamecalc.jp/bokumono-grabaza/requests) |
| `rqm_gw_123` | 鉄鉱石（品質2）×99 + 頑丈な石材×5 + 頑丈な木材×5 | **現行Masterは正しい** | [GameWith個別](https://gamewith.jp/bokumono-grabaza/517898) |
| `rqm_kevin_02` | 願い一覧の「ショウリュウバッタ」に対し、アイテム図鑑は「ショウリョウバッタ」 | **参照辞書は修正済み**。canonical entityは「ショウリョウバッタ」、旧表記はalias。既存Player State互換性のため、`objectives.label` は今回変更しない | [GameWith虫図鑑](https://gamewith.jp/bokumono-grabaza/516821)、[GameWithお願い個別](https://gamewith.jp/bokumono-grabaza/517934) |
| `rqm_kevin_02` の報酬 | 一部GameWithお願いページでは「蜂蜜」、巣蜜の個別アイテムページでは本依頼の報酬として「巣蜜」 | **現行Masterの巣蜜を維持**。GameCalc・AppMediaも巣蜜を記載 | [GameWith巣蜜](https://gamewith.jp/bokumono-grabaza/515691)、[GameCalc](https://www.gamecalc.jp/bokumono-grabaza/requests)、[AppMedia](https://appmedia.jp/bokumono_grabaza/79202048) |
| `rqm_gw_114` | GameWith/AppMedia/Foguは「ペットのなかよし度を5回上げる」。StratsWikiは「任意のペットが5♥以上」と説明 | **probableを維持**。主目的を `action_count` ×5とし、実ゲームのカウンター挙動で確定するまでは断定しない | [GameWith](https://gamewith.jp/bokumono-grabaza/517907)、[AppMedia](https://appmedia.jp/bokumono_grabaza/79232288)、[Fogu](https://fogu.com/sos6/town/sherene.html)、[StratsWiki](https://stratswiki.com/sos-gb/requests/a-member-of-the-family/) |

## 既存Player Stateの保護

既存Masterには `player_state_migration` があり、対象の分類は
- unchanged 59件
- progress preserving 64件
- 特別移行 2件
- trigger-only 3件

合計128件。進捗未記録／完了済みを区別した移行、および「逃げ出した動物を探せ！」の途中進捗を場所別に勝手に割り振らない仕組みを確認。

**重要:** `masterRevision` と `requestMasterObjectiveSignature` によりプレイヤーが独自に編集した達成条件を保護するため、文言を1文字だけ変えた場合でも既存同期への影響がある。名称のalias正規化や品質のデータ化を理由にObjectiveを安易に一括上書きしない。

## 残る判断・監査境界

1. シェリーン「愛する家族の絆深めて」：5回の増加か、5♥到達か、ゲーム内受託後の実測で確定させる（**未確定1件**）。
2. ケヴィンの旧表記「ショウリュウバッタ」を画面にも「ショウリョウバッタ」と表示する場合は、単なる文字列置換ではなく、Player State移行・旧ラベル一致判定・回帰テストを付けて別リビジョンとして行う。
3. 今回の静的テストは**外部サイト128件をリアルタイムに再クロールするテストではない**。前回監査の127件 confirmed は現行Master上の評価。外部情報の更新やゲームパッチによる条件変更を自動検出する仕組みではない。
4. `audit_flags` の `information_incomplete` / `abstract_expression` 等には、**元資料の曖昧さや旧データの監査経緯を記した歴史的フラグ**が混在する。現在のObjectiveが未構造化だと直ちに推定しない。

## 再監査結果の扱い

今回のチェックで直ちに確定・上書きすべき新しい必要素材の誤りは発見されなかったため、**`index.html` と `release.json` は変更しない**。作戦ツールのUI改修と競合しないよう、このPRでは監査記録と回帰テストのみ追加する。
