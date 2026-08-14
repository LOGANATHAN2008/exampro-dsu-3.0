importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

const firebaseConfig = {
    apiKey: "AIzaSyDKDT0kvwEm0cEdh_MpbTb8A9W3_xwAVxY",
    authDomain: "dsu-exam-system.firebaseapp.com",
    projectId: "dsu-exam-system",
    storageBucket: "dsu-exam-system.firebasestorage.app",
    messagingSenderId: "155083834622",
    appId: "1:155083834622:web:ff0a9780b88bad0b8811af",
    measurementId: "G-G605ZRL3N6"
};

firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
    console.log('[firebase-messaging-sw.js] Received background message ', payload);
    
    // Customize notification here
    const notificationTitle = payload.notification.title || "ExamPro DSU";
    const notificationOptions = {
        body: payload.notification.body || "You have a new message.",
        icon: '/dsu_logo.png'
    };

    self.registration.showNotification(notificationTitle, notificationOptions);
});
