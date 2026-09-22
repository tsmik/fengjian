"use strict";

const {formatDate} = require("./dates");

/**
 * 請款金額用「通告金額」，不用「實領」。
 * 業務規則：實領要等家珍確認入帳才補記，請款當下手上只有通告金額。
 * 通告金額沒填時才退而用實領。
 */
function amountOf(notice) {
  if (typeof notice.通告金額 === "number") return notice.通告金額;
  if (typeof notice.實領 === "number") return notice.實領;
  return null;
}

function formatMoney(value) {
  return value.toLocaleString("en-US");
}

function byDateAsc(a, b) {
  const da = a.通告日期 || "9999-12-31";
  const db = b.通告日期 || "9999-12-31";
  return da.localeCompare(db);
}

/**
 * 一筆一行。showSource 只有在清單混到多個來源時才打開，
 * 單一來源時每行都寫「家珍」只是雜訊。
 */
function formatRow(notice, {showSource, showBilledDate}) {
  const parts = [formatDate(notice.通告日期)];
  if (showSource && notice.來源) parts.push(`[${notice.來源}]`);
  parts.push(notice.通告名稱 || "(無名稱)");

  const amount = amountOf(notice);
  parts.push(amount === null ? "金額未定" : formatMoney(amount));

  if (showBilledDate && notice.請款日) parts.push(`(請款 ${formatDate(notice.請款日)})`);
  if (notice.額外) parts.push(`(額外：${notice.額外})`);

  return parts.join(" ");
}

function formatBlock(heading, notices, {showBilledDate = false} = {}) {
  if (!notices.length) return `${heading}：無`;

  const rows = notices.slice().sort(byDateAsc);
  const sources = new Set(rows.map((n) => n.來源).filter(Boolean));
  const showSource = sources.size > 1;

  const amounts = rows.map(amountOf);
  const total = amounts.reduce((sum, a) => sum + (a === null ? 0 : a), 0);
  const missing = amounts.filter((a) => a === null).length;

  let title = `${heading}（${rows.length} 筆，共 ${formatMoney(total)}`;
  if (missing) title += `，${missing} 筆未填金額`;
  title += "）";

  const lines = rows.map((n) => formatRow(n, {showSource, showBilledDate}));
  return `${title}\n${lines.join("\n")}`;
}

/** 對帳狀態 = 未結：還沒跟家珍請款的。 */
function formatUnbilled(notices) {
  return formatBlock("未結待請款", notices.filter((n) => n.對帳狀態 === "未結"));
}

/** 對帳狀態 = 已請款：請款了但錢還沒進來的。 */
function formatBilledPending(notices) {
  return formatBlock(
    "已請款待入帳",
    notices.filter((n) => n.對帳狀態 === "已請款"),
    {showBilledDate: true},
  );
}

/** 兩塊一起出，就是一張完整的對帳快照。 */
function formatBillingSummary(notices) {
  return `${formatUnbilled(notices)}\n\n${formatBilledPending(notices)}`;
}

module.exports = {
  amountOf,
  formatBlock,
  formatUnbilled,
  formatBilledPending,
  formatBillingSummary,
};
