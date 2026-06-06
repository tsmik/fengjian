// p2/seed/build_observations.mjs
// 觀察庫「撈草稿」：P1 questions（OBS_PARTS_DATA）→ 新 observations（v0.6 §A.1）。
// 純讀 p2_seed/rbf1_settings_questions.json，產出 observations.json（之後推到 rbf2-staging）。
// 規則：
//  - q.text → label；q.opts[].v → options[]；q.opts[].hint → optionHints（保留草稿，不丟資料）。
//  - **paired 不進 observation**（轉成部位 lrMode，屬 ruleSet 範疇）→ 另存 paired_map.json 供第 3 階段用。
//  - 保留 sourceQid（= 原 q.id，可追溯）。

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dir, '..', '..');
const Q = JSON.parse(readFileSync(join(REPO, 'p2_seed', 'rbf1_settings_questions.json'), 'utf8'));

const observations = [];
const pairedMap = {};   // q.id -> true（paired）；給第 3 階段推 lrMode 用，不寫進 observation
const seen = new Set();
let collisions = 0;

for (const partName of Object.keys(Q)) {
  for (const sec of (Q[partName].sections || [])) {
    for (const q of (sec.qs || [])) {
      if (seen.has(q.id)) { collisions++; console.log('⚠️ obsId 重複:', q.id); }
      seen.add(q.id);

      const options = (q.opts || []).map(o => o.v);
      const optionHints = {};
      let anyHint = false;
      (q.opts || []).forEach(o => { if (o.hint) { optionHints[o.v] = o.hint; anyHint = true; } });

      const obs = {
        obsId: q.id,
        part: partName,          // 解剖部位（題庫部位名：頭/額/耳/眉/眼/鼻/顴/口/人中/地閣/頤）
        section: sec.label || '',
        label: q.text,
        options,
        note: '',
        sourceQid: q.id
      };
      if (anyHint) obs.optionHints = optionHints;
      observations.push(obs);

      if (q.paired) pairedMap[q.id] = true;   // 只記在 manifest，不進 observation
    }
  }
}

mkdirSync(__dir, { recursive: true });
writeFileSync(join(__dir, 'observations.json'), JSON.stringify(observations, null, 2));
writeFileSync(join(__dir, 'paired_map.json'), JSON.stringify(pairedMap, null, 2));

console.log(`observations: ${observations.length}  (obsId 重複: ${collisions})`);
console.log(`paired questions (記在 paired_map, 不進 observation): ${Object.keys(pairedMap).length}`);
console.log('parts:', Object.keys(Q).join(' '));
console.log('wrote p2/seed/observations.json + paired_map.json');
