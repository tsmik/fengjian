// node p2/js/rs_diff_test.mjs
import { diffSets } from './rs_diff.js';

let fail = 0;
const eq = (n, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); console.log((ok ? '✅' : '❌') + ' ' + n + (ok ? '' : '  got=' + JSON.stringify(got))); if (!ok) fail++; };

const A = {
  id: 'setA', name: 'A', basedOn: null,
  dims: {
    0: {
      dimName: '形勢', targetPoleName: '形', parts: {
        眉: { cards: [{ id: 'c1', label: '眉長過目', role: 'main', combos: [{ leaves: [{ ref: 'br1', match: '眉長過目' }] }] }], spice: {} },
        鼻: { cards: [{ id: 'n1', label: '鼻樑挺', role: 'aux', combos: [{ leaves: [{ ref: 'no1', match: '鼻樑挺' }] }] }], spice: { 中辣: 2 } }
      }
    }
  }
};
// B＝複製 A 後改：眉c1 主→輔、眉加一張「眉粗」、鼻中辣 2→3、目標極 形→勢
const B = {
  id: 'setB', name: 'B', basedOn: 'setA',
  dims: {
    0: {
      dimName: '形勢', targetPoleName: '勢', parts: {
        眉: { cards: [
          { id: 'c1', label: '眉長過目', role: 'aux', combos: [{ leaves: [{ ref: 'br1', match: '眉長過目' }] }] },
          { id: 'c2', label: '眉粗', role: 'aux', combos: [{ leaves: [{ ref: 'br2', match: '眉粗' }] }] }
        ], spice: {} },
        鼻: { cards: [{ id: 'n1', label: '鼻樑挺', role: 'aux', combos: [{ leaves: [{ ref: 'no1', match: '鼻樑挺' }] }] }], spice: { 中辣: 3 } }
      }
    }
  }
};

const d = diffSets(A, B);
console.log(JSON.stringify(d.summary));
eq('關係＝B 複製自 A', d.relationship, 'B 是從 A 複製後修改的（同源）');
eq('新增 1（眉粗）', d.summary.cardsAdded, 1);
eq('刪除 0', d.summary.cardsRemoved, 0);
eq('修改 1（眉長過目 角色）', d.summary.cardsChanged, 1);
eq('辣度差異 1（鼻 中辣 2→3）', d.summary.spiceDiffs, 1);
eq('目標極差異 1（形→勢）', d.summary.poleDiffs, 1);
eq('A 共 2 條 / B 共 3 條', [d.summary.aCount, d.summary.bCount], [2, 3]);
const chg = d.conditionDiffs.find(x => x.type === 'change');
eq('修改詳述含 主→輔', /主→輔/.test(chg.detail), true);
eq('辣度列內容', d.spiceDiffs[0], { dim: '形勢', part: '鼻', level: '中辣', from: 2, to: 3 });
eq('目標極列內容', d.poleDiffs[0], { dim: '形勢', from: '形', to: '勢' });
const obsAdd = d.obsDiffs.filter(x => x.type === 'add');
eq('觀察題層級：新增 1（眉粗）', obsAdd.length, 1);
eq('觀察題新增內容', obsAdd[0].cond, '眉粗');

console.log(fail ? ('\n❌ ' + fail + ' 項不符') : '\n✅ 全部通過');
process.exit(fail ? 1 : 0);
