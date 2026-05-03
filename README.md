# MathBattle Bundle

このZIPは、GitHub Pages公開用アプリをルート直下に置き、スマホ端末ローカル用ツールを別フォルダに分けて同梱したものです。

## フォルダ構成

```text
index.html                     # GitHub Pages 本番公開用エントリ
css/                           # 公開用スタイル
js/                            # 公開用プログラム
data/                          # 公開用データ
.nojekyll                      # GitHub Pages用
local-save-deploy/             # スマホ端末ローカル保存・デプロイ用
  problem-maker/               # 問題作成ツール
shared/                        # 問題授受形式・JSON Schema
docs/                          # 補足ドキュメント
.github/workflows/             # GitHub Pages公開用Workflow
plan.md                        # 要件・計画
rule.md                        # 開発ルール
handoff.md                     # 引き継ぎ文書
handsoff.md                    # 旧名互換の引き継ぎ文書
failure-log.md                 # 失敗ログ
```

## GitHub Pages に公開するもの

公開用アプリはルート直下にあります。

ただし、`local-save-deploy/` は公開したくないローカル用ツールなので、GitHub Pagesは同梱の `.github/workflows/deploy-pages.yml` を使ってください。

このWorkflowは、Pages artifact に以下だけを入れます。

- `index.html`
- `css/`
- `js/`
- `data/`
- `.nojekyll`

そのため、以下はGitHub Pagesに公開されません。

- `local-save-deploy/`
- `shared/`
- `docs/`
- `plan.md`
- `rule.md`
- `handsoff.md`
- `failure-log.md`

## 重要

GitHub Pages設定で「Deploy from branch / root」を選ぶと、`local-save-deploy/` も公開される可能性があります。

この構成では、GitHub Pagesは **GitHub Actions** で公開してください。

## 公開本体に含めないもの

公開本体には、管理用のキャラクター設定UIを含めません。

含めないもの:

- `character.json` インポート画面
- キャラクター定義リセットボタン
- キャラクター編集画面
- 問題作成ツール
- Gemini UI / API Key入力欄
- GoogleログインUI

`data/character.json` は実行時データとして残します。キャラクター追加は、管理者がこのファイルを編集して再デプロイする運用です。

## ローカル用フォルダ

`local-save-deploy/problem-maker/` がスマホ端末ローカル用の問題作成ツールです。

これは本番公開用ではありません。スマホ端末内、またはスマホからアクセスできるローカル保存先・ローカルサーバーで使う想定です。

## 問題授受形式

問題の授受形式は `shared/problem-format.md` と `shared/schemas/problem-package.schema.json` に定義しています。

形式名: `learning.problemPackage`
推奨拡張子: `.learning-pack.json`

ローカル問題作成ツールで作った問題パッケージを、公開用の `data/mathUnits.json` に反映して使います。

## デプロイ手順

1. このZIPを展開する。
2. 展開後の中身をGitHubリポジトリのルートへ配置する。
3. GitHub Pagesを **GitHub Actions** で公開する設定にする。
4. `main` にpushすると、`.github/workflows/deploy-pages.yml` が公開用ファイルだけをPagesへ公開する。
