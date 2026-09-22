"use strict";

const {PROPERTIES} = require("./schema");
const {formatDate} = require("./dates");

/** 欄位在預覽裡的排列順序，照 Notion 上的欄位順序走比較好對。 */
const FIELD_ORDER = Object.keys(PROPERTIES);

function displayValue(name, value) {
  if (value === null || value === undefined || value === "") return "（空）";
  if (PROPERTIES[name] && PROPERTIES[name].type === "date") return formatDate(value);
  if (typeof value === "boolean") return value ? "勾選" : "不勾選";
  if (typeof value === "number") return value.toLocaleString("en-US");
  return String(value);
}

function orderedEntries(fields) {
  return FIELD_ORDER.filter((name) => name in fields).map((name) => [name, fields[name]]);
}

/** 新增通告的預覽。寫進去之前一定先讓人看過。 */
function previewCreate(fields) {
  const lines = orderedEntries(fields).map(([name, value]) => `${name}：${displayValue(name, value)}`);
  return [
    "要新增這筆通告：",
    "",
    lines.join("\n"),
    "",
    "回「好」我就寫進去，回「取消」就算了。",
  ].join("\n");
}

/**
 * 更新的預覽，一律寫成「舊值 → 新值」，
 * 這樣誤判（例如把演出費狀態當成對帳狀態）一眼就看得出來。
 */
function previewUpdate(updates) {
  const blocks = updates.map((update, index) => {
    const changes = orderedEntries(update.fields).map(([name, value]) => {
      const before = displayValue(name, (update.before || {})[name]);
      const after = displayValue(name, value);
      return `　${name}：${before} → ${after}`;
    });
    const heading = updates.length > 1 ?
      `${index + 1}. ${update.title || "(無名稱)"}` :
      update.title || "(無名稱)";
    return `${heading}\n${changes.join("\n")}`;
  });

  const heading = updates.length > 1 ? `要更新這 ${updates.length} 筆：` : "要更新這筆：";
  return [heading, "", blocks.join("\n\n"), "", "回「好」我就改下去，回「取消」就算了。"].join("\n");
}

/** 把待確認的動作真的寫進 Notion，回傳要發回 LINE 的文字。 */
async function executeAction(notion, action) {
  if (action.kind === "create") {
    const page = await notion.createNotice(action.fields);
    return `已新增「${page.通告名稱 || action.fields.通告名稱 || "通告"}」\n${page.url}`;
  }

  if (action.kind === "update") {
    const done = [];
    const failed = [];

    for (const update of action.updates) {
      try {
        const page = await notion.updateNotice(update.pageId, update.fields);
        done.push(page.通告名稱 || update.title || update.pageId);
      } catch (err) {
        failed.push(`${update.title || update.pageId}（${err.message}）`);
      }
    }

    const lines = [];
    if (done.length) lines.push(`已更新 ${done.length} 筆：${done.join("、")}`);
    if (failed.length) lines.push(`失敗 ${failed.length} 筆：${failed.join("；")}`);
    return lines.join("\n") || "沒有東西被更新。";
  }

  throw new Error(`不認得的動作：${action.kind}`);
}

/** 依動作型別產生預覽文字。 */
function previewAction(action) {
  if (action.kind === "create") return previewCreate(action.fields);
  if (action.kind === "update") return previewUpdate(action.updates);
  throw new Error(`不認得的動作：${action.kind}`);
}

module.exports = {previewCreate, previewUpdate, previewAction, executeAction, displayValue};
