# スマホ端末ローカル用 問題作成ツール

このツールは GitHub Pages 本番ページには置きません。スマホ端末のローカル環境でだけ使う前提です。

## 目的

- Geminiで問題パッケージを生成する
- `.learning-pack.json` を読み書きする
- 本番アプリ用の `mathUnits.json` に変換する

## セキュリティ方針

- 本番ページには含めない
- Gemini API Keyは保存しない
- Googleログインで許可メールだけが操作できる
- 非ローカル環境では画面をロックする

## 設定

1. `config/local-tool.config.example.js` を `config/local-tool.config.js` にコピーする
2. `googleAuth.clientId` を設定する
3. `allowedEmails` に許可するGoogleアカウントを入れる
4. スマホ端末のローカル環境で `index.html` を開く

注意：Googleログインは利用するURLのオリジン設定が必要です。スマホの `file://` で動かない場合は、端末内または同一LAN内のローカルサーバーで開いてください。
