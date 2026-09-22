"use strict";

/**
 * 履歷分區設定。
 *
 * ⚠️ 開發前待決事項 #1（尚未決定，先用以下暫定規則）：
 *
 * 「類型」欄位目前只有 戲劇／廣告／學製／電影／豎屏劇 五個選項，沒有「八點檔」。
 * 在 Notion 上新增「八點檔」選項並回頭補標舊資料之前，八點檔只能靠劇名清單認。
 * 兩條路都留著：
 *   - 只要 Notion 上出現「八點檔」選項，PRIMETIME_TYPES 就會自動生效（不用改程式）
 *   - 在那之前，PRIMETIME_TITLES 是唯一的判斷依據
 *
 * PRIMETIME_TITLES 需要人工確認過才算數。沒列進來的戲劇一律歸「戲劇特約」，
 * 也就是說：漏列 = 該劇被放到戲劇特約，不會消失，只是分錯區。
 */
const PRIMETIME_TITLES = [
  "好運來",
  "百味人生",
];

/** Notion 上若新增這些「類型」選項，會直接歸到八點檔特約。 */
const PRIMETIME_TYPES = ["八點檔"];

/**
 * ⚠️ 待決事項 #1 的另一半：豎屏劇歸哪一區。
 * 暫定跟著戲劇特約走；要獨立成一區的話，在 SECTIONS 加一筆即可。
 */
const SECTIONS = [
  {title: "電影特約", types: ["電影"]},
  {title: "戲劇特約", types: ["戲劇", "豎屏劇"]},
  {title: "八點檔特約", types: PRIMETIME_TYPES},
  {title: "廣告特約", types: ["廣告"]},
];

/** 學製一律不列入履歷。 */
const EXCLUDED_TYPES = ["學製"];

module.exports = {PRIMETIME_TITLES, PRIMETIME_TYPES, SECTIONS, EXCLUDED_TYPES};
