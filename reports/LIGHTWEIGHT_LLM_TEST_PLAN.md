# DCP 軽量 LLM 互換性テスト計画

## 目的

DCP が高性能モデル前提でしか機能しないなら普及しない。軽量 LLM (≤3.8B) が DCP を正しく消費・生成できるかを検証し、Interactive Schema のプロファイル適応設計にフィードバックする。

## テスト対象モデル

ollama ローカル環境で実行。全モデル ≤3.8B — 上限が低いため、ここで動けば汎用性は高い。

| モデル | パラメータ | 備考 |
|--------|-----------|------|
| phi3:mini | 3.8B | Microsoft。推論に強い。最も期待値が高い |
| gemma2:2b | 2B | Google。軽量バランス型 |
| qwen2.5:1.5b | 1.5B | Alibaba。多言語対応 |
| llama3.2:1b | 1B | Meta。最小実用クラス |
| qwen2.5:0.5b | 0.5B | 超軽量。限界探索用 |

## テスト項目

### Test 1: DCP 読解（消費側）

DCP の主要価値はシステム→AI のデータ注入。消費側で正しく読めるかが最重要。

**方式:** `$S` ヘッダー + データ行を入力し、特定フィールドの値を質問する。

```
入力:
  ["$S","rag-chunk-meta:v1",5,"source","page","section","score","chunk_index"]
  ["docs/auth.md",12,"JWT Config",0.92,3]
  ["docs/api.md",5,"Rate Limiting",0.87,1]

質問: "What is the score of the second entry?"
期待: 0.87
```

**バリエーション:**
- フィールド数: 4, 6, 8（複雑度による劣化を測定）
- 位置: 先頭 / 中間 / 末尾フィールド（位置バイアスの確認）
- 行数: 2, 5, 10（データ量による劣化）

**評価:** 正答率 (exact match)。部分正解（正しいフィールドだが隣の行の値など）も記録。

### Test 2: DCP 生成（出力側）

LLM が自発的に DCP 準拠出力を生成できるかの観測。期待薄だが、errorRate の現実値が取れる。

**方式:** schema 定義を提示し、指定フォーマットでデータを出力させる。

```
入力:
  Schema: ["$S","log-entry:v1",4,"level","service","timestamp","error_code"]
  Task: "Express the following as a DCP row: Error in auth-service at timestamp 1711284600, code E_TIMEOUT"

期待: ["error","auth-service",1711284600,"E_TIMEOUT"]
```

**評価基準:**
- 構造正解: JSON array として valid か
- フィールド順序: schema 定義通りの位置か
- 値正確性: 型と値が正しいか
- 余計な出力: DCP 行以外のテキストが混入するか

### Test 3: NL vs DCP 精度比較

同一データを NL と DCP の2形式で渡し、同じ質問への回答精度を比較。DCP が NL より劣る場合、軽量モデルでの DCP 採用に慎重になる必要がある。

**方式:**

```
NL 形式:
  [Result 1]
  Source: docs/auth.md
  Page: 12
  Section: JWT Config
  Relevance Score: 0.92
  Chunk Index: 3

DCP 形式:
  ["$S","rag-chunk-meta:v1",5,"source","page","section","score","chunk_index"]
  ["docs/auth.md",12,"JWT Config",0.92,3]

質問: "Which document has the highest score?"
```

**評価:** 同一質問に対する正答率を NL / DCP で比較。DCP が NL と同等以上なら、トークン削減分が純粋なメリット。

### Test 4: 密度別スキーマ理解度

abbreviated / expanded / full の3密度で同じデータ + 質問を投入。どの密度から正しく解釈できるかを測定。プロファイル適応の閾値設計に直結する。

**方式:**

```
Abbreviated:
  $S:knowledge:v1#fcbc [expand:GET /schemas/knowledge:v1]
  ["add","auth","jwt migration fix",0.8]

Expanded:
  $S:knowledge:v1#fcbc [action(add|replace|flag|remove) domain detail confidence:0-1] [expand:GET /schemas/knowledge:v1]
  ["add","auth","jwt migration fix",0.8]

Full:
  {"$dcp":"schema","id":"knowledge:v1","fields":["action","domain","detail","confidence"],"fieldCount":4,"types":{"action":{"type":"string","enum":["add","replace","flag","remove"]},...}}
  ["add","auth","jwt migration fix",0.8]

質問: "What action is being performed and in which domain?"
```

**評価:** 密度ごとの正答率。期待される傾向: full > expanded > abbreviated。小モデルで abbreviated が通るなら、プロファイル適応の初期値を下げられる。

### Test 5: パッシブ教育効果（マルチターン）

expanded ヒントを受けた後、次のターンで DCP 準拠出力が改善するかを観測。

**方式:**
1. Turn 1: schema なしで「このデータを構造化して」と指示 → NL 出力を記録
2. Turn 2: expanded ヒントを付けて同じ指示 → 出力の DCP 準拠度を記録
3. Turn 3: abbreviated ヒントだけで同じ指示 → 学習が持続するか

**評価:** ターンごとの DCP 準拠度の変化。改善があればパッシブ教育が軽量モデルでも機能する証拠。

## 実行方式

- ollama REST API (`POST /api/generate`) を Python スクリプトから呼び出し
- temperature=0 で決定的出力（再現性確保）
- 各テスト × 各モデルを自動実行、結果を JSON + サマリーテーブルで出力
- タイムアウト: 30秒/リクエスト

## 期待される成果

1. **モデルサイズ × DCP 能力のマトリクス** — どこまで小さいモデルで DCP が使えるか
2. **errorRate の実測値** — プロファイル適応の初期パラメータに使用
3. **密度閾値** — 各モデルサイズに対する最適ヒント密度
4. **NL vs DCP の損益分岐点** — DCP が NL より不利になるモデルサイズの下限
5. **パッシブ教育の有効範囲** — 教育が機能するモデルサイズの下限

## 注意事項

- 軽量モデルの出力は不安定。各テストを最低3回実行して安定性も評価する
- 日本語 vs 英語で差が出る可能性がある。テストは英語で統一（tokenizer 効率が高い）
- DCP の主要価値は消費側（Test 1, 3, 4）。生成側（Test 2, 5）は補助的な知見
