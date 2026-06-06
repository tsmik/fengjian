# P2 admin2 資料層（第 2 階段）

> 本資料夾＝P2（rbf2app）專用，與 P1 的根目錄 `firestore.rules` / `firebase.json` / `.firebaserc` **完全分開**。
> 本階段**只寫 rbf2app-staging（測試）**，未碰 rbf2app 正式、未碰 rbf1。

## 內容
| 檔 | 用途 |
|---|---|
| `firestore.rbf2.rules` | P2 Security Rules（v0.6 §D）。鎖登入＋角色；無 `if true`、無後門。 |
| `firebase.json` | 只給 P2 用的 deploy 設定（指向 `firestore.rbf2.rules`）。用 `--config p2/firebase.json` 部署。 |
| `seed/build_observations.mjs` | 撈草稿：P1 questions → observations（§A.1）。純讀 `p2_seed/`。 |
| `seed/observations.json` | 產出的觀察庫草稿（138 筆，可人工增刪）。 |
| `seed/paired_map.json` | paired 題清單（66 筆）。**不進 observation**，供第 3 階段推部位 lrMode。 |
| `seed/push_observations.mjs` | 把 observations.json 寫進 rbf2app-staging。 |

## 撈草稿轉換規則（§A.1）
- `q.text → label`；`q.opts[].v → options[]`；`q.opts[].hint → optionHints`（保留草稿不丟資料）。
- 保留 `sourceQid`（= 原 q.id，可追溯）。
- **paired 不進 observation**（改記在 `paired_map.json`）——左右是部位屬性（lrMode），屬 ruleSet 範疇。

## 已部署到 rbf2app-staging 的狀態
- **observations 集合：138 筆**（server count 已核對）。
- **Security Rules：`firestore.rbf2.rules`（嚴格版）已上線**。
- 驗證（positive control）：未登入讀 `observations` / `users/*` / 任意集合 → 全部 `permission-denied` ✅
  → 證明上線的是嚴格規則、不是 P1 的 `if true`。

## 重現方式
```bash
node p2/seed/build_observations.mjs                       # 重生 observations.json
# 部署規則（測試站）：
firebase deploy --only firestore:rules --project rbf2app-staging --config p2/firebase.json
# 灌觀察庫（需 firebase client SDK；嚴格規則下需先以 teacher/admin 登入或開 seed 視窗）：
node p2/seed/push_observations.mjs p2/seed/observations.json
```
> 註：本次 seed 採「暫時開 observations 寫入 → 灌 → 換回嚴格規則」的方式（測試站、空庫，視窗數秒）。
> 日後由 admin2 介面（teacher/admin 登入）寫入，不需開窗。

## 範圍／待第 3 階段
- 本階段只做 **observations ＋ Security Rules**。`ruleSets` / `config/active` / `spiceScript` 等留待第 3 階段（條件編輯器、rule1 乾淨版）一起建——屆時參考 `p2_seed/live_dirt_list.md` 清髒、用 `paired_map.json` 推 lrMode。
- 使用者管理（白名單 `allowedUsers`、role）規則已寫進 `firestore.rbf2.rules`，UI 待 admin2。
