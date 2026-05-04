const {onRequest} = require("firebase-functions/https");
const {defineSecret} = require("firebase-functions/params");
const logger = require("firebase-functions/logger");
const {getFirestore} = require("firebase-admin/firestore");
const {initializeApp, getApps, getApp} = require("firebase-admin/app");

if (getApps().length === 0) {
  initializeApp();
}

const ALLOWED_ORIGINS = [
  "https://tsmik.github.io",
  "https://fengjian.pages.dev",
  "https://staging.fengjian.pages.dev",
];

function setCorsHeaders(req, res) {
  const origin = req.get("Origin");
  // 允許清單內的 origin，或允許 *.fengjian.pages.dev 子網域（給 CF preview 部署用）
  if (origin && (ALLOWED_ORIGINS.includes(origin) || /^https:\/\/[a-z0-9-]+\.fengjian\.pages\.dev$/.test(origin))) {
    res.set("Access-Control-Allow-Origin", origin);
  } else {
    // 預設 fallback 到 production 主網址
    res.set("Access-Control-Allow-Origin", "https://tsmik.github.io");
  }
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type");
}

const claudeApiKey = defineSecret("CLAUDE_API_KEY");

exports.claudeVision = onRequest(
  {
    maxInstances: 1,
    timeoutSeconds: 120,
    secrets: [claudeApiKey],
    invoker: "public",
  },
  async (req, res) => {
    // CORS - must be before anything else
    setCorsHeaders(req, res);

    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }

    if (req.method !== "POST") {
      res.status(405).json({error: "Method not allowed"});
      return;
    }

    // Support new format (images array) and old format (frontImage/sideImage)
    let {images, frontImage, frontType, sideImage, sideType, questions} = req.body;

    // Convert old format to new
    if (!images && frontImage) {
      images = [{base64: frontImage, mediaType: frontType || "image/jpeg", type: "正面"}];
      if (sideImage) {
        images.push({base64: sideImage, mediaType: sideType || "image/jpeg", type: "側面"});
      }
    }

    if (!images || images.length === 0) {
      res.status(400).json({error: "images is required"});
      return;
    }

    const apiKey = claudeApiKey.value();
    if (!apiKey) {
      logger.error("CLAUDE_API_KEY not set");
      res.status(500).json({error: "API key not configured"});
      return;
    }

    // Build image content blocks
    const imageContent = images.map((img) => ({
      type: "image",
      source: {
        type: "base64",
        media_type: img.mediaType || "image/jpeg",
        data: (img.base64 || "").replace(/\s/g, ""),
      },
    }));

    // Build photo description for prompt
    const photoDesc = images.map((img, i) => `第${i + 1}張：${img.type || "照片"}`).join("、");

    // Determine what angles are available
    const types = images.map((img) => img.type || "");
    const hasFront = types.some((t) => t === "正面");
    const hasSide = types.some((t) => t.includes("側") || t.includes("90°"));
    const hasBack = types.some((t) => t === "背面");
    const hasTop = types.some((t) => t === "頂部");

    // Build angle hints
    const angleHints = [];
    if (hasBack) angleHints.push("有背面照，可用於判斷枕骨相關題目。");
    if (hasTop) angleHints.push("有頂部照，可用於判斷頂骨相關題目。");
    if (!hasSide) angleHints.push("沒有側面照，但正面照如果有線索（如鼻高低可從山根寬窄推測、額立斜可從額頭輪廓推測），就盡量判讀並標 L。");
    if (!hasFront) angleHints.push("沒有正面照，請盡量從其他角度推斷，信心低就標 L。");

    const systemPrompt = `你是面相學觀察助手。你的任務是根據照片，逐題回答觀察問題。

重要原則：
1. 方向性：所有左右皆從本人（subject）角度。照片中人物的左側 = 圖片右側。
2. 只做客觀幾何觀察，不做吉凶論斷。
3. 每題給出答案和信心度（H=高/M=中/L=低）。
4. 盡量判讀每一題，即使信心度低也要給出你的最佳判斷，用 L（低信心）標記。
5. 只有在完全不可能從任何照片角度看出來的情況下才填 null（例如需要用手觸摸骨頭硬度、按壓肉質軟硬）。
6. 必須填 null 的觸摸類題目：頭骨硬度（h15）、耳質硬軟（er11）、眉毛硬軟（br15），這些絕對需要觸摸。其他題目都應盡量判讀。
7. 被頭髮部分遮擋的部位，如果能看到一點線索，就盡量判讀並標 L。只有完全看不到才填 null。
8. 骨肉比例類題目（鼻骨肉比 n10、顴骨肉比 q3、地閣骨肉 c6），從照片的視覺線索盡量判讀，標 L 或 M。
9. 頭骨形狀類題目（頂骨、枕骨、華陽骨），如果有對應角度的照片（頂部照、背面照、側面照）就盡量判讀。只有僅有正面照時才填 null。
${angleHints.map((h) => "10. " + h).join("\n")}

回覆格式：只回傳 JSON，不要任何其他文字。格式如下：
{
  "h1_L": { "answer": null, "confidence": null },
  "h1_R": { "answer": null, "confidence": null },
  "e1": { "answer": "額高", "confidence": "H" },
  "br1_L": { "answer": "眉長", "confidence": "H" },
  "br1_R": { "answer": "眉長", "confidence": "M" }
}

左右分開題的 key 用 _L 和 _R 後綴。
非左右題直接用 qId 作為 key。`;

    const userMessage = `共 ${images.length} 張照片（${photoDesc}）。請根據照片逐題回答以下觀察問題。\n\n${questions}`;

    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 8000,
          system: systemPrompt,
          messages: [
            {
              role: "user",
              content: [
                ...imageContent,
                {type: "text", text: userMessage},
              ],
            },
          ],
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        logger.error("Claude API error", {status: response.status, body: errText});
        res.status(502).json({error: `Claude API error: ${response.status}`, details: errText});
        return;
      }

      const data = await response.json();
      const textContent = data.content.find((c) => c.type === "text");

      if (!textContent) {
        res.status(502).json({error: "No text response from Claude"});
        return;
      }

      // Parse the JSON from Claude's response
      let parsed;
      try {
        let jsonStr = textContent.text.trim();
        const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (jsonMatch) {
          jsonStr = jsonMatch[1].trim();
        }
        parsed = JSON.parse(jsonStr);
      } catch (parseErr) {
        logger.error("Failed to parse Claude response", {text: textContent.text});
        res.status(502).json({error: "Failed to parse Claude response", raw: textContent.text});
        return;
      }

      res.json({results: parsed});
    } catch (err) {
      logger.error("Request failed", {error: err.message});
      res.status(500).json({error: err.message});
    }
  },
);

exports.claudeAnalysis = onRequest(
  {
    maxInstances: 2,
    timeoutSeconds: 120,
    secrets: [claudeApiKey],
    invoker: "public",
  },
  async (req, res) => {
    // CORS
    setCorsHeaders(req, res);

    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }

    if (req.method !== "POST") {
      res.status(405).json({error: "Method not allowed"});
      return;
    }

    // 取得前端傳入的用戶數據
    const {name, gender, age, dimData, coefficients} = req.body;

    if (!name || !dimData || !coefficients) {
      res.status(400).json({error: "name, dimData, coefficients are required"});
      return;
    }

    const apiKey = claudeApiKey.value();
    if (!apiKey) {
      logger.error("CLAUDE_API_KEY not set");
      res.status(500).json({error: "API key not configured"});
      return;
    }

    const db = getFirestore();

    // 從 Firestore 讀取最新規則
    let dimRules = null;
    try {
      const rulesDoc = await db.collection("settings").doc("rules").get();
      if (rulesDoc.exists && rulesDoc.data().rulesJson) {
        dimRules = JSON.parse(rulesDoc.data().rulesJson);
      }
    } catch (err) {
      logger.error("Failed to load rules from Firestore", {error: err.message});
      res.status(500).json({error: "Failed to load rules from Firestore"});
      return;
    }

    if (!dimRules || !Array.isArray(dimRules) || dimRules.length !== 13) {
      res.status(500).json({error: "Invalid rules data in Firestore"});
      return;
    }

    // 從 Firestore 讀取最新 prompt
    let systemPrompt = null;
    try {
      const promptDoc = await db.collection("settings").doc("analysis_prompt").get();
      if (promptDoc.exists && promptDoc.data().prompt) {
        systemPrompt = promptDoc.data().prompt;
      }
    } catch (err) {
      logger.error("Failed to load prompt from Firestore", {error: err.message});
    }

    // 如果 Firestore 沒有 prompt，用預設值
    if (!systemPrompt) {
      const dimSummary = dimRules.map((dim, i) => {
        return `${String(i + 1).padStart(2, "0")} ${dim.positive}${dim.negative}（${dim.positiveType}=${dim.positive}，${dim.negativeType}=${dim.negative}）`;
      }).join("\n");

      systemPrompt = `你是「風鑑學堂」的人相兵法 AI 評析師。你的任務是根據面相觀察數據，為學員提供深度、務實、有血有肉的人相兵法分析。

分析原則：
1. 動靜不是好壞之分，每種配置都有其適合的戰場和策略。
2. 先天是「資源池」，後天是「怎麼花資源」。先天不足時後天偏動是必要的生存策略，不能說「你太拼了要放鬆」。
3. 分析要從係數入手，但結論要深入到部位分布，不能只講係數數字。
4. 要讓學員感受到「這在說的是我」，不是在排列參數標籤。
5. 語氣穩重深刻，引人深思，不說廢話。
6. 使用繁體中文。

13個維度：
${dimSummary}

判讀順序：
1. 總係數 → 三大子係數（先天/運氣/後天）找出「誰在撐、誰在拖」
2. 老闆係數 vs 主管係數，判斷格局走向
3. 各維度細節，重點放在係數最極端的維度
4. 部位層，找出強點和弱點
5. 具體調整方向建議

分析長度：約 600-800 字，分段清晰。`;
    }

    // 組成部位×維度明細表
    const partNames = ["頭", "上停", "中停", "下停", "耳", "眉", "眼", "鼻", "口"];
    const dimNames = dimRules.map((d) => `${d.positive}${d.negative}`);

    let dimTable = "部位 × 維度明細（各部位在各維度的動靜）：\n";
    dimTable += "部位 | " + dimNames.join(" | ") + "\n";
    dimTable += "--- | " + dimNames.map(() => "---").join(" | ") + "\n";

    for (const part of partNames) {
      const row = dimNames.map((dn) => {
        const val = (dimData[dn] && dimData[dn][part]) ? dimData[dn][part] : "-";
        return val;
      });
      dimTable += `${part} | ${row.join(" | ")}\n`;
    }

    // 組成係數摘要
    const coefText = [
      `總係數：${coefficients.total ?? "-"}`,
      `先天指數：${coefficients.innate ?? "-"}`,
      `老闆係數：${coefficients.boss ?? "-"}`,
      `主管係數：${coefficients.manager ?? "-"}`,
      `運氣指數：${coefficients.luck ?? "-"}`,
      `後天指數：${coefficients.acquired ?? "-"}`,
    ].join("　");

    // 組成 13 維度動靜摘要
    const dimResultText = dimRules.map((dim) => {
      const dn = `${dim.positive}${dim.negative}`;
      const res = dimData[dn] ? dimData[dn]["_result"] : null;
      const coef = dimData[dn] ? dimData[dn]["_coef"] : null;
      if (!res) return `${dn}：未完成`;
      return `${dn}：${res}（係數 ${coef ?? "-"}）`;
    }).join("　");

    // User message
    const userMessage = `請為以下學員進行人相兵法評析：

姓名：${name}
性別：${gender || "未知"}
年齡：${age || "未知"}

【係數總覽】
${coefText}

【13維度動靜】
${dimResultText}

【部位 × 維度明細】
${dimTable}

請依照判讀原則，給出完整的人相兵法評析。`;

    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 2000,
          system: systemPrompt,
          messages: [
            {role: "user", content: userMessage},
          ],
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        logger.error("Claude API error", {status: response.status, body: errText});
        res.status(502).json({error: `Claude API error: ${response.status}`, details: errText});
        return;
      }

      const data = await response.json();
      const textContent = data.content.find((c) => c.type === "text");

      if (!textContent) {
        res.status(502).json({error: "No text response from Claude"});
        return;
      }

      res.json({analysis: textContent.text});
    } catch (err) {
      logger.error("Request failed", {error: err.message});
      res.status(500).json({error: err.message});
    }
  },
);

// ==================== publishToProduction ====================
// 只在 staging 環境呼叫。把 staging settings/rules 和 settings/questions
// 複製到 production Firestore，同時記錄各部位/維度更新時間戳記。

const PROD_PROJECT_ID = "renxiangbingfa";
const STAGING_PROJECT_ID = "renxiangbingfa-staging";

function getProductionDb() {
  try {
    return getFirestore(getApp("prod"));
  } catch (e) {
    const prodApp = initializeApp({projectId: PROD_PROJECT_ID}, "prod");
    return getFirestore(prodApp);
  }
}

const PUBLISH_ADMIN_UIDS = [
  "XT1Err9cmnNokgMQKUrGUj3ishG2", // production admin
  "ARGLfFp3HqbWMtN7CAoAxR4rHhm1", // staging admin
];

const Q_PART_NAMES_PUB = ["頭", "額", "耳", "眉", "眼", "鼻", "顴", "口", "人中", "地閣", "頤"];
const DIM_NAMES_PUB = ["形勢", "經緯", "方圓", "曲直", "收放", "緩急", "順逆", "分合", "真假", "攻守", "奇正", "虛實", "進退"];

exports.publishToProduction = onRequest(
  {
    region: "us-central1",
    invoker: "public",
    timeoutSeconds: 60,
  },
  async (req, res) => {
    // CORS
    setCorsHeaders(req, res);
    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }
    if (req.method !== "POST") {
      res.status(405).json({error: "Method not allowed"});
      return;
    }

    // 驗證：只允許 admin uid
    const {callerUid} = req.body;
    if (!callerUid || !PUBLISH_ADMIN_UIDS.includes(callerUid)) {
      res.status(403).json({error: "Unauthorized"});
      return;
    }

    try {
      const stagingApp = (() => {
        try { return getApp("staging"); } catch (e) {
          return initializeApp({projectId: STAGING_PROJECT_ID}, "staging");
        }
      })();
      const stagingDb = getFirestore(stagingApp);
      const prodDb = getProductionDb();

      const now = new Date().toISOString();

      // 讀 staging rules
      const stagingRulesDoc = await stagingDb.collection("settings").doc("rules").get();
      if (!stagingRulesDoc.exists || !stagingRulesDoc.data().rulesJson) {
        res.status(400).json({error: "Staging rules not found"});
        return;
      }
      const rulesJson = stagingRulesDoc.data().rulesJson;

      // 讀 staging questions
      const stagingQuestionsDoc = await stagingDb.collection("settings").doc("questions").get();
      if (!stagingQuestionsDoc.exists || !stagingQuestionsDoc.data().questionsJson) {
        res.status(400).json({error: "Staging questions not found"});
        return;
      }
      const questionsJson = stagingQuestionsDoc.data().questionsJson;

      // 備份 production 現有資料
      const prodRulesDoc = await prodDb.collection("settings").doc("rules").get();
      const prodQuestionsDoc = await prodDb.collection("settings").doc("questions").get();
      if (prodRulesDoc.exists) {
        await prodDb.collection("settings").doc("rules_backup").set({
          ...prodRulesDoc.data(),
          backedUpAt: now,
        });
      }
      if (prodQuestionsDoc.exists) {
        await prodDb.collection("settings").doc("questions_backup").set({
          ...prodQuestionsDoc.data(),
          backedUpAt: now,
        });
      }

      // 計算各部位/維度更新時間戳記
      const updateLog = {};

      // 比對 questions（部位層）
      let stagingQuestions = {};
      let prodQuestions = {};
      try { stagingQuestions = JSON.parse(questionsJson); } catch (e) {}
      try { prodQuestions = prodQuestionsDoc.exists && prodQuestionsDoc.data().questionsJson ? JSON.parse(prodQuestionsDoc.data().questionsJson) : {}; } catch (e) {}

      Q_PART_NAMES_PUB.forEach((part) => {
        const stagingPart = JSON.stringify(stagingQuestions[part] || {});
        const prodPart = JSON.stringify(prodQuestions[part] || {});
        if (stagingPart !== prodPart) {
          updateLog["part_" + part] = now;
        }
      });

      // 比對 rules（維度層）
      let stagingRules = [];
      let prodRules = [];
      try { stagingRules = JSON.parse(rulesJson); } catch (e) {}
      try { prodRules = prodRulesDoc.exists && prodRulesDoc.data().rulesJson ? JSON.parse(prodRulesDoc.data().rulesJson) : []; } catch (e) {}

      DIM_NAMES_PUB.forEach((dim, i) => {
        const stagingDim = JSON.stringify(stagingRules[i] || {});
        const prodDim = JSON.stringify(prodRules[i] || {});
        if (stagingDim !== prodDim) {
          updateLog["dim_" + dim] = now;
        }
      });

      // 寫入 production
      await prodDb.collection("settings").doc("rules").set({
        rulesJson,
        updatedAt: now,
        publishedFrom: "staging",
        publishedBy: callerUid,
      });
      await prodDb.collection("settings").doc("questions").set({
        questionsJson,
        updatedAt: now,
        publishedFrom: "staging",
        publishedBy: callerUid,
      });

      // 寫入更新時間戳記（合併到現有的 updateLog）
      if (Object.keys(updateLog).length > 0) {
        await prodDb.collection("settings").doc("updateLog").set(updateLog, {merge: true});
      }

      const changedParts = Q_PART_NAMES_PUB.filter((p) => updateLog["part_" + p]);
      const changedDims = DIM_NAMES_PUB.filter((d) => updateLog["dim_" + d]);

      res.json({
        success: true,
        publishedAt: now,
        changedParts,
        changedDims,
        message: `發布成功。變動部位：${changedParts.join("、") || "無"}；變動維度：${changedDims.join("、") || "無"}`,
      });
    } catch (err) {
      logger.error("publishToProduction error", {error: err.message, stack: err.stack});
      res.status(500).json({error: err.message});
    }
  },
);

// ==================== getRules ====================

const DIM_NAMES = ["形勢", "經緯", "方圓", "曲直", "收放", "緩急", "順逆", "分合", "真假", "攻守", "奇正", "虛實", "進退"];
const PART_ORDER = ["頭", "上停", "耳", "眉", "眼", "鼻", "口", "顴", "人中", "地閣", "頤", "中停", "下停"];

function nodeToMd(node, depth, qLookup, dim) {
  if (!node) return "";
  const indent = "  ".repeat(depth);
  let md = "";

  // partResult 節點
  if (node.partResult !== undefined) {
    md += indent + "- 引用 **" + node.partResult + "** 的判定結果\n";
    return md;
  }

  // 葉節點：有 ref 的條件
  if (node.ref) {
    const q = qLookup[node.ref];
    const qText = q ? q.text : node.ref;
    const matchArr = Array.isArray(node.match) ? node.match : [node.match];
    let matchLabels = [];
    if (q) {
      matchArr.forEach(function(m) {
        const opt = q.opts.find(function(o) { return o.val === m; });
        matchLabels.push(opt ? opt.label : m);
      });
    } else {
      matchLabels = matchArr;
    }
    const side = node.side;
    let sideLabel; let sideType;
    if (side === "L" || side === "R") {
      sideLabel = dim.positive;
      sideType = dim.positiveType;
    } else if (side === "B") {
      sideLabel = dim.negative;
      sideType = dim.negativeType;
    } else {
      sideLabel = dim.positive;
      sideType = dim.positiveType;
    }

    let line = indent + "- **" + sideLabel + "（" + sideType + "）**：" + qText + " → " + matchLabels.join(" / ");

    if (node.veto && node.veto.length > 0) {
      node.veto.forEach(function(v) {
        if (v.condition && v.condition.ref) {
          const vq = qLookup[v.condition.ref];
          const vText = vq ? vq.text : v.condition.ref;
          const vMatch = Array.isArray(v.condition.match) ? v.condition.match : [v.condition.match];
          let vLabels = [];
          if (vq) {
            vMatch.forEach(function(vm) {
              const vopt = vq.opts.find(function(o) { return o.val === vm; });
              vLabels.push(vopt ? vopt.label : vm);
            });
          } else { vLabels = vMatch; }
          line += "（排除：" + vText + " = " + vLabels.join("/") + " → " + v.result + "）";
        }
      });
    }
    md = line + "\n";
    return md;
  }

  // 純 veto 節點
  if (node.veto && !node.op && !node.ref && !node.partResult) {
    node.veto.forEach(function(v) {
      if (v.condition) {
        md += indent + "- ⛔ VETO（" + v.result + "）：\n";
        md += nodeToMd(v.condition, depth + 1, qLookup, dim);
      }
    });
    if (node.rule) md += nodeToMd(node.rule, depth, qLookup, dim);
    return md;
  }

  // rule 包裝節點
  if (node.rule && !node.op) {
    return nodeToMd(node.rule, depth, qLookup, dim);
  }

  // AND / OR / COUNT 複合節點
  if (node.op === "AND" || node.op === "OR" || node.op === "COUNT") {
    let opLabel = node.op;
    if (node.op === "COUNT") opLabel = "至少 " + node.min + " 項符合";
    md += indent + "- 【" + opLabel + "】\n";
    if (node.items && Array.isArray(node.items)) {
      node.items.forEach(function(item) {
        md += nodeToMd(item, depth + 1, qLookup, dim);
      });
    }
    if (node.each) {
      md += nodeToMd(node.each, depth + 1, qLookup, dim);
    }
    if (node.veto && node.veto.length > 0) {
      node.veto.forEach(function(v) {
        if (v.condition) {
          md += indent + "  - ⛔ VETO（" + v.result + "）：\n";
          md += nodeToMd(v.condition, depth + 2, qLookup, dim);
        }
      });
    }
    return md;
  }

  // NOT 節點
  if (node.op === "NOT") {
    md += indent + "- 【NOT 排除】\n";
    if (node.item) md += nodeToMd(node.item, depth + 1, qLookup, dim);
    return md;
  }

  // LR 節點
  if (node.op === "LR") {
    const mergeLabel = node.merge === "all" ? "左右都要符合" : "左右任一符合";
    md += indent + "- 【LR " + mergeLabel + "】\n";
    if (node.each) {
      md += nodeToMd(node.each, depth + 1, qLookup, dim);
    }
    if (node.items && Array.isArray(node.items)) {
      node.items.forEach(function(item) {
        md += nodeToMd(item, depth + 1, qLookup, dim);
      });
    }
    return md;
  }

  // group / 敘述分組
  if (node.op === "group") {
    if (node.label) md += indent + "- 【" + node.label + "】\n";
    if (node.items && Array.isArray(node.items)) {
      node.items.forEach(function(item) {
        md += nodeToMd(item, depth + (node.label ? 1 : 0), qLookup, dim);
      });
    }
    return md;
  }

  // each 節點（沒有 op 但有 each）
  if (node.each && !node.op) {
    return nodeToMd(node.each, depth, qLookup, dim);
  }

  // 未知節點 fallback
  if (node.items && Array.isArray(node.items)) {
    node.items.forEach(function(item) {
      md += nodeToMd(item, depth, qLookup, dim);
    });
  }

  return md;
}

exports.getRules = onRequest(
  {
    region: "us-central1",
    invoker: "public",
    cors: true,
  },
  async (req, res) => {
    const dimIdx = parseInt(req.query.dim);
    if (isNaN(dimIdx) || dimIdx < 0 || dimIdx > 12) {
      res.status(400).send("Invalid dim parameter. Use 0-12.");
      return;
    }

    const db = getFirestore();
    const [rulesDoc, questionsDoc] = await Promise.all([
      db.collection("settings").doc("rules").get(),
      db.collection("settings").doc("questions").get(),
    ]);

    if (!rulesDoc.exists || !rulesDoc.data().rulesJson) {
      res.status(500).send("Rules not found in Firestore");
      return;
    }

    const rules = JSON.parse(rulesDoc.data().rulesJson);
    const questions = questionsDoc.exists && questionsDoc.data().questionsJson
      ? JSON.parse(questionsDoc.data().questionsJson)
      : {};

    const dim = rules[dimIdx];
    if (!dim) {
      res.status(404).send("Dimension not found");
      return;
    }

    // 建 qLookup
    const qLookup = {};
    Object.keys(questions).forEach((partName) => {
      const pd = questions[partName];
      if (!pd || !pd.sections) return;
      pd.sections.forEach((sec) => {
        sec.qs.forEach((q) => {
          qLookup[q.id] = {text: q.text, opts: q.opts, part: partName};
        });
      });
    });

    // 組 markdown
    const dimName = DIM_NAMES[dimIdx];
    let md = `# ${dimName} 評分條件\n`;
    md += `> 匯出時間：${new Date().toISOString().substring(0, 19)}\n`;
    md += `> 分類：${dim.category}\n`;
    md += `> A 側：${dim.positive}（${dim.positiveType}） / B 側：${dim.negative}（${dim.negativeType}）\n\n`;
    md += `---\n\n`;

    PART_ORDER.forEach((partName) => {
      const pd = dim.parts[partName];
      if (!pd) return;
      const content = nodeToMd(pd, 0, qLookup, dim);
      if (!content.trim()) return;
      md += `## ${partName}\n\n`;
      md += content;
      md += "\n";
    });

    res.set("Content-Type", "text/markdown; charset=utf-8");
    res.send(md);
  },
);

// ==================== getStudentData ====================
// D 類討論用：撈 admin 案例庫資料給 claude.ai
// 對應前端 case_mgmt.js 的 exportAllCases()，回傳格式完全一致

const ADMIN_UID = "XT1Err9cmnNokgMQKUrGUj3ishG2";
const studentDataSecret = defineSecret("STUDENT_DATA_SECRET");

const PARTS_LABELS = ["頭", "上停", "中停", "下停", "耳", "眉", "眼", "鼻", "口"];

// 模擬 case_mgmt.js 的 buildExportFromData
// 不依賴 core.js DIMS，而是用從 Firestore 讀來的 rules 重建
function buildExportFromData(name, gender, birthday, date, d, rules) {
  if (!d || !Array.isArray(d) || d.length !== 13) return null;
  let hasAny = false;
  for (let ci = 0; ci < 13 && !hasAny; ci++) {
    for (let cj = 0; cj < 9 && !hasAny; cj++) {
      if (d[ci][cj]) hasAny = true;
    }
  }
  if (!hasAny) return null;

  function cDim(i) {
    const r = d[i];
    const a = r.filter((v) => v === "A").length;
    const b = r.filter((v) => v === "B").length;
    if (a + b === 0) return null;
    return {
      a: a,
      b: b,
      coeff: Math.min(a, b) / Math.max(a, b),
      type: a > b ? rules[i].positiveType : rules[i].negativeType,
    };
  }

  function aCoeff(ids) {
    let sumMin = 0;
    let sumMax = 0;
    ids.forEach((i) => {
      const r = cDim(i);
      if (r) {
        sumMin += Math.min(r.a, r.b);
        sumMax += Math.max(r.a, r.b);
      }
    });
    return sumMax > 0 ? (sumMin / sumMax).toFixed(2) : "0.00";
  }

  const matrix = {};
  for (let di = 0; di < 13; di++) {
    const dimResult = cDim(di);
    const parts = {};
    for (let pi = 0; pi < 9; pi++) {
      const v = d[di][pi];
      if (v) {
        const tp = v === "A" ? rules[di].positiveType : rules[di].negativeType;
        const ch = v === "A" ? rules[di].positive : rules[di].negative;
        parts[PARTS_LABELS[pi]] = ch + "(" + tp + ")";
      } else {
        parts[PARTS_LABELS[pi]] = null;
      }
    }
    matrix[`${rules[di].positive}${rules[di].negative}`] = {
      parts: parts,
      coeff: dimResult ? dimResult.coeff.toFixed(2) : null,
      type: dimResult ? dimResult.type : null,
      staticCount: dimResult ? (rules[di].positiveType === "靜" ? dimResult.a : dimResult.b) : 0,
      dynamicCount: dimResult ? (rules[di].positiveType === "靜" ? dimResult.b : dimResult.a) : 0,
    };
  }

  return {
    name: name || "未命名",
    gender: gender || "",
    birthday: birthday || "",
    date: date || "",
    coefficients: {
      total: aCoeff([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]),
      innate: aCoeff([0, 1, 2, 3, 4, 5]),
      luck: aCoeff([6, 7, 8]),
      acquired: aCoeff([9, 10, 11, 12]),
      boss: aCoeff([0, 1, 2]),
      manager: aCoeff([3, 4, 5]),
    },
    matrix: matrix,
    rawData: d,
  };
}

function parseDataJson(jsonStr) {
  if (!jsonStr) return null;
  try {
    const d = JSON.parse(jsonStr);
    if (d && Array.isArray(d) && d.length === 13) return d;
  } catch (e) {}
  return null;
}

// 對一個 doc，收集 0-2 筆 export（manual + obs）
// 注意：obs 部分簡化為「只有 dataJson 才算 obs」，不做 obsJson 重算
function collectExports(docData, name, gender, birthday, date, caseId, isSelf, rules) {
  const exports = [];

  // 手動資料
  const manualD = parseDataJson(docData.manualDataJson);
  if (manualD) {
    const ex = buildExportFromData(name, gender, birthday, date, manualD, rules);
    if (ex) {
      ex._dataSource = "manual";
      if (isSelf) ex._source = "self";
      if (caseId) ex._caseId = caseId;
      exports.push(ex);
    }
  }

  // 觀察資料（簡化：只用 dataJson，不重算 obsJson）
  const obsD = parseDataJson(docData.dataJson);
  if (obsD) {
    const ex2 = buildExportFromData(name, gender, birthday, date, obsD, rules);
    if (ex2) {
      ex2._dataSource = "obs";
      if (isSelf) ex2._source = "self";
      if (caseId) ex2._caseId = caseId;
      exports.push(ex2);
    }
  }

  return exports;
}

exports.getStudentData = onRequest(
  {
    region: "us-central1",
    invoker: "public",
    cors: true,
    secrets: [studentDataSecret],
  },
  async (req, res) => {
    // 強制 CORS *（claude.ai web_fetch 不從 tsmik.github.io 發出）
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type, X-API-Secret");

    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }

    try {
      // 1. 驗 secret
      const expectedSecret = studentDataSecret.value();
      const providedSecret = req.query.secret || req.get("X-API-Secret");
      if (!providedSecret || providedSecret !== expectedSecret) {
        res.status(401).json({error: "unauthorized", message: "Invalid or missing secret"});
        return;
      }

      // 2. 驗 source（v1 只支援 admin）
      const source = req.query.source || "admin";
      if (source !== "admin") {
        res.status(400).json({
          error: "unsupported_source",
          message: "Only \"admin\" source supported in v1",
          supported: ["admin"],
        });
        return;
      }

      // 3. 解析參數
      const studentParam = req.query.student; // 學員姓名 / "all" / undefined
      const listMode = req.query.list === "1";
      const dataSourceFilter = req.query.dataSource; // "manual" / "obs" / undefined

      const db = getFirestore();

      // 4. 撈 rules（轉換邏輯需要）
      const rulesDoc = await db.collection("settings").doc("rules").get();
      if (!rulesDoc.exists || !rulesDoc.data().rulesJson) {
        res.status(500).json({error: "rules_not_found", message: "Rules not in Firestore"});
        return;
      }
      const rules = JSON.parse(rulesDoc.data().rulesJson);
      if (!Array.isArray(rules) || rules.length !== 13) {
        res.status(500).json({error: "invalid_rules", message: "Rules format invalid"});
        return;
      }

      // 5. 撈 admin 自己的 doc + 所有 cases
      const results = [];

      // 5a. admin 本人資料
      const selfDoc = await db.collection("users").doc(ADMIN_UID).get();
      let adminName = "曾麥可"; // fallback
      if (selfDoc.exists) {
        const sd = selfDoc.data();
        if (sd.displayName) adminName = sd.displayName;
        const selfExports = collectExports(sd, adminName, sd.gender, sd.birthday, "", null, true, rules);
        selfExports.forEach((e) => results.push(e));
      }

      // 5b. admin 底下所有案例
      const snap = await db.collection("users").doc(ADMIN_UID).collection("cases").orderBy("createdAt", "desc").get();
      snap.forEach((doc) => {
        const c = doc.data();
        const caseExports = collectExports(c, c.name, c.gender, c.birthday, c.date, doc.id, false, rules);
        caseExports.forEach((e) => results.push(e));
      });

      if (results.length === 0) {
        res.json({
          error: "no_data",
          message: "No exportable data in admin library",
        });
        return;
      }

      // 6. List 模式：只回姓名清單
      if (listMode) {
        const names = new Set();
        results.forEach((r) => {
          if (r.name) names.add(r.name);
        });
        res.json({
          students: Array.from(names).sort(),
          count: names.size,
        });
        return;
      }

      // 7. 過濾學員姓名
      let filtered = results;
      if (studentParam && studentParam !== "all") {
        filtered = results.filter((r) => r.name === studentParam);
        if (filtered.length === 0) {
          const available = Array.from(new Set(results.map((r) => r.name))).sort();
          res.json({
            error: "student_not_found",
            message: `Student "${studentParam}" not in admin library`,
            available: available,
          });
          return;
        }
      }

      // 8. 過濾 dataSource (manual/obs)
      if (dataSourceFilter && (dataSourceFilter === "manual" || dataSourceFilter === "obs")) {
        filtered = filtered.filter((r) => r._dataSource === dataSourceFilter);
      }

      // 9. 組裝 summary 表（仿 exportAllCases）
      const caseMap = {};
      filtered.forEach((r) => {
        const key = r._caseId || "_self_";
        if (!caseMap[key]) caseMap[key] = {name: r.name, manual: null, obs: null};
        let dimCount = 0;
        for (const dn in r.matrix) {
          if (r.matrix[dn].type !== null) dimCount++;
        }
        const status = dimCount === 13 ? "✅ 完整" : "⚠️ " + dimCount + "/13 維度";
        if (r._dataSource === "manual") caseMap[key].manual = status;
        else caseMap[key].obs = status;
      });
      const summaryLines = ["| 案例 | 手動 | 觀察 |", "|------|------|------|"];
      for (const sk in caseMap) {
        const s = caseMap[sk];
        summaryLines.push("| " + s.name + " | " + (s.manual || "—") + " | " + (s.obs || "—") + " |");
      }

      // 10. 回傳（格式跟 case_mgmt.js exportAllCases 一致）
      res.json({
        exportedAt: new Date().toISOString(),
        exportedBy: adminName,
        totalCases: filtered.length,
        summary: summaryLines.join("\n"),
        instruction: "收到此檔案時，請先顯示上方 summary 的案例總表，等使用者指定要分析哪個案例、用手動還是觀察資料，再開始分析。",
        note: "同一案例可能有兩筆（manual=手動輸入, obs=觀察題），以 _dataSource 區分",
        cases: filtered,
      });
    } catch (err) {
      logger.error("getStudentData error", {error: err.message, stack: err.stack});
      res.status(500).json({error: "internal_error", message: err.message});
    }
  },
);
