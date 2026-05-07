// ============================================================
// 手機版報告 tab — sub-tab 切換（自動報告 / 手動報告）
// 職責：報告分頁 mount / unmount + sub-tab 切換 + LS persist
// 依賴：無（純 DOM）
// 被用：m_main.js（mountReport / unmountReport）
// retest 範圍：點報告分頁 → 兩個 sub-tab + placeholder + sub-tab 切換 + LS persist
// ============================================================

const LS_SUBTAB = 'm_report_subtab';

let _container = null;
let _subtab = 'auto'; // 'auto' | 'manual'

const SUBTABS = [
  { key: 'auto',   label: '自動報告' },
  { key: 'manual', label: '手動報告' }
];

export function mountReport(container) {
  _container = container;
  // 恢復上次 sub-tab
  try {
    const saved = localStorage.getItem(LS_SUBTAB);
    if (saved === 'auto' || saved === 'manual') _subtab = saved;
  } catch (e) {}
  _render();
}

export function unmountReport() {
  if (_container) _container.innerHTML = '';
  _container = null;
}

export function getReportSaveStatus() {
  return 'saved'; // patch 2 才實作 dirty 偵測
}

export function discardReportDraft() {
  // patch 2 才實作
}

function _render() {
  if (!_container) return;
  _container.innerHTML = `
    <div class="m-segmented" role="tablist">
      ${SUBTABS.map(t => `
        <button class="m-seg-btn ${t.key === _subtab ? 'm-seg-active' : ''}" data-subtab="${t.key}">${t.label}</button>
      `).join('')}
    </div>
    <div class="m-submode-content" id="m-report-content"></div>
  `;
  _container.querySelectorAll('[data-subtab]').forEach(btn => {
    btn.addEventListener('click', () => {
      _subtab = btn.dataset.subtab;
      try { localStorage.setItem(LS_SUBTAB, _subtab); } catch (e) {}
      _render();
    });
  });
  _renderContent();
}

function _renderContent() {
  const el = _container.querySelector('#m-report-content');
  if (!el) return;
  if (_subtab === 'auto') {
    el.innerHTML = `
      <div class="m-placeholder">
        <div class="m-placeholder-title">自動報告</div>
        <div class="m-placeholder-desc">依據觀察資料生成<br>包含 13 維度結果 / 動靜分析 / 流年</div>
        <div class="m-placeholder-step">階段 2 實作</div>
      </div>
    `;
  } else {
    el.innerHTML = `
      <div class="m-placeholder">
        <div class="m-placeholder-title">手動報告</div>
        <div class="m-placeholder-desc">13 維度 × 9 部位手動填動/靜<br>輸入視圖 + 總覽視圖</div>
        <div class="m-placeholder-step">下個 patch 實作</div>
      </div>
    `;
  }
}
