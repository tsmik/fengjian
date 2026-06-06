// tests/engine_v2/translate.mjs
// 透明轉譯器：rbf1 live 巢狀樹 → 新格式 DNF（v0.6 §A.2 / §B）。
// 用途：① 構造性證明新文法能表達 live 規則（轉不出就 throw）；
//      ② 自動生成 fixture，避免手打中文 match 字串的筆誤造成假 diff。
// 產物（frozen JSON）才是 v2 引擎讀的東西；本轉譯器是拋棄式（admin2 取代）。
//
// 對映規則（與讀碼結論一致）：
//  - 部位若為 COUNT 且 items 全是 partResult → 聚合部位（threshold=min, children=子部位）。
//  - 否則為葉部位：LR(merge) → lrMode(all→both/any→either)，無 LR → none；內層必為 COUNT(min, items)。
//  - COUNT 內 group 只是 UI 群集，攤平：每個「被計數單位」= 一張卡（threshold=min）。
//  - 單位 → combos（DNF）：ref→[[leaf]]；AND→笛卡爾串接；OR→聯集。
//  - rule1 基準：所有卡 role=aux、passPole=positive（主卡與目標極反轉由老師日後標）。

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dir, '..', '..');
const live = JSON.parse(readFileSync(join(REPO, 'p2_seed', 'rbf1_settings_rules.json'), 'utf8'));
const questions = JSON.parse(readFileSync(join(REPO, 'p2_seed', 'rbf1_settings_questions.json'), 'utf8'));

// ref → 全選項清單（NOT 轉「反向選項」complement 用）
const refOptions = {};
for (const pn of Object.keys(questions))
  for (const sec of questions[pn].sections)
    for (const q of sec.qs) refOptions[q.id] = q.opts.map(o => o.v);

function toCombos(node) {
  if (node == null) throw new Error('null unit');
  if (node.ref !== undefined) {
    const leaf = { ref: node.ref, match: node.match };
    if ('side' in node) leaf.side = node.side;
    return [[leaf]];
  }
  if (node.op === 'AND') {
    let combos = [[]];
    node.items.forEach(it => {
      const sub = toCombos(it), next = [];
      combos.forEach(c => sub.forEach(s => next.push(c.concat(s))));
      combos = next;
    });
    return combos;
  }
  if (node.op === 'OR') {
    let out = [];
    node.items.forEach(it => { out = out.concat(toCombos(it)); });
    return out;
  }
  // NOT：新文法用「反向選項」（§4.5），把 NOT(ref=X) 轉成 ref ∈ (全選項 ∖ X)。
  // 等價性：答案已填時 !(ans∈X) ⇔ ans∈complement；未填時兩邊都因部位前置檢查回 null。
  if (node.op === 'NOT') {
    const inner = node.item;
    if (!inner || inner.ref === undefined)
      throw new Error('NOT wraps non-ref (需 De Morgan，本資料未出現): ' + JSON.stringify(node).slice(0, 100));
    const opts = refOptions[inner.ref];
    if (!opts) throw new Error('NOT ref 不在 questions，無法取反向選項: ' + inner.ref);
    const matchArr = Array.isArray(inner.match) ? inner.match : [inner.match];
    const complement = opts.filter(o => matchArr.indexOf(o) < 0);
    const leaf = { ref: inner.ref, match: complement, _from: 'NOT(' + JSON.stringify(inner.match) + ')' };
    return [[leaf]];
  }
  throw new Error('unsupported unit node: ' + JSON.stringify(node).slice(0, 100));
}

function countUnits(items) {
  const units = [];
  items.forEach(it => {
    if (it.group !== undefined && it.items) it.items.forEach(sub => units.push({ node: sub, group: it.group }));
    else units.push({ node: it, group: null });
  });
  return units;
}

function isAggregate(node) {
  return node && node.op === 'COUNT' && Array.isArray(node.items) &&
    node.items.length > 0 && node.items.every(it => it.partResult !== undefined);
}

function buildAgg(node) {
  const children = node.items.map(it => {
    const s = it.partResult, dot = s.indexOf('.');
    return dot >= 0 ? { part: s.slice(0, dot), side: s.slice(dot + 1) } : { part: s };
  });
  return { kind: 'aggregate', passPole: 'positive', threshold: node.min, children };
}

function buildLeaf(node) {
  let lrMode = 'none', inner = node;
  if (node.op === 'LR') { lrMode = node.merge === 'all' ? 'both' : 'either'; inner = node.each; }
  if (!inner || inner.op !== 'COUNT') throw new Error('leaf inner not COUNT: ' + JSON.stringify(inner).slice(0, 100));
  const units = countUnits(inner.items);
  const cards = units.map((u, i) => {
    const card = { id: 'c' + (i + 1), role: 'aux', combos: toCombos(u.node) };
    if (u.group) card.note = u.group;
    return card;
  });
  return { kind: 'leaf', lrMode, passPole: 'positive', auxThreshold: inner.min, cards };
}

function buildPart(node) {
  // 解開 {rule:...} 外殼（dim9 的 8 個部位用這種包法；無 op/partResult/ref 時）
  if (node && node.rule !== undefined && node.op === undefined && node.partResult === undefined && node.ref === undefined) {
    return buildPart(node.rule);
  }
  return isAggregate(node) ? buildAgg(node) : buildLeaf(node);
}

function buildDim(d) {
  const parts = {};
  Object.keys(d.parts).forEach(pn => { parts[pn] = buildPart(d.parts[pn]); });
  return {
    dimIndex: d.dimIndex,
    dimName: d.dimName || d.view || ('dim' + d.dimIndex),
    positiveType: d.positiveType,
    negativeType: d.negativeType,
    _source: 'translated from p2_seed/rbf1_settings_rules.json (rule1 baseline, faithful)',
    parts
  };
}

const TARGET = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
mkdirSync(__dir, { recursive: true });
for (const di of TARGET) {
  const fix = buildDim(live[di]);
  const path = join(__dir, `fixture_dim${di}.json`);
  writeFileSync(path, JSON.stringify(fix, null, 2));
  const nLeaf = Object.values(fix.parts).filter(p => p.kind === 'leaf').length;
  const nAgg = Object.values(fix.parts).filter(p => p.kind === 'aggregate').length;
  console.log(`dim${di}: wrote ${path}  (${nLeaf} leaf + ${nAgg} aggregate parts)`);
}
console.log('translate done.');
