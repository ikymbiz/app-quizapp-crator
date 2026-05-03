# Architecture

## 公開用

公開用アプリはリポジトリのルート直下に置く。

- `index.html`
- `css/`
- `js/`
- `data/`

GitHub Pagesへの公開は GitHub Actions で行い、Workflow内で `.pages-artifact` に公開対象だけをコピーする。

## ローカル用

問題作成ツールは `local-save-deploy/problem-maker/` に分離する。

このツールはスマホ端末ローカル用であり、GitHub Pagesの公開対象には含めない。

## 共通仕様

問題授受形式とJSON Schemaは `shared/` に置く。

公開アプリとローカル問題作成ツールは、`.learning-pack.json` と `mathUnits.json` を通じて連携する。

## 管理機能の配置

公開用アプリには、管理用キャラクター設定UIを置かない。

- 公開用アプリは `data/character.json` を読み込むだけ。
- キャラクター追加・編集は、管理者がファイルを編集して再デプロイする。
- 問題作成ツール、Gemini生成、Googleログインは `local-save-deploy/problem-maker/` 側だけに置く。

## タップ処理

スマホ操作を安定させるため、公開用アプリの主要ボタンは `UI.activate()` を使う。

`UI.activate()` は以下をまとめて扱う。

- `pointerup`
- `touchend`
- `click`

短時間の二重発火は抑制する。
