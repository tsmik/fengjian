// p2/js/engine_test.mjs — 用 Mike 的「眉」例子驗證 p2/js/engine.js（辣度＝每部位輔數量）
// 跑：node p2/js/engine_test.mjs
import { scoreLeafPart, scoreAggregate } from './engine.js';

let fail = 0;
function eq(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log((ok ? '✅' : '❌') + ' ' + name + (ok ? '' : '  got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want)));
  if (!ok) fail++;
}

// 眉：4 張卡片（眉長過目主、無鷹角輔、眉粗輔、雙眉一致輔·非左右題）
// 辣度門檻（輔數量）：大辣=3(全)、中辣=2、小辣=1
const 眉 = {
  kind: 'leaf', spice: { 大辣: 3, 中辣: 2, 小辣: 1 }, cards: [
    { id: 'c1', role: 'main', combos: [[{ ref: 'br1', match: '眉長過目' }]] },
    { id: 'c2', role: 'aux', combos: [[{ ref: 'br4', match: '無鷹角' }]] },
    { id: 'c3', role: 'aux', combos: [[{ ref: 'br2', match: '眉粗' }]] },
    { id: 'c4', role: 'aux', combos: [[{ ref: 'm00', match: '雙眉一致' }]] },
  ]
};
const isPaired = id => ['br1', 'br4', 'br2'].indexOf(id) >= 0;  // m00 非左右題
const obs = { br1_L: '眉長過目', br1_R: '眉長過目', br4_L: '有鷹角', br4_R: '無鷹角', br2_L: '眉粗', br2_R: '眉粗', m00: '雙眉一致' };

const at = lv => scoreLeafPart(眉, obs, isPaired, lv);
const s = at('中辣');
console.log('--- 逐側得分（不受層級；左 主1輔2、右 主1輔3）---');
eq('左眉 主/滿', [s.L.main, s.L.mainMax], [1, 1]);
eq('左眉 輔/滿', [s.L.aux, s.L.auxMax], [2, 3]);
eq('右眉 主/滿', [s.R.main, s.R.mainMax], [1, 1]);
eq('右眉 輔/滿', [s.R.aux, s.R.auxMax], [3, 3]);

console.log('--- 眉當計分部位（左右都過才算）---');
eq('大辣(需輔3) → 不過（左只2）', at('大辣').standalonePass, false);
eq('中辣(需輔2) → 過', at('中辣').standalonePass, true);
eq('小辣(需輔1) → 過', at('小辣').standalonePass, true);

console.log('--- 眉當中停子部位（左右各自判）---');
eq('左眉 大辣 → 不過 (2<3)', at('大辣').Lpass, false);
eq('左眉 中辣 → 過 (2≥2)', at('中辣').Lpass, true);
eq('右眉 大辣 → 過 (3≥3)', at('大辣').Rpass, true);

console.log('--- 聚合：中停只放 眉.L、眉.R（門檻固定，不受辣度；辣度只影響眉本身過不過）---');
const prMid = { '眉': at('中辣') };
const aggMid = scoreAggregate({ threshold: 2, children: [{ part: '眉', side: 'L' }, { part: '眉', side: 'R' }] }, prMid);
eq('中停(眉L+眉R) 中辣 過關側數', [aggMid.passed, aggMid.total], [2, 2]);
const prBig = { '眉': at('大辣') };
const aggBig = scoreAggregate({ threshold: 2, children: [{ part: '眉', side: 'L' }, { part: '眉', side: 'R' }] }, prBig);
eq('中停(眉L+眉R) 大辣 過關側數（左不過）', [aggBig.passed, aggBig.total], [1, 2]);

console.log('--- 混合 combo：眉長過目(左中右不中) 而且 雙眉一致(中) → 左得分、右不得分 ---');
const mix = { kind: 'leaf', spice: { 大辣: 1, 中辣: 1, 小辣: 1 }, cards: [{ id: 'mx', role: 'aux', combos: [[{ ref: 'br1', match: '眉長過目' }, { ref: 'm00', match: '雙眉一致' }]] }] };
const ms = scoreLeafPart(mix, { br1_L: '眉長過目', br1_R: '不及目', m00: '雙眉一致' }, isPaired, '中辣');
eq('混合卡 左得分=1', ms.L.aux, 1);
eq('混合卡 右得分=0（被左右題右側擋掉）', ms.R.aux, 0);

console.log(fail ? ('\n❌ ' + fail + ' 項不符') : '\n✅ 全部符合 Mike 手算結果（辣度＝每部位輔數量）');
process.exit(fail ? 1 : 0);
