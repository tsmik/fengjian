"use strict";

/**
 * 「通告總表」的欄位定義。
 *
 * 這份表就是唯一真相：Claude 只負責理解文字，實際要寫進 Notion 的值一律先過
 * validateFields()。select 的 options 直接對應 Notion 上的選項，模型自創的值
 * （例如「已請款了」）會在這裡被擋下來，不會送到 Notion。
 *
 * 「代表照」(file) 刻意不列入 — Bot 不處理照片。
 */
const PROPERTIES = {
  通告名稱: {type: "title"},
  通告日期: {type: "date"},
  類型: {type: "select", options: ["戲劇", "廣告", "學製", "電影", "豎屏劇"]},
  來源: {type: "select", options: ["家珍", "自接", "習得Frank"]},
  角色: {type: "rich_text"},
  通告金額: {type: "number"},
  額外: {type: "rich_text"},
  實領: {type: "number"},
  經紀費: {type: "number"},
  經紀費狀態: {type: "select", options: ["已結", "未結", "免結"]},
  對帳狀態: {type: "select", options: ["未結", "已請款", "已結", "免結"]},
  請款日: {type: "date"},
  演出費狀態: {type: "select", options: ["未收", "已收", "已收(現金)"]},
  簽單類型: {type: "select", options: ["個人", "多人", "免簽", "勞報單"]},
  簽單狀態: {type: "select", options: ["待補", "已拍照回傳", "已交回"]},
  對外顯示: {type: "checkbox"},
  影片連結: {type: "url"},
  備註: {type: "rich_text"},
};

const TITLE_PROPERTY = "通告名稱";

/**
 * 口語 → 正式選項。只收「意思明確」的說法；含糊的（例如單講「結了」不知道是
 * 對帳還是經紀費）不放進來，讓它落到錯誤訊息去問使用者。
 */
const SELECT_ALIASES = {
  對帳狀態: {
    請款: "已請款",
    請款了: "已請款",
    已請款了: "已請款",
    送出請款: "已請款",
    入帳: "已結",
    已入帳: "已結",
    結清: "已結",
    已結清: "已結",
    未請款: "未結",
  },
  經紀費狀態: {
    已付: "已結",
    付了: "已結",
    未付: "未結",
    不用付: "免結",
  },
  演出費狀態: {
    收到: "已收",
    收到了: "已收",
    領到: "已收",
    現金: "已收(現金)",
    領現: "已收(現金)",
    "已收（現金）": "已收(現金)",
    沒收到: "未收",
  },
  簽單狀態: {
    已交: "已交回",
    交回: "已交回",
    交回了: "已交回",
    拍照回傳: "已拍照回傳",
    拍照: "已拍照回傳",
    回傳: "已拍照回傳",
    未交: "待補",
    沒簽: "待補",
  },
  簽單類型: {
    個人簽單: "個人",
    多人簽單: "多人",
    不用簽: "免簽",
    勞報: "勞報單",
  },
  類型: {
    短劇: "豎屏劇",
    直式短劇: "豎屏劇",
    學生製片: "學製",
    學生劇: "學製",
    CF: "廣告",
    cf: "廣告",
  },
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** 全形括號、空白統一，方便比對選項。 */
function canonical(value) {
  return String(value)
    .replace(/[（]/g, "(")
    .replace(/[）]/g, ")")
    .replace(/\s+/g, "")
    .trim();
}

/**
 * 把一個 select 值正規化成 Notion 上真正存在的選項。
 * @return {{ok: true, value: string}|{ok: false, error: string}}
 */
function normalizeSelect(propName, raw) {
  const def = PROPERTIES[propName];
  const wanted = canonical(raw);
  const hit = def.options.find((opt) => canonical(opt) === wanted);
  if (hit) return {ok: true, value: hit};

  const alias = (SELECT_ALIASES[propName] || {})[wanted];
  if (alias) return {ok: true, value: alias};

  return {
    ok: false,
    error: `「${propName}」沒有「${raw}」這個選項，只能是：${def.options.join("、")}`,
  };
}

/** 「3,200」「$3200」「3200 元」都收，回傳 number。 */
function normalizeNumber(propName, raw) {
  if (typeof raw === "number") {
    if (!Number.isFinite(raw)) return {ok: false, error: `「${propName}」不是有效數字`};
    return {ok: true, value: raw};
  }
  const cleaned = String(raw).replace(/[,，$＄\s]/g, "").replace(/[元塊]$/u, "");
  if (cleaned === "" || !/^-?\d+(\.\d+)?$/.test(cleaned)) {
    return {ok: false, error: `「${propName}」不是有效數字：${raw}`};
  }
  return {ok: true, value: Number(cleaned)};
}

function normalizeDate(propName, raw) {
  const value = String(raw).trim();
  if (!ISO_DATE.test(value)) {
    return {ok: false, error: `「${propName}」日期格式要是 YYYY-MM-DD，收到：${raw}`};
  }
  const [y, m, d] = value.split("-").map(Number);
  const probe = new Date(Date.UTC(y, m - 1, d));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== m - 1 || probe.getUTCDate() !== d) {
    return {ok: false, error: `「${propName}」不是存在的日期：${raw}`};
  }
  return {ok: true, value};
}

function normalizeUrl(propName, raw) {
  const value = String(raw).trim();
  if (!/^https?:\/\/\S+$/.test(value)) {
    return {ok: false, error: `「${propName}」要是 http(s) 網址，收到：${raw}`};
  }
  return {ok: true, value};
}

function normalizeCheckbox(propName, raw) {
  if (typeof raw === "boolean") return {ok: true, value: raw};
  const value = canonical(raw);
  if (["true", "是", "勾選", "要", "yes", "1"].includes(value.toLowerCase())) {
    return {ok: true, value: true};
  }
  if (["false", "否", "不勾", "不要", "no", "0"].includes(value.toLowerCase())) {
    return {ok: true, value: false};
  }
  return {ok: false, error: `「${propName}」只能是勾選或不勾選，收到：${raw}`};
}

/**
 * 驗證並正規化一組欄位。
 *
 * null 代表「清空這個欄位」，會保留下來交給 toNotionProperties。
 *
 * @param {Object} fields 欄位名 → 值
 * @return {{fields: Object, errors: string[]}}
 */
function validateFields(fields) {
  const out = {};
  const errors = [];

  for (const [name, raw] of Object.entries(fields || {})) {
    const def = PROPERTIES[name];
    if (!def) {
      errors.push(`「通告總表」沒有「${name}」這個欄位`);
      continue;
    }
    if (raw === null || raw === undefined || raw === "") {
      out[name] = null;
      continue;
    }

    let result;
    switch (def.type) {
      case "select":
        result = normalizeSelect(name, raw);
        break;
      case "number":
        result = normalizeNumber(name, raw);
        break;
      case "date":
        result = normalizeDate(name, raw);
        break;
      case "url":
        result = normalizeUrl(name, raw);
        break;
      case "checkbox":
        result = normalizeCheckbox(name, raw);
        break;
      default: // title / rich_text
        result = {ok: true, value: String(raw).trim()};
    }

    if (result.ok) out[name] = result.value;
    else errors.push(result.error);
  }

  return {fields: out, errors};
}

/** 已驗證的欄位 → Notion API 的 properties payload。 */
function toNotionProperties(fields) {
  const properties = {};

  for (const [name, value] of Object.entries(fields)) {
    const def = PROPERTIES[name];
    if (!def) continue;

    if (value === null) {
      // Notion 用 null（date/select/url）或空陣列（text）來清空欄位
      if (def.type === "title" || def.type === "rich_text") {
        properties[name] = {[def.type]: []};
      } else if (def.type === "checkbox") {
        properties[name] = {checkbox: false};
      } else {
        properties[name] = {[def.type]: null};
      }
      continue;
    }

    switch (def.type) {
      case "title":
      case "rich_text":
        properties[name] = {[def.type]: [{type: "text", text: {content: value}}]};
        break;
      case "select":
        properties[name] = {select: {name: value}};
        break;
      case "date":
        properties[name] = {date: {start: value}};
        break;
      default:
        properties[name] = {[def.type]: value};
    }
  }

  return properties;
}

/** Notion page → 好用的扁平物件。缺值一律是 null。 */
function fromNotionPage(page) {
  const out = {id: page.id, url: page.url};
  const props = page.properties || {};

  for (const [name, def] of Object.entries(PROPERTIES)) {
    const prop = props[name];
    if (!prop) {
      out[name] = null;
      continue;
    }
    switch (def.type) {
      case "title":
      case "rich_text": {
        const parts = prop[def.type] || [];
        const text = parts.map((p) => p.plain_text || "").join("").trim();
        out[name] = text || null;
        break;
      }
      case "select":
        out[name] = prop.select ? prop.select.name : null;
        break;
      case "date":
        out[name] = prop.date ? prop.date.start : null;
        break;
      case "checkbox":
        out[name] = prop.checkbox === true;
        break;
      default:
        out[name] = prop[def.type] === undefined ? null : prop[def.type];
    }
  }

  return out;
}

module.exports = {
  PROPERTIES,
  TITLE_PROPERTY,
  SELECT_ALIASES,
  normalizeSelect,
  validateFields,
  toNotionProperties,
  fromNotionPage,
};
