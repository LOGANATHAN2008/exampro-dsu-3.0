// ============================================
// Firebase Configuration - ExamPro DSU
// Shared across all pages
// ============================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut, setPersistence, browserLocalPersistence } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
    getFirestore, collection, onSnapshot, getDocs, doc, getDoc,
    deleteDoc, addDoc, updateDoc, setDoc, serverTimestamp,
    query, orderBy, where, Timestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyDKDT0kvwEm0cEdh_MpbTb8A9W3_xwAVxY",
    authDomain: "dsu-exam-system.firebaseapp.com",
    projectId: "dsu-exam-system",
    storageBucket: "dsu-exam-system.firebasestorage.app",
    messagingSenderId: "155083834622",
    appId: "1:155083834622:web:ff0a9780b88bad0b8811af",
    measurementId: "G-1TPT1BR6GD"
};

// ============================================================
// BOOTSTRAP SUPER-ADMIN EMAIL LIST
// ⚠️  MIRROR ANY CHANGES HERE IN firestore.rules → isSuperAdmin()
//     (search for "// SYNC: ADMIN_EMAILS" in firestore.rules)
// These emails grant super-admin access even before an admins/{uid}
// Firestore document is created. Minimal set — use Admin Management
// UI in admin.html to add/remove real admins via Firestore.
// ============================================================
const ADMIN_EMAILS = [
    "admin@dsu.edu",
    "loganathan@dsu.edu",
    "mloganathan082008@gmail.com",
    "exampro.loganathanm.in@gmail.com"
];

const DEPARTMENTS = [
    "BCA", "MCA", "BSc CS", "BSc IT", "BBA", "BCom",
    "BA", "BSc", "MSc", "MBA", "MTech", "BTech"
];

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
await setPersistence(auth, browserLocalPersistence);
const db = getFirestore(app);

export {
    app, auth, db,
    ADMIN_EMAILS, DEPARTMENTS,
    onAuthStateChanged, signOut,
    collection, onSnapshot, getDocs, doc, getDoc,
    deleteDoc, addDoc, updateDoc, setDoc, serverTimestamp,
    query, orderBy, where, Timestamp
};
