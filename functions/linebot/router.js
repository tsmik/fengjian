"use strict";

const {formatResume} = require("./resume");
const {formatUnbilled, formatBilledPending, formatBillingSummary} = require("./billing");
const {validateFields, PROPERTIES} = require("./schema");
const {resolveDate} = require("./dates");
const {previewAction, executeAction} = require("./actions");
const {interpret} = require("./agent");

const CONFIRM_WORDS = ["好", "好的", "好喔", "好啊", "確認", "確定", "可以", "對", "是", "ok", "okay", "yes", "y", "寫吧", "送出"];
const CANCEL_WORDS = ["取消", "不要", "算了", "先不要", "不用", "cancel", "no", "n"];

const HELP = `可以這樣用：

【查詢】
・履歷 — 對外顯示的演出經歷，可直接轉貼
・請款清單 — 未結待請款
・已請款 — 已請款待入帳
・對帳 — 上面兩塊一起
（前面加「家珍」可以只看家珍的，例如「家珍請款清單」）

【記錄】
・直接貼通告原文 → 我解析成一筆通告給你看，回「好」才寫進去
・「豆腐媽媽 簽單交回了」「願望 實領 3200」→ 找到那筆並更新
・「這幾筆請款了：A、B、C」→ 一次更新多筆

寫入前都會先給預覽，回「好」執行、「取消」作廢。`;

/** 比對指令前先把空白和大小寫弄乾淨。 */
function normalize(text) {
  return String(text || "").trim().replace(/\s+/g, "").toLowerCase();
}

/**
 * 「家珍請款清單」→ {source: "家珍", rest: "請款清單"}。
 * 沒有來源前綴就原樣回傳。
 */
function splitSource(text) {
  for (const source of PROPERTIES.來源.options) {
    const prefix = normalize(source);
    if (text.startsWith(prefix) && text.length > prefix.length) {
      return {source, rest: text.slice(prefix.length)};
    }
  }
  return {source: null, rest: text};
}

/**
 * 認得的唯讀指令。認不出來回 null，交給 Claude 去理解。
 * @return {{kind: string, source: ?string}|null}
 */
function matchCommand(text) {
  const normalized = normalize(text);
  if (!normalized) return null;

  if (["說明", "help", "?", "？", "指令", "怎麼用"].includes(normalized)) {
    return {kind: "help", source: null};
  }

  const {source, rest} = splitSource(normalized);

  if (["履歷", "演出經歷", "作品", "經歷"].includes(rest)) return {kind: "resume", source};
  if (["請款清單", "未結", "待請款", "未結待請款", "要請款的"].includes(rest)) {
    return {kind: "unbilled", source};
  }
  if (["已請款", "待入帳", "已請款待入帳", "已請款的有哪些", "已經請款的"].includes(rest)) {
    return {kind: "billed", source};
  }
  if (["對帳", "對帳表", "對帳狀況", "帳"].includes(rest)) return {kind: "reconcile", source};

  return null;
}

async function runCommand(command, notion) {
  if (command.kind === "help") return HELP;

  if (command.kind === "resume") {
    // 履歷不分來源；學製與未勾「對外顯示」的在 formatResume 裡就被排掉了。
    return formatResume(await notion.queryPublic());
  }

  if (command.kind === "unbilled") {
    return formatUnbilled(await notion.queryByReconcileStatus(["未結"], command.source));
  }

  if (command.kind === "billed") {
    return formatBilledPending(await notion.queryByReconcileStatus(["已請款"], command.source));
  }

  const rows = await notion.queryByReconcileStatus(["未結", "已請款"], command.source);
  return formatBillingSummary(rows);
}

/** 模型給的日期可能是 M/D，先換算成 YYYY-MM-DD 再交給 validateFields。 */
function resolveDateFields(fields, now) {
  const out = {};
  const unresolved = [];

  for (const [name, value] of Object.entries(fields || {})) {
    if (PROPERTIES[name] && PROPERTIES[name].type === "date" && value) {
      const iso = resolveDate(value, now);
      if (iso) out[name] = iso;
      else unresolved.push(`「${name}」看不懂這個日期：${value}`);
      continue;
    }
    out[name] = value;
  }

  return {fields: out, unresolved};
}

/** 提案 → 可執行的動作。欄位有問題就回錯誤，讓使用者自己補。 */
function buildAction(result, now) {
  if (result.type === "create") {
    const resolved = resolveDateFields(result.fields, now);
    const {fields, errors} = validateFields(resolved.fields);
    const problems = [...resolved.unresolved, ...errors];

    if (problems.length) return {error: `這筆解析得不乾淨：\n${problems.join("\n")}`};
    if (!fields.通告名稱) return {error: "看不出通告名稱，你再給我一次劇名？"};

    return {action: {kind: "create", fields}};
  }

  const updates = [];
  const problems = [];

  const seen = result.seen && result.seen.get ? result.seen : new Map();

  for (const raw of result.updates || []) {
    if (!raw.page_id) {
      problems.push("有一筆更新沒有指到既有通告");
      continue;
    }
    // page_id 一定要來自 search_notices 查到的結果。模型憑空生一個 ID 出來時，
    // 寧可退回去問，也不要拿它去 PATCH 一個不知道是什麼的頁面。
    if (!seen.has(raw.page_id)) {
      problems.push("有一筆更新指到沒查證過的通告，我不敢直接改");
      continue;
    }

    const resolved = resolveDateFields(raw.fields, now);
    const {fields, errors} = validateFields(resolved.fields);
    problems.push(...resolved.unresolved, ...errors);

    if (!Object.keys(fields).length) {
      problems.push("有一筆更新沒說要改什麼欄位");
      continue;
    }

    const before = seen.get(raw.page_id);
    updates.push({
      pageId: raw.page_id,
      title: before.通告名稱 || null,
      fields,
      before,
    });
  }

  if (problems.length) return {error: `這幾筆我不敢直接寫：\n${problems.join("\n")}`};
  if (!updates.length) return {error: "沒找到要更新的通告。"};

  return {action: {kind: "update", updates}};
}

/**
 * 一則文字訊息從進來到產出回覆的完整流程。
 *
 * 順序是有意的：先處理「好／取消」，才不會在有待確認操作時把「好」
 * 當成新指令丟給模型；接著是確定性指令（唯讀、不花錢、不會錯）；
 * 都不是才交給 Claude。
 *
 * @return {Promise<string>} 要回給 LINE 的文字
 */
async function handleText({text, userId, notion, store, apiKey, now = new Date(), clientImpl}) {
  const normalized = normalize(text);
  const pending = await store.loadPending(userId);

  if (pending && CONFIRM_WORDS.includes(normalized)) {
    await store.clearPending(userId);
    return executeAction(notion, pending);
  }

  if (pending && CANCEL_WORDS.includes(normalized)) {
    await store.clearPending(userId);
    return "取消了，沒有動到任何東西。";
  }

  if (!pending && CONFIRM_WORDS.includes(normalized)) {
    return "目前沒有待確認的操作。（超過 20 分鐘的預覽會自動作廢，重貼一次就好）";
  }

  const command = matchCommand(text);
  if (command) return runCommand(command, notion);

  const result = await interpret({apiKey, notion, text, now, clientImpl});

  if (result.type === "question") return result.question;
  if (result.type === "text" || result.type === "error") return result.text;

  const built = buildAction(result, now);
  if (built.error) return built.error;

  await store.savePending(userId, built.action);
  return previewAction(built.action);
}

module.exports = {handleText, matchCommand, runCommand, buildAction, normalize, HELP, CONFIRM_WORDS, CANCEL_WORDS};
