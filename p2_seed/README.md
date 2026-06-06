# p2_seed — rbf1 live settings 匯出（第 1 階段唯一真相來源）

> 第 0 階段步驟 0 產出。**這是第 1 階段引擎 fixture 與「撈草稿」的唯一真相來源。**
> ⚠️ repo 內的 `all_rules.json`（若有）**已過時，禁止使用**。一律用本資料夾的檔。

## 檔案
| 檔 | 內容 |
|---|---|
| `rbf1_settings_rules.json` | `settings/rules` 的 `rulesJson` 解析後（13 維度陣列，每維 `parts`） |
| `rbf1_settings_rules.meta.json` | 來源時間戳/發布者 |
| `rbf1_settings_questions.json` | `settings/questions` 的 `questionsJson` 解析後（11 部位題庫） |
| `rbf1_settings_questions.meta.json` | 來源時間戳/發布者 |

## 來源與方法
- 來源專案：**`renxiangbingfa`（rbf1 正式站）**。
- 匯出時間（doc `updatedAt`）：**2026-05-25T02:03:46Z**，`publishedFrom: staging`。
- 方法：用 rbf1 公開 web config（`apiKey` 為公開值）＋ firebase 客戶端 SDK 走 `settings` 的 `read: if true` 路徑讀取。
- **純讀取**：客戶端 SDK 無寫入權（rules 寫入限 admin），全程只 `getDoc`，**未對 rbf1 做任何寫入/修改**。

## 即時觀察到的格式重點（給第 1 階段參考，非本階段工作）
- `rules` 是 **13 元素陣列**；維度物件用的 key **不是** v0.6 §A.2 假設的 `dimName`（live 無此欄）→ 第 1 階段寫 v2 引擎/轉檔時，以本檔實際欄位為準。
- dim[0] 的 `parts` 有 **16 個**（含 `頂骨/枕骨/華陽骨` 等聚合子部位），符合 v0.6 §A.2「聚合部位」模型。
- `questions` 11 部位：頭 額 耳 眉 眼 鼻 顴 口 人中 地閣 頤。

## 重新匯出方式（若日後 rbf1 規則有更新）
暫存腳本在 `/tmp/rbf_export/read.mjs`（未進 repo）。需要時可重跑；或請工程協助。
