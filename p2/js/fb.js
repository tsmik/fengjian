// p2/js/fb.js — P2 admin 共用 Firebase（rbf2app-staging）。供各功能區編輯器 import。
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, setPersistence, browserLocalPersistence }
  from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { getFirestore, doc, getDoc, setDoc, deleteDoc, collection, getDocs, writeBatch }
  from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

export const RBF2_STAGING = {
  apiKey: 'AIzaSyDZ3z9LV1g3rnhO0QjmYOfipUGMtD1cq7g',
  authDomain: 'rbf2app-staging.firebaseapp.com',
  projectId: 'rbf2app-staging',
  storageBucket: 'rbf2app-staging.firebasestorage.app',
  messagingSenderId: '565853308902',
  appId: '1:565853308902:web:8a7a3e63df1291124df827'
};
export const RBF2_PROD = {
  apiKey: 'AIzaSyB2n1wCVVETwyS9eCldAzowwWue5HXxNbs',
  authDomain: 'rbf2app.firebaseapp.com',
  projectId: 'rbf2app',
  storageBucket: 'rbf2app.firebasestorage.app',
  messagingSenderId: '93651965615',
  appId: '1:93651965615:web:813fab08c6d6e70650665a'
};
// 網域感知(比照前台 m_main.js getFirebaseConfig):正式 rbf2app 網域→正式庫;其餘(staging.pages.dev/localhost)→staging。
// 這樣 rbf2app.pages.dev/p2/* 後台存的是正式庫,不會誤寫 staging。
export function rbf2Config() {
  const host = window.location.hostname;
  if (host === 'rbf2app.web.app' || host === 'rbf2app.pages.dev' || /\.rbf2app\.(web\.app|pages\.dev)$/.test(host)) return RBF2_PROD;
  return RBF2_STAGING;
}

let app, auth, db, _fbOK = false;
try { app = initializeApp(rbf2Config()); auth = getAuth(app); setPersistence(auth, browserLocalPersistence).catch(() => {}); db = getFirestore(app); _fbOK = true; }
catch (e) { _fbOK = false; }

export { auth, db, doc, getDoc, setDoc, deleteDoc, collection, getDocs, writeBatch };
export const fbOK = () => _fbOK;

export function onUser(cb) {
  if (!_fbOK) { cb(null, null); return; }
  onAuthStateChanged(auth, async (u) => {
    let role = null;
    // role 來源＝白名單 allowedUsers/{email}（admin 才可寫）；不再讀本人可寫的 users/{uid}.role。
    if (u) {
      const email = (u.email || '').toLowerCase();
      try { if (email) { const s = await getDoc(doc(db, 'allowedUsers', email)); if (s.exists()) role = s.data().role || null; } } catch (e) {}
      if (email === 'chaojentseng@gmail.com') role = 'admin';   // bootstrap：與規則一致，防鎖死
    }
    cb(u, role);
  });
}
export async function login() { if (!_fbOK) throw new Error('Firebase 未初始化'); await signInWithPopup(auth, new GoogleAuthProvider()); }
export async function logout() { if (auth) await signOut(auth); }
