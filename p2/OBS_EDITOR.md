# 觀察庫編輯器（v0.7 §1）— 第一版

> 頁面：`p2/observations.html`（+ `p2/js/obs_editor.js` + `fb.js` + 三支 generated 資料）。
> 比照舊 admin「觀察問題」頁逐項重現；UI 用 /app 設計語言（Noto Serif TC、暖砂石、static 綠 `#7A9E7E`）。

## 怎麼開
```bash
python3 -m http.server 8124 --directory p2   # → http://localhost:8124/observations.html
```
（上線後：`https://rbf2app-staging.pages.dev/p2/observations`。）

## 層級（§2：section ＝一等公民）
**部位(11) → section → 題目 → 選項**。三欄：左＝部位、中＝section+題目、右＝題目編輯器。

## 已重現的操作（對照舊 admin，已用無頭瀏覽器逐項驗證）
- **section**：＋新增 / 改名(點標題) / 刪除(僅空 section，非空擋刪) / ▲▼排序。
- **題目**：＋題（**ID 自動生成**＝部位前綴+流水號，驗證得 br25）/ 改題目文字 / 左右題(paired)勾選 / **所屬 section 下拉搬移** / ▲▼ section 內排序 / 刪除。
- **選項**：＋選項（值＋提示）/ 改 / 刪 / ▲▼排序。
- **刪除保護（v0.6 §11 A）**：
  - 題目被任一維度引用 → 擋刪（toast：「被 N 維度引用…不可刪」）。驗證 br1（10 維）擋刪 ✓。
  - 選項值被規則 match 用到 → 擋刪。驗證 br1「眉長過目」擋刪 ✓。
  - 未被引用的新題 → 可刪 ✓。
- **被哪些維度引用標籤（§11 B）**：每題顯示引用它的維度名清單＋「N維」綠徽章；編輯時顯示影響提醒。
- **dirty 追蹤**：標題列顯示「未存變更 N 筆＋版面」。

## 資料寫哪（你選的：直接寫 rbf2app-staging）
- 內容 → `observations/{obsId}`（含新 `paired` 欄，見下）。
- **順序/分組 → `config/questionsLayout`**（`{部位:[{label,qIds:[]}]}`，§2 要的「section 順序」正式保存於此，不靠集合隨機序）。
- 登入(admin/teacher)後自動讀 staging 真資料；未登入＝離線預覽(打包 138 筆)、可編不可存。
- 「儲存到 staging」用 batch 一次寫（dirty 題 + 刪除 + layout），角色不足會擋並顯示你的 UID。

## 兩個要你知道的設計決定
1. **`paired` 收回 observation**：第 2 階段曾把 paired 移到 `paired_map.json`，但「這題是否分左右收集」其實是**觀察題自身屬性**（≠ 規則的 lrMode）。題庫編輯器要能編它，故 `paired` 收回每筆 observation；載入時若舊資料無此欄，用 `paired_map` 帶預設（66 筆）。規則層的 lrMode 仍是部位屬性，兩者不衝突。
2. **引用來源＝目前的 live 規則**（`p2_seed` 那份，生成 `ref_dims.js`）。等第 3 階段用 admin2 編出 rule1 後，引用反查應改成讀 ruleSets——屆時換資料來源即可，介面不變。

## 重生 generated 資料
```bash
node p2/js/_gen_obs_meta.mjs   # questions_layout.js + ref_dims.js
```

## 待你並排驗收（v0.7 §3）
請拿舊 admin 觀察問題頁與此頁並排，確認操作細節沒漏（特別是：section 改名是否更新到題、搬移後順序、ID 規則、刪除保護訊息）。發現漏的我補。

## 還沒做（留待後續）
- 與條件編輯器合併成單一 admin2 分頁殼（§5.5 UI 對齊時做；目前是獨立頁）。
- 引用來源切到 ruleSets（待 rule1 編出後）。
- 拖拉搬移題目（目前用 ▲▼ + 下拉；舊 admin 也是按鈕式）。
