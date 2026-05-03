# 問題作成ツールのローカルデプロイ手順

## デプロイ対象

`local-save-deploy/problem-maker/` を静的サイトとしてデプロイしてください。

## 起動ファイル

`index.html`

## 注意

このツールはHTMLアプリです。`index.html` をJSONとして解析するツールや、JSON専用の保存先にはアップロードしないでください。

問題データとして授受するのは次のファイルだけです。

- `*.learning-pack.json`
- `mathUnits.json`

エラー例：

```text
Unexpected token '<', "<!DOCTYPE "... is not valid JSON
```

これはHTMLをJSONとして読んでいる時に出ます。
