# 舊 admin（admin.html）功能盤點 vs admin2 現況

> 唯讀盤點，不含去留建議（那是 Mike 要決定的）。來源：`admin.html`（2333 行，自包含 inline app，
> 用 Firebase compat SDK）＋ `rules/all_questions.js`（題庫靜態 seed）。對照對象：P2 的 `p2/admin2.html`。
> 狀態欄：✅有對應 / ⚠️部分 / ❌沒有。

## 一頁摘要

舊 admin ＝ **4 個分頁 + 1 個發布機制 + 一些 UX**，全部寫 `settings/*` 單一文件（JSON 字串）。

| # | 舊 admin 功能區 | 編什麼 | 存到 Firestore | admin2 現況 |
|---|---|---|---|---|
| 1 | **評分規則** | 13 維巢狀規則樹 | `settings/rules`.rulesJson | ⚠️ 部分（admin2 改編「新格式 DNF」，非舊樹） |
| 2 | **觀察問題** | 題目/選項/分組(section) | `settings/questions`.questionsJson | ❌ 沒有（admin2 只「讀」observations 當引用，無題庫編輯器） |
| 3 | **流年表** | 男/女 1-99 歲流年 | `settings/liunian`.liunianJson | ❌ 沒有 |
| 4 | **板書文字（講義）** | 每維度一段講義 | `settings/board`.boardJson | ❌ 沒有 |
| 5 | **發布到正式** | staging→prod 複製＋紅點 | Cloud Function `publishToProduction` + `settings/updateLog` | ❌ 沒有（P2 改用 ruleSets+config/active 版本制，待第 5 階段） |
| — | Export 維度為 Markdown / Undo-Redo / dirty 追蹤 / 快捷鍵 | UX | — | ⚠️ 部分（admin2 有匯出 JSON、localStorage 自動存；無 undo/redo） |
| — | 登入：`ADMIN_UIDS` 寫死兩個 UID | 權限 | （前端硬比對） | ⚠️ 不同（admin2 用 `users/{uid}.role` 角色制） |

> admin2 **多出**舊 admin 沒有的東西：辣度(主/輔/門檻)、目標極、聚合部位編輯、套裝(ruleSets)概念——這些是 P2 新文法。

---

## 逐項細節

### 1. 評分規則（Rules Editor）→ `settings/rules`.rulesJson
- 舊：編 13 維巢狀樹，運算子 `AND/OR/COUNT/NOT/LR/VETO/partResult/group`；含 `weight`、`veto`、`敘述分組(group:{label,items})`、左右 `LR(merge:all/any)`。可 Export 維度為 .md、undo/redo。
- admin2：**改編「新格式 DNF」**（卡片→combo→葉、主/輔、目標極、左右模式、聚合部位）。是 P2 刻意的換文法，不是 1:1。
  - **舊有、新文法故意不收**（v0.6 §4.5 除名）：`VETO`、`weight`、深層巢狀、`LR 當節點`(改部位屬性)、`NOT 當節點`(改反向選項)。
  - **「敘述分組」(group label)**：舊 admin 可把條件包進有標題的分組（純顯示/敘述用）。admin2 目前只有卡片的 `note`（從 live group 帶過來），**沒有**第一級的敘述分組編輯 UI。→ ⚠️ 部分。

### 2. 觀察問題（Questions Editor）→ `settings/questions`.questionsJson ❗最大缺口
- 舊 admin 能做：新增/編輯/刪除**題目**、新增/編輯/刪除**選項**(v/hint)、**section 分組**的建立/改名/刪除、題目在 section 間搬移、ID 自動生成(前綴)、**刪除保護**(被規則引用的題不給刪)、顯示「這題被哪些維度引用」標籤。
- admin2：**沒有題庫編輯器**。只把 138 筆 `observations` 當「卡片引用來源」**唯讀**使用。
  - v0.6 §11.2 把「觀察庫 新增/編輯（含保護 A+B）」列為 admin2 該有的功能 → **尚未蓋**。這是目前最明顯的缺口。

### 3. 流年表（Liunian）→ `settings/liunian`.liunianJson
- 舊：`{男:[{age,mark,name75,area75,jiuzhi,yewu,qinzu,zinv,erbei,wuguan,santing}×99+], 女:[…]}`，男女切換、關/隘標記、預設值 diff、重置。
- admin2：**沒有**。（前台「虛歲流年」仍會用到流年資料 → 之後需決定 P2 怎麼供應。）

### 4. 板書文字／講義（Board）→ `settings/board`.boardJson
- 舊：`{維度名: 多行講義文字}`，13 個 textarea、依維度上色、dirty 追蹤。
- admin2：**沒有**。（注意 v0.6 §C 凍結存檔會「拍下當時講義」`boardTextSnapshot`，但「編講義」這件事 admin2 沒有。）

### 5. 發布到正式 + 更新紀錄
- 舊：staging 限定 `doPublish()` → 打 Cloud Function `publishToProduction`（POST 到 `…cloudfunctions.net/publishToProduction`），把 rules/questions/board 複製到正式；含 dry-run；並算 diff 寫 `settings/updateLog`（`part_*`/`dim_*`/`q_*` 時間戳）給學員端紅點通知。
- admin2：**沒有**。P2 改用「套裝(ruleSets) + `config/active` 設為上線 + 一鍵回滾」（v0.6 §6/§11.1），**待第 5 階段**。`updateLog` 紅點通知 P2 目前無對應。

### 6. 權限模型
- 舊：`ADMIN_UIDS = ['XT1Err9…(prod)','ARGLfFp3…(staging)']` 前端寫死兩個 UID，二元 admin/非 admin。
- admin2：用 `users/{uid}.role`（admin/teacher/…）角色制（更通用）。→ 不同實作，概念上「限管理員」兩邊都有。

### 7. 沒有的（兩邊都沒有，記錄一下）
- 使用者/白名單(`allowedUsers`)管理：舊 admin **也沒有**（§11.6 列為 admin2 待做，尚未蓋）。
- 徽章、照片訓練、AI 分析設定：舊 admin 沒有（在別的頁/檔）。

---

## ❗ 你點名的兩件事

### Q1. 觀察題目（settings/questions）完整結構
兩層分組：**部位(11) → section(分組) → 題目 → 選項**。欄位名：
```
{
  "<部位名>": {                         // 頭/額/耳/眉/眼/鼻/顴/口/人中/地閣/頤（11 個）
    "total": 16,                        // 該部位題數
    "sections": [                       // ← 「分組」就是這層
      {
        "label": "頂骨",                 // 分組名（頭→頂骨/枕骨/華陽骨；眉→眉型/眉勢/眉位/眉質/一致性/眉骨…）
        "qs": [
          {
            "id": "h1",                  // 唯一 id（前綴+號）
            "text": "頂骨龜背/圓/平/凹凸",
            "paired": true,              // 是否左右題
            "opts": [ {"v":"龜背","hint":"…"}, {"v":"圓","hint":"…"}, … ]   // 字串或 {v,hint}
          }
        ]
      }
    ]
  }
}
```
- 「分組」＝ `sections[].label`（**沒有**更深的群組；沒有「組別 id」，只有 label 字串＋陣列順序）。
- 舊 admin 對這層分組可：建立/改名/刪除 section、把題目在 section 間搬移。

### Q2. 撈草稿進 observations 時，分組有沒有被帶過來？→ **有，但是攤平成標籤**
盤點 `p2/seed/observations.json`（138 筆）確認：
- ✅ **每筆都帶 `part`（部位）和 `section`（分組 label）**。section 分組**完整保留**，例如：
  - 眉 → 眉型 / 眉勢 / 眉位 / 眉質 / 一致性 / 眉骨
  - 顴 → 顴形 / 顴骨肉 / 顴柄 / 顴整體
- ✅ `optionHints`（選項提示）也保留；`sourceQid` 保留可追溯。
- ⚠️ 但有幾點要知道：
  1. 分組是**攤平成每筆 obs 上的 `section` 字串**，不是一個有 id/順序的群組物件。**section 的排列順序**和每部位 `total` 沒另存（可從資料推回）。
  2. `paired` 依規矩**沒進 obs**（移到 `p2/seed/paired_map.json`）。
  3. **admin2 目前沒有用到/顯示 `section` 分組**（題庫編輯器還沒蓋）——資訊在資料裡，但介面還沒呈現/管理它。
- 結論：**分組沒有遺失**，撈草稿時就帶過來了；要做的是日後 admin2 的「觀察庫編輯器」把 `section` 拿來分組顯示/管理（對應上面缺口 #2）。

---

## admin2 缺口清單（純列，不含去留）
1. **觀察庫編輯器**（題目/選項/section 分組 的增刪改、刪除保護、被引用維度標籤）— §11.2，未蓋。
2. **講義/board 編輯器** — 未蓋。
3. **流年表編輯器** — 未蓋。
4. **發布/版本上線**（套裝設為 active、回滾）＋更新紀錄紅點 — §11.1，待第 5 階段。
5. **敘述分組(group)** 在條件編輯器裡的第一級編輯 — 目前只存成卡片 note。
6. **使用者/白名單管理** — §11.6，未蓋（舊 admin 也沒有）。
7. UX：undo/redo、Export 為 Markdown — 未蓋（admin2 有匯出 JSON）。
