# 第 0 階段 — 需要人在 Console 做的部分（Claude Code 做不了的）

> 📍 **進度更新（2026-06-06）**：專案已建立、web app config 已抓好並填進 `js/m_main.js`。
> - 實際專案 ID：**`rbf2app`（正式）/ `rbf2app-staging`（測試）**（原定 `rbf2` 因 GCP 要求 ID ≥6 字而改名）。
> - 下面步驟 1a/1b/1c **已由 CLI 完成**，可略過。
> - **你現在只需做**：步驟 1d（開 Google 登入）、1e（建 Firestore）——已整理成更白話的
>   **`p2_seed/我要在後台點的步驟.md`**，照那份點即可。步驟 3（Cloudflare）之後再做。
> - 以下保留原始技術版供參考。



> Claude Code 已自動完成：① 開 `p2-staging` 分支 ② 唯讀匯出 rbf1 settings 到 `p2_seed/`
> ③ `js/m_main.js` 加好 rbf2 環境切換（config 先放 PLACEHOLDER）。
>
> **以下三件必須由有 Google/Cloudflare 帳號權限的人操作**，因為：
> - 建 Firebase 專案、開 Google 登入、設授權網域 → **只能在 Firebase Console 點**（CLI 無法開 Auth 供應商）。
> - 部署 Cloudflare Pages → 這台機器**沒裝 wrangler、Cloudflare 未登入**，且 Pages 一般走 Console 接 GitHub。
>
> 做完這三件、把 config 填回，第 0 階段就完成、可進第 1 階段（引擎）。

---

## 步驟 1 — 建 rbf2 / rbf2-staging 兩個 Firebase 專案

### 1a. 建專案（二選一）
**A. 用 CLI（較快，需此機已登入的 firebase 帳號有額度）**
```bash
firebase projects:create rbf2 --display-name "RBF2"
firebase projects:create rbf2-staging --display-name "RBF2 Staging"
```
> ⚠️ 專案 ID 全球唯一。若 `rbf2` 已被別人佔走，CLI 會報錯——這時請改在 Console 用一個你決定的 ID（並回報新 ID，我把 `m_main.js` 的 projectId 一起改）。

**B. 用 Console（點選式）**
https://console.firebase.google.com → 「新增專案」→ 取 ID `rbf2`、再做一次 `rbf2-staging`。

### 1b. 每個專案各建一個 Web App，拿 config
```bash
firebase apps:create web "rbf2-web" --project rbf2
firebase apps:sdkconfig web --project rbf2          # ← 印出 firebaseConfig
firebase apps:create web "rbf2-staging-web" --project rbf2-staging
firebase apps:sdkconfig web --project rbf2-staging  # ← 印出 firebaseConfig
```

### 1c. 把 config 填回 `js/m_main.js`（取代 PLACEHOLDER）
- 把 `rbf2` 那串輸出整段貼進 `RBF2_PROD_CONFIG`。
- 把 `rbf2-staging` 那串貼進 `RBF2_STAGING_CONFIG`。
- 兩個物件目前都是 `FILL_AFTER_..._CREATED` 佔位字，全部換成真值即可。
> 填完可叫我幫你核對格式、或我直接幫你貼。

### 1d. 開 Google 登入 + 授權網域（**Console only，CLI 做不到**）
每個專案各做一次：
- Firebase Console → 該專案 → **Authentication → Sign-in method → 啟用 Google**。
- **Authentication → Settings → Authorized domains** 加入之後 Cloudflare 的網域：
  `rbf2.pages.dev`、`rbf2-staging.pages.dev`（自訂網域也要加）。
> iOS 提醒（v0.5 §16-4）：手機 Google 登入用 `signInWithPopup`，別用 redirect。

### 1e. 建 Firestore 資料庫
每個專案：Console → **Firestore Database → 建立資料庫**（正式模式、地區選 asia-east1 或就近）。
> P2 安全規則（v0.6 §D）這階段先不套也行；空資料測登入即可。第 2 階段再寫 `firestore.rules`。

---

## 步驟 3 — 部署 /app /m 到 rbf2-staging（Cloudflare Pages）

> 這台機器沒裝 wrangler、未登入 Cloudflare，所以由你在 Cloudflare 後台接 GitHub 最穩。

1. Cloudflare Dashboard → **Workers & Pages → Create → Pages → Connect to Git**。
2. 選 repo `tsmik/fengjian`，分支選 **`p2-staging`**。
3. Build 設定：這是純靜態站，**無 build 指令**，輸出目錄＝repo 根目錄（與現有 fengjian Pages 設法一致）。
4. 專案命名讓網址變成 **`rbf2-staging.pages.dev`**（要跟 `m_main.js` 的 hostname 判斷一致；不一致就告訴我實際網址，我改判斷式）。
5. 部署完開 `https://rbf2-staging.pages.dev/app` 與 `/m`：
   - 開瀏覽器 console 應看到 `Using RBF2-STAGING config`。
   - 用 Google 登入應成功（資料是空的，正常）。

---

## 做完請回報這幾項，我接著進第 1 階段
- [ ] rbf2 / rbf2-staging 是否成功用到 ID `rbf2`/`rbf2-staging`（若被佔走，回報實際 ID）。
- [ ] 兩組 firebaseConfig 是否已填回 `m_main.js`（或貼給我幫填）。
- [ ] Google 登入已啟用、授權網域已加。
- [ ] `rbf2-staging.pages.dev` 能登入、跑起來。

> 全部 OK 後說一聲「第 0 階段完成」，我就開始第 1 階段：並排寫 `rule_engine_v2.js` ＋ 拿 `p2_seed/` 的 live 規則做回歸驗證。
