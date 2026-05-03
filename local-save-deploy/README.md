# local-save-deploy

このフォルダは、スマホ端末ローカルで使う問題作成ツール用です。

## 使うフォルダ

静的サイトとしてデプロイ・保存する場合は、次のフォルダを指定してください。

```text
local-save-deploy/problem-maker/
```

## JSONとして読み込ませてはいけないファイル

以下はHTML/CSS/JSのアプリ本体です。問題データJSONではありません。

- `problem-maker/index.html`
- `problem-maker/css/tool.css`
- `problem-maker/js/localProblemTool.js`

`Unexpected token '<', "<!DOCTYPE "... is not valid JSON` が出た場合は、`index.html` をJSONとして読み込ませています。
問題授受に使うファイルは `.learning-pack.json` または `mathUnits.json` です。

## 問題授受ファイル

問題作成ツールで保存するファイル：

- `.learning-pack.json`：汎用問題パッケージ
- `mathUnits.json`：MathBattle本体用に変換済みの問題定義

GitHub Pages本体へ反映する場合は、生成した `mathUnits.json` を公開用の `data/mathUnits.json` と差し替えてください。
