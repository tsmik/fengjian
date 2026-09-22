"use strict";

const crypto = require("node:crypto");

const REPLY_URL = "https://api.line.me/v2/bot/message/reply";
const PUSH_URL = "https://api.line.me/v2/bot/message/push";

/** LINE 單則文字上限 5000 字、單次最多 5 則。 */
const MAX_TEXT_LENGTH = 5000;
const MAX_MESSAGES = 5;

/**
 * 驗證 X-Line-Signature。
 *
 * 一定要用「原始 bytes」算，不能用 JSON.parse 再 stringify 回去的結果 —
 * 鍵的順序和空白只要差一個字元，簽章就對不起來。
 *
 * @param {string} channelSecret
 * @param {Buffer|string} rawBody
 * @param {string} signature header 上的 X-Line-Signature
 * @return {boolean}
 */
function verifySignature(channelSecret, rawBody, signature) {
  if (!channelSecret || !signature) return false;

  const expected = crypto
    .createHmac("sha256", channelSecret)
    .update(Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody), "utf8"))
    .digest();

  let received;
  try {
    received = Buffer.from(String(signature), "base64");
  } catch {
    return false;
  }

  if (received.length !== expected.length) return false;
  return crypto.timingSafeEqual(received, expected);
}

/**
 * 長文字切成多則。切在換行處，切不開才硬切。
 * @param {string} text
 * @return {Array<{type: "text", text: string}>}
 */
function textMessages(text) {
  const body = String(text === null || text === undefined ? "" : text).trim() || "（沒有內容）";
  const chunks = [];
  let rest = body;

  while (rest.length > MAX_TEXT_LENGTH && chunks.length < MAX_MESSAGES - 1) {
    let cut = rest.lastIndexOf("\n", MAX_TEXT_LENGTH);
    if (cut <= 0) cut = MAX_TEXT_LENGTH;
    chunks.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }

  chunks.push(rest.slice(0, MAX_TEXT_LENGTH));
  return chunks.filter(Boolean).map((chunk) => ({type: "text", text: chunk}));
}

class LineClient {
  /**
   * @param {string} accessToken channel access token
   * @param {{fetchImpl?: Function}} [options]
   */
  constructor(accessToken, options = {}) {
    this.accessToken = accessToken;
    this.fetch = options.fetchImpl || globalThis.fetch;
  }

  async post(url, body) {
    const response = await this.fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      const error = new Error(`LINE API ${response.status}: ${text.slice(0, 300)}`);
      error.status = response.status;
      throw error;
    }

    return true;
  }

  async reply(replyToken, messages) {
    return this.post(REPLY_URL, {replyToken, messages});
  }

  async push(to, messages) {
    return this.post(PUSH_URL, {to, messages});
  }

  /**
   * 先試 reply（不計入免費方案額度），失敗才 push。
   *
   * reply token 大約一分鐘內有效且只能用一次，Claude 想久一點就會過期；
   * 過期的 token 會拿到 400，這時候只能改用 push 把訊息送出去。
   *
   * @return {Promise<"reply"|"push">} 實際用了哪一條路
   */
  async deliver(replyToken, userId, text) {
    const messages = textMessages(text);

    if (replyToken) {
      try {
        await this.reply(replyToken, messages);
        return "reply";
      } catch (err) {
        if (!userId) throw err;
      }
    }

    await this.push(userId, messages);
    return "push";
  }
}

module.exports = {LineClient, verifySignature, textMessages, MAX_TEXT_LENGTH, MAX_MESSAGES};
