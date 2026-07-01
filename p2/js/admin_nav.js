// p2/js/admin_nav.js — 後台共用頂部分頁列
// 取代舊 index.html 的 6-iframe 外殼:改用 top-level 連結,一次只載入一頁、
// 只跑一個 Firebase 登入,避免多 iframe 併發登入互相搶而被登出。
// 純 classic script(無 import),於 DOMContentLoaded 把分頁列插到 body 最上方。
(function () {
  var TABS = [
    { href: 'admin2.html', label: '條件編輯器', match: ['admin2.html', 'admin2', ''] },
    { href: 'observations.html', label: '觀察庫', match: ['observations.html'] },
    { href: 'rulesets.html', label: '套裝', match: ['rulesets.html'] },
    { href: 'lectures.html', label: '講義', match: ['lectures.html'] },
    { href: 'liunian.html', label: '流年', match: ['liunian.html'] },
    { href: 'users.html', label: '使用者', match: ['users.html'] }
  ];
  var path = (location.pathname.split('/').pop() || '');
  function build() {
    if (document.getElementById('admin-nav-bar')) return;
    var bar = document.createElement('div');
    bar.id = 'admin-nav-bar';
    bar.setAttribute('style', 'display:flex;align-items:center;gap:2px;padding:0 12px;height:44px;background:#fbf8f2;border-bottom:1px solid #d8ccb6;font-family:"Noto Serif TC",serif;overflow-x:auto;');
    var title = document.createElement('span');
    title.textContent = 'admin2';
    title.setAttribute('style', 'font-size:14px;font-weight:700;letter-spacing:1px;margin-right:12px;color:#4a443b;flex:0 0 auto;');
    bar.appendChild(title);
    TABS.forEach(function (t) {
      var active = t.match.indexOf(path) >= 0;
      var a = document.createElement('a');
      a.href = t.href;
      a.textContent = t.label;
      a.setAttribute('style', 'flex:0 0 auto;font-size:13px;text-decoration:none;padding:7px 15px;border-radius:8px 8px 0 0;color:' + (active ? '#4a443b' : '#9a8f7d') + ';font-weight:' + (active ? '600' : '400') + ';background:' + (active ? '#f6f1e9' : 'transparent') + ';border:1px solid ' + (active ? '#d8ccb6' : 'transparent') + ';border-bottom:none;');
      // 用分頁列切換工具＝站內導覽:標記後,各頁 beforeunload 略過「未儲存離開」警告
      // (草稿已自動存本機、切回會還原);仍保留關瀏覽器/打別網址時的警告。
      if (!active) a.addEventListener('click', function () { try { window.__adminNavigating = true; } catch (e) {} });
      bar.appendChild(a);
    });
    document.body.insertBefore(bar, document.body.firstChild);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
  else build();
})();
