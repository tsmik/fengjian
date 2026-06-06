// tests/engine_v2/audit_dirt.mjs
// 掃全 13 維 live 規則，偵測髒資料，產出 p2_seed/live_dirt_list.md（rule1 乾淨版藍圖）。
// 純讀取 p2_seed/；不改任何引擎。

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dir, '..', '..');
const live = JSON.parse(readFileSync(join(REPO, 'p2_seed', 'rbf1_settings_rules.json'), 'utf8'));
const questions = JSON.parse(readFileSync(join(REPO, 'p2_seed', 'rbf1_settings_questions.json'), 'utf8'));

const refOptions = {};
for (const pn of Object.keys(questions))
  for (const sec of questions[pn].sections)
    for (const q of sec.qs) refOptions[q.id] = q.opts.map(o => o.v);

const findings = [];
function add(dim, part, type, detail, fix) { findings.push({ dim, part, type, detail, fix }); }

function unwrap(node) {
  return (node && node.rule !== undefined && node.op === undefined && node.partResult === undefined && node.ref === undefined)
    ? node.rule : node;
}
function isAgg(n) { return n && n.op === 'COUNT' && Array.isArray(n.items) && n.items.length && n.items.every(it => it.partResult !== undefined); }

function countUnits(items) {
  const u = [];
  (items || []).forEach(it => {
    if (it.group !== undefined && it.items) it.items.forEach(s => u.push(s));
    else u.push(it);
  });
  return u;
}
// 收集一個 unit 內所有 {ref,match}（含 NOT 內層）
function leavesOf(node, out) {
  if (node == null) return;
  if (node.ref !== undefined) { out.push(node); return; }
  if (node.op === 'NOT') { leavesOf(node.item, out); return; }
  if (node.items) node.items.forEach(x => leavesOf(x, out));
}

live.forEach((d, di) => {
  const partNames = Object.keys(d.parts);
  partNames.forEach(pn => {
    let node = unwrap(d.parts[pn]);

    if (isAgg(node)) {
      // 聚合部位
      const raws = node.items.map(it => it.partResult);
      // 重複子部位
      const seen = {};
      raws.forEach(r => { seen[r] = (seen[r] || 0) + 1; });
      Object.keys(seen).forEach(r => {
        if (seen[r] > 1) add(di, pn, '重複項', `聚合子部位 "${r}" 出現 ${seen[r]} 次`, `去重，每子部位只列一次`);
      });
      // 左右不對稱（X.L 有、X.R 無）
      const bySide = {};
      raws.forEach(r => { const dot = r.indexOf('.'); if (dot >= 0) { const base = r.slice(0, dot), s = r.slice(dot + 1); (bySide[base] = bySide[base] || new Set()).add(s); } });
      Object.keys(bySide).forEach(b => {
        const s = bySide[b];
        if (s.has('L') !== s.has('R')) add(di, pn, '引用錯誤(左右不對稱)', `子部位 "${b}" 只引用了 ${[...s].join('/')} 側`, `補另一側成 ${b}.L + ${b}.R`);
      });
      // 子部位不存在
      raws.forEach(r => { const base = r.split('.')[0]; if (!partNames.includes(base)) add(di, pn, '引用錯誤', `引用不存在的子部位 "${r}"`, `修正引用或移除`); });
      // 壞門檻
      if (node.min <= 0) add(di, pn, '壞門檻', `聚合 min=${node.min}`, `設為合理正整數`);
      if (node.min > raws.length) add(di, pn, '空殼門檻', `聚合 min=${node.min} > 子部位數 ${raws.length}（永遠不成立）`, `下修 min 或補子部位`);
    } else {
      // 葉部位
      const inner = (node.op === 'LR') ? node.each : node;
      if (!inner || inner.op !== 'COUNT') { add(di, pn, '其他', `葉部位內層非 COUNT：${JSON.stringify(inner).slice(0, 60)}`, `人工檢視`); return; }
      const units = countUnits(inner.items);
      // 門檻
      if (inner.min <= 0) add(di, pn, '壞門檻', `COUNT min=${inner.min}`, `設為合理正整數`);
      if (inner.min > units.length) add(di, pn, '空殼門檻', `COUNT min=${inner.min} > 計數單位 ${units.length}（永遠不成立）`, `下修 min`);
      if (units.length === 0) add(di, pn, '空殼', `COUNT 無任何計數單位`, `補卡或移除部位`);
      // 每個葉
      const seenLeaf = {};
      units.forEach(u => {
        const lv = []; leavesOf(u, lv);
        lv.forEach(leaf => {
          const key = leaf.ref + '|' + JSON.stringify(leaf.match);
          seenLeaf[key] = (seenLeaf[key] || 0) + 1;
          // 空 match
          if (leaf.match === '' || leaf.match == null || (Array.isArray(leaf.match) && leaf.match.length === 0))
            add(di, pn, '空match', `ref ${leaf.ref} 的 match 為空`, `補上正確選項`);
          // ref 不在題庫
          if (!refOptions[leaf.ref]) { add(di, pn, '引用錯誤', `ref "${leaf.ref}" 不在 questions 題庫`, `修正 ref 或補題`); return; }
          // match 值不在該題選項（死條件，永遠不命中）
          const arr = Array.isArray(leaf.match) ? leaf.match : [leaf.match];
          const opts = refOptions[leaf.ref];
          const dead = arr.filter(v => opts.indexOf(v) < 0);
          if (dead.length) add(di, pn, '死選項(match不在題庫選項)', `ref ${leaf.ref} match ${JSON.stringify(dead)} 不在題目選項 ${JSON.stringify(opts)}`, `對齊題庫選項字串或更新題目`);
        });
      });
    }
  });
});

// === 輸出 markdown ===
const byType = {};
findings.forEach(f => { byType[f.type] = (byType[f.type] || 0) + 1; });

let md = `# Live 規則髒資料清單（rule1 乾淨版藍圖）\n\n`;
md += `> 由 \`tests/engine_v2/audit_dirt.mjs\` 掃 \`p2_seed/rbf1_settings_rules.json\`（全 13 維）自動產出。\n`;
md += `> 用途：第 3 階段 admin2 編 **rule1 乾淨版** 時逐筆處理。回歸 fixture 目前**照原樣保留**這些髒，\n`;
md += `> 所以 13 維回歸仍 100% 相同；清掉後那幾格會出現「刻意的 diff」。\n\n`;
md += `## 摘要\n\n總筆數：**${findings.length}**\n\n| 分類 | 筆數 |\n|---|---|\n`;
Object.keys(byType).sort().forEach(t => { md += `| ${t} | ${byType[t]} |\n`; });
md += `\n## 明細\n\n| # | 維度 | 部位 | 分類 | 內容 | rule1 建議改法 |\n|---|---|---|---|---|---|\n`;
findings.forEach((f, i) => {
  md += `| ${i + 1} | dim${f.dim} | ${f.part} | ${f.type} | ${f.detail.replace(/\|/g, '\\|')} | ${f.fix.replace(/\|/g, '\\|')} |\n`;
});
md += `\n## 備註\n`;
md += `- 「死選項」最常見＝規則寫的 match 字串與題庫現選項對不上（題目後來改字、規則沒跟著改）→ 該條永遠不命中，等於沒作用。\n`;
md += `- 「左右不對稱／重複項」多為聚合部位手誤（如 dim2 頭 \`頂骨.L\` 兩次缺 \`.R\`）。\n`;
md += `- 本清單不含「設計取捨」類（如門檻高低是否合理）——只列**客觀錯誤/死碼**。門檻調校屬辣度/老師標主輔範疇。\n`;

writeFileSync(join(REPO, 'p2_seed', 'live_dirt_list.md'), md);
console.log(`findings: ${findings.length}`);
console.log('by type:', JSON.stringify(byType));
console.log('wrote p2_seed/live_dirt_list.md');
