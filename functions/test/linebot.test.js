"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");

const schema = require("../linebot/schema");
const dates = require("../linebot/dates");
const resume = require("../linebot/resume");
const billing = require("../linebot/billing");
const line = require("../linebot/line");
const router = require("../linebot/router");
const {handleWebhook} = require("../linebot/webhook");

// ---------------------------------------------------------------- 測試替身

/** 只實作 router / webhook 真正會用到的 NotionClient 介面。 */
function fakeNotion(rows = []) {
  return {
    rows,
    created: [],
    updated: [],
    async queryPublic() {
      return rows.filter((r) => r.對外顯示 === true);
    },
    async queryByReconcileStatus(statuses, source) {
      return rows.filter(
        (r) => statuses.includes(r.對帳狀態) && (!source || r.來源 === source),
      );
    },
    async searchByTitle(text) {
      return rows.filter((r) => (r.通告名稱 || "").includes(text));
    },
    async query() {
      return rows;
    },
    async createNotice(fields) {
      this.created.push(fields);
      return {...fields, id: "new-page", url: "https://notion.so/new-page"};
    },
    async updateNotice(pageId, fields) {
      this.updated.push({pageId, fields});
      const row = rows.find((r) => r.id === pageId) || {};
      return {...row, ...fields, id: pageId, url: `https://notion.so/${pageId}`};
    },
  };
}

function fakeStore() {
  const pending = new Map();
  const events = new Set();
  return {
    pending,
    events,
    async claimEvent(id) {
      if (!id) return true;
      if (events.has(id)) return false;
      events.add(id);
      return true;
    },
    async savePending(userId, action) {
      pending.set(userId, action);
    },
    async loadPending(userId) {
      return pending.get(userId) || null;
    },
    async clearPending(userId) {
      pending.delete(userId);
    },
  };
}

/** 對外顯示的 5 筆真實資料（2026-09-22 從通告總表讀出）。 */
const REAL_PUBLIC_ROWS = [
  {
    id: "a", 通告名稱: "豆腐媽媽", 類型: "戲劇", 角色: "員工",
    影片連結: "https://youtu.be/sys1pInU5rg", 通告日期: "2026-04-11", 對外顯示: true,
  },
  {
    id: "b", 通告名稱: "百味人生(病患)", 類型: "戲劇", 角色: "病患",
    影片連結: "https://youtu.be/tsFarReESxg", 通告日期: "2025-09-25", 對外顯示: true,
  },
  {
    id: "c", 通告名稱: "好運來", 類型: "戲劇", 角色: "路人",
    影片連結: "https://youtu.be/bZ81dBu6heY", 通告日期: "2025-09-05", 對外顯示: true,
  },
  {
    id: "d", 通告名稱: "ICERD宣導短片職場篇", 類型: "廣告", 角色: "隔壁老闆",
    影片連結: "https://youtu.be/sD23NAJbPHo", 通告日期: "2025-09-03", 對外顯示: true,
  },
  {
    id: "e", 通告名稱: "願望", 類型: "戲劇", 角色: "流浪漢/乞丐",
    影片連結: "https://youtu.be/p3xIgqHgqZM", 通告日期: "2025-08-10", 對外顯示: true,
  },
];

// ---------------------------------------------------------------- schema

test("select 只收 Notion 上真的存在的選項", () => {
  assert.deepEqual(schema.normalizeSelect("對帳狀態", "已請款"), {ok: true, value: "已請款"});

  const bad = schema.normalizeSelect("對帳狀態", "已請款了啦");
  assert.equal(bad.ok, false);
  assert.match(bad.error, /未結、已請款、已結、免結/);
});

test("口語說法會被翻成正式選項", () => {
  assert.equal(schema.normalizeSelect("對帳狀態", "請款了").value, "已請款");
  assert.equal(schema.normalizeSelect("簽單狀態", "交回").value, "已交回");
  assert.equal(schema.normalizeSelect("演出費狀態", "已收（現金）").value, "已收(現金)");
});

test("validateFields 擋掉不存在的欄位和壞值", () => {
  const {fields, errors} = schema.validateFields({
    通告名稱: "豆腐媽媽",
    通告金額: "3,200",
    對帳狀態: "亂寫",
    集合時間: "14:00",
  });

  assert.equal(fields.通告名稱, "豆腐媽媽");
  assert.equal(fields.通告金額, 3200);
  assert.equal(errors.length, 2);
  assert.ok(errors.some((e) => e.includes("集合時間")));
  assert.ok(errors.some((e) => e.includes("對帳狀態")));
});

test("validateFields 擋掉不存在的日期", () => {
  assert.equal(schema.validateFields({通告日期: "2026-02-30"}).errors.length, 1);
  assert.equal(schema.validateFields({通告日期: "2026-02-28"}).errors.length, 0);
});

test("toNotionProperties 依型別產出正確的 payload", () => {
  const props = schema.toNotionProperties({
    通告名稱: "願望",
    通告日期: "2026-04-11",
    類型: "戲劇",
    通告金額: 3200,
    對外顯示: true,
    備註: null,
  });

  assert.deepEqual(props.通告名稱, {title: [{type: "text", text: {content: "願望"}}]});
  assert.deepEqual(props.通告日期, {date: {start: "2026-04-11"}});
  assert.deepEqual(props.類型, {select: {name: "戲劇"}});
  assert.deepEqual(props.通告金額, {number: 3200});
  assert.deepEqual(props.對外顯示, {checkbox: true});
  assert.deepEqual(props.備註, {rich_text: []}, "null 代表清空");
});

test("fromNotionPage 把 Notion 的巢狀結構攤平", () => {
  const flat = schema.fromNotionPage({
    id: "p1",
    url: "https://notion.so/p1",
    properties: {
      通告名稱: {title: [{plain_text: "豆腐媽媽"}]},
      通告日期: {date: {start: "2026-04-11"}},
      對帳狀態: {select: {name: "未結"}},
      實領: {number: 3200},
      對外顯示: {checkbox: true},
      角色: {rich_text: []},
    },
  });

  assert.equal(flat.id, "p1");
  assert.equal(flat.通告名稱, "豆腐媽媽");
  assert.equal(flat.對帳狀態, "未結");
  assert.equal(flat.實領, 3200);
  assert.equal(flat.對外顯示, true);
  assert.equal(flat.角色, null, "空 rich_text 要是 null 而不是空字串");
  assert.equal(flat.經紀費, null, "沒出現的欄位也要有 key");
});

// ---------------------------------------------------------------- 日期推定

test("12 月貼 1 月的通告會推到明年", () => {
  const dec = new Date("2026-12-20T03:00:00Z"); // 台北 12/20
  assert.equal(dates.inferYear(1, 5, dec), "2027-01-05");
  assert.equal(dates.inferYear(12, 25, dec), "2026-12-25");
});

test("1 月補登 12 月的通告會退回去年", () => {
  const jan = new Date("2026-01-10T03:00:00Z");
  assert.equal(dates.inferYear(12, 28, jan), "2025-12-28");
});

test("剛過去幾天的日期算今年，不會跳到明年", () => {
  const now = new Date("2026-09-22T03:00:00Z");
  assert.equal(dates.inferYear(9, 5, now), "2026-09-05");
  assert.equal(dates.inferYear(4, 11, now), "2026-04-11");
});

test("resolveDate 收得到常見寫法，看不懂就回 null", () => {
  const now = new Date("2026-09-22T03:00:00Z");
  assert.equal(dates.resolveDate("2026-10-15", now), "2026-10-15");
  assert.equal(dates.resolveDate("2026/10/15", now), "2026-10-15");
  assert.equal(dates.resolveDate("10/15", now), "2026-10-15");
  assert.equal(dates.resolveDate("10月15日", now), "2026-10-15");
  assert.equal(dates.resolveDate("下禮拜三", now), null);
  assert.equal(dates.resolveDate("13/40", now), null);
});

test("台北時區跨日算得對", () => {
  // UTC 還是 9/21 晚上，台北已經 9/22
  assert.equal(dates.todayInTaipei(new Date("2026-09-21T16:30:00Z")), "2026-09-22");
});

// ---------------------------------------------------------------- 履歷

test("YouTube 連結統一成 youtu.be 短網址", () => {
  assert.equal(
    resume.shortenYoutube("https://www.youtube.com/watch?v=sys1pInU5rg&list=PL1"),
    "https://youtu.be/sys1pInU5rg",
  );
  assert.equal(resume.shortenYoutube("https://youtu.be/abc123?t=42"), "https://youtu.be/abc123");
  assert.equal(resume.shortenYoutube("https://vimeo.com/123"), "https://vimeo.com/123");
});

test("劇名結尾的括號如果就是角色就拿掉", () => {
  assert.equal(resume.displayTitle({通告名稱: "百味人生(病患)", 角色: "病患"}), "百味人生");
  assert.equal(resume.displayTitle({通告名稱: "百味人生(病患)", 角色: "路人"}), "百味人生(病患)");
  assert.equal(resume.displayTitle({通告名稱: "願望(第二季)", 角色: "乞丐"}), "願望(第二季)");
});

test("分區：學製排除、八點檔看清單、豎屏劇跟著戲劇", () => {
  assert.equal(resume.sectionOf({通告名稱: "某學生片", 類型: "學製"}), null);
  assert.equal(resume.sectionOf({通告名稱: "好運來", 類型: "戲劇"}), "八點檔特約");
  assert.equal(resume.sectionOf({通告名稱: "豆腐媽媽", 類型: "戲劇"}), "戲劇特約");
  assert.equal(resume.sectionOf({通告名稱: "某短劇", 類型: "豎屏劇"}), "戲劇特約");
  assert.equal(resume.sectionOf({通告名稱: "某片", 類型: "電影"}), "電影特約");
  assert.equal(resume.sectionOf({通告名稱: "某廣告", 類型: "廣告"}), "廣告特約");
});

test("履歷輸出：真實資料的完整版型", () => {
  const text = resume.formatResume(REAL_PUBLIC_ROWS);

  assert.equal(text, [
    "【戲劇特約】",
    "",
    "《豆腐媽媽》飾 員工",
    "https://youtu.be/sys1pInU5rg",
    "",
    "《願望》飾 流浪漢/乞丐",
    "https://youtu.be/p3xIgqHgqZM",
    "",
    "【八點檔特約】",
    "",
    "《百味人生》飾 病患",
    "https://youtu.be/tsFarReESxg",
    "",
    "《好運來》飾 路人",
    "https://youtu.be/bZ81dBu6heY",
    "",
    "【廣告特約】",
    "",
    "《ICERD宣導短片職場篇》飾 隔壁老闆",
    "https://youtu.be/sD23NAJbPHo",
  ].join("\n"));
});

test("履歷不列入沒勾對外顯示的通告，空區塊不出現", () => {
  const text = resume.formatResume([
    ...REAL_PUBLIC_ROWS,
    {通告名稱: "私下的案子", 類型: "電影", 角色: "路人", 對外顯示: false},
  ]);

  assert.ok(!text.includes("私下的案子"));
  assert.ok(!text.includes("電影特約"), "沒有電影就不要印電影區塊");
});

test("完全沒有對外顯示的通告時給的是人看得懂的話", () => {
  assert.equal(resume.formatResume([]), "目前沒有勾選「對外顯示」的通告。");
});

// ---------------------------------------------------------------- 請款

const BILLING_ROWS = [
  {通告名稱: "豆腐媽媽", 通告日期: "2026-04-11", 通告金額: 3200, 對帳狀態: "未結", 來源: "家珍"},
  {通告名稱: "願望", 通告日期: "2025-08-10", 通告金額: 2400, 對帳狀態: "未結", 來源: "家珍", 額外: "車資 100"},
  {通告名稱: "沒填金額的", 通告日期: "2026-05-01", 對帳狀態: "未結", 來源: "家珍"},
  {通告名稱: "好運來", 通告日期: "2025-09-05", 通告金額: 1800, 對帳狀態: "已請款", 請款日: "2025-09-20", 來源: "家珍"},
  {通告名稱: "早就結了", 通告日期: "2025-01-01", 通告金額: 999, 對帳狀態: "已結", 來源: "家珍"},
];

test("未結待請款：只列未結、加總、標出沒填金額的", () => {
  const text = billing.formatUnbilled(BILLING_ROWS);

  assert.match(text, /^未結待請款（3 筆，共 5,600，1 筆未填金額）/);
  assert.ok(text.includes("2025/08/10 願望 2,400 (額外：車資 100)"));
  assert.ok(text.includes("2026/05/01 沒填金額的 金額未定"));
  assert.ok(!text.includes("早就結了"), "已結的不該出現在待請款");
  assert.ok(!text.includes("好運來"), "已請款的不該出現在待請款");
});

test("未結待請款：日期舊的排前面（先請先結）", () => {
  const lines = billing.formatUnbilled(BILLING_ROWS).split("\n");
  assert.match(lines[1], /2025\/08\/10 願望/);
  assert.match(lines[2], /2026\/04\/11 豆腐媽媽/);
});

test("已請款待入帳：帶上請款日", () => {
  const text = billing.formatBilledPending(BILLING_ROWS);
  assert.match(text, /^已請款待入帳（1 筆，共 1,800）/);
  assert.ok(text.includes("2025/09/05 好運來 1,800 (請款 2025/09/20)"));
});

test("請款金額用通告金額，不用實領", () => {
  assert.equal(billing.amountOf({通告金額: 3200, 實領: 3100}), 3200);
  assert.equal(billing.amountOf({實領: 3100}), 3100, "通告金額沒填才退而用實領");
  assert.equal(billing.amountOf({}), null);
});

test("多個來源混在一起時才標來源", () => {
  const single = billing.formatUnbilled(BILLING_ROWS);
  assert.ok(!single.includes("[家珍]"));

  const mixed = billing.formatUnbilled([
    ...BILLING_ROWS,
    {通告名稱: "自己接的", 通告日期: "2026-06-01", 通告金額: 5000, 對帳狀態: "未結", 來源: "自接"},
  ]);
  assert.ok(mixed.includes("[家珍]") && mixed.includes("[自接]"));
});

test("沒有資料時兩塊都說「無」", () => {
  const text = billing.formatBillingSummary([]);
  assert.equal(text, "未結待請款：無\n\n已請款待入帳：無");
});

// ---------------------------------------------------------------- LINE

test("簽章驗證：算對才過", () => {
  const secret = "s3cret";
  const body = Buffer.from(JSON.stringify({events: []}), "utf8");
  const signature = crypto.createHmac("sha256", secret).update(body).digest("base64");

  assert.equal(line.verifySignature(secret, body, signature), true);
  assert.equal(line.verifySignature(secret, body, "bm9wZQ=="), false);
  assert.equal(line.verifySignature("wrong", body, signature), false);
  assert.equal(line.verifySignature(secret, body, undefined), false);
  assert.equal(line.verifySignature(secret, Buffer.from("tampered"), signature), false);
});

test("長文字切成多則，優先切在換行處", () => {
  const para = `${"あ".repeat(4000)}\n${"い".repeat(3000)}`;
  const messages = line.textMessages(para);

  assert.equal(messages.length, 2);
  assert.ok(messages.every((m) => m.type === "text" && m.text.length <= line.MAX_TEXT_LENGTH));
  assert.equal(messages[0].text.length, 4000, "應該切在換行，不是切在 5000 字");
});

test("短文字就一則；空字串不會送出空訊息", () => {
  assert.deepEqual(line.textMessages("好"), [{type: "text", text: "好"}]);
  assert.equal(line.textMessages("   ")[0].text, "（沒有內容）");
});

test("reply 失敗會 fallback 到 push", async () => {
  const calls = [];
  const client = new line.LineClient("token", {
    fetchImpl: async (url) => {
      calls.push(url);
      if (url.endsWith("/reply")) {
        return {ok: false, status: 400, text: async () => "Invalid reply token"};
      }
      return {ok: true, status: 200, text: async () => ""};
    },
  });

  assert.equal(await client.deliver("stale-token", "U123", "嗨"), "push");
  assert.equal(calls.length, 2);
  assert.ok(calls[1].endsWith("/push"));
});

// ---------------------------------------------------------------- router

test("唯讀指令認得出來（含來源前綴）", () => {
  assert.deepEqual(router.matchCommand("履歷"), {kind: "resume", source: null});
  assert.deepEqual(router.matchCommand(" 請款清單 "), {kind: "unbilled", source: null});
  assert.deepEqual(router.matchCommand("家珍請款清單"), {kind: "unbilled", source: "家珍"});
  assert.deepEqual(router.matchCommand("已請款的有哪些"), {kind: "billed", source: null});
  assert.deepEqual(router.matchCommand("對帳"), {kind: "reconcile", source: null});
  assert.equal(router.matchCommand("豆腐媽媽 簽單交回了"), null, "不是指令就交給模型");
});

test("「履歷」不經過 Claude 就能回答", async () => {
  const notion = fakeNotion(REAL_PUBLIC_ROWS);
  const text = await router.handleText({
    text: "履歷",
    userId: "U1",
    notion,
    store: fakeStore(),
    apiKey: "unused",
    clientImpl: {messages: {create: () => assert.fail("唯讀指令不該呼叫 Claude")}},
  });

  assert.ok(text.startsWith("【戲劇特約】"));
});

test("新增：先預覽，回「好」才寫進 Notion", async () => {
  const notion = fakeNotion([]);
  const store = fakeStore();
  const now = new Date("2026-09-22T03:00:00Z");

  // 假的 Claude：直接提議新增一筆
  const clientImpl = {
    messages: {
      create: async () => ({
        stop_reason: "tool_use",
        content: [{
          type: "tool_use",
          id: "t1",
          name: "create_notice",
          input: {fields: {通告名稱: "新戲", 通告日期: "10/15", 類型: "戲劇", 來源: "家珍", 通告金額: 3200}},
        }],
      }),
    },
  };

  const preview = await router.handleText({
    text: "10/15 新戲 特約 3200 家珍",
    userId: "U1", notion, store, apiKey: "k", now, clientImpl,
  });

  assert.ok(preview.includes("要新增這筆通告"));
  assert.ok(preview.includes("通告日期：2026/10/15"), "月日要被推成完整日期");
  assert.equal(notion.created.length, 0, "預覽階段不能寫入");

  const done = await router.handleText({
    text: "好", userId: "U1", notion, store, apiKey: "k", now,
  });

  assert.equal(notion.created.length, 1);
  assert.equal(notion.created[0].通告日期, "2026-10-15");
  assert.ok(done.includes("已新增「新戲」"));
  assert.equal(await store.loadPending("U1"), null, "執行完要清掉待確認狀態");
});

test("回「取消」就什麼都不做", async () => {
  const notion = fakeNotion([]);
  const store = fakeStore();
  await store.savePending("U1", {kind: "create", fields: {通告名稱: "不要的"}});

  const text = await router.handleText({
    text: "取消", userId: "U1", notion, store, apiKey: "k",
  });

  assert.match(text, /取消了/);
  assert.equal(notion.created.length, 0);
  assert.equal(await store.loadPending("U1"), null);
});

test("沒有待確認時說「好」不會誤觸發任何東西", async () => {
  const text = await router.handleText({
    text: "好",
    userId: "U1",
    notion: fakeNotion([]),
    store: fakeStore(),
    apiKey: "k",
    clientImpl: {messages: {create: () => assert.fail("不該呼叫 Claude")}},
  });

  assert.match(text, /目前沒有待確認的操作/);
});

test("更新：預覽要寫成「舊值 → 新值」", async () => {
  const rows = [{
    id: "p1", 通告名稱: "豆腐媽媽", 對帳狀態: "未結", 請款日: null, 來源: "家珍",
  }];
  const notion = fakeNotion(rows);
  const store = fakeStore();
  const seen = new Map([["p1", rows[0]]]);

  const built = router.buildAction({
    type: "update",
    seen,
    updates: [{page_id: "p1", fields: {對帳狀態: "已請款", 請款日: "9/22"}}],
  }, new Date("2026-09-22T03:00:00Z"));

  assert.equal(built.error, undefined);

  const {previewUpdate} = require("../linebot/actions");
  const preview = previewUpdate(built.action.updates);
  assert.ok(preview.includes("對帳狀態：未結 → 已請款"));
  assert.ok(preview.includes("請款日：（空） → 2026/09/22"));

  await store.savePending("U1", built.action);
  await router.handleText({text: "好", userId: "U1", notion, store, apiKey: "k"});

  assert.deepEqual(notion.updated, [{
    pageId: "p1",
    fields: {對帳狀態: "已請款", 請款日: "2026-09-22"},
  }]);
});

test("模型給了不存在的選項時拒絕寫入，而不是照寫", () => {
  const built = router.buildAction({
    type: "create",
    fields: {通告名稱: "某戲", 對帳狀態: "請款完成惹"},
  }, new Date());

  assert.match(built.error, /對帳狀態/);
  assert.equal(built.action, undefined);
});

test("看不懂的日期不會被猜成某一天", () => {
  const built = router.buildAction({
    type: "create",
    fields: {通告名稱: "某戲", 通告日期: "下禮拜三"},
  }, new Date());

  assert.match(built.error, /看不懂這個日期/);
});

test("沒有通告名稱就不新增", () => {
  const built = router.buildAction({type: "create", fields: {類型: "戲劇"}}, new Date());
  assert.match(built.error, /通告名稱/);
});

test("模型問問題時就把問題轉給使用者", async () => {
  const clientImpl = {
    messages: {
      create: async () => ({
        stop_reason: "tool_use",
        content: [{
          type: "tool_use", id: "t1", name: "need_more_info",
          input: {question: "「結了」是指對帳還是演出費？"},
        }],
      }),
    },
  };

  const text = await router.handleText({
    text: "豆腐媽媽結了",
    userId: "U1",
    notion: fakeNotion([]),
    store: fakeStore(),
    apiKey: "k",
    clientImpl,
  });

  assert.equal(text, "「結了」是指對帳還是演出費？");
});

// ---------------------------------------------------------------- webhook

function fakeRes() {
  return {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    send(body) {
      this.body = body;
      return this;
    },
  };
}

const QUIET_LOGGER = {info() {}, warn() {}, error() {}};

function webhookConfig(overrides = {}) {
  return {
    channelSecret: "s3cret",
    accessToken: "line-token",
    allowedUserIds: "Umike",
    notionToken: "secret_notion",
    dataSourceId: "ds",
    anthropicKey: "k",
    db: {collection: () => assert.fail("不該碰到 Firestore")},
    logger: QUIET_LOGGER,
    ...overrides,
  };
}

function signedRequest(payload, secret = "s3cret") {
  const rawBody = Buffer.from(JSON.stringify(payload), "utf8");
  const signature = crypto.createHmac("sha256", secret).update(rawBody).digest("base64");
  return {
    method: "POST",
    rawBody,
    body: payload,
    get: (name) => (name === "X-Line-Signature" ? signature : undefined),
  };
}

test("簽章不符直接 401，不做任何事", async () => {
  const req = {
    method: "POST",
    rawBody: Buffer.from("{}"),
    body: {},
    get: () => "d3Jvbmc=",
  };
  const res = fakeRes();

  await handleWebhook(req, res, webhookConfig());
  assert.equal(res.statusCode, 401);
});

test("白名單外的 userId 一律略過（Bot 是公開帳號）", async () => {
  const req = signedRequest({
    events: [{
      type: "message",
      webhookEventId: "e1",
      replyToken: "r1",
      source: {userId: "U路人"},
      message: {type: "text", text: "履歷"},
    }],
  });
  const res = fakeRes();

  // 白名單擋下來的話根本走不到 Firestore，碰到就會 assert.fail
  await handleWebhook(req, res, webhookConfig());
  assert.equal(res.statusCode, 200);
});

test("GET 不被當成 webhook", async () => {
  const res = fakeRes();
  await handleWebhook({method: "GET", get: () => undefined}, res, webhookConfig());
  assert.equal(res.statusCode, 405);
});

// ---------------------------------------------------------------- 後續補強

test("劇名清單只對戲劇生效，同名的廣告不會被歸到八點檔", () => {
  assert.equal(resume.sectionOf({通告名稱: "好運來廣告", 類型: "廣告"}), "廣告特約");
  assert.equal(resume.sectionOf({通告名稱: "好運來", 類型: "戲劇"}), "八點檔特約");
});

test("Notion 之後真的加了「八點檔」類型時不用改程式", () => {
  assert.equal(resume.sectionOf({通告名稱: "沒列在清單裡的戲", 類型: "八點檔"}), "八點檔特約");
});

test("沒查證過的 page_id 不會被拿去改", () => {
  const built = router.buildAction({
    type: "update",
    seen: new Map(),
    updates: [{page_id: "憑空生出來的", fields: {對帳狀態: "已請款"}}],
  }, new Date());

  assert.match(built.error, /沒查證過/);
  assert.equal(built.action, undefined);
});

test("更新沒說要改什麼欄位時不會送出空的 PATCH", () => {
  const row = {id: "p1", 通告名稱: "豆腐媽媽"};
  const built = router.buildAction({
    type: "update",
    seen: new Map([["p1", row]]),
    updates: [{page_id: "p1", fields: {}}],
  }, new Date());

  assert.match(built.error, /沒說要改什麼欄位/);
});

test("多筆更新其中一筆失敗時，其他筆照樣完成並回報", async () => {
  const notion = fakeNotion([{id: "p1", 通告名稱: "A"}, {id: "p2", 通告名稱: "B"}]);
  notion.updateNotice = async (pageId, fields) => {
    if (pageId === "p2") throw new Error("Notion API 404");
    notion.updated.push({pageId, fields});
    return {通告名稱: "A", id: pageId, url: "https://notion.so/p1"};
  };

  const {executeAction} = require("../linebot/actions");
  const text = await executeAction(notion, {
    kind: "update",
    updates: [
      {pageId: "p1", title: "A", fields: {對帳狀態: "已請款"}},
      {pageId: "p2", title: "B", fields: {對帳狀態: "已請款"}},
    ],
  });

  assert.ok(text.includes("已更新 1 筆：A"));
  assert.ok(text.includes("失敗 1 筆：B"));
  assert.equal(notion.updated.length, 1);
});

test("Notion 遇到 429 會重試，不是直接放棄", async () => {
  const {NotionClient} = require("../linebot/notion");
  let calls = 0;
  const notion = new NotionClient("token", "ds", {
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) {
        return {
          ok: false,
          status: 429,
          headers: {get: () => "0"},
          text: async () => "rate limited",
        };
      }
      return {ok: true, status: 200, json: async () => ({results: [], has_more: false})};
    },
  });

  assert.deepEqual(await notion.query(), []);
  assert.equal(calls, 2);
});

test("Notion 回 400 不重試，直接拋錯", async () => {
  const {NotionClient} = require("../linebot/notion");
  let calls = 0;
  const notion = new NotionClient("token", "ds", {
    fetchImpl: async () => {
      calls += 1;
      return {ok: false, status: 400, headers: {get: () => null}, text: async () => "bad request"};
    },
  });

  await assert.rejects(() => notion.query(), /Notion API 400/);
  assert.equal(calls, 1);
});

test("查詢與新增都走 data source，不是 database", async () => {
  const {NotionClient} = require("../linebot/notion");
  const seen = [];
  const notion = new NotionClient("token", "ds-123", {
    fetchImpl: async (url, init) => {
      seen.push({url, body: init.body ? JSON.parse(init.body) : null, headers: init.headers});
      return {ok: true, status: 200, json: async () => ({results: [], has_more: false, id: "p"})};
    },
  });

  await notion.query();
  await notion.createNotice({通告名稱: "某戲"});

  assert.ok(seen[0].url.endsWith("/data_sources/ds-123/query"));
  assert.equal(seen[0].headers["Notion-Version"], "2025-09-03");
  assert.ok(seen[1].url.endsWith("/pages"));
  assert.deepEqual(seen[1].body.parent, {type: "data_source_id", data_source_id: "ds-123"});
});

test("LINE Console 按 Verify（events 為空）能過，而且不會建任何連線", async () => {
  const res = fakeRes();
  await handleWebhook(signedRequest({events: []}), res, webhookConfig({
    notionToken: null, // 真的去 new NotionClient 會因為缺 token 而爆掉
  }));

  assert.equal(res.statusCode, 200);
});

test("同一個 webhookEventId 只會被處理一次", async () => {
  const store = fakeStore();
  assert.equal(await store.claimEvent("e1"), true);
  assert.equal(await store.claimEvent("e1"), false);
});

test("端對端：簽章 → 白名單 → 去重 → 履歷 → 回 LINE", async () => {
  const notionPages = [{
    id: "p1",
    url: "https://notion.so/p1",
    properties: {
      通告名稱: {title: [{plain_text: "豆腐媽媽"}]},
      通告日期: {date: {start: "2026-04-11"}},
      類型: {select: {name: "戲劇"}},
      角色: {rich_text: [{plain_text: "員工"}]},
      影片連結: {url: "https://www.youtube.com/watch?v=sys1pInU5rg"},
      對外顯示: {checkbox: true},
    },
  }];

  const sent = [];
  const firestore = new Map();
  const db = {
    collection: (name) => ({
      doc: (id) => ({
        async create(data) {
          const key = `${name}/${id}`;
          if (firestore.has(key)) {
            const err = new Error("ALREADY_EXISTS");
            err.code = 6;
            throw err;
          }
          firestore.set(key, data);
        },
        async set(data) {
          firestore.set(`${name}/${id}`, data);
        },
        async get() {
          const key = `${name}/${id}`;
          return {exists: firestore.has(key), data: () => firestore.get(key)};
        },
        async delete() {
          firestore.delete(`${name}/${id}`);
        },
      }),
    }),
  };

  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    if (String(url).includes("api.notion.com")) {
      return {ok: true, status: 200, json: async () => ({results: notionPages, has_more: false})};
    }
    if (String(url).includes("api.line.me")) {
      sent.push(JSON.parse(init.body));
      return {ok: true, status: 200, text: async () => ""};
    }
    throw new Error(`沒預期到的請求：${url}`);
  };

  try {
    const payload = {
      events: [{
        type: "message",
        webhookEventId: "evt-1",
        replyToken: "reply-1",
        source: {userId: "Umike"},
        message: {type: "text", text: "履歷"},
      }],
    };

    const res1 = fakeRes();
    await handleWebhook(signedRequest(payload), res1, webhookConfig({db}));

    assert.equal(res1.statusCode, 200);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].replyToken, "reply-1");
    assert.equal(sent[0].messages[0].text, [
      "【戲劇特約】",
      "",
      "《豆腐媽媽》飾 員工",
      "https://youtu.be/sys1pInU5rg",
    ].join("\n"));

    // LINE 重送同一則事件時不該再回一次
    const res2 = fakeRes();
    await handleWebhook(signedRequest(payload), res2, webhookConfig({db}));

    assert.equal(res2.statusCode, 200);
    assert.equal(sent.length, 1, "重送的事件不該再送出訊息");
  } finally {
    globalThis.fetch = realFetch;
  }
});
