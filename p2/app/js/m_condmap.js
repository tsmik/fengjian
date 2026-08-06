// ============================================================
// js/m_condmap.js — 上課 tab 內「條件總覽」子分頁（教學概念，純唯讀對照表）
// 職責：把 13 維度 × 各部位 的老師條件攤成一張大表，供橫向/縱向比對。
//   上方欄 = 13 維度（先天6｜運氣3｜後天4，沿用維度色）；
//   左方列 = 部位＋子部位（頂骨/枕骨/華陽骨/上停/耳…＋中停/下停引用列）；
//   格子   = 該部位在該維度的條件卡「標題」；點標題展開實際觀察選項。
// 資料來源：上線套裝 getP2().dims[di].parts[部位].cards[]（label=標題、combos→match=細節）。
//   → 完全唯讀：不碰題庫、不碰引擎、不依賴任何學員資料、不寫任何 Firestore。
// 中停/下停在規則層沒有自身條件（engine.js AGG_FIXED 綜合其子部位判定，13 維皆同），
//   故以「引用列」呈現：左欄標明綜合哪些部位，資料格標「綜合」不重複列條件。
// 不碰桌機 index_desktop.html；CSS 在 index.html 的 .m-cm-* 區塊。
// ============================================================

import { DIMS, DIM_BG_COLORS, DIM_DEEP_COLORS } from './core.js';
import { ensureDimRulesLoaded } from './m_input.js';
import { getP2 } from './p2_data.js';

let _el = null;
let _loaded = false;

function _esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

// 左欄列定義（15 列）：part=規則部位名；ref=引用列（中停/下停，無自身條件）。
// 依三停分區排列，引用列緊接其綜合的子部位，方便比對。
const CM_ROWS = [
  { band: '上停區' },
  { part: '頂骨' }, { part: '枕骨' }, { part: '華陽骨' }, { part: '上停' }, { part: '耳' },
  { band: '中停區' },
  { ref: '中停', refs: '眉・眼・鼻・顴' },
  { part: '眉' }, { part: '眼' }, { part: '鼻' }, { part: '顴' },
  { band: '下停區' },
  { ref: '下停', refs: '口・人中・地閣・頤' },
  { part: '口' }, { part: '人中' }, { part: '地閣' }, { part: '頤' },
];

// 由條件卡的 combos 組出展開細節：combo 之間為「或」、combo 內 leaf 為「且」、leaf 的 match 選項以「、」串。
function _cardDetail(card) {
  const combos = Array.isArray(card && card.combos) ? card.combos : [];
  const comboTexts = combos.map(cb => {
    const leaves = Array.isArray(cb && cb.leaves) ? cb.leaves : [];
    return leaves.map(lf => (Array.isArray(lf && lf.match) ? lf.match : []).join('、'))
      .filter(Boolean).join('　且　');
  }).filter(Boolean);
  return comboTexts.join('　或　');
}

// 某 (維度 di, 部位名 part) 的條件卡陣列（無則空）
function _cardsOf(dims, di, part) {
  const dd = dims && dims[di];
  const p = dd && dd.parts && dd.parts[part];
  return (p && Array.isArray(p.cards)) ? p.cards : [];
}

export async function mountCondmap(container) {
  _el = container;
  if (!container.querySelector('.m-cm-wrap')) {
    container.innerHTML = '<div class="m-panel-empty" style="padding:24px;text-align:center">載入條件總覽…</div>';
  }
  if (!_loaded) {
    try { await ensureDimRulesLoaded(); _loaded = true; }
    catch (e) { if (_el) _el.innerHTML = '<div class="m-panel-empty" style="padding:24px;text-align:center">條件規則載入失敗，請重整</div>'; return; }
  }
  if (!_el) return;
  _render();
}

export function unmountCondmap() { _el = null; }

function _render() {
  if (!_el) return;
  const bundle = getP2();
  const dims = (bundle && Array.isArray(bundle.dims)) ? bundle.dims : [];
  const nDim = 13;

  // 表頭：13 維度（三大類色）
  let head = '<th class="m-cm-corner">部位＼維度</th>';
  for (let di = 0; di < nDim; di++) {
    const dm = DIMS[di] || {};
    head += `<th class="m-cm-dh" style="--dc:${DIM_DEEP_COLORS[di]};--db:${DIM_BG_COLORS[di]}">`
      + `<span class="m-cm-dn">${_esc(dm.dn || '')}</span>`
      + `<span class="m-cm-dv">${_esc(dm.view || '')}</span></th>`;
  }

  // 表身
  let body = '';
  CM_ROWS.forEach((row, ri) => {
    if (row.band) {
      body += `<tr class="m-cm-bandrow"><th class="m-cm-band">${_esc(row.band)}</th>`
        + `<td class="m-cm-bandfill" colspan="${nDim}"></td></tr>`;
      return;
    }
    if (row.ref) {
      // 引用列：左欄標明綜合對象，資料格標「綜合」不重複條件
      body += `<tr class="m-cm-row is-refrow"><th class="m-cm-part is-ref">`
        + `<span class="m-cm-pn">${_esc(row.ref)}</span>`
        + `<span class="m-cm-psub">綜合 ${_esc(row.refs)}</span></th>`;
      for (let di = 0; di < nDim; di++) {
        body += `<td class="m-cm-cell is-ref"><span class="m-cm-refnote">綜合判定</span></td>`;
      }
      body += '</tr>';
      return;
    }
    // 一般部位列
    body += `<tr class="m-cm-row"><th class="m-cm-part"><span class="m-cm-pn">${_esc(row.part)}</span></th>`;
    for (let di = 0; di < nDim; di++) {
      const cards = _cardsOf(dims, di, row.part);
      if (!cards.length) { body += '<td class="m-cm-cell is-empty"></td>'; continue; }
      let cell = '';
      cards.forEach((card, ci) => {
        const label = card.label || card.id || '';
        const detail = _cardDetail(card);
        const key = `${di}_${ri}_${ci}`;
        cell += `<div class="m-cm-card">`
          + `<button class="m-cm-chip${detail ? '' : ' is-flat'}" data-cm-key="${key}"${detail ? '' : ' disabled'}>`
          + `${_esc(label)}${detail ? '<span class="m-cm-caret">▸</span>' : ''}</button>`;
        if (detail) cell += `<div class="m-cm-detail" data-cm-detail="${key}" hidden>${_esc(detail)}</div>`;
        cell += `</div>`;
      });
      body += `<td class="m-cm-cell">${cell}</td>`;
    }
    body += '</tr>';
  });

  _el.innerHTML = `
    <div class="m-cm-hint">13 維度 × 各部位的老師條件對照（唯讀）。點<b>條件標題</b>展開實際觀察選項；<b>中停/下停</b>為綜合其他部位判定，無自身條件。左右滑動看更多維度。</div>
    <div class="m-cm-wrap">
      <table class="m-cm-table">
        <thead><tr>${head}</tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>`;
  _bind();
}

function _bind() {
  if (!_el) return;
  _el.querySelectorAll('.m-cm-chip[data-cm-key]').forEach(btn => {
    if (btn.disabled) return;
    btn.addEventListener('click', () => {
      const key = btn.dataset.cmKey;
      const detail = _el.querySelector(`[data-cm-detail="${key}"]`);
      if (!detail) return;
      const open = detail.hasAttribute('hidden');
      if (open) { detail.removeAttribute('hidden'); btn.classList.add('is-open'); }
      else { detail.setAttribute('hidden', ''); btn.classList.remove('is-open'); }
    });
  });
}
