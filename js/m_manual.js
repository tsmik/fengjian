// ============================================================
// 手機版手動輸入 tab — placeholder（階段 1 空殼）
// 職責：手動輸入 tab mount / unmount。後續階段把 m_report.js 的 manual subtab 整段邏輯搬過來。
// 依賴：（階段 1 暫無，後續會接 m_report.js manual 相關 export）
// 被用：m_main.js（mountManual / unmountManual）
// retest 範圍：手動輸入 tab 切進來能看到 placeholder，切出去 unmount 不留 DOM
// ============================================================

let _container = null;

export function mountManual(container) {
  _container = container;
  _container.innerHTML = `
    <div class="m-placeholder">
      <div class="m-placeholder-title">手動輸入</div>
      <div class="m-placeholder-desc">
        手動輸入 13 維度動靜<br>
        生成手動兵法報告
      </div>
      <div class="m-placeholder-step">階段 2 搬入既有手動輸入流程</div>
    </div>
  `;
}

export function unmountManual() {
  if (_container) {
    _container.innerHTML = '';
    _container = null;
  }
}
