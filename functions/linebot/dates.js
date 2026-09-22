"use strict";

const TAIPEI = "Asia/Taipei";

/** 台北時區的今天，格式 YYYY-MM-DD。 */
function todayInTaipei(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TAIPEI,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function toUtcDays(isoDate) {
  const [y, m, d] = isoDate.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / 86400000;
}

function pad(n) {
  return String(n).padStart(2, "0");
}

/**
 * 原文沒寫年份時，推定是哪一年。
 *
 * 規則：以台北時區當下的年份為準；只有「跨年」那一種情況才換年份 ——
 * 也就是換成別的年份之後，日期會落在今天前後 60 天內（12 月貼 1 月的通告、
 * 1 月補登 12 月的通告都是這一種）。其餘一律留在今年，
 * 不要因為「4/11 已經過去了」就自作主張跳到明年。
 *
 * @param {number} month 1-12
 * @param {number} day 1-31
 * @param {Date} [now]
 * @return {string} YYYY-MM-DD
 */
function inferYear(month, day, now = new Date()) {
  const today = todayInTaipei(now);
  const thisYear = Number(today.slice(0, 4));
  const candidate = (year) => `${year}-${pad(month)}-${pad(day)}`;
  const deltaOf = (iso) => toUtcDays(iso) - toUtcDays(today);

  const NEARBY_DAYS = 60;
  const thisYears = candidate(thisYear);

  // 今年的日期就在附近，沒有跨年問題
  if (Math.abs(deltaOf(thisYears)) <= NEARBY_DAYS) return thisYears;

  for (const year of [thisYear + 1, thisYear - 1]) {
    const other = candidate(year);
    if (Math.abs(deltaOf(other)) <= NEARBY_DAYS) return other;
  }

  return thisYears;
}

/**
 * 把模型抓到的日期字串轉成 YYYY-MM-DD。
 *
 * 收 "2026-10-15"、"2026/10/15"、"10/15"、"10月15日"、"10-15"。
 * 認不出來回 null，讓上層去問使用者，不要亂猜。
 *
 * @param {string} raw
 * @param {Date} [now]
 * @return {string|null}
 */
function resolveDate(raw, now = new Date()) {
  if (raw === null || raw === undefined) return null;
  const text = String(raw).trim().replace(/\s+/g, "");
  if (!text) return null;

  const full = text.match(/^(\d{4})[-/年.](\d{1,2})[-/月.](\d{1,2})日?$/);
  if (full) {
    return `${full[1]}-${pad(Number(full[2]))}-${pad(Number(full[3]))}`;
  }

  const partial = text.match(/^(\d{1,2})[-/月.](\d{1,2})日?$/);
  if (partial) {
    const month = Number(partial[1]);
    const day = Number(partial[2]);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return inferYear(month, day, now);
  }

  return null;
}

/** 2026-04-11 → 2026/04/11（給 LINE 訊息用，比 ISO 好讀）。 */
function formatDate(isoDate) {
  if (!isoDate) return "日期未定";
  return String(isoDate).slice(0, 10).replace(/-/g, "/");
}

module.exports = {TAIPEI, todayInTaipei, inferYear, resolveDate, formatDate};
