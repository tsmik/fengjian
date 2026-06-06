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
node tests/engine_v2/translate.mjs    # 從 p2_seed live 規則重生全 13 維 fixture
node tests/engine_v2/regress.mjs      # 13 維回歸驗證，exit 0 = 全綠且非空泛
node tests/engine_v2/audit_dirt.mjs   # 掃 live 髒資料 → p2_seed/live_dirt_list.md
```

## 結果（全 13 維）
- 維度：**dim0–dim12 全部**，每維 16 部位（13 葉 + 3 聚合）。
- 辣度：**中辣 = rbf1 現有 `COUNT.min`**（§E 暫行值）。
- 比對 **19,500 次**（base / 左右不對稱 / 含未填 / 正向偏置 四種合成輸入）→ **逐格相同 19,500/19,500（100%）**，動靜＋係數全相符。
- **每維非空泛**：13 維逐維確認 A/B/null 皆有、動靜兩支皆出現（regress.mjs 內建 vacuous 檢查，空泛即 exit 1）。
- 偵測力（mutation test）：故意把 眉 門檻 3→2 → 立刻出現 145/800 不一致 → 測試抓得到差異。
- **0 筆 diff 不一致** → 代表轉譯器涵蓋了全部 live 運算子；live 髒並未造成新舊引擎分歧（兩邊對同一條髒規則的解讀一致），髒由獨立的 `audit_dirt.mjs` 另行揪出（見下）。

## 轉譯器為支援全 13 維新增的處理（不影響 dim0/2 的 100%）
- **`{rule:...}` 外殼**：dim9 的 8 個部位用 `{rule:<node>}` 包一層 → 解開。
- **`NOT` → 反向選項**（§4.5）：唯一出現在 dim7/眼 `NOT(ey3="眼圓")`，轉成 `ey3 ∈ (全選項 ∖ 眼圓)`。
  等價性：答案已填時 `!(ans∈X) ⇔ ans∈complement`；未填時兩邊都因部位前置檢查回 null。
- 全 13 維運算子封閉清單＝`COUNT / LR / AND / OR / NOT`（無 VETO、無 weight、葉無自帶 side）——
  **v2 引擎無需新增運算子**（NOT 在轉譯階段就化為一般 match 陣列），故既有 2 維 100% 不受影響。

## Live 髒資料（→ `p2_seed/live_dirt_list.md`）
`audit_dirt.mjs` 掃全 13 維，找到 **4 筆**客觀錯誤（非設計取捨）：
| 維/部位 | 類 | 內容 | rule1 建議 |
|---|---|---|---|
| dim2 / 頭 | 重複項＋左右不對稱 | 聚合引用 `頂骨.L` 兩次、缺 `頂骨.R` | 改 `頂骨.L + 頂骨.R` |
| dim3 / 上停 | 空殼門檻 | `COUNT min=3` 但只有 2 個計數單位 → **永遠非 positive**（3000 次全填驗證 positive=0） | 下修 min |
| dim12 / 頂骨 | 死選項(typo) | h1 match `…再接頭頂/杏門`，題庫是 `…囟門`（杏/囟 錯字）→ 該條永不命中 | 對齊為 `囟門` |
（第 1 階段先發現的 dim2 頭 bug 已收進此清單，不再散落。）

## §B 關鍵設計要求：理由字串前置
`evaluateLeafPart` 回傳 `{ result, firedCards }`、`evaluateAggregate` 回 `{ result, hitChildren }`——
**命中的 combo 已保留**（不是只回布林），凍結存檔的理由字串（v0.6 §C）可直接由此產出，避免第 4 階段回頭改引擎介面。

## 過程中發現的 live 髒資料（給第 3 階段 rule1 清理）
- **dim2「頭」聚合 bug**：`COUNT(min=3, [頂骨.L, 頂骨.L, 枕骨, 華陽骨.L, 華陽骨.R])`——
  **`頂骨.L` 出現兩次、缺 `頂骨.R`**（左頂骨判到會被算兩次、右頂骨完全不算）。
  本階段 fixture **照原樣保留**（所以回歸 100% 相同）；rule1 乾淨版應改為 `頂骨.L + 頂骨.R`。
  → 屆時這格會出現「刻意的 diff」，正是 §15 說的「差異只來自刻意清掉的髒」。

## 已知範圍／caveat（誠實）
- 全 13 維皆驗（中辣）。
- fixture 由轉譯器生成、非純手打——這樣同時證明「新文法可表達 live」且避免手打中文 match 字串的筆誤。轉譯器與 v2 引擎邏輯獨立、且以舊引擎為獨立 oracle，近兩萬組隨機輸入下若有補償性錯誤極難同時成立；mutation test 另證偵測力。
- 大/小辣公式（§E）本階段未驗（admin2 階段才接 ratio）；只驗中辣＝舊 min。
- 髒資料清單只列**客觀錯誤/死碼**（重複/壞門檻/死選項/引用錯誤），不含「門檻高低是否合理」這類設計取捨——後者屬辣度與老師標主輔的範疇。
