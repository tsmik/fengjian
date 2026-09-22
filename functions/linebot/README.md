# 戲劇演出通告 LINE Bot

把通告轉貼、記錄、履歷整理、請款查詢從 claude.ai 專案對話搬到 LINE。

進入點是 `functions/index.js` 的 `exports.lineWebhook`，其餘實作都在這個目錄。

---

## 目前做到哪

| 規劃書功能 | 狀態 |
|---|---|
| Phase 1 — webhook（簽章、白名單、去重） | ✅ |
| Phase 1 — 整理文字履歷 | ✅ |
| Phase 1 — 請款清單查詢 | ✅ |
| Phase 2 — 通告轉貼（解析 → 預覽 → 確認 → 新增） | ✅ |
| Phase 2 — 記錄／更新請款（找到通告 → 預覽 → 確認 → 更新） | ✅ |
| Phase 2 — 欄位缺漏時追問、pending 狀態存 Firestore | ✅ |
| Phase 3 — 失敗重試 | 部分（Notion 429/5xx 會重試；Claude 用 SDK 內建重試） |
| Phase 3 — 操作日誌、「復原上一筆」 | ❌ 未做 |
| 照片分類／EXIF／代表照／PDF 履歷 | ❌ 不在範圍（留在 claude.ai 專案） |

---

## 指令

| 輸入 | 結果 |
|---|---|
| `履歷` / `演出經歷` / `作品` | 對外顯示的演出經歷，四區塊格式，可直接轉貼 |
| `請款清單` / `未結` / `待請款` | 對帳狀態 = 未結，含筆數與金額小計 |
| `已請款` / `待入帳` | 對帳狀態 = 已請款，含請款日 |
| `對帳` | 上面兩塊一起 |
| 前面加 `家珍` / `自接` / `習得Frank` | 只看該來源，例如 `家珍請款清單` |
| `說明` / `help` | 指令一覽 |
| 直接貼通告原文 | 解析成一筆通告 → 預覽 → 回「好」才寫入 |
| `豆腐媽媽 簽單交回了` | 找到那筆 → 預覽「舊值 → 新值」→ 回「好」才更新 |
| `這幾筆請款了：A、B、C` | 一次提議更新多筆 |
| `好` / `確認` / `ok` | 執行待確認的操作 |
| `取消` / `不要` | 作廢待確認的操作 |

預覽超過 20 分鐘沒確認就自動作廢，重貼一次即可。

---

## 設定步驟

### 1. Notion integration

1. <https://www.notion.so/my-integrations> → New integration（internal）→ 複製 token（`ntn_...`）
2. **回到「通告總表」頁面 → ⋯ → Connections → 加入剛建立的 integration**
   沒做這步的話 API 一律回 404，而且錯誤訊息不會告訴你是權限問題。

資料庫 ID 已經寫死在 `functions/index.js`：

```
data source ID：9c4165a0-b198-42e1-8389-3578a8b76f10
```

注意這是 **data source ID**，不是 database（page）ID `bca35263-...`。
Notion API 2025-09-03 之後查詢和新增頁面都吃 data source ID，兩個混用會 404。

### 2. LINE Official Account

1. <https://developers.line.biz/console/> → 建 Provider → 建 Messaging API channel
2. Basic settings → 複製 **Channel secret**
3. Messaging API → 發行 **Channel access token（long-lived）**
4. Messaging API → 關掉「自動回應訊息」和「歡迎訊息」，開啟 **Use webhook**

### 3. 找出自己的 LINE userId

Bot 是公開帳號，任何人加好友都能傳訊息進來，所以一定要設白名單。

先只設 secret 之外的部分把函式部署上去，加 Bot 好友後隨便傳一句話，
到 Cloud Functions log 找 `linebot: 略過白名單外的來源`，裡面的 `userId`（`U` 開頭）就是。
把它設進 `LINE_ALLOWED_USER_IDS` 再部署一次。

多個人用逗號或空白隔開。

### 4. 設 secrets

```bash
firebase functions:secrets:set LINE_CHANNEL_SECRET
firebase functions:secrets:set LINE_CHANNEL_ACCESS_TOKEN
firebase functions:secrets:set LINE_ALLOWED_USER_IDS   # U 開頭，多個用逗號隔開
firebase functions:secrets:set NOTION_TOKEN
# CLAUDE_API_KEY 是既有的 secret（claudeVision / claudeAnalysis 也在用），沿用就好
```

機密一律走 Secret Manager，不要進 repo。

### 5. 部署並掛上 webhook

```bash
cd functions && npm install
firebase deploy --only functions:lineWebhook,firestore:rules
```

把部署後的網址（`https://linewebhook-xxxx.a.run.app`）填到
LINE Console → Messaging API → Webhook URL，按 **Verify** 應該回 Success。

### 6. Firestore TTL（選用）

Bot 用兩個集合存內部狀態：

- `linebotEvents` — webhook 去重紀錄，`expiresAt` 為 24 小時後
- `linebotPending` — 待確認的操作，`expiresAt` 為 20 分鐘後

程式讀取時會自己判斷過期，所以不設 TTL 也不會出錯，只是文件會一直累積。
要自動清的話，在 Firestore Console 對這兩個集合的 `expiresAt` 欄位各設一條 TTL policy。

---

## 設計筆記

**Claude 只解析，程式負責寫入。** `agent.js` 給模型四個工具，其中只有
`search_notices` 會真的執行；`create_notice` / `update_notices` 被攔下來當成「提案」，
欄位先過 `schema.js` 的 `validateFields()`，select 值不在 Notion 選項裡就直接退回。
模型寫出「已請款了啦」這種值不會進到資料庫。

**履歷和請款清單不經過模型。** 排版是確定性規則（`resume.js`、`billing.js`），
程式直接排，同樣的資料永遠排出同樣的結果。

**年份推定在程式端。** 模型只要交出月日（`10/15`），`dates.js` 依台北時區推年份：
以當年為準，只有換年份之後會落在今天前後 60 天內時才換年（12 月貼 1 月的通告、
1 月補登 12 月的通告）。模型自己補的年份一律不採信。

**寫入前一定先預覽。** 更新一律顯示「舊值 → 新值」，
這樣「把演出費狀態誤判成對帳狀態」這種錯一眼就看得出來。

**去重在做任何事之前。** 同一個 `webhookEventId` 只會被處理一次
（Firestore `create()` 的原子性），webhook 重送不會變成兩筆通告。

**reply 失敗才 push。** reply token 大約一分鐘內有效且只能用一次，
Claude 想久一點就會過期；`line.js` 的 `deliver()` 會改走 push（push 有免費額度上限，reply 沒有）。
冷啟動會吃掉幾秒，目前沒設 `minInstances`；如果實測常常 fallback 到 push，
把 `lineWebhook` 的 `minInstances` 設成 1 即可（會有固定費用）。

**內部錯誤一律回 200。** 回非 2xx 會讓 LINE 重送，而重送一則「新增通告」比漏掉一則糟糕得多。
簽章不符是唯一回 401 的情況。

---

## 開發前待決事項的現況

規劃書 §七 列了四項，目前的處理方式：

### 1. 八點檔、豎屏劇在履歷的歸類 — ⚠️ 還沒決定，先用暫定規則

「類型」欄位只有 戲劇／廣告／學製／電影／豎屏劇，沒有「八點檔」。
現在的作法（`functions/linebot/resume-config.js`）：

- **八點檔**：靠 `PRIMETIME_TITLES` 劇名清單認，目前列了 `好運來`、`百味人生`
  — **這兩筆是從現有資料推斷的，需要人工確認**。沒列進清單的戲劇會歸到「戲劇特約」，
  不會消失，只是分錯區。
- 若之後在 Notion 的「類型」新增「八點檔」選項並回頭補標（規劃書建議的 (a) 案），
  程式不用改也會自動生效 —— `PRIMETIME_TYPES` 已經在判斷條件裡。
- **豎屏劇**：暫定跟著「戲劇特約」。要獨立一區的話在 `SECTIONS` 加一筆即可。

建議還是走 (a)：規則放在資料裡比放在清單裡可靠。

### 2. 「請款文字」的用途與格式 — 兩種都做了

- `請款清單` → 未結待請款（要傳給家珍的）
- `已請款` → 已請款待入帳（查還沒收到錢的）
- `對帳` → 兩塊一起

金額用「通告金額」而不是「實領」（實領要等確認入帳才補記）。
如果有過去傳給家珍的實際範例，`billing.js` 的 `formatRow()` 換掉就好。

### 3. 是否新增「集合時間」「地點」欄位 — 沒加，先進備註

現在通告原文裡的集合時間、地點、聯絡方式會被整理成一句話放「備註」。
要在 LINE 查「明天幾點在哪」的話得先在 Notion 加欄位，加完後在 `schema.js`
的 `PROPERTIES` 補上定義，`agent.js` 的 tool schema 會自動跟著長出來。

### 4. 實領／經紀費／額外的計算關係 — 沒自動化

照規劃書 §三，Bot 不做自動計算，只記錄訊息裡明確給出的數字。
系統提示裡有寫死這條規則。

---

## 測試

```bash
cd functions && npm test
```

40 個測試，涵蓋：select 值驗證、跨年日期推定、履歷分區與排版（用真實資料比對）、
請款金額小計、LINE 簽章驗證與長訊息切割、預覽→確認→寫入的流程、白名單與去重。
全部用測試替身，不會打到 Notion、LINE 或 Anthropic。

尚未做過真實環境的端對端測試（需要實際的 channel、token 與 Notion integration）。
規劃書 Phase 2 的驗收（貼 5 則歷史通告原文、人工比對解析結果）也還沒跑。
