# 把 P2 部署到 rbf2app-staging.pages.dev（你在 Cloudflare 後台點）

> Claude Code 無法代做：這台沒裝 wrangler、也沒有 Cloudflare 登入/API token，而 `wrangler login`
> 需要瀏覽器互動。所以這步跟「建 Firebase 專案」一樣，要你在 Cloudflare 後台點。
> 好消息：**現有的 `fengjian` Pages 專案已經在部署這個 repo（含 functions/）且正常運作**，
> 所以 P2 只要「比照 fengjian 的設定，改接 `p2-staging` 分支、命名 rbf2app-staging」即可，不必處理 functions/。

## 步驟（GitHub 自動部署，最可靠）
1. 進 Cloudflare Dashboard → **Workers & Pages → Create → Pages → Connect to Git**。
2. 選 repo **`tsmik/fengjian`**。
3. **Project name 填 `rbf2app-staging`**（很重要：網址要剛好是 `rbf2app-staging.pages.dev`，程式才會自動連到對的 Firebase）。
4. **Production branch 選 `p2-staging`**。
5. Build 設定（**比照現有 fengjian 專案**；本 repo 是純靜態、無 build）：
   - Framework preset: **None**
   - Build command: **留空**
   - Build output directory: **`/`**（跟 fengjian 一樣）
   > 若 fengjian 專案的設定與上面不同，**以 fengjian 的為準**照抄一份——它已證明能跑這個 repo。
6. 按 **Save and Deploy**，等綠燈。

## 部署後，這些網址可開
- 編輯器（你主要要的）：**https://rbf2app-staging.pages.dev/p2/admin2**
- P2 前台桌機：**https://rbf2app-staging.pages.dev/app**
- P2 前台手機：**https://rbf2app-staging.pages.dev/m**
> 註：`/app`、`/m` 會載入、能 Google 登入，但**還沒接新引擎、rbf2app-staging 也還沒有規則資料**，
> 所以報告類功能是空的——那是第 4 階段（換引擎）的事。本次重點是 **admin2 能線上開**。

## 確認部署成功
開 `/p2/admin2` 應看到：左欄 13 維、右欄一堆 observations、標題「admin2 條件編輯器」。
（授權網域 `rbf2app-staging.pages.dev` 你第 0 階段已加，所以 Google 登入可用。）

---

## 你怎麼把自己設成 admin（才能「存到 staging」）
1. 開 `https://rbf2app-staging.pages.dev/p2/admin2` → 按 **Google 登入**，用你的 Google 帳號登入。
2. 看你的 **UID**：兩種方式
   - 在編輯器點「**存到 staging**」，跳出的提示框會寫「你的 UID：xxxx」；或
   - Firebase Console → `rbf2app-staging` → **Authentication → Users**，登入後那一列就是你的 UID。
3. 設 role：Firebase Console → `rbf2app-staging` →
   **Firestore Database → 資料**（https://console.firebase.google.com/project/rbf2app-staging/firestore/data）
   → 建集合 **`users`** → 文件 ID 填你的 **UID** → 加一個欄位 **`role`**（字串）＝ **`admin`** → 儲存。
4. 回 `/p2/admin2` 重新整理（登入狀態還在）→ 右上角應顯示「角色：admin」→ 這時「存到 staging」就能寫進 `ruleSets`。

> ⚠️ 安全提醒（已記在 `p2/ADMIN2.md`）：目前 §D 規則讓使用者能寫自己的 `users/{uid}`（含 role），
> 等於可自我升權。**測試方便**就是靠這點；**上正式前要修**（改用 custom claims 或 admin-only 集合）。

---

## 想讓我直接幫你部署（替代方案）
如果你想跳過後台、讓我用指令部署：在 Cloudflare 建一個 **API Token**（範本「Edit Cloudflare Workers」或自訂含 `Pages:Edit`），把 token＋account id 給我，我就 `wrangler pages deploy` 上去（只部署 rbf2app-staging）。不過 GitHub 自動部署通常更省事、之後每次 push 自動更新。
