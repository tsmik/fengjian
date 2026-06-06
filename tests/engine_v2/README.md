# 第 1 階段 — 引擎 v2 ＋ 回歸驗證（結果）

> 目標（v0.6 §15 第 1 階段）：先證明新引擎能用新格式算出跟舊引擎一致的結果，把風險前置引爆。
> **不改舊引擎 `js/rule_engine.js`、不改 `js/app.js`。** 新引擎 `js/rule_engine_v2.js` 並排新增。

## 檔案
| 檔 | 用途 |
|---|---|
| `js/rule_engine_v2.js` | 新引擎（讀新格式 DNF：部位→卡片→combo→葉、主/輔、目標極、聚合、輔門檻/辣度）。**不 import 舊引擎/core**，獨立。 |
| `tests/engine_v2/translate.mjs` | 透明轉譯器 live→新格式（拋棄式，admin2 取代）。構造性證明新文法能表達 live。 |
| `tests/engine_v2/fixture_dim0.json` / `fixture_dim2.json` | 凍結的新格式 fixture（v2 引擎讀的就是這個）。 |
| `tests/engine_v2/regress.mjs` | 回歸：舊引擎(live) vs 新引擎(fixture)，比對 `data[di][0..8]`＋動靜＋係數。 |

## 怎麼跑
```bash
node tests/engine_v2/translate.mjs   # 重生 fixture（如 p2_seed 規則更新）
node tests/engine_v2/regress.mjs     # 回歸驗證，exit 0 = 全綠
```

## 結果
- 維度：**dim0（形勢，靜/動）、dim2（方圓，動/靜）**，共 32 個部位（含 6 個聚合）。
- 辣度：**中辣 = rbf1 現有 `COUNT.min`**（§E 暫行值）。
- 比對 **2000 次**（base / 左右不對稱 / 含未填 三種合成輸入）→ **逐格相同 2000/2000（100%）**，動靜＋係數全相符。
- 非空泛驗證：輸出分布 A/B/null 皆有、動靜約各半（1502/1498）、L≠R 與未填(null)皆涵蓋。
- 偵測力（mutation test）：故意把 眉 門檻 3→2 → 立刻出現 145/800 不一致 → 證明測試抓得到差異。

## §B 關鍵設計要求：理由字串前置
`evaluateLeafPart` 回傳 `{ result, firedCards }`、`evaluateAggregate` 回 `{ result, hitChildren }`——
**命中的 combo 已保留**（不是只回布林），凍結存檔的理由字串（v0.6 §C）可直接由此產出，避免第 4 階段回頭改引擎介面。

## 過程中發現的 live 髒資料（給第 3 階段 rule1 清理）
- **dim2「頭」聚合 bug**：`COUNT(min=3, [頂骨.L, 頂骨.L, 枕骨, 華陽骨.L, 華陽骨.R])`——
  **`頂骨.L` 出現兩次、缺 `頂骨.R`**（左頂骨判到會被算兩次、右頂骨完全不算）。
  本階段 fixture **照原樣保留**（所以回歸 100% 相同）；rule1 乾淨版應改為 `頂骨.L + 頂骨.R`。
  → 屆時這格會出現「刻意的 diff」，正是 §15 說的「差異只來自刻意清掉的髒」。

## 已知範圍／caveat（誠實）
- 只做 2 維（dim0/dim2），非全 13 維——符合第 1 階段「先 1–2 維」。其餘維度結構同型（同一組運算子），可同法擴充。
- fixture 由轉譯器生成、非純手打——這樣同時證明「新文法可表達」且避免手打中文 match 字串的筆誤。轉譯器與 v2 引擎邏輯獨立、且以舊引擎為獨立 oracle，數百組隨機輸入下若有補償性錯誤極難同時成立；mutation test 另證偵測力。
- 大/小辣公式（§E）本階段未驗（admin2 階段才接 ratio）；只驗中辣＝舊 min。
