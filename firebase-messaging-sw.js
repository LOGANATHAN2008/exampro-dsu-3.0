importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

const firebaseConfig = {
    apiKey: "AIzaSyDKDT0kvwEm0cEdh_MpbTb8A9W3_xwAVxY",
    authDomain: "dsu-exampro.firebaseapp.com",
    projectId: "dsu-exampro",
    storageBucket: "dsu-exampro.appspot.com",
    messagingSenderId: "530095819717",
    appId: "1:530095819717:web:2cbfd97ce8a958cfb99db1",
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
