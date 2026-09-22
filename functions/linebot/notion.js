"use strict";

const {toNotionProperties, fromNotionPage, TITLE_PROPERTY} = require("./schema");

const API_BASE = "https://api.notion.com/v1";

/**
 * 2025-09-03 起 Notion 把「database」拆成 database + data source：
 * 查詢走 /data_sources/{id}/query，建頁的 parent 也要用 data_source_id。
 * 兩個 ID 長得一樣但不通用，混用會 404。
 */
const NOTION_VERSION = "2025-09-03";

const RETRYABLE = new Set([429, 500, 502, 503, 504]);

class NotionError extends Error {
  constructor(message, status, body) {
    super(message);
    this.name = "NotionError";
    this.status = status;
    this.body = body;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class NotionClient {
  /**
   * @param {string} token internal integration token（secret_...）
   * @param {string} dataSourceId 通告總表的 data source ID
   * @param {{fetchImpl?: Function, maxAttempts?: number}} [options]
   */
  constructor(token, dataSourceId, options = {}) {
    if (!token) throw new Error("缺少 Notion token");
    if (!dataSourceId) throw new Error("缺少 Notion data source ID");
    this.token = token;
    this.dataSourceId = dataSourceId;
    this.fetch = options.fetchImpl || globalThis.fetch;
    this.maxAttempts = options.maxAttempts || 3;
  }

  async request(method, path, body) {
    let lastError;

    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      const response = await this.fetch(`${API_BASE}${path}`, {
        method,
        headers: {
          "Authorization": `Bearer ${this.token}`,
          "Notion-Version": NOTION_VERSION,
          "Content-Type": "application/json",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });

      if (response.ok) return response.json();

      const text = await response.text();
      lastError = new NotionError(
        `Notion API ${response.status}: ${text.slice(0, 300)}`,
        response.status,
        text,
      );

      if (!RETRYABLE.has(response.status) || attempt === this.maxAttempts) throw lastError;

      const retryAfter = Number(response.headers.get("Retry-After"));
      const waitMs = Number.isFinite(retryAfter) && retryAfter > 0 ?
        retryAfter * 1000 :
        2 ** (attempt - 1) * 500;
      await sleep(waitMs);
    }

    throw lastError;
  }

  /**
   * 查通告，自動翻頁。
   * @param {{filter?: Object, sorts?: Object[], limit?: number}} [query]
   * @return {Promise<Object[]>} fromNotionPage() 後的扁平通告
   */
  async query({filter, sorts, limit = 200} = {}) {
    const results = [];
    let cursor;

    do {
      const body = {page_size: Math.min(100, limit - results.length)};
      if (filter) body.filter = filter;
      if (sorts) body.sorts = sorts;
      if (cursor) body.start_cursor = cursor;

      const page = await this.request("POST", `/data_sources/${this.dataSourceId}/query`, body);
      results.push(...(page.results || []).map(fromNotionPage));
      cursor = page.has_more ? page.next_cursor : undefined;
    } while (cursor && results.length < limit);

    return results;
  }

  /** 對外顯示 = 勾選的通告，日期新的在前。 */
  async queryPublic() {
    return this.query({
      filter: {property: "對外顯示", checkbox: {equals: true}},
      sorts: [{property: "通告日期", direction: "descending"}],
    });
  }

  /**
   * 對帳用的通告（未結 / 已請款），可另外限定來源。
   * @param {string[]} statuses 對帳狀態
   * @param {string} [source] 來源
   */
  async queryByReconcileStatus(statuses, source) {
    const statusFilter = statuses.length === 1 ?
      {property: "對帳狀態", select: {equals: statuses[0]}} :
      {or: statuses.map((s) => ({property: "對帳狀態", select: {equals: s}}))};

    const filter = source ?
      {and: [statusFilter, {property: "來源", select: {equals: source}}]} :
      statusFilter;

    return this.query({
      filter,
      sorts: [{property: "通告日期", direction: "ascending"}],
    });
  }

  /** 用劇名片段找通告，新的排前面。 */
  async searchByTitle(text, limit = 8) {
    const results = await this.query({
      filter: {property: TITLE_PROPERTY, title: {contains: String(text).trim()}},
      sorts: [{property: "通告日期", direction: "descending"}],
      limit,
    });
    return results.slice(0, limit);
  }

  async getPage(pageId) {
    return fromNotionPage(await this.request("GET", `/pages/${pageId}`));
  }

  /** 新增一筆通告。fields 必須已經過 validateFields()。 */
  async createNotice(fields) {
    const page = await this.request("POST", "/pages", {
      parent: {type: "data_source_id", data_source_id: this.dataSourceId},
      properties: toNotionProperties(fields),
    });
    return fromNotionPage(page);
  }

  /** 更新一筆通告。fields 必須已經過 validateFields()。 */
  async updateNotice(pageId, fields) {
    const page = await this.request("PATCH", `/pages/${pageId}`, {
      properties: toNotionProperties(fields),
    });
    return fromNotionPage(page);
  }
}

module.exports = {NotionClient, NotionError, NOTION_VERSION, API_BASE};
