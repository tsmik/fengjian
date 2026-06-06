// tests/engine_v2/regress.mjs
// 回歸驗證（v0.6 §B.1）：舊引擎(rule_engine.js, live 格式) vs 新引擎(rule_engine_v2.js, 新格式 fixture)。
// 同一份觀察輸入兩邊各跑，比對 data[di][0..8] 部位向量 ＋ 動靜 ＋ 係數。
// 中辣（= rbf1 現有 COUNT.min）下，預期「逐格相同」。
// 觀察輸入為合成（涵蓋 命中/不命中/左右不對稱/未填），不動 rbf1 任何使用者私人資料。

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as core from '../../js/core.js';
import { evaluateAll, evaluateDimension } from '../../js/rule_engine.js';
import { evaluateDimensionV2 } from '../../js/rule_engine_v2.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dir, '..', '..');

const live = JSON.parse(readFileSync(join(REPO, 'p2_seed', 'rbf1_settings_rules.json'), 'utf8'));
const questions = JSON.parse(readFileSync(join(REPO, 'p2_seed', 'rbf1_settings_questions.json'), 'utf8'));
const DIMS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const fixtures = {};
DIMS.forEach(di => { fixtures[di] = JSON.parse(readFileSync(join(__dir, `fixture_dim${di}.json`), 'utf8')); });

core.setDimRules(live);   // 舊引擎用完整 13 維 live 規則

// --- 建 ref → {paired, opts[]} （生成輸入用）---
const refInfo = {};
for (const partName of Object.keys(questions)) {
  for (const sec of questions[partName].sections) {
    for (const q of sec.qs) refInfo[q.id] = { paired: !!q.paired, opts: q.opts.map(o => o.v) };
  }
}

// --- 收集兩個 fixture 用到的所有 ref ---
function collectRefs(fix, set) {
  for (const p of Object.values(fix.parts)) {
    if (p.kind === 'aggregate') continue;
    for (const c of p.cards) for (const combo of c.combos) for (const leaf of combo) set.add(leaf.ref);
  }
}
const allRefs = new Set();
DIMS.forEach(di => collectRefs(fixtures[di], allRefs));
const REFS = [...allRefs];

// 警示：fixture 用到的 ref 是否都在 questions 裡（沒有的話無法生選項）
const missing = REFS.filter(r => !refInfo[r]);
if (missing.length) console.log('⚠️ refs not in questions (will skip-fill):', missing.join(','));

// ref → 「會讓部位通過」的 match 值集合（從 fixture combos 收集），給 posBias 模式偏向命中用
const posValues = {};
DIMS.forEach(di => {
  for (const p of Object.values(fixtures[di].parts)) {
    if (p.kind === 'aggregate') continue;
    for (const c of p.cards) for (const combo of c.combos) for (const leaf of combo) {
      const arr = Array.isArray(leaf.match) ? leaf.match : [leaf.match];
      (posValues[leaf.ref] = posValues[leaf.ref] || new Set());
      arr.forEach(v => posValues[leaf.ref].add(v));
    }
  }
});

// --- 確定性 RNG ---
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
let rng = mulberry32(123456789);
const pick = arr => arr[Math.floor(rng() * arr.length)];

// --- 生成一份 obsData ---
// mode: 'base'（只設非分側，L==R）, 'sided'（paired 設 _L/_R 各自隨機）, 'sidedNull'（再隨機留空一些）
function pickVal(r, info, mode) {
  // posBias：0.7 機率挑「會命中」的值，讓 positive 部位更常出現 → 動靜兩支都被充分測到
  if (mode === 'posBias' && posValues[r] && posValues[r].size && rng() < 0.7) {
    return pick([...posValues[r]]);
  }
  return pick(info.opts);
}
function genInput(mode) {
  const o = {};
  for (const r of REFS) {
    const info = refInfo[r];
    if (!info) continue;
    const unfilled = (mode === 'sidedNull') && (rng() < 0.18);
    if (unfilled) continue; // 留空 → null 測試
    if (info.paired && mode !== 'base') {
      o[r + '_L'] = pickVal(r, info, mode);
      o[r + '_R'] = pickVal(r, info, mode);
    } else {
      o[r] = pickVal(r, info, mode);
    }
  }
  return o;
}

// --- 比一份輸入 ---
function vecEq(a, b) { for (let i = 0; i < 9; i++) if (a[i] !== b[i]) return false; return true; }

let total = 0, pass = 0;
const mismatches = [];
const COUNTS = { base: 250, sided: 350, sidedNull: 400, posBias: 500 };
// 每維統計：比對次數/通過、輸出多樣性（A/B/null）、動靜分布 → 確認非空泛
const per = {};
DIMS.forEach(di => { per[di] = { cmp: 0, ok: 0, A: 0, B: 0, null: 0, 動: 0, 靜: 0, nonNull: 0 }; });

for (const mode of Object.keys(COUNTS)) {
  for (let n = 0; n < COUNTS[mode]; n++) {
    const input = genInput(mode);
    // 餵進 core（含 sanitize），讀回 sanitized obs 給兩邊用同一份
    core.setData(core.emptyData());
    core.setObsData(JSON.parse(JSON.stringify(input)));
    const obs = core.obsData;
    evaluateAll(obs);

    for (const di of DIMS) {
      total++;
      const oldVec = core.data[di].slice(0, 9);
      const oldDim = evaluateDimension(live[di], obs);
      const v2 = evaluateDimensionV2(fixtures[di], obs, '中辣');

      const vecOK = vecEq(oldVec, v2.dataVec);
      const attrOK = oldDim.attribute === v2.attribute;
      const coefOK = Math.abs(oldDim.coefficient - v2.coefficient) < 1e-9;

      const p = per[di];
      p.cmp++;
      oldVec.forEach(c => { if (c === null) p.null++; else { p[c]++; p.nonNull++; } });
      p[oldDim.attribute] = (p[oldDim.attribute] || 0) + 1;

      if (vecOK && attrOK && coefOK) { pass++; p.ok++; }
      else if (mismatches.length < 12) {
        mismatches.push({ mode, di, oldVec, newVec: v2.dataVec, vecOK, attrOK, coefOK,
          oldAttr: oldDim.attribute, newAttr: v2.attribute,
          oldCoef: +oldDim.coefficient.toFixed(4), newCoef: +v2.coefficient.toFixed(4) });
      }
    }
  }
}

console.log('================ 全 13 維回歸結果（中辣 = rbf1 COUNT.min）================');
console.log('每維：比對次數、逐格相同、輸出多樣性(A/B/null)、動靜分布、是否非空泛');
console.log('dim | name   |  ok/cmp   | A   B    null  | 動   靜   | vacuous?');
DIMS.forEach(di => {
  const p = per[di], nm = (fixtures[di].dimName || '').padEnd(4, '　');
  const vac = (p.nonNull === 0 || (p.A === 0 && p.B === 0) || (p.動 === 0 && p.靜 === 0)) ? '⚠️空泛' : 'OK';
  console.log(
    String(di).padStart(2) + '  | ' + nm + ' | ' +
    String(p.ok + '/' + p.cmp).padStart(9) + ' | ' +
    String(p.A).padStart(4) + String(p.B).padStart(5) + String(p.null).padStart(6) + ' | ' +
    String(p.動).padStart(4) + String(p.靜).padStart(5) + ' | ' + vac
  );
});
console.log('-------------------------------------------------------------');
console.log(`總比對: ${total}  | 逐格相同: ${pass}  | 不一致: ${total - pass}`);
const anyVac = DIMS.some(di => { const p = per[di]; return p.nonNull === 0 || (p.A === 0 && p.B === 0) || (p.動 === 0 && p.靜 === 0); });

if (mismatches.length) {
  console.log('\n--- 前幾筆不一致（debug；判斷是轉譯器 bug 還是 live 髒）---');
  for (const m of mismatches) {
    console.log(`mode=${m.mode} dim=${m.di} vecOK=${m.vecOK} attrOK=${m.attrOK} coefOK=${m.coefOK}`);
    console.log(`  old vec=${JSON.stringify(m.oldVec)} attr=${m.oldAttr} coef=${m.oldCoef}`);
    console.log(`  new vec=${JSON.stringify(m.newVec)} attr=${m.newAttr} coef=${m.newCoef}`);
  }
}
console.log('\n結論:',
  (pass === total ? '✅ 13 維逐格一致' : '❌ 有不一致（見 debug）') +
  (anyVac ? ' ｜ ⚠️ 有維度輸出空泛，需加強輸入' : ' ｜ 所有維度輸出非空泛'));
process.exit((pass === total && !anyVac) ? 0 : 1);
