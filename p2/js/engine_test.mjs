// p2/js/engine_test.mjs — 用 Mike 親手算的「眉」例子驗證 p2/js/engine.js
// 跑：node p2/js/engine_test.mjs
import { scoreLeafPart, scoreAggregate } from './engine.js';

let fail = 0;
function eq(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log((ok ? '✅' : '❌') + ' ' + name + (ok ? '' : '  got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want)));
  if (!ok) fail++;
}

// ---- Mike 的「眉」：4 張卡片（敘述分組）----
// 眉長過目(主·左右題)、無鷹角(輔·左右題)、眉粗(輔·左右題)、雙眉一致(輔·非左右題)
const 眉 = {
  kind: 'leaf', cards: [
    { id: 'c1', role: 'main', combos: [[{ ref: 'br1', match: '眉長過目' }]] },
    { id: 'c2', role: 'aux', combos: [[{ ref: 'br4', match: '無鷹角' }]] },
    { id: 'c3', role: 'aux', combos: [[{ ref: 'br2', match: '眉粗' }]] },
    { id: 'c4', role: 'aux', combos: [[{ ref: 'm00', match: '雙眉一致' }]] },
  ]
};
const isPaired = id => ['br1', 'br4', 'br2'].indexOf(id) >= 0;  // br1/br4/br2 左右題；m00 非左右題
// 答案：眉長過目 左右都中；無鷹角 左有鷹角(0)右無鷹角(1)；眉粗 左右都中；雙眉一致 中(左右各1)
const obs = {
  br1_L: '眉長過目', br1_R: '眉長過目',
  br4_L: '有鷹角', br4_R: '無鷹角',
  br2_L: '眉粗', br2_R: '眉粗',
  m00: '雙眉一致'
};

const s = scoreLeafPart(眉, obs, isPaired, 0.8);
console.log('--- 逐側得分（應：左 主1輔2、右 主1輔3）---');
eq('左眉 主/滿', [s.L.main, s.L.mainMax], [1, 1]);
eq('左眉 輔/滿', [s.L.aux, s.L.auxMax], [2, 3]);
eq('右眉 主/滿', [s.R.main, s.R.mainMax], [1, 1]);
eq('右眉 輔/滿', [s.R.aux, s.R.auxMax], [3, 3]);
eq('合計 主/滿 輔/滿（應 2/2、5/6）', [s.combined.main, s.combined.mainMax, s.combined.aux, s.combined.auxMax], [2, 2, 5, 6]);

console.log('--- 眉當計分部位（左右合算；主2/2、輔5/6=83%）---');
eq('輔100% → 不過', scoreLeafPart(眉, obs, isPaired, 1.0).standalonePass, false);
eq('輔80%  → 過', scoreLeafPart(眉, obs, isPaired, 0.8).standalonePass, true);

console.log('--- 眉當中停子部位（左右各自判）---');
eq('左眉 輔100% → 不過', scoreLeafPart(眉, obs, isPaired, 1.0).Lpass, false);
eq('左眉 輔50%  → 過 (2/3=67%)', scoreLeafPart(眉, obs, isPaired, 0.5).Lpass, true);
eq('左眉 輔80%  → 不過 (67%<80)', scoreLeafPart(眉, obs, isPaired, 0.8).Lpass, false);
eq('右眉 一定過 (3/3)', scoreLeafPart(眉, obs, isPaired, 1.0).Rpass, true);

// ---- 聚合：中停只看 眉.L / 眉.R（示意）----
console.log('--- 聚合（中停只放 眉.L、眉.R 示意；ratio=0.5 → 2 側都算）---');
const pr = { '眉': scoreLeafPart(眉, obs, isPaired, 0.5) };
const agg = scoreAggregate({ threshold: 2, children: [{ part: '眉', side: 'L' }, { part: '眉', side: 'R' }] }, pr);
eq('中停(眉L+眉R) 過關側數', [agg.passed, agg.total], [2, 2]);   // L過(67%≥50) R過(100%)

// ---- 混合 combo 邊角：一張卡 combo = 眉長過目(左右題) 而且 雙眉一致(非左右題) ----
console.log('--- 混合 combo：眉長過目(左中右不中) 而且 雙眉一致(中) → 左得分、右不得分 ---');
const mixPart = { kind: 'leaf', cards: [{ id: 'mx', role: 'aux', combos: [[{ ref: 'br1', match: '眉長過目' }, { ref: 'm00', match: '雙眉一致' }]] }] };
const mixObs = { br1_L: '眉長過目', br1_R: '不及目', m00: '雙眉一致' };
const ms = scoreLeafPart(mixPart, mixObs, isPaired, 0.5);
eq('混合卡 左得分=1', ms.L.aux, 1);
eq('混合卡 右得分=0（被左右題右側擋掉）', ms.R.aux, 0);

console.log(fail ? ('\n❌ ' + fail + ' 項不符') : '\n✅ 全部符合 Mike 手算結果');
process.exit(fail ? 1 : 0);
