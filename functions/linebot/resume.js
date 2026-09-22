"use strict";

const {SECTIONS, EXCLUDED_TYPES, PRIMETIME_TITLES, PRIMETIME_TYPES} = require("./resume-config");

/**
 * YouTube 網址統一成 youtu.be 短網址，並去掉 ?t=、&list= 這些追蹤參數。
 * 不是 YouTube 的連結原樣保留。
 */
function shortenYoutube(url) {
  if (!url) return null;
  const text = String(url).trim();

  const watch = text.match(/^https?:\/\/(?:www\.|m\.)?youtube\.com\/watch\?(?:.*&)?v=([\w-]{6,})/);
  if (watch) return `https://youtu.be/${watch[1]}`;

  const shortsOrEmbed = text.match(/^https?:\/\/(?:www\.)?youtube\.com\/(?:shorts|embed|live)\/([\w-]{6,})/);
  if (shortsOrEmbed) return `https://youtu.be/${shortsOrEmbed[1]}`;

  const short = text.match(/^https?:\/\/youtu\.be\/([\w-]{6,})/);
  if (short) return `https://youtu.be/${short[1]}`;

  return text;
}

/**
 * 顯示用的劇名。
 *
 * 通告名稱常寫成「百味人生(病患)」，括號裡就是角色；履歷已經單獨列角色了，
 * 再帶一次很囉唆。只在括號內容 == 角色時才拿掉，其他括號（例如「(第二季)」）
 * 一律保留，免得誤刪資訊。
 */
function displayTitle(notice) {
  const title = (notice.通告名稱 || "").trim();
  const role = (notice.角色 || "").trim();
  if (!role) return title;

  const match = title.match(/^(.*?)[（(]([^（()）]*)[）)]$/);
  if (match && match[2].trim() === role && match[1].trim()) {
    return match[1].trim();
  }
  return title;
}

function sectionOf(notice) {
  const type = notice.類型;
  if (!type || EXCLUDED_TYPES.includes(type)) return null;

  const title = (notice.通告名稱 || "").trim();
  // 劇名清單只對「戲劇」生效：叫「好運來廣告」的廣告不該被歸到八點檔。
  const byTitle =
    type === "戲劇" && PRIMETIME_TITLES.some((name) => title === name || title.startsWith(name));
  if (PRIMETIME_TYPES.includes(type) || byTitle) return "八點檔特約";

  const section = SECTIONS.find((s) => s.types.includes(type));
  return section ? section.title : null;
}

/** 單筆條目：劇名 + 角色一行，連結一行。 */
function formatEntry(notice) {
  const title = displayTitle(notice);
  const role = (notice.角色 || "").trim();
  const link = shortenYoutube(notice.影片連結);

  const head = role ? `《${title}》飾 ${role}` : `《${title}》`;
  return link ? `${head}\n${link}` : head;
}

/** 通告日期新的排前面；沒填日期的排最後。 */
function byDateDesc(a, b) {
  const da = a.通告日期 || "";
  const db = b.通告日期 || "";
  if (!da && !db) return 0;
  if (!da) return 1;
  if (!db) return -1;
  return db.localeCompare(da);
}

/**
 * 把「對外顯示 = 勾選」的通告排成 LINE 可直接轉貼的履歷文字。
 *
 * 排版是確定性規則，不交給模型，才不會每次跑出來長得不一樣。
 *
 * @param {Object[]} notices fromNotionPage() 出來的通告
 * @return {string}
 */
function formatResume(notices) {
  const visible = (notices || []).filter((n) => n.對外顯示 === true);
  const buckets = new Map(SECTIONS.map((s) => [s.title, []]));

  for (const notice of visible) {
    const section = sectionOf(notice);
    if (section && buckets.has(section)) buckets.get(section).push(notice);
  }

  const blocks = [];
  for (const {title} of SECTIONS) {
    const rows = buckets.get(title);
    if (!rows.length) continue;
    rows.sort(byDateDesc);
    blocks.push(`【${title}】\n\n${rows.map(formatEntry).join("\n\n")}`);
  }

  if (!blocks.length) return "目前沒有勾選「對外顯示」的通告。";
  return blocks.join("\n\n");
}

module.exports = {formatResume, formatEntry, displayTitle, shortenYoutube, sectionOf};
