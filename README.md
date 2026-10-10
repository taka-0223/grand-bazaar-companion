# 風のグランドバザール 作戦ボード

個人利用を前提にした PWA です。種・料理・計画をつなぎ、既知情報だけを使って次の行動を逆算します。

## 保存
- IndexedDB を主保存、localStorage をミラーとして使用
- アプリのバージョン更新とプレイヤーデータを分離
- JSON バックアップ/復元に対応
- プレイヤーデータはこのリポジトリには含めません

## 公開
GitHub Pages の `main` ブランチ直下から配信する構成です。

## Third-party data
一部のゲームデータは MIT ライセンスの公開データを利用しています。詳細は `THIRD_PARTY_NOTICES.md` を参照してください。

## Masterの起動時軽量化
- `data/board-master.full.v1.json` は完全版Masterの正本です。加工・経済計算・整合性テストはここを参照します。
- `index.html` の `MASTER_DATA` は、現在のUIが参照する項目だけをビルド時に投影した軽量版です。完全版を起動時に取得しないため、オフライン利用も維持できます。
- 完全版を更新した場合は `node tools/build-runtime-master.mjs --write` で埋め込みを更新し、`node tools/build-runtime-master.mjs --check` と `node --test tests/*.test.mjs` で確認してください。
- 新しいUIが別のMaster項目を必要とするときは `lib/runtime-master-projection.mjs` へ明示的に追加してください。一括の起動時取得へ戻さないでください。
- UI上のネタバレ防止は従来どおりPlayer Stateの発見状況で判断し、未発見情報を新しく表示しません。
