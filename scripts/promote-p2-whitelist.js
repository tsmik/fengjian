// scripts/promote-p2-whitelist.js — 把 rbf2app-staging 的白名單(allowedUsers 全部,含 _groups_meta 分組)
// 複製到 rbf2app(正式)。既有同 email 文件會被 staging 版整份覆蓋(staging 是名單正本)。
// 用法：node scripts/promote-p2-whitelist.js
const admin = require('firebase-admin');

const stagingApp = admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: 'rbf2app-staging' }, 'staging');
const prodApp = admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: 'rbf2app' }, 'prod');

async function main() {
  const snap = await stagingApp.firestore().collection('allowedUsers').get();
  let n = 0;
  for (const d of snap.docs) {
    await prodApp.firestore().collection('allowedUsers').doc(d.id).set(d.data());
    console.log('  ✅', d.id, d.data().role ? '(' + d.data().role + ')' : '');
    n++;
  }
  console.log(`\n🎉 白名單複製完成,共 ${n} 筆(含 _groups_meta)。`);
  process.exit(0);
}
main().catch(err => { console.error('❌ 失敗:', err); process.exit(1); });
