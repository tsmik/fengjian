// ruleset_convert_test.mjs — 純轉換函式單測。跑：node p2/js/ruleset_convert_test.mjs
import { convertObservations, collectDims, buildIsPaired, CANONICAL_PARTS } from './ruleset_convert.js';

let fail = 0;
function eq(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log((ok ? '✅' : '❌') + ' ' + name + (ok ? '' : '\n   got=' + JSON.stringify(got) + '\n  want=' + JSON.stringify(want)));
  if (!ok) fail++;
}

// ---- fixture：頭(2 section + 1 不在 layout 的新題)、鼻(1 題)；故意先放鼻再放頭，驗 canonical 排序 ----
const obsDocs = [
  { obsId: 'n1', part: '鼻', section: '鼻型', label: '鼻長短', options: ['鼻長', '鼻短'] },
  { obsId: 'h1', part: '頭', section: '頂骨', label: '頂骨型相', paired: true, options: ['龜背', '圓'], optionHints: { '龜背': '緩緩隆起' } },
  { obsId: 'h2', part: '頭', section: '頂骨', label: '頂骨接合', options: ['突', '平'] },          // 非左右題
  { obsId: 'h3', part: '頭', section: '枕骨', label: '枕骨型相', options: ['圓', '平'] },
  { obsId: 'hX', part: '頭', section: '新區', label: '不在layout的新題', options: ['a'] },          // layout 沒有 → 依 .section 補後
];
const layout = {
  '頭': [{ label: '頂骨', qIds: ['h1', 'h2'] }, { label: '枕骨', qIds: ['h3'] }],
  '鼻': [{ label: '鼻型', qIds: ['n1'] }],
};

const obsParts = convertObservations(obsDocs, layout);

// 1) 部位順序＝canonical（頭 在 鼻 前），即使輸入先放鼻
eq('部位順序 canonical', Object.keys(obsParts), ['頭', '鼻']);

// 2) 頭：total=4、section 順序＝頂骨/枕骨/新區
eq('頭 total', obsParts['頭'].total, 4);
eq('頭 section 順序', obsParts['頭'].sections.map(s => s.label), ['頂骨', '枕骨', '新區']);

// 3) 頂骨內題序 h1,h2；h1 帶 paired:true + optionHints；h2 無 paired key、hint 補 ''
eq('頂骨題序', obsParts['頭'].sections[0].qs.map(q => q.id), ['h1', 'h2']);
eq('h1 形狀', obsParts['頭'].sections[0].qs[0], { id: 'h1', text: '頂骨型相', opts: [{ v: '龜背', hint: '緩緩隆起' }, { v: '圓', hint: '' }], paired: true });
eq('h2 無 paired key', 'paired' in obsParts['頭'].sections[0].qs[1], false);

// 4) 不在 layout 的新題 hX → 依 section「新區」補在最後
eq('新區題', obsParts['頭'].sections[2].qs.map(q => q.id), ['hX']);

// 5) 鼻：1 題
eq('鼻 total', obsParts['鼻'].total, 1);

// 6) collectDims：依 dimIndex 放索引（輸入亂序）
const dims = collectDims([
  { id: '2', data: { dimIndex: 2, dimName: '方圓' } },
  { id: '0', data: { dimIndex: 0, dimName: '形勢' } },
]);
eq('dim0', dims[0] && dims[0].dimName, '形勢');
eq('dim2', dims[2] && dims[2].dimName, '方圓');
eq('dim1 缺→undefined', dims[1], undefined);

// 7) isPaired：h1 是、h2/n1 否
const ip = buildIsPaired(obsParts);
eq('isPaired h1', ip('h1'), true);
eq('isPaired h2', ip('h2'), false);
eq('isPaired n1', ip('n1'), false);

console.log(fail ? ('\n❌ ' + fail + ' 項不符') : '\n✅ 轉換層全部符合');
process.exit(fail ? 1 : 0);
