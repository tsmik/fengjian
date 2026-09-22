"use strict";

/** 待確認的操作放多久過期。超過就當作沒發生過，重貼一次比誤寫安全。 */
const PENDING_TTL_MS = 20 * 60 * 1000;

/** 去重紀錄保留多久。LINE 重送通常在很短時間內，留一天很夠。 */
const EVENT_TTL_MS = 24 * 60 * 60 * 1000;

const EVENTS = "linebotEvents";
const PENDING = "linebotPending";

/** Firestore 的 ALREADY_EXISTS。 */
const ALREADY_EXISTS = 6;

/**
 * Webhook 去重 + 待確認操作的暫存。
 *
 * 兩者都放 Firestore：Cloud Run 執行個體隨時會被回收，記憶體裡的狀態留不住，
 * 而「同一則通告被重送兩次就新增兩筆」是這個 Bot 最不能犯的錯。
 */
class Store {
  /**
   * @param {FirebaseFirestore.Firestore} db
   * @param {{now?: () => number}} [options]
   */
  constructor(db, options = {}) {
    this.db = db;
    this.now = options.now || (() => Date.now());
  }

  /**
   * 記下這個 webhook 事件；回 false 代表之前已經處理過，這次要整個跳過。
   *
   * 用 create()（而不是 set()）才有原子性：兩份重送同時進來時，只有一份會成功。
   *
   * @param {string} webhookEventId
   * @return {Promise<boolean>} true = 第一次看到，可以處理
   */
  async claimEvent(webhookEventId) {
    if (!webhookEventId) return true; // 沒有 ID 就無從去重，照常處理

    const now = this.now();
    try {
      await this.db.collection(EVENTS).doc(webhookEventId).create({
        createdAt: new Date(now).toISOString(),
        expiresAt: new Date(now + EVENT_TTL_MS),
      });
      return true;
    } catch (err) {
      if (err && err.code === ALREADY_EXISTS) return false;
      throw err;
    }
  }

  /**
   * 存一筆待確認的操作（等使用者回「好」）。每人同時只會有一筆，新的蓋掉舊的。
   * @param {string} userId
   * @param {Object} action 要執行的動作，見 actions.js
   */
  async savePending(userId, action) {
    const now = this.now();
    await this.db.collection(PENDING).doc(userId).set({
      action,
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + PENDING_TTL_MS),
      expiresAtMs: now + PENDING_TTL_MS,
    });
  }

  /**
   * 取出待確認的操作；過期的當作不存在並順手清掉。
   * @param {string} userId
   * @return {Promise<Object|null>}
   */
  async loadPending(userId) {
    const snap = await this.db.collection(PENDING).doc(userId).get();
    if (!snap.exists) return null;

    const data = snap.data();
    if (!data || typeof data.expiresAtMs !== "number" || data.expiresAtMs <= this.now()) {
      await this.clearPending(userId);
      return null;
    }
    return data.action;
  }

  async clearPending(userId) {
    await this.db.collection(PENDING).doc(userId).delete();
  }
}

module.exports = {Store, PENDING_TTL_MS, EVENT_TTL_MS, EVENTS, PENDING};
