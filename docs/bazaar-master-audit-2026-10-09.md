# Bazaar Shop / Facility Master v1 — 監査・App引き継ぎ（2026-10-09）

## このPRの成果範囲

- `data/bazaar-shops.v1.json`：町の常設店2店＋バザール店21店（合計23店）、ストーリー内のバザールランク1〜7。
- `data/bazaar-facilities.v1.json`：恒久的設備38件（ウィルバー工務店20・ゴラン大工屋12・運び屋ちからもち6）。
- `data/bazaar-offers.v1.json`：攻略判断に影響が大きい固定価格8オファー（フェリペのウィンドジュエル／5種すてき＋ラッピング＋占い）。
- `lib/bazaar-master-plan.mjs`：店舗・設備・オファーについて、**既知情報だけ**を公開する読み取り処理と設備費用の累計（前提工事を重複集計しない）。
- `tools/validate-bazaar-master.mjs`：shop→Request Master ID→報酬→依頼人→rankの照合、料理器具・資源Master参照、施設前提の非循環性、ネタバレ防止の回帰テスト。

**未収録：** 全店舗の季節変動在庫・装飾品150点超の全効果・テントセット／ボーナス。これらを「0件」や「入荷しない」と解釈しない。今回の8オファーは完全在庫カタログではない。

## 確認済みの基本構造

バザールはストーリー上7ランク。売上目標は村1,000G、町50,000G、都市200,000G、地方500,000G、国1,000,000G、世界2,000,000G。必要な新規誘致店舗数はそれぞれ0、2、5、8、12、16（村は0）。21バザール店舗のうち、初期4・村ランク自動解放1・既存お願いで解放16。<https://gamewith.jp/bokumono-grabaza/514651> <https://gamewith.jp/bokumono-grabaza/515261>

店舗の日本語名と機能・営業時間はGameWithの現行店舗一覧を採用し、AppMediaの日本語一覧、StratsWikiのショップ一覧で照合。<https://gamewith.jp/bokumono-grabaza/515261> <https://appmedia.jp/bokumono_grabaza/79199948> <https://stratswiki.com/sos-gb/shops/>

営業日は町常設2店とバザール21店で別定義。通常の土曜は第一部10:00–13:59、第二部15:00–18:59。祭りなどで開催日が変わる場合、現在のAppの `festivalMap/isBazaarDate` との照合が必要。<https://gamewith.jp/bokumono-grabaza/515278>

## 明示的な情報源差異

1. **エールダンジュ店主**：GameWith店舗一覧は「ディアナ」、AppMedia日本語一覧とRequest Masterは「カリーナ」。`カリーナ` 採用。GameWithの表記誤りの可能性が高い。
2. **店名別表記**：ラッピング屋ラピ／ラッピング屋・ラピ、レアクジ引き屋レアロット／クジ引き屋ロット。内部のIDは名前から自動生成せず固定する。
3. **ロナルド依頼のタイトル**：GameWith『ロナルドの店の開店準備』、現行Request Master『ロナルドの開店準備』。`rqm_gw_122` → `出店：ザッカ・パラダイス` の報酬一致で接続。
4. **3面目の畑解放rank**：StratsWikiウィルバー表はrank3、GameWith畑拡張・StratsWiki Farm Upgradesはrank4。後者を採用。
5. **追加のどうぶつ小屋のrank**：StratsWiki Farm Upgradesはrank4、GameWith/AppMediaの小屋拡張・StratsWikiゴラン表はrank5。rank5を採用。
6. **土の品質2段階目のrank**：StratsWiki Farm Upgradesはrank4、ゴラン店頭一覧はdefaultと記載。rank4を暫定採用し `confidence:'probable'` として保持。ゲーム内再確認事項。

## 設備・必要経費の検証

- 初回カバン拡張5,000G、初回そうこ拡張5,000G、2回目カバン30,000G、2回目そうこ20,000G：GameWith＋StratsWikiが一致。<https://gamewith.jp/bokumono-grabaza/515381> <https://stratswiki.com/sos-gb/shops/wilburs-workshop/>
- 畑2面20,000G、3面100,000G、牧草地50,000G、2つ目のどうぶつ小屋100,000G：GameWith＋AppMedia＋StratsWiki複数ページで照合。<https://gamewith.jp/bokumono-grabaza/517157> <https://appmedia.jp/bokumono_grabaza/79239401> <https://stratswiki.com/sos-gb/guides/farm-upgrades/>
- フライパン10,000G、鍋30,000G、オーブン50,000G。設備は `MASTER.cooking_utensils` の安定IDと価格を一致させた。<https://gamewith.jp/bokumono-grabaza/517705> <https://stratswiki.com/sos-gb/items/utensils/>
- 養蜂畑・きのこ原木の初回10,000G、拡張各50,000G/200,000G：GameWith/StratsWikiと `MASTER.meta.resource_master` を照合。<https://gamewith.jp/bokumono-grabaza/515019> <https://stratswiki.com/sos-gb/shops/heavy-lifters/>
- すてき5種類各140,000G、ウィンドジュエル210,000G：GameWith＋StratsWiki照合。<https://gamewith.jp/bokumono-grabaza/517699> <https://stratswiki.com/sos-gb/shops/felipes-fineries/>

## Appとの接続契約（UIチームへ）

**このPRはデータのみで、index.html／release.json／Player Stateを変更しない。**

- `shops[*].unlock.request_id` は `MASTER.requests.id` を参照。依頼の**登録・受託・完了**と実際の店の**出店済み／見つけた**は別。rankに到達しただけで16店舗を「現在購入可能」と判定しない。
- `facility_upgrades[*].unlock` のrank・前提工事・プレイヤーフラグは全てAND条件。購入済み工事を費用へ再計上しない。前提未発見のときは一切の素材・店名を先読み表示しない。
- `facility_upgrades[*].name_ja=null` は**日本語のゲーム内正式表示名未確定**を意味し、`label_ja` は利用者向けの説明名（推定の正式名ではない）。
- `data/bazaar-offers.v1.json` は高優先度8オファーのみ。季節在庫については「未収録」を空の在庫として表示しない。
- 動的解放の判断とプレイヤー側の既知ID・購入済みIDはApp専用。Master自体にゲーム進捗を書き込まない。
- 新規目標候補への予測入力は、ネタバレ防止条件・Master参照の曖昧さ・導線をUIで確認してから接続する（既存UI改革と衝突させない）。

## 次のData担当

優先候補は**バザールのテント・カウンター・オブジェ効果／シリーズボーナス**。主要な固定施設は今回構造化済みだが、装飾セットの効果は価格比較・売上予測に直結するため未整備では作戦最適化できない。効果・入手先・同シリーズ数の発動閾値を個別に正規化したい。参考：<https://stratswiki.com/sos-gb/guides/bazaar-decor-effects/> <https://stratswiki.com/sos-gb/guides/bazaar-decor-series/>。
