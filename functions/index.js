const {onRequest} = require("firebase-functions/https");
const {defineSecret} = require("firebase-functions/params");
const logger = require("firebase-functions/logger");

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
    res.set("Access-Control-Allow-Origin", "https://tsmik.github.io");
    res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type");

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
    if (hasBack) angleHints.push("背面照片可用於判斷枕骨相關題目。");
    if (hasTop) angleHints.push("頂部照片可用於判斷頂骨相關題目。");
    if (!hasSide) angleHints.push("沒有側面照，需要側面才能判的題目（如額隆起、額立斜、鼻順等）請填 null。");
    if (!hasFront) angleHints.push("沒有正面照，需要正面才能判的題目請盡量從其他角度推斷，無法判斷的填 null。");

    const systemPrompt = `你是面相學觀察助手。你的任務是根據照片，逐題回答觀察問題。

重要原則：
1. 方向性：所有左右皆從本人（subject）角度。照片中人物的左側 = 圖片右側。
2. 只做客觀幾何觀察，不做吉凶論斷。
3. 每題給出答案和信心度（H=高/M=中/L=低）。
4. 無法從照片判斷的題目，answer 填 null、confidence 填 null。
5. 頭部（頂骨、枕骨、華陽、頭骨整體）通常需要觸摸，照片無法判斷，全部填 null。但如果有背面照或頂部照，可嘗試從照片觀察枕骨和頂骨的外觀型相。
6. 需觸摸才能判的題目（硬軟、骨肉比等）填 null。
7. 被頭髮遮擋看不到的部位填 null。
${angleHints.map((h) => "8. " + h).join("\n")}

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
