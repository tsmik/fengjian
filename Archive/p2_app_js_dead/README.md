# P2 前台死碼封存（2026-07-08）

這 9 個檔案原在 `p2/app/js/`，經完整稽核確認**從未被載入執行**後搬到這裡（P2 入口 `p2/app/index.html` 只載 `liunian_default.js` + `m_main.js` 模組鏈）。

- `app.js`／`ai_analysis.js`／`case_mgmt.js`／`knowledge_page.js`／`notes_page.js`／`rule_engine_v2.js` — efdf9ce 從 P1 批次複製過來的舊桌機殼層，從未接上 P2 入口。
- `obs_ui.js`／`cond_page.js` — 只被 report.js 一行「匯入但從未呼叫」的 import 拉著（該行已刪）。
- `manual.js` — 只被 sens_analysis.js／manual_sens_v2.js 的死頁函式引用（該兩段已刪）。

注意：`m_board.js` 是活的（課程板書），不在此清單。
稽核完整證據見記憶 `reference_p2_dead_code_audit.md`。
