# 問題パッケージ形式 `learning.problemPackage` v1

## 目的

この形式は、MathBattle以外の学習ゲームでも使える汎用的な問題授受フォーマットです。

- 問題素材：文章、計算式、画像、動画、音声
- 回答形式：数値入力、四択、文字入力
- 期待回答速度：問題または単元側で定義
- ゲームロジック：問題の中身には依存せず、正誤と回答時間だけを受け取る

## 拡張子

推奨拡張子：

```text
.learning-pack.json
```

通常の `.json` としても読み込めます。

## トップレベル構造

```json
{
  "type": "learning.problemPackage",
  "schemaVersion": 1,
  "packageId": "sample-elementary-math-ja",
  "title": "サンプル問題パッケージ",
  "description": "説明",
  "locale": "ja-JP",
  "assets": [],
  "monsterUnitMap": {},
  "units": []
}
```

## Unit

`unit` は単元です。

```json
{
  "id": "clock_choice_01",
  "title": "時計の読み方 四択",
  "description": "画像を見て時刻を選ぶ",
  "expectedAnswerSeconds": 8,
  "answerType": "choice",
  "contentTypes": ["text", "image"],
  "generator": {
    "kind": "static",
    "questions": []
  }
}
```

## Question

```json
{
  "content": [
    { "type": "text", "text": "時計が表す時刻はどれ？" },
    { "type": "image", "src": "assets/clock-0330.png", "alt": "3時30分の時計" }
  ],
  "response": {
    "type": "choice",
    "choices": [
      { "id": "a", "label": "3時" },
      { "id": "b", "label": "3時30分" }
    ],
    "correctId": "b"
  },
  "expectedAnswerSeconds": 8,
  "explanation": "短い針が3を少し過ぎ、長い針が6を指している。"
}
```

## Content Block

| type | 用途 |
|---|---|
| `text` | 文章問題 |
| `formula` | 計算式・数式 |
| `image` | 画像問題 |
| `video` | 動画問題 |
| `audio` | 音声問題 |

複数の素材を同じ問題に入れられます。

## Response

### 数値入力

```json
{
  "type": "numeric",
  "correct": 42,
  "tolerance": 0
}
```

### 四択

```json
{
  "type": "choice",
  "choices": [
    { "id": "a", "label": "24" },
    { "id": "b", "label": "36" }
  ],
  "correctId": "b"
}
```

### 文字入力

```json
{
  "type": "text",
  "answers": ["センチメートル", "せんちめーとる", "centimeter"]
}
```

## MathBattleでの使い方

- 問題設定ツールから `.learning-pack.json` をインポートする。
- `units` は既存の `mathUnits` にマージされる。
- `monsterUnitMap` が含まれている場合、モンスターと単元の対応もマージされる。
- 100問モードのステージ進行は、モンスターに紐づく単元から問題を生成する。

## スキーマ

正式なJSON Schemaは次のファイルです。

```text
schemas/problem-package.schema.json
```

## Geminiで生成する場合

問題設定ツールは、Gemini APIにこの形式のJSONを返すよう依頼します。
生成後は必ずツール側でバリデーションし、問題文・正解・選択肢を確認してから反映してください。
