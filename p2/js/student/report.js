// p2/js/student/report.js — 兵法報告（分組表格版 / B1）
// 純渲染：吃 rs（loadRuleSetById 結構）+ obs（答案）+ level（辣度），輸出 13 維分組報告。
// 圖表（雷達/動靜總覽 SVG）留後續 B2/B3；此版＝表格 + 群組/總係數，忠實比照 P1 report.js 的分組與係數公式。
import { evaluateDimension } from '../engine.js';

// 群組固定對應（出處：P1 report.js 老闆[0,1,2]/主管[3,4,5]/運氣[6,7,8]/後天[9,10,11,12]）
// 顏色取自 DESIGN.md 群組色票
const SUBGROUPS = [
  { name: '老闆', dims: [0, 1, 2], color: '#936A78' },
  { name: '主管', dims: [3, 4, 5], color: '#876D4F' },
  { name: '運氣', dims: [6, 7, 8], color: '#546D77' },
  { name: '後天', dims: [9, 10, 11, 12], color: '#797181' },
];
const PRE_COLOR = '#854F51';   // 先天（老闆+主管）
const TOTAL_COLOR = '#494541'; // 總係數
const ALL_DIMS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

// 三大類分段（每段含哪些 subgroup index）
const CATEGORIES = [
  { name: '先天指數', subs: [0, 1], pre: true },   // 老闆 + 主管 → 額外先天係數
  { name: '運氣指數', subs: [2] },
  { name: '後天指數', subs: [3] },
];

// 算單維：回 {name, hasResult, complete, attribute, coeff, pos, neg}
function evalDim(rs, di, obs, level) {
  const dd = rs.dims[di];
  if (!dd) return { di, name: '', missing: true };
  const r = evaluateDimension(dd, obs, rs.isPaired, level);
  const complete = r.dataVec.every(v => v !== null);      // 9 計分部位全有結果
  const hasResult = (r.positiveCount + r.negativeCount) > 0;
  return {
    di, name: dd.dimName || '', missing: false,
    hasResult, complete,
    attribute: r.attribute, coeff: r.coefficient,
    pos: r.positiveCount, neg: r.negativeCount,
  };
}

// 群組係數＝各維係數簡單平均（avgCoeff），只在組內每維都 complete 才顯示
function groupCoef(dimResults, dims) {
  const rs = dims.map(i => dimResults[i]);
  const complete = rs.every(d => d && !d.missing && d.complete);
  let sum = 0, n = 0;
  rs.forEach(d => { if (d && d.hasResult) { sum += d.coeff; n += 1; } });
  return { complete, value: n > 0 ? (sum / n) : 0 };
}

function fmt(v) { return v.toFixed(2); }

// 動/靜 chip（色底白字，DESIGN：強調標籤＝色底白字；動橘靜綠）
function poleChip(attr) {
  if (!attr) return '<span class="rp-dash">—</span>';
  const cls = attr === '動' ? 'rp-act' : 'rp-sta';
  return `<span class="rp-chip ${cls}">${attr}</span>`;
}

function dimRow(d) {
  if (d.missing) return '';
  const coef = d.complete ? fmt(d.coeff) : '<span class="rp-inc">未填完</span>';
  const cnt = d.hasResult ? `${d.pos}/${d.neg}` : '<span class="rp-dash">—</span>';
  return `<tr>
    <td class="rp-dim">${d.name}</td>
    <td class="rp-pole">${d.hasResult ? poleChip(d.attribute) : '<span class="rp-dash">—</span>'}</td>
    <td class="rp-num">${coef}</td>
    <td class="rp-num rp-sub">${cnt}</td>
  </tr>`;
}

function bandRow(label, gc, color) {
  const v = gc.complete ? fmt(gc.value) : '<span class="rp-inc-w">未填完</span>';
  return `<tr><td class="rp-band" colspan="4" style="background:${color}">${label} ${v}</td></tr>`;
}

// 主入口：把報告 HTML 寫進 container
export function renderReport(container, rs, obs, level) {
  if (!rs) { container.innerHTML = ''; return; }
  // 先算 13 維
  const dimResults = ALL_DIMS.map(di => evalDim(rs, di, obs, level));
  const hasAnyRule = dimResults.some(d => !d.missing);
  if (!hasAnyRule) { container.innerHTML = '<p class="rp-empty">此套裝尚無有規則的維度。</p>'; return; }

  let body = '';
  CATEGORIES.forEach(cat => {
    body += `<tr><td class="rp-cat" colspan="4">${cat.name}</td></tr>`;
    cat.subs.forEach(si => {
      const sg = SUBGROUPS[si];
      sg.dims.forEach(di => { body += dimRow(dimResults[di]); });
      // subgroup 係數（先天類才分老闆/主管帶；運氣/後天的 subgroup 帶＝該類係數）
      const gc = groupCoef(dimResults, sg.dims);
      body += bandRow(sg.name + '係數', gc, sg.color);
    });
    // 先天類額外加「先天係數」(老闆+主管合併)
    if (cat.pre) {
      const gcPre = groupCoef(dimResults, [0, 1, 2, 3, 4, 5]);
      body += bandRow('先天係數', gcPre, PRE_COLOR);
    }
  });
  // 總係數
  const gcTotal = groupCoef(dimResults, ALL_DIMS.filter(i => !dimResults[i].missing));
  body += bandRow('總係數', gcTotal, TOTAL_COLOR);

  container.innerHTML = `
    <table class="rp-table">
      <thead><tr><th>維度</th><th>動靜</th><th>係數</th><th class="rp-sub">符合/不符</th></tr></thead>
      <tbody>${body}</tbody>
    </table>
    <p class="rp-foot">辣度＝${level}　·　係數＝min(符合,不符)÷max(…)　·　群組係數＝組內各維係數平均（填完才顯示）</p>`;
}
