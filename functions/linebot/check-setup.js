#!/usr/bin/env node
"use strict";

/**
 * 設定檢查工具。每設好一樣東西就跑一次，當場知道對不對，
 * 不用等部署完才發現 token 打錯或忘記把資料庫分享給 integration。
 *
 *   cd functions
 *   NOTION_TOKEN=ntn_xxx npm run check
 *   NOTION_TOKEN=ntn_xxx LINE_CHANNEL_ACCESS_TOKEN=xxx npm run check
 *
 * 只讀不寫，不會動到任何資料。
 */

const {NotionClient} = require("./notion");

const DATA_SOURCE_ID = "9c4165a0-b198-42e1-8389-3578a8b76f10";

const OK = "  ✅";
const NG = "  ❌";
const SKIP = "  ⏭️";

function heading(text) {
  console.log(`\n${text}`);
}

async function checkNotion(token) {
  heading("【Notion】");

  if (!token) {
    console.log(`${SKIP} 沒有設 NOTION_TOKEN，跳過`);
    console.log("     設好之後這樣跑：NOTION_TOKEN=ntn_xxx npm run check");
    return null;
  }

  if (!token.startsWith("ntn_") && !token.startsWith("secret_")) {
    console.log(`${NG} token 格式看起來不對（應該是 ntn_ 開頭）`);
    console.log("     你複製到的可能是別的東西，回 Notion integration 頁面再 Copy 一次");
    return false;
  }

  const notion = new NotionClient(token, DATA_SOURCE_ID);

  let rows;
  try {
    rows = await notion.query({limit: 100});
  } catch (err) {
    console.log(`${NG} 連不上通告總表`);

    if (err.status === 401) {
      console.log("     401 = token 不對。回 Notion integration 頁面重新 Copy 一次。");
    } else if (err.status === 404) {
      console.log("     404 = token 是對的，但這個 integration 看不到「通告總表」。");
      console.log("     👉 十之八九是漏了「把資料庫分享給 integration」這步：");
      console.log("        Notion 開啟「通告總表」→ 右上角 ⋯ → Connections");
      console.log("        → Add connections → 選你剛建的 integration → Confirm");
    } else {
      console.log(`     ${err.message}`);
    }
    return false;
  }

  console.log(`${OK} 讀到通告總表，目前 ${rows.length} 筆通告`);

  const publicRows = rows.filter((r) => r.對外顯示 === true);
  console.log(`${OK} 其中 ${publicRows.length} 筆勾了「對外顯示」（履歷會列出這些）`);

  const unbilled = rows.filter((r) => r.對帳狀態 === "未結");
  console.log(`${OK} ${unbilled.length} 筆未結待請款`);

  const latest = rows
    .filter((r) => r.通告日期)
    .sort((a, b) => (b.通告日期 || "").localeCompare(a.通告日期 || ""))[0];
  if (latest) {
    console.log(`     最近一筆：${latest.通告日期}　${latest.通告名稱}`);
  }

  return true;
}

async function checkLine(token) {
  heading("【LINE】");

  if (!token) {
    console.log(`${SKIP} 沒有設 LINE_CHANNEL_ACCESS_TOKEN，跳過（第 2 步才會用到）`);
    return null;
  }

  const headers = {Authorization: `Bearer ${token}`};

  let info;
  try {
    const response = await fetch("https://api.line.me/v2/bot/info", {headers});
    if (!response.ok) {
      console.log(`${NG} access token 不對（${response.status}）`);
      console.log("     回 LINE Developers Console → Messaging API → 重新發行一次");
      return false;
    }
    info = await response.json();
  } catch (err) {
    console.log(`${NG} 連不上 LINE：${err.message}`);
    return false;
  }

  console.log(`${OK} access token 可用，Bot 名稱「${info.displayName}」`);

  try {
    const response = await fetch("https://api.line.me/v2/bot/channel/webhook/endpoint", {headers});
    if (response.ok) {
      const endpoint = await response.json();
      if (endpoint.endpoint) {
        console.log(`${OK} Webhook 已設定：${endpoint.endpoint}`);
        console.log(`     啟用狀態：${endpoint.active ? "已啟用" : "⚠️ 未啟用（要打開 Use webhook）"}`);
      } else {
        console.log(`${SKIP} Webhook 還沒設（第 5 步才會設）`);
      }
    } else {
      console.log(`${SKIP} Webhook 還沒設（第 5 步才會設）`);
    }
  } catch {
    console.log(`${SKIP} 查不到 Webhook 設定，先不管`);
  }

  return true;
}

function checkWhitelist(raw) {
  heading("【白名單】");

  const ids = String(raw || "").split(/[,\s]+/).map((s) => s.trim()).filter(Boolean);

  if (!ids.length) {
    console.log(`${SKIP} 沒有設 LINE_ALLOWED_USER_IDS，跳過（第 6 步才會設）`);
    return null;
  }

  const bad = ids.filter((id) => !/^U[0-9a-f]{32}$/.test(id));
  if (bad.length) {
    console.log(`${NG} 這些不像 LINE userId：${bad.join("、")}`);
    console.log("     userId 是 U 開頭 + 32 個英數字，在 LINE Developers Console");
    console.log("     → Basic settings → Your user ID 可以找到");
    return false;
  }

  console.log(`${OK} ${ids.length} 個 userId 格式正確`);
  return true;
}

async function main() {
  console.log("檢查 LINE Bot 的設定…");

  const results = [
    await checkNotion(process.env.NOTION_TOKEN),
    await checkLine(process.env.LINE_CHANNEL_ACCESS_TOKEN),
    checkWhitelist(process.env.LINE_ALLOWED_USER_IDS),
  ];

  const failed = results.filter((r) => r === false).length;
  const passed = results.filter((r) => r === true).length;

  heading("────────────────");
  if (failed) {
    console.log(`${failed} 項有問題，${passed} 項正常。照上面的指示修完再跑一次。`);
    process.exitCode = 1;
  } else if (passed) {
    console.log(`設好的 ${passed} 項都正常 👍`);
  } else {
    console.log("什麼都還沒設。從第 1 步的 NOTION_TOKEN 開始。");
  }
}

main().catch((err) => {
  console.error("\n檢查工具自己出錯了：", err.message);
  process.exitCode = 1;
});
