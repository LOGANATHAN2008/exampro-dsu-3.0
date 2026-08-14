import { 
    collection, doc, setDoc, addDoc, onSnapshot, getDoc, 
    updateDoc, deleteDoc, getDocs, query, where 
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getMessaging, getToken } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging.js";

// STUN/TURN Servers Config
const servers = {
    iceServers: [
        {
            urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'],
        },
        // TODO: For production, add a TURN server here (e.g., Twilio or Xirsys) 
        // to handle restrictive NATs and symmetric firewalls.
        // {
        //     urls: 'turn:your-turn-server.com',
        //     username: 'user',
        //     credential: 'password'
        // }
    ],
    iceCandidatePoolSize: 10,
};

let pc = null;
let localStream = null;
let remoteStream = null;
let currentCallDocId = null;
let currentChatDocId = null;
let callType = null;
let unsubscribeCallDoc = null;
let unsubscribeOfferCandidates = null;
let unsubscribeAnswerCandidates = null;

/**
 * Cleanup function to completely shut down the WebRTC connection,
 * stop all media tracks, and remove Firestore listeners.
 */
export async function cleanupCall(db) {
    if (pc) {
        pc.close();
        pc = null;
    }
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }
    if (remoteStream) {
        remoteStream.getTracks().forEach(track => track.stop());
        remoteStream = null;
    }
    
    if (unsubscribeCallDoc) { unsubscribeCallDoc(); unsubscribeCallDoc = null; }
    if (unsubscribeOfferCandidates) { unsubscribeOfferCandidates(); unsubscribeOfferCandidates = null; }
    if (unsubscribeAnswerCandidates) { unsubscribeAnswerCandidates(); unsubscribeAnswerCandidates = null; }

    if (currentCallDocId && db) {
        try {
            await deleteDoc(doc(db, 'calls', currentCallDocId));
        } catch (e) {
            console.error("Error deleting call doc", e);
        }
        currentCallDocId = null;
    }
    
    hideInCallUI();
}

/**
 * Caller function: starts a call to a specific user.
 */
export async function startCall(db, currentUser, type, calleeUID, calleeName, calleeAvatar, chatId) {
    if (!calleeUID) {
        if(window.showToast) window.showToast("Cannot call: User ID missing");
        return;
    }
    callType = type;
    currentChatDocId = chatId;
    
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        console.error("navigator.mediaDevices not found. HTTPS is required for WebRTC.");
        if(window.showToast) window.showToast("Calling requires HTTPS or a modern browser.");
        return;
    }
    
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ 
            video: type === 'video', 
            audio: true 
        });
    } catch (e) {
        console.error("Media error", e);
        if(window.showToast) window.showToast("Camera/Mic permission denied or unavailable.");
        return;
    }

    showInCallUI(type, calleeName, calleeAvatar, true);
    setLocalStream(localStream, type);

    pc = new RTCPeerConnection(servers);
    remoteStream = new MediaStream();
    setRemoteStream(remoteStream, type);

    localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
    pc.ontrack = event => {
        event.streams[0].getTracks().forEach(track => remoteStream.addTrack(track));
    };

    const callDocRef = doc(collection(db, 'calls'));
    currentCallDocId = callDocRef.id;
    const offerCandidatesRef = collection(callDocRef, 'offerCandidates');
    const answerCandidatesRef = collection(callDocRef, 'answerCandidates');

    pc.onicecandidate = async event => {
        if (event.candidate) {
            await addDoc(offerCandidatesRef, event.candidate.toJSON());
        }
    };

    const offerDescription = await pc.createOffer();
    await pc.setLocalDescription(offerDescription);

    const callData = {
        callerUID: currentUser.uid,
        calleeUID: calleeUID,
        callerName: window.currentUserName || "Unknown",
        callerAvatar: currentUser.photoURL || "",
        type: type,
        status: 'ringing',
        offer: {
            type: offerDescription.type,
            sdp: offerDescription.sdp,
        },
        createdAt: new Date()
    };
    await setDoc(callDocRef, callData);

    unsubscribeCallDoc = onSnapshot(callDocRef, async (snapshot) => {
        if (!snapshot.exists()) {
            cleanupCall(db);
            return;
        }
        const data = snapshot.data();
        if (data.status === 'declined' || data.status === 'ended' || data.status === 'missed') {
            if(window.showToast) window.showToast(`Call ${data.status}`);
            
            if (currentChatDocId) {
                try {
                    await addDoc(collection(db, "chats", currentChatDocId, "messages"), {
                        senderId: currentUser.uid,
                        type: 'call',
                        callType: type,
                        callStatus: data.status,
                        durationSeconds: callSeconds,
                        sentAt: new Date()
                    });
                } catch(e) { console.error("Error saving call message:", e); }
            }

            cleanupCall(db);
        }
        if (data.answer && !pc.currentRemoteDescription) {
            const answerDescription = new RTCSessionDescription(data.answer);
            pc.setRemoteDescription(answerDescription);
            startCallTimer(); 
        }
    });

    unsubscribeAnswerCandidates = onSnapshot(answerCandidatesRef, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
            if (change.type === 'added') {
                const candidate = new RTCIceCandidate(change.doc.data());
                pc.addIceCandidate(candidate);
            }
        });
    });
    
    setTimeout(async () => {
        if (currentCallDocId) {
            const snap = await getDoc(callDocRef);
            if (snap.exists() && snap.data().status === 'ringing') {
                await updateDoc(callDocRef, { status: 'missed' });
                if(window.showToast) window.showToast("Call missed");
                cleanupCall(db);
            }
        }
    }, 30000);
}

/**
 * Callee function: accepts an incoming call.
 */
export async function acceptCall(db, callId, type, chatId) {
    if (!callId) return;
    currentCallDocId = callId;
    currentChatDocId = chatId;
    callType = type;
    
    const callDocRef = doc(db, 'calls', callId);
    const offerCandidatesRef = collection(callDocRef, 'offerCandidates');
    const answerCandidatesRef = collection(callDocRef, 'answerCandidates');
    
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        console.error("navigator.mediaDevices not found. HTTPS is required for WebRTC.");
        if(window.showToast) window.showToast("Calling requires HTTPS or a modern browser.");
        await updateDoc(callDocRef, { status: 'declined_no_media' });
        return;
    }
    
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ 
            video: type === 'video', 
            audio: true 
        });
    } catch (e) {
        console.error("Media error", e);
        if(window.showToast) window.showToast("Camera/Mic permission denied or unavailable.");
        await updateDoc(callDocRef, { status: 'declined_no_media' });
        return;
    }

    const callDocSnap = await getDoc(callDocRef);
    if(!callDocSnap.exists()) return;
    const callData = callDocSnap.data();

    showInCallUI(type, callData.callerName, callData.callerAvatar, false);
    setLocalStream(localStream, type);

    pc = new RTCPeerConnection(servers);
    remoteStream = new MediaStream();
    setRemoteStream(remoteStream, type);

    localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
    pc.ontrack = event => {
        event.streams[0].getTracks().forEach(track => remoteStream.addTrack(track));
    };

    pc.onicecandidate = async event => {
        if (event.candidate) {
            await addDoc(answerCandidatesRef, event.candidate.toJSON());
        }
    };

    const offerDescription = callData.offer;
    await pc.setRemoteDescription(new RTCSessionDescription(offerDescription));

    const answerDescription = await pc.createAnswer();
    await pc.setLocalDescription(answerDescription);

    const answer = {
        type: answerDescription.type,
        sdp: answerDescription.sdp,
    };

    await updateDoc(callDocRef, { answer, status: 'connected' });
    startCallTimer();

    unsubscribeOfferCandidates = onSnapshot(offerCandidatesRef, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
            if (change.type === 'added') {
                const candidate = new RTCIceCandidate(change.doc.data());
                pc.addIceCandidate(candidate);
            }
        });
    });

    unsubscribeCallDoc = onSnapshot(callDocRef, (snapshot) => {
        if (!snapshot.exists()) {
            cleanupCall(db);
            return;
        }
        const data = snapshot.data();
        if (data.status === 'ended') {
            if(window.showToast) window.showToast("Call ended");
            cleanupCall(db);
        }
    });
}

/**
 * Callee function: declines an incoming call.
 */
export async function declineCall(db, callId) {
    if(!callId) return;
    const callDocRef = doc(db, 'calls', callId);
    await updateDoc(callDocRef, { status: 'declined' });
}

/**
 * Ends the current active call.
 */
export async function endCall(db) {
    if (currentCallDocId && db) {
        const callDocRef = doc(db, 'calls', currentCallDocId);
        await updateDoc(callDocRef, { status: 'ended' });
    }
    await cleanupCall(db);
}


/* ========================================================================= */
/* UI Helper Functions (Assumes DOM elements exist in chats.html)            */
/* ========================================================================= */

let callTimerInterval = null;
let callSeconds = 0;

function showInCallUI(type, remoteName, remoteAvatar, isCaller) {
    const overlay = document.getElementById('inCallOverlay');
    if (!overlay) return;
    overlay.style.display = 'flex';
    
    document.getElementById('inCallRemoteName').textContent = remoteName || "Unknown User";
    
    const videoContainer = document.getElementById('inCallVideoContainer');
    const voiceContainer = document.getElementById('inCallVoiceContainer');
    
    if (type === 'video') {
        videoContainer.style.display = 'block';
        voiceContainer.style.display = 'none';
        document.getElementById('toggleVideoBtn').style.display = 'flex';
    } else {
        videoContainer.style.display = 'none';
        voiceContainer.style.display = 'flex';
        document.getElementById('toggleVideoBtn').style.display = 'none';
        
        const avatarEl = document.getElementById('inCallAvatar');
        if (remoteAvatar) {
            avatarEl.innerHTML = `<img src="${remoteAvatar}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;
        } else {
            const initials = (remoteName||"Unknown").split(' ').map(w=>w[0]).slice(0,2).join('');
            avatarEl.innerHTML = `<span>${initials.toUpperCase()}</span>`;
        }
    }
    
    document.getElementById('inCallStatus').textContent = isCaller ? 'Calling...' : 'Connecting...';
    callSeconds = 0;
    if(callTimerInterval) clearInterval(callTimerInterval);
}

function hideInCallUI() {
    const overlay = document.getElementById('inCallOverlay');
    if (overlay) overlay.style.display = 'none';
    
    document.getElementById('localVideo').srcObject = null;
    document.getElementById('remoteVideo').srcObject = null;
    document.getElementById('voiceOnlyAudio').srcObject = null;
    
    if(callTimerInterval) {
        clearInterval(callTimerInterval);
        callTimerInterval = null;
    }
}

function setLocalStream(stream, type) {
    if(type === 'video') {
        const localVideo = document.getElementById('localVideo');
        if(localVideo) localVideo.srcObject = stream;
    }
}

function setRemoteStream(stream, type) {
    if(type === 'video') {
        const remoteVideo = document.getElementById('remoteVideo');
        if(remoteVideo) remoteVideo.srcObject = stream;
    } else {
        const audio = document.getElementById('voiceOnlyAudio');
        if(audio) audio.srcObject = stream;
    }
}

function startCallTimer() {
    const statusEl = document.getElementById('inCallStatus');
    if(!statusEl) return;
    
    if(callTimerInterval) clearInterval(callTimerInterval);
    callSeconds = 0;
    
    statusEl.textContent = "00:00";
    callTimerInterval = setInterval(() => {
        callSeconds++;
        const mins = String(Math.floor(callSeconds / 60)).padStart(2, '0');
        const secs = String(callSeconds % 60).padStart(2, '0');
        statusEl.textContent = `${mins}:${secs}`;
    }, 1000);
}

export function toggleMic() {
    if(localStream) {
        const audioTrack = localStream.getAudioTracks()[0];
        if(audioTrack) {
            audioTrack.enabled = !audioTrack.enabled;
            return !audioTrack.enabled; 
        }
    }
    return false;
}

export function toggleVideo() {
    if(localStream && callType === 'video') {
        const videoTrack = localStream.getVideoTracks()[0];
        if(videoTrack) {
            videoTrack.enabled = !videoTrack.enabled;
            return !videoTrack.enabled; 
        }
    }
    return false;
}

/**
 * Global Call Listener (Dynamic Island & Background Notifications)
 */
let globalCallUnsubscribe = null;
export function initGlobalListener(db, currentUser) {
    if (globalCallUnsubscribe) return; // Already listening

    // Request Notification permission for background calls
    if ("Notification" in window && Notification.permission === "default") {
        Notification.requestPermission();
    }

    // Initialize Firebase Cloud Messaging for Background Pushes
    try {
        const messaging = getMessaging();
        getToken(messaging, { vapidKey: "BDMFxPzadFCNDmgUU9dnwKd_KYiMEdcq8mtHh-Ch-Vh3sy2eKrzVwWrjTR2jEDUHxtDf9vH6hRqV4z6hdenMo3g" }).then((currentToken) => {
            if (currentToken) {
                // Save token to Firestore
                setDoc(doc(db, "fcmTokens", currentUser.uid), {
                    token: currentToken,
                    updatedAt: new Date()
                }, { merge: true });
            } else {
                console.log('No registration token available. Request permission to generate one.');
            }
        }).catch((err) => {
            console.log('An error occurred while retrieving token. ', err);
        });
    } catch (e) {
        console.warn("FCM init failed:", e);
    }

    const q = query(
        collection(db, "calls"),
        where("calleeUID", "==", currentUser.uid),
        where("status", "==", "ringing")
    );

    globalCallUnsubscribe = onSnapshot(q, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
            if (change.type === 'added') {
                const callData = change.doc.data();
                const callId = change.doc.id;
                
                // Show OS notification if page is hidden
                if (document.hidden && "Notification" in window && Notification.permission === "granted") {
                    new Notification("Incoming " + callData.type + " call...", {
                        body: callData.callerName || "Unknown",
                        icon: callData.callerAvatar || "/dsu_logo.png"
                    });
                }
                
                // Show Dynamic Island UI
                showDynamicIsland(callId, callData, db, currentUser);
            }
        });
    });

    // ─── BACKGROUND MESSAGE NOTIFICATIONS ───
    const chatQ = query(
        collection(db, "chats"),
        where("participants", "array-contains", currentUser.uid)
    );

    let isInitialChatLoad = true;
    onSnapshot(chatQ, (snapshot) => {
        if (isInitialChatLoad) {
            isInitialChatLoad = false;
            return;
        }
        
        snapshot.docChanges().forEach((change) => {
            if (change.type === 'modified' || change.type === 'added') {
                const data = change.doc.data();
                if (data.lastMessageSenderId && data.lastMessageSenderId !== currentUser.uid) {
                    const now = new Date().getTime();
                    // If lastMessageAt is null (pending server timestamp), assume it's right now
                    const msgTime = data.lastMessageAt ? (typeof data.lastMessageAt.toMillis === 'function' ? data.lastMessageAt.toMillis() : 0) : now;
                    
                    // Only notify if message is recent (within 10 seconds) to avoid spam
                    if (now - msgTime < 10000) {
                        if (typeof window.playNotification === 'function') {
                            window.playNotification();
                        }
                        
                        const msgText = data.lastMessage || "Sent a message";
                        const senderName = data.lastMessageSenderName || 'User';
                        
                        // Show in-app Toast notification
                        if (typeof window.showToast === 'function') {
                            // Don't show toast if they are currently on chats page to avoid double notifications while chatting
                            if (!window.location.pathname.includes('chats.html')) {
                                window.showToast(`ExamPro DSU - ${senderName}: ${msgText}`, 'info');
                            }
                        }
                        
                        // Show OS-level background notification
                        if ("Notification" in window && Notification.permission === "granted") {
                            new Notification(`ExamPro DSU: ${senderName}`, {
                                body: msgText,
                                icon: "/dsu_logo.png"
                            });
                        }
                    }
                }
            }
        });
    });
}

function showDynamicIsland(callId, data, db, currentUser) {
    // Remove existing if any
    let existing = document.getElementById('dynamicIslandCall');
    if (existing) existing.remove();

    const island = document.createElement('div');
    island.id = 'dynamicIslandCall';
    island.className = 'dynamic-island active';
    
    const initials = (data.callerName || "U").substring(0, 1).toUpperCase();
    const avatarHtml = data.callerAvatar 
        ? `<img src="${data.callerAvatar}" style="width:100%;height:100%;object-fit:cover;">`
        : `<span style="font-size:24px;font-weight:bold;color:white;">${initials}</span>`;

    island.innerHTML = `
        <div class="dynamic-island-avatar" style="${!data.callerAvatar ? 'background:#00a884;' : ''}">
            ${avatarHtml}
        </div>
        <div class="dynamic-island-info">
            <div class="dynamic-island-title">mobile</div>
            <div class="dynamic-island-name">${data.callerName || 'Unknown'}</div>
        </div>
        <div class="dynamic-island-actions">
            <button class="dynamic-island-btn decline" id="diDeclineBtn"><i class="fas fa-phone-slash"></i></button>
            <button class="dynamic-island-btn accept" id="diAcceptBtn"><i class="fas fa-phone"></i></button>
        </div>
        <audio id="diRingtone" loop src="ringtone.mp3" autoplay></audio>
    `;
    
    document.body.appendChild(island);

    // Play ringtone explicitly (autoplay might be blocked without interaction)
    const audio = island.querySelector('#diRingtone');
    audio.play().catch(e => console.log('Audio autoplay blocked', e));

    // Handle Decline
    document.getElementById('diDeclineBtn').onclick = async () => {
        island.classList.replace('active', 'hide');
        setTimeout(() => island.remove(), 400);
        await updateDoc(doc(db, "calls", callId), { status: 'declined' });
    };

    // Handle Accept
    document.getElementById('diAcceptBtn').onclick = () => {
        island.classList.replace('active', 'hide');
        setTimeout(() => island.remove(), 400);
        
        // If we are already on chats.html, we can just trigger the accept logic
        if (window.location.pathname.includes('chats.html')) {
            if (typeof window.acceptIncomingCall === 'function') {
                window.acceptIncomingCall(callId, data); 
            }
        } else {
            // Redirect to chats.html with call ID
            window.location.href = 'chats.html?acceptCall=' + callId;
        }
    };
    
    // Listen for call ending while ringing
    const callUnsub = onSnapshot(doc(db, "calls", callId), (snap) => {
        if (!snap.exists() || snap.data().status !== 'ringing') {
            island.classList.replace('active', 'hide');
            setTimeout(() => {
                if(island.parentNode) island.remove();
            }, 400);
            callUnsub();
        }
    });
}
