"use strict";

const {LineClient, verifySignature} = require("./line");
const {NotionClient} = require("./notion");
const {Store} = require("./store");
const {handleText} = require("./router");

/**
 * 白名單。這是公開帳號，任何人加好友都能傳訊息進來，
 * 沒有這一關就等於把 Notion 資料庫的寫入權開給全世界。
 */
function parseAllowedUserIds(raw) {
  return String(raw || "")
    .split(/[,\s]+/)
    .map((id) => id.trim())
    .filter(Boolean);
}

/** 處理單一事件，回傳要發回去的文字；null = 不回話。 */
async function handleEvent(event, deps) {
  if (event.type !== "message" || !event.message) return null;

  // 照片、貼圖不在這個 Bot 的範圍（照片分類留在 claude.ai 專案）
  if (event.message.type !== "text") return null;

  const userId = event.source && event.source.userId;
  if (!userId) return null;

  return handleText({
    text: event.message.text,
    userId,
    notion: deps.notion,
    store: deps.store,
    apiKey: deps.anthropicKey,
  });
}

/**
 * LINE webhook 的主流程。
 *
 * 不論內部出什麼錯都回 200 —— 回非 2xx 會讓 LINE 重送，
 * 而重送一則「新增通告」的訊息比漏掉一則糟糕得多。簽章不符是唯一的例外。
 *
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 * @param {Object} config 見 index.js 的 lineWebhook
 */
async function handleWebhook(req, res, config) {
  if (req.method !== "POST") {
    res.status(405).send("Method not allowed");
    return;
  }

  const signature = req.get("X-Line-Signature");
  if (!verifySignature(config.channelSecret, req.rawBody, signature)) {
    config.logger.warn("linebot: 簽章驗證失敗");
    res.status(401).send("Invalid signature");
    return;
  }

  const events = (req.body && req.body.events) || [];

  // LINE Developers Console 按「Verify」時送的就是簽章正確、events 為空的請求。
  // 在這裡就收工，免得為了一個驗證請求去建 Notion / Firestore 連線。
  if (!events.length) {
    res.status(200).send("OK");
    return;
  }

  // 先回 200 是誘人的做法，但 Cloud Run 會在回應送出後凍結執行個體，
  // 背景工作會被砍掉。所以照順序做完再回；reply token 過期時 deliver() 會改走 push。
  const line = new LineClient(config.accessToken);
  const allowed = parseAllowedUserIds(config.allowedUserIds);

  const deps = {
    notion: new NotionClient(config.notionToken, config.dataSourceId),
    store: new Store(config.db),
    anthropicKey: config.anthropicKey,
  };

  for (const event of events) {
    const userId = event.source && event.source.userId;

    if (!userId || !allowed.includes(userId)) {
      config.logger.info("linebot: 略過白名單外的來源", {userId});
      continue;
    }

    // 同一個事件重送時不能重做一次。去重要在做任何事之前。
    if (!(await deps.store.claimEvent(event.webhookEventId))) {
      config.logger.info("linebot: 重複事件，略過", {webhookEventId: event.webhookEventId});
      continue;
    }

    let replyText;
    try {
      replyText = await handleEvent(event, deps);
    } catch (err) {
      config.logger.error("linebot: 處理失敗", {error: err.message, stack: err.stack});
      replyText = `出錯了：${err.message}\n（沒有寫入任何東西，再試一次看看）`;
    }

    if (!replyText) continue;

    try {
      const via = await line.deliver(event.replyToken, userId, replyText);
      if (via === "push") config.logger.info("linebot: reply token 失效，改用 push");
    } catch (err) {
      config.logger.error("linebot: 送不出訊息", {error: err.message});
    }
  }

  res.status(200).send("OK");
}

module.exports = {handleWebhook, handleEvent, parseAllowedUserIds};
