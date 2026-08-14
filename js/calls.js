import { 
    collection, doc, setDoc, addDoc, onSnapshot, getDoc, 
    updateDoc, deleteDoc, getDocs 
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

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
export async function startCall(db, currentUser, type, calleeUID, calleeName, calleeAvatar) {
    if (!calleeUID) {
        if(window.showToast) window.showToast("Cannot call: User ID missing");
        return;
    }
    callType = type;
    
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

    unsubscribeCallDoc = onSnapshot(callDocRef, (snapshot) => {
        if (!snapshot.exists()) {
            cleanupCall(db);
            return;
        }
        const data = snapshot.data();
        if (data.status === 'declined' || data.status === 'ended' || data.status === 'missed') {
            if(window.showToast) window.showToast(`Call ${data.status}`);
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
export async function acceptCall(db, callId, type) {
    if (!callId) return;
    currentCallDocId = callId;
    callType = type;
    
    const callDocRef = doc(db, 'calls', callId);
    const offerCandidatesRef = collection(callDocRef, 'offerCandidates');
    const answerCandidatesRef = collection(callDocRef, 'answerCandidates');
    
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
