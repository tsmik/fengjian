# admin2 條件編輯器（第 3 階段：只蓋 UI）

> 本階段**只做編輯器 UI**，不預編 rule1 內容、不預標主/輔（role 預設「未標」）。
> 檔案：`p2/admin2.html` + `p2/js/admin2.js` + `p2/js/dims_meta.js` + `p2/js/observations_data.js`。

## 怎麼開來看
編輯器是純前端，需用 http 開（ES module）：
```bash
python3 -m http.server 8123 --directory p2
# 瀏覽器開 http://localhost:8123/admin2.html
```
（之後接 Cloudflare 部署到 rbf2app-staging.pages.dev 就能線上開。）
已用無頭瀏覽器驗證：13 維 / 16 部位 / 138 observations 正常載入，葉＋聚合編輯、辣度骨架皆運作，序列化形狀符合 v0.6 §A.2。

## 能做哪些操作
- **左欄**：13 維度（顯示動靜極性）。
- **第二欄**：該維 16 部位（13 葉 + 3 聚合），● 代表已有內容。
- **葉部位編輯器**（§4.2）：
  - 設**目標極**（動/靜）、**左右模式**（都要/任一/不分）。
  - **卡片**：＋新增卡片、▲▼ 排序、✕ 刪除、標記下拉（**未標/主/輔**，預設未標）。
  - 卡內可多 **combo（或）**；combo 內多葉＝**而且**。
  - **觀察葉**：從右欄 observations **拖** 進 combo（或點 combo 設為 ◉ 目標後點清單加入＝清單為輔）；每葉勾「哪些選項算符合」（藍色＝已勾）。
- **聚合部位編輯器**（頭/中停/下停，§4.3）：勾子部位（paired 子部位可選 L/R）＋設**固定門檻**。
- **辣度劇本骨架**（§E，右下）：大/中/小辣三格 ratio 欄位（**先留空**待填）；**取整機制＝B**（輔門檻可低到 0）。
- **存檔**：
  - **匯出 JSON**：產出 v0.6 §A.2 形狀的套裝（可下載）。
  - **自動草稿**：每次編輯自動存 localStorage（重開不丟）。
  - **存到 staging**：登入 Google 且角色 admin/teacher → 寫進 rbf2app-staging 的 `ruleSets/{id}` + `dims/{i}`（+ `config/spiceScript_draft`）。

## 明確沒做（照指示）
- 沒編任何 rule1 規則內容、沒標任何主/輔。
- 沒寫任何實際 `ruleSets` 資料到 staging（編輯器有能力寫，但本階段不灌內容）。

## 序列化形狀（符合 §A.2）
```json
{ "ruleSet": { "id","name","note","basedOn":null,"status":"draft","createdAt" },
  "spice": { "levels":["大辣","中辣","小辣"], "rounding":"B", "ratios":{"大辣":"","中辣":"","小辣":""} },
  "dims": { "0": { "dimIndex":0,"dimName":"形勢","positiveType":"靜","negativeType":"動",
    "parts": {
      "眉": { "kind":"leaf","targetPole":"靜","lrMode":"both",
              "cards":[ {"id":"…","role":null,"combos":[ [ {"ref":"br1","match":["眉長過目"]} ] ]} ] },
      "頭": { "kind":"aggregate","targetPole":null,"threshold":2,
              "children":[ {"part":"頂骨","side":"L"} ] }
    } } } }
```
- `role:null`＝未標（主/輔留給老師）。`auxThreshold` 不存在 part 上——輔門檻由辣度 `round(ratio×輔卡數)` 算（§E）。

## ⚠️ 發現一個 §D 安全模型的洞（要你知道，需日後修）
§D 的 `users/{uid}` 規則是「本人可讀寫整包」，但 **`role` 也存在這份文件裡** → 任何登入者可以**自己把自己 role 改成 admin**（自我升權），就能寫 ruleSets。
- **測試階段**：這反而方便你 bootstrap——登入後把自己 `users/<uid>.role` 設成 `admin` 即可（UID 會顯示在「存到 staging」的提示框；或在 Firestore console 手動加 `role:"admin"`）。
- **上正式前必須修**：role 不可由本人自行寫入。建議用 **Firebase custom claims**，或把 role 改存在**只有 admin 可寫**的集合（如 `roles/{uid}`），`users/{uid}` 不放 role。這是 v0.6 §D 要補的一條，留待之後處理（不擋本階段）。

## 待後續階段
- 用此編輯器實際編 **rule1 乾淨版**（第 3 階段內容工作；參考 `p2_seed/live_dirt_list.md` 清髒、`p2/seed/paired_map.json` 推 lrMode）。
- 拖拉排序卡片（目前用 ▲▼；拖拉加葉已支援）、`config/active`、套裝管理 CRUD/回滾（admin2 後續）。
- 重生靜態資料：`node p2/js/_gen_meta.mjs`。
