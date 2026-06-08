# Handoff — 使用者/白名單分頁 v2（擴充欄位）

給接手的新 session。目標：把 admin2 的「使用者」分頁從「白名單＋角色」擴充成完整的學員資料卡。

## 現況（已完成 v1）
- 分頁檔：`p2/users.html` + `p2/js/users_admin.js`，掛在外殼 `p2/index.html` 的 `使用者` tab（`f-users`）。
- 資料：`allowedUsers/{email}` = `{ email, role, addedAt }`，存 **rbf2app-staging**。
- 規則：`allowedUsers` → 登入者可讀、**admin 可寫**（`p2/firestore.rbf2.rules` 已部署，免改）。
- v1 已能：登入後列出全部白名單、新增(email+角色)、即時改角色、移除；非 admin 唯讀；顯示自己 email/uid/role。
- 共用登入：`p2/js/fb.js`（exports: fbOK, onUser, login, logout, db, doc, getDoc, setDoc, deleteDoc, collection, getDocs, writeBatch）。

## v2 要做
### 1. 每筆 user 擴充欄位（existing 與新增都可編）
`allowedUsers/{email}` 加：
- `name`（姓名，文字）
- `period`（上課期間，文字；例「2026 春季」或自由文字）
- `note`（備註，文字，可多行）
- `photo`（大頭照縮圖，base64 字串；見下）
（保留 `email` / `role` / `addedAt`，新增 `updatedAt`。）

把每筆做成「卡片」可展開編輯（比照套裝分頁 inline 編輯的手感）：姓名為標題、角色 badge、上課期間、備註、照片縮圖；admin 可改，存用 `setDoc(..., {merge:true})`。

### 2. 照片欄位（推薦：縮圖存 Firestore，不開 Storage）
- `<input type="file" accept="image/*">` → 讀成 Image → 畫到 canvas 縮到最長邊 ≤ 200px → `canvas.toDataURL('image/jpeg', 0.7)` 得 base64（約 20–40KB，遠低於 Firestore 1MB 單文件上限）。
- 存進 `allowedUsers/{email}.photo`；顯示用 `<img src="<base64>">`。
- 加「移除照片」。註：若日後要高解析原圖再改用 Firebase Storage（需在 console 開 Storage＋部署 storage rules）。

### 3.（可選，問 Mike）匯入 P1 既有白名單
P2 是獨立新專案，白名單目前空的。Mike 可能想把 P1（renxiangbingfa）既有 `allowedUsers` 帶過來。
- P1 既有資料可用 Firestore REST 讀（參考 settings.local.json 既有 curl 範例的 renxiangbingfa key），或請 Mike 在 console 匯出。
- 確認 P1 的 allowedUsers 欄位形狀後，寫一支一次性匯入（admin 登入後 batch setDoc 到 rbf2app-staging）。**先問 Mike 要不要、以及 P1 既有欄位有哪些**。

## 紀律（務必遵守）
- 只動 `p2/` 檔；用明確 `git add p2/...`；分支 `p2-staging`；P1 `main`(a18ac84) 不可動；不要碰 root `firestore.rules`（Mike 平行 session 在處理）。
- 每個 patch：路徑、retest、四道鎖、一鍵複製（Mike 無程式背景）。
- 驗證：用 Claude_Preview（臨時加 `.claude/launch.json` 一個 python http.server 指 `p2/`，測完還原 launch.json）。離線可驗版面/結構/無 console error；實際讀寫白名單要 admin 登入（Mike 的 UID 已是 admin）。

## 角色實際生效（背景知識，本分頁不處理）
現行規則 `users/{uid}` 只能本人讀寫 → admin 無法改別人「實際生效角色」。白名單的 role 目前是名單標記；要真正生效需在登入流程把 `allowedUsers.role` 帶進 `users/{uid}`（＋小改規則），排在「接報告頁/部署」階段，不在本分頁範圍。
