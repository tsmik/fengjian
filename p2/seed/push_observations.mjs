// p2/seed/push_observations.mjs
// 把 p2/seed/observations.json 寫進 rbf2app-staging 的 observations 集合（批次寫）。
// 只寫 rbf2app-staging（測試）；不寫 rbf2app 正式、不碰 rbf1。
// 跑法（需可解析 firebase client SDK）：
//   node p2/seed/push_observations.mjs <path-to-observations.json>
// 用 client SDK + 公開 apiKey；需在 seed 視窗（observations 可寫）下執行。

import { initializeApp } from 'firebase/app';
import { getFirestore, doc, writeBatch, collection, getCountFromServer } from 'firebase/firestore';
import { readFileSync } from 'node:fs';

// rbf2app-staging（測試）config — 與 js/m_main.js 的 RBF2_STAGING_CONFIG 一致
const STAGING = {
  apiKey: 'AIzaSyDZ3z9LV1g3rnhO0QjmYOfipUGMtD1cq7g',
  authDomain: 'rbf2app-staging.firebaseapp.com',
  projectId: 'rbf2app-staging',
  storageBucket: 'rbf2app-staging.firebasestorage.app',
  messagingSenderId: '565853308902',
  appId: '1:565853308902:web:8a7a3e63df1291124df827'
};

const path = process.argv[2];
if (!path) { console.error('usage: node push_observations.mjs <observations.json>'); process.exit(1); }
const observations = JSON.parse(readFileSync(path, 'utf8'));

const app = initializeApp(STAGING);
const db = getFirestore(app);

let written = 0;
for (let i = 0; i < observations.length; i += 400) {
  const batch = writeBatch(db);
  for (const o of observations.slice(i, i + 400)) {
    batch.set(doc(db, 'observations', o.obsId), o);
    written++;
  }
  await batch.commit();
}

const cnt = await getCountFromServer(collection(db, 'observations'));
console.log(`wrote ${written} observations; server count = ${cnt.data().count}`);
process.exit(0);
