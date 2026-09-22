"use strict";

const Anthropic = require("@anthropic-ai/sdk");
const {PROPERTIES} = require("./schema");
const {todayInTaipei} = require("./dates");

/**
 * 解析與分類交給 Sonnet 等級就夠（規劃書 §五）。履歷、請款清單的排版是
 * 確定性規則，由程式直接排，不經過模型。
 */
const MODEL = "claude-sonnet-5";

/** 最多來回幾次。搜尋 → 提案通常兩次就結束，留點餘裕給多筆更新。 */
const MAX_TURNS = 4;

/** 從欄位定義自動長出 tool 的 JSON schema，這樣選項只會有一份真相。 */
function buildFieldSchema() {
  const properties = {};

  for (const [name, def] of Object.entries(PROPERTIES)) {
    switch (def.type) {
      case "select":
        properties[name] = {type: "string", enum: def.options};
        break;
      case "number":
        properties[name] = {type: "number"};
        break;
      case "checkbox":
        properties[name] = {type: "boolean"};
        break;
      case "date":
        properties[name] = {
          type: "string",
          description: "YYYY-MM-DD。原文只有月日就寫 M/D，年份交給程式推定，不要自己補。",
        };
        break;
      default:
        properties[name] = {type: "string"};
    }
  }

  return properties;
}

const FIELD_SCHEMA = buildFieldSchema();

const TOOLS = [
  {
    name: "search_notices",
    description:
      "在通告總表裡找既有的通告。要更新某一筆之前一定要先用這個找到 page_id。" +
      "劇名片段、對帳狀態、來源都可以當條件。",
    input_schema: {
      type: "object",
      properties: {
        query: {type: "string", description: "通告名稱的片段，例如「豆腐媽媽」"},
        對帳狀態: {type: "string", enum: PROPERTIES.對帳狀態.options},
        來源: {type: "string", enum: PROPERTIES.來源.options},
        limit: {type: "number", description: "最多回幾筆，預設 8"},
      },
    },
  },
  {
    name: "create_notice",
    description:
      "提議新增一筆通告。只是提議，程式會先給使用者看預覽、等他回「好」才真的寫進去。" +
      "原文裡的集合時間、地點、聯絡人這類資訊目前沒有對應欄位，整理進「備註」。",
    input_schema: {
      type: "object",
      properties: {fields: {type: "object", properties: FIELD_SCHEMA}},
      required: ["fields"],
    },
  },
  {
    name: "update_notices",
    description:
      "提議更新一筆或多筆既有通告。page_id 要來自 search_notices 的結果。" +
      "同樣只是提議，使用者回「好」才會真的寫入。",
    input_schema: {
      type: "object",
      properties: {
        updates: {
          type: "array",
          items: {
            type: "object",
            properties: {
              page_id: {type: "string"},
              fields: {type: "object", properties: FIELD_SCHEMA},
            },
            required: ["page_id", "fields"],
          },
        },
      },
      required: ["updates"],
    },
  },
  {
    name: "need_more_info",
    description:
      "訊息不夠明確、無法判斷要改哪一筆或哪個欄位時，用這個把問題丟回去問。" +
      "不要猜。",
    input_schema: {
      type: "object",
      properties: {question: {type: "string"}},
      required: ["question"],
    },
  },
];

function systemPrompt(now) {
  return `你是 Mike 的戲劇通告記錄助理。Mike 是演員，接特約演出，通告資料記在 Notion 的「通告總表」。
今天是 ${todayInTaipei(now)}（台北時間）。

你的工作只有「理解訊息、決定要做什麼」，實際寫入由程式執行。所以：
- 要新增就呼叫 create_notice，要更新就呼叫 update_notices，兩者都只是提議。
- 選項類欄位只能用 tool schema 裡列出的值，不要自己造詞。
- 不確定的時候呼叫 need_more_info 問清楚，不要猜。

業務規則：
1. 「對帳狀態」和「演出費狀態」是兩條不同的軌道，不要混：
   - 對帳狀態＝跟經紀人家珍之間的請款進度（未結 → 已請款 → 已結）
   - 演出費狀態＝演出費實際收到了沒
   訊息只說「結了」「收到了」而看不出是哪一條時，用 need_more_info 問。
2. 對帳狀態改成「已請款」時，同時要填「請款日」（沒特別講就填今天）。
3. 金額以家珍確認為準。車馬費、overtime 這類費用不預估，只有訊息明確給了數字才記到「額外」和「實領」。
4. 「通告金額」「實領」「經紀費」之間不要自己算。訊息給什麼數字就記什麼數字。
5. 通告日期原文沒寫年份就只填月日（例如 10/15），程式會推定年份。不要自己補年份。
6. 轉貼的通告原文裡的集合時間、地點、聯絡方式沒有對應欄位，整理成一句話放「備註」。
7. 要更新既有通告時，先用 search_notices 找到那一筆。找不到或找到超過一筆而無法區分時，用 need_more_info 問。
8. 一則訊息提到多筆（例如「這幾筆請款了：A、B、C」），用一次 update_notices 一起提議。

回覆一律用繁體中文，語氣簡短直接。`;
}

/** search_notices 回給模型的精簡欄位 —— 不必把整筆塞回去。 */
function summarizeForModel(notice) {
  return {
    page_id: notice.id,
    通告名稱: notice.通告名稱,
    通告日期: notice.通告日期,
    類型: notice.類型,
    來源: notice.來源,
    角色: notice.角色,
    通告金額: notice.通告金額,
    實領: notice.實領,
    對帳狀態: notice.對帳狀態,
    請款日: notice.請款日,
    演出費狀態: notice.演出費狀態,
    簽單狀態: notice.簽單狀態,
  };
}

/**
 * 跑一輪「理解 → 提案」。search_notices 會真的去查 Notion，
 * create/update 只會被攔下來當成提案回傳，不會寫入。
 *
 * @param {Object} params
 * @param {string} params.apiKey Anthropic API key
 * @param {Object} params.notion NotionClient
 * @param {string} params.text 使用者訊息
 * @param {Date} [params.now]
 * @param {Object} [params.clientImpl] 測試用的假 client
 * @return {Promise<{type: string, fields?: Object, updates?: Object[], question?: string,
 *   text?: string, found?: Object[]}>}
 */
async function interpret({apiKey, notion, text, now = new Date(), clientImpl}) {
  const client = clientImpl || new Anthropic({apiKey});
  const messages = [{role: "user", content: text}];
  /** page_id → 查到的原始通告，之後拿來做「舊值 → 新值」的預覽。 */
  const seen = new Map();

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system: systemPrompt(now),
      thinking: {type: "adaptive"},
      output_config: {effort: "low"},
      tools: TOOLS,
      messages,
    });

    if (response.stop_reason === "refusal") {
      return {type: "error", text: "這則訊息我沒辦法處理，換個說法再試一次。"};
    }

    const toolUses = response.content.filter((block) => block.type === "tool_use");

    if (!toolUses.length) {
      const said = response.content
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join("\n")
        .trim();
      return {type: "text", text: said || "我不確定你要我做什麼。"};
    }

    // 提案類的工具：拿到就停，不執行。
    const proposal = toolUses.find((block) => block.name !== "search_notices");
    if (proposal) {
      if (proposal.name === "create_notice") {
        return {type: "create", fields: proposal.input.fields || {}};
      }
      if (proposal.name === "update_notices") {
        return {type: "update", updates: proposal.input.updates || [], seen};
      }
      return {type: "question", question: proposal.input.question || "可以說得更清楚一點嗎？"};
    }

    // 只剩搜尋，執行後把結果餵回去。
    messages.push({role: "assistant", content: response.content});
    const results = [];

    for (const block of toolUses) {
      const input = block.input || {};
      let content;
      try {
        const rows = input.query ?
          await notion.searchByTitle(input.query, input.limit || 8) :
          await notion.query({
            filter: input.對帳狀態 ?
              {property: "對帳狀態", select: {equals: input.對帳狀態}} :
              undefined,
            sorts: [{property: "通告日期", direction: "descending"}],
            limit: input.limit || 8,
          });

        const filtered = input.來源 ? rows.filter((r) => r.來源 === input.來源) : rows;
        filtered.forEach((row) => seen.set(row.id, row));
        content = JSON.stringify(filtered.map(summarizeForModel));
      } catch (err) {
        content = `查詢失敗：${err.message}`;
      }

      results.push({type: "tool_result", tool_use_id: block.id, content});
    }

    messages.push({role: "user", content: results});
  }

  return {type: "text", text: "想太久了，沒得出結論。把訊息拆短一點再試試。"};
}

module.exports = {interpret, TOOLS, MODEL, MAX_TURNS, systemPrompt, buildFieldSchema};
