/**
 * test_rule_engine.js — 規則引擎 vs 舊邏輯對照測試
 * 用 dim_09_攻守.json 驗證新引擎結果與舊邏輯一致
 */

const { evaluate, evaluatePart, evaluateDimension } = require('./rule_engine.js');
const dimDef = require('./rules/dim_09_攻守.json');

let pass = 0, fail = 0;

function run(name, desc, obsData, partName, expected) {
  const result = evaluateDimension(dimDef, obsData);
  const partIdx = ['頭','上停','中停','下停','耳','眉','眼','鼻','口'].indexOf(partName);
  const actual = result.results[partName].result === 'positive' ? 'A' : 'B';
  const ok = actual === expected;
  if (ok) pass++; else fail++;
  console.log(`[${name}] ${desc}`);
  console.log(`  預期: ${partName} = ${expected === 'A' ? '攻' : '守'}(${expected})`);
  console.log(`  實際: ${actual === 'A' ? '攻' : '守'}(${actual})`);
  console.log(`  結果: ${ok ? 'PASS' : 'FAIL'}`);
  if (!ok) {
    console.log(`  DEBUG: partResult =`, JSON.stringify(result.results[partName]));
  }
  console.log('');
}

// ===== Part 0 — 頭 =====
run('10-0-A', '頭攻（頭硬）', { h15: '偏硬' }, '頭', 'A');
run('10-0-B', '頭守（5條皆無）', { h15: '一般', h2: '平順', h7: '無自剋骨', h8: '無橫條骨', h11_L: '圓隆', h11_R: '圓隆' }, '頭', 'B');
run('10-0-C', '頭攻（左華陽突露）', { h11_L: '突露' }, '頭', 'A');
run('10-0-D', '頭攻（有自剋骨）', { h7: '有自剋骨' }, '頭', 'A');
run('10-0-E', '頭攻（有橫條骨）', { h8: '有橫條骨' }, '頭', 'A');
run('10-0-F', '頭攻（頂骨突起）', { h2: '突起' }, '頭', 'A');

// ===== Part 1 — 上停 =====
run('10-1-A', '上停攻（美人尖）', { e12: '有美人尖' }, '上停', 'A');
run('10-1-B', '上停攻（額緊）', { e10: '額緊' }, '上停', 'A');
run('10-1-C', '上停攻（骨感+大天庭）', { e15: '骨感明顯', e11: '大天庭' }, '上停', 'A');
run('10-1-D', '上停攻（骨感+小天庭）', { e15: '骨感明顯', e11: '小天庭' }, '上停', 'A');
run('10-1-E', '上停守（3條皆無）', { e12: '無美人尖', e10: '額鬆', e15: '有肉包', e11: '無' }, '上停', 'B');
run('10-1-F', '上停守（骨感但無天庭）', { e15: '骨感明顯', e11: '無' }, '上停', 'B');

// ===== Part 4 — 耳 =====
run('10-4-A', '耳攻（左耳高）', { er7_L: '耳高' }, '耳', 'A');
run('10-4-B', '耳攻（右耳尖）', { er4_R: '耳尖' }, '耳', 'A');
run('10-4-C', '耳攻（右耳硬）', { er11_R: '耳硬' }, '耳', 'A');
run('10-4-D', '耳攻（左輪不包廓）', { er9_L: '輪不包廓' }, '耳', 'A');
run('10-4-E', '耳攻（右耳勢朝上）', { er15_R: '耳勢朝上' }, '耳', 'A');
run('10-4-F', '耳守（左右皆安全）',
  { er7_L: '耳低', er7_R: '耳低', er9_L: '輪包廓', er9_R: '輪包廓',
    er4_L: '耳圓', er4_R: '耳圓', er11_L: '耳軟', er11_R: '耳軟',
    er15_L: '一般', er15_R: '一般' }, '耳', 'B');

// ===== Part 5 — 眉 =====
run('10-5-A', '眉攻（左眉3/4：鷹角+稀少+質硬）',
  { br4_L: '有鷹角', br16_L: '眉毛稀少', br15_L: '質硬', br8_L: '平' }, '眉', 'A');
run('10-5-B', '眉守（左眉2/4 右眉1/4）',
  { br4_L: '有鷹角', br8_L: '有揚', br16_L: '眉毛多', br15_L: '柔順',
    br4_R: '有鷹角', br8_R: '平', br16_R: '眉毛多', br15_R: '柔順' }, '眉', 'B');
run('10-5-C', '眉攻（右眉4/4全中）',
  { br4_R: '有鷹角', br16_R: '眉毛稀少', br15_R: '質硬', br8_R: '有揚' }, '眉', 'A');

// ===== Part 6 — 眼 =====
run('10-6-A', '眼攻（左眼有眼鉤）', { ey6_L: '有眼鉤' }, '眼', 'A');
run('10-6-B', '眼攻（右眼大圓尾上）',
  { ey2_R: '眼大', ey3_R: '眼圓', ey4_R: '眼尾朝上' }, '眼', 'A');
run('10-6-C', '眼攻（左眼睛凸）', { ey5_L: '睛凸' }, '眼', 'A');
run('10-6-D', '眼守（無攻條件）',
  { ey6_L: '無眼鉤', ey6_R: '無眼鉤', ey5_L: '正常', ey5_R: '正常' }, '眼', 'B');
run('10-6-E', '眼守（大圓但尾不朝上）',
  { ey2_R: '眼大', ey3_R: '眼圓', ey4_R: '眼尾平' }, '眼', 'B');

// ===== Part 7 — 鼻 =====
run('10-7-A', '鼻攻（鼻高）', { n2: '鼻高' }, '鼻', 'A');
run('10-7-B', '鼻攻（有起節）', { n11: '有起節突露' }, '鼻', 'A');
run('10-7-C', '鼻攻（骨多於肉）', { n10: '骨多於肉' }, '鼻', 'A');
run('10-7-D', '鼻攻（山根窄）', { n9: '山根窄' }, '鼻', 'A');
run('10-7-E', '鼻守（4條皆無）',
  { n2: '鼻低', n11: '無起節', n10: '肉多於骨', n9: '山根寬' }, '鼻', 'B');

// ===== Part 8 — 口 =====
run('10-8-A', '口攻（嘴角朝上）', { m4: '嘴角朝上' }, '口', 'A');
run('10-8-B', '口攻（唇薄）', { m8: '唇薄' }, '口', 'A');
run('10-8-C', '口攻（放鬆見齒）', { m7: '放鬆見齒' }, '口', 'A');
run('10-8-D', '口攻（唇凸）', { m10: '唇凸' }, '口', 'A');
run('10-8-E', '口攻（有唇珠）', { m11: '有唇珠' }, '口', 'A');
run('10-8-F', '口守（5條皆無）',
  { m4: '嘴角水平', m7: '閉合線密', m8: '唇一般', m10: '唇不凸', m11: '無唇珠' }, '口', 'B');

// ===== Part 2 — 中停 =====
run('10-2-A', '中停攻（4部位攻：左眉+左眼+鼻+左顴）',
  { br4_L: '有鷹角', br16_L: '眉毛稀少', br15_L: '質硬',  // 左眉3/4→攻
    ey6_L: '有眼鉤',                                         // 左眼攻
    n2: '鼻高',                                                // 鼻攻
    q1_L: '顴高且隆'                                           // 左顴攻
  }, '中停', 'A');
run('10-2-B', '中停守（只有3部位攻）',
  { br4_L: '有鷹角', br16_L: '眉毛稀少', br15_L: '質硬',
    ey6_L: '有眼鉤',
    n2: '鼻高'
  }, '中停', 'B');
run('10-2-C', '中停攻（左眉+右眉+左眼+右眼=4部位）',
  { br4_L: '有鷹角', br16_L: '眉毛稀少', br15_L: '質硬',
    br4_R: '有鷹角', br16_R: '眉毛稀少', br15_R: '質硬',
    ey6_L: '有眼鉤', ey5_R: '睛凸' }, '中停', 'A');

// ===== Part 3 — 下停 =====
run('10-3-A', '下停攻（口攻+人中窄+地閣短=3/5）',
  { m4: '嘴角朝上', p3: '人中窄', c3: '地閣短' }, '下停', 'A');
run('10-3-B', '下停守（只有口攻=1/5）',
  { m4: '嘴角朝上' }, '下停', 'B');
run('10-3-C', '下停攻（口攻+地閣窄尖+左頤露尖=3/5）',
  { m8: '唇薄', c4: '地閣窄尖', y2_L: '頤露尖' }, '下停', 'A');

// ===== 整維度計算 =====
console.log('--- 整維度計算 ---');

function runDim(name, desc, obsData, expectedAttr) {
  const result = evaluateDimension(dimDef, obsData);
  const ok = expectedAttr === null || result.attribute === expectedAttr;
  if (ok) pass++; else fail++;
  const parts = ['頭','上停','中停','下停','耳','眉','眼','鼻','口'];
  const partStr = parts.map(p => {
    const r = result.results[p].result === 'positive' ? '攻' : '守';
    return `${p}=${r}`;
  }).join(' ');
  console.log(`[${name}] ${desc}`);
  console.log(`  ${partStr}`);
  console.log(`  攻${result.positiveCount} 守${result.negativeCount} → ${result.attribute} ${result.coefficient.toFixed(2)}`);
  if (expectedAttr) console.log(`  預期屬性: ${expectedAttr} → ${ok ? 'PASS' : 'FAIL'}`);
  console.log('');
}

runDim('DIM-A', '全攻（所有部位觸發攻條件）',
  { h15: '偏硬', e12: '有美人尖', er7_L: '耳高', br4_L: '有鷹角', br16_L: '眉毛稀少', br15_L: '質硬',
    ey6_L: '有眼鉤', n2: '鼻高', m4: '嘴角朝上', q1_L: '顴高且隆',
    p3: '人中窄', c3: '地閣短', y2_L: '頤露尖' }, '動');

runDim('DIM-B', '全守（無攻條件）',
  { h15: '一般', h2: '平順', e12: '無美人尖', e10: '額鬆',
    er7_L: '耳低', er7_R: '耳低', er9_L: '輪包廓', er9_R: '輪包廓',
    n2: '鼻低', n11: '無起節', n10: '肉多於骨', n9: '山根寬',
    m4: '嘴角水平', m7: '閉合線密', m8: '唇一般' }, '靜');

runDim('DIM-C', '空 obsData', {}, null);

// ===== Summary =====
console.log('========================================');
console.log(`Total: ${pass + fail} cases, ${pass} PASS, ${fail} FAIL`);
if (fail > 0) process.exit(1);
