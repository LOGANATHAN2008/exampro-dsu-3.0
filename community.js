import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut, setPersistence, browserLocalPersistence } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, doc, getDoc, collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, arrayUnion, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// Ensure this matches the existing dashboard.js firebase config!
const firebaseConfig = {
    apiKey: "AIzaSyDKDT0kvwEm0cEdh_MpbTb8A9W3_xwAVxY",
    authDomain: "dsu-exam-system.firebaseapp.com",
    projectId: "dsu-exam-system",
    storageBucket: "dsu-exam-system.appspot.com",
    messagingSenderId: "563584335869",
    appId: "1:563584335869:web:355ce9e1dc4a68212dd061",
    measurementId: "G-FDRL6G9Q7L"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
await setPersistence(auth, browserLocalPersistence);
const db = getFirestore(app);

let currentUser = null;
let userData = null;
let chatUnsubscribe = null;

// On load
document.addEventListener('DOMContentLoaded', () => {
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            currentUser = user;
            try {
                const userDoc = await getDoc(doc(db, 'users', user.uid));
                if (userDoc.exists()) {
                    userData = userDoc.data();
                    document.getElementById('studentName').innerText = userData.name || 'Student';
                    document.getElementById('sidebarName').innerText = userData.name || 'Student';
                    if(document.getElementById('chatDeptName')) {
                        document.getElementById('chatDeptName').innerText = userData.department || 'General';
                    }
                    
                    // Default tab is chat
                    loadDepartmentChat();
                } else {
                    window.location.href = 'login.html';
                }
            } catch (err) {
                console.error("Error fetching user data:", err);
            }
        } else {
            window.location.href = 'login.html';
        }
    });
});

// Chat Logic
function loadDepartmentChat() {
    if (!userData || !userData.department) return;
    
    const chatBox = document.getElementById('chatBox');
    const dept = userData.department;
    
    if (chatUnsubscribe) chatUnsubscribe(); // Unsub previous if any
    
    chatBox.innerHTML = '<div style="text-align:center; color:var(--text-muted); margin-top: 20px;">Loading chat...</div>';
    
    const messagesRef = collection(db, 'chatRooms', dept, 'messages');
    const q = query(messagesRef, orderBy('timestamp', 'asc'));
    
    chatUnsubscribe = onSnapshot(q, (snapshot) => {
        chatBox.innerHTML = '';
        if (snapshot.empty) {
            chatBox.innerHTML = '<div style="text-align:center; color:var(--text-muted); margin-top: 20px;">No messages yet. Be the first to say hello!</div>';
            return;
        }
        
        snapshot.forEach(docSnap => {
            const msg = docSnap.data();
            const isMine = msg.senderUID === currentUser.uid;
            
            const msgDiv = document.createElement('div');
            msgDiv.className = `chat-msg ${isMine ? 'mine' : 'others'}`;
            
            // Format time
            let timeStr = '';
            if (msg.timestamp) {
                const date = msg.timestamp.toDate();
                timeStr = date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
            }
            
            msgDiv.innerHTML = `
                ${!isMine ? `<div class="sender">${msg.senderName}</div>` : ''}
                <div>${msg.text}</div>
                <div class="time">${timeStr}</div>
                <button class="btn-report" onclick="reportContent('chat', '${docSnap.id}', '${dept}')" title="Report Message"><i class="fas fa-flag"></i></button>
            `;
            chatBox.appendChild(msgDiv);
        });
        
        // Scroll to bottom
        chatBox.scrollTop = chatBox.scrollHeight;
    }, (error) => {
        console.error("Chat error:", error);
        chatBox.innerHTML = '<div style="text-align:center; color:var(--error); margin-top: 20px;">Could not load chat. Check permissions.</div>';
    });
}

window.sendChatMessage = async function() {
    const input = document.getElementById('chatInput');
    const text = input.value.trim();
    if (!text || !userData || !userData.department) return;
    
    input.value = '';
    
    try {
        const messagesRef = collection(db, 'chatRooms', userData.department, 'messages');
        await addDoc(messagesRef, {
            text: text,
            senderUID: currentUser.uid,
            senderName: userData.name || 'Anonymous',
            timestamp: serverTimestamp()
        });
    } catch (err) {
        console.error("Error sending message:", err);
        alert("Failed to send message.");
    }
}

// Global Report Logic
window.reportContent = async function(type, contentId, extraPath = '') {
    if(!confirm("Are you sure you want to report this content? Admins will review it.")) return;
    
    try {
        await addDoc(collection(db, 'reports'), {
            type: type, // 'chat', 'project', 'forum', etc.
            contentId: contentId,
            extraPath: extraPath, // useful for chat room dept
            reportedBy: currentUser.uid,
            timestamp: serverTimestamp(),
            status: 'pending'
        });
        alert("Content reported successfully!");
    } catch (err) {
        console.error("Error reporting:", err);
        alert("Failed to report content.");
    }
}

// ===== Modal Helpers =====
window.openCommModal = function(title, innerHTML, onSubmit) {
    document.getElementById('commModalTitle').innerText = title;
    document.getElementById('commModalBody').innerHTML = innerHTML;
    const submitBtn = document.getElementById('commModalSubmit');
    submitBtn.onclick = async () => {
        const originalText = submitBtn.innerText;
        submitBtn.innerText = 'Wait...';
        submitBtn.disabled = true;
        await onSubmit();
        submitBtn.innerText = originalText;
        submitBtn.disabled = false;
    };
    document.getElementById('commModal').style.display = 'flex';
}

window.closeCommModal = function() {
    document.getElementById('commModal').style.display = 'none';
    document.getElementById('commModalBody').innerHTML = '';
}

// ===== Project Team Finder =====
let projectsUnsubscribe = null;

window.loadProjects = function() {
    if (projectsUnsubscribe) projectsUnsubscribe();
    
    const projectsRef = collection(db, 'projectListings');
    const q = query(projectsRef, orderBy('timestamp', 'desc'));
    
    projectsUnsubscribe = onSnapshot(q, (snapshot) => {
        const grid = document.getElementById('projectsGrid');
        grid.innerHTML = '';
        if (snapshot.empty) {
            grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:var(--text-muted);">No projects posted yet. Create one!</div>';
            return;
        }
        
        snapshot.forEach(docSnap => {
            const proj = docSnap.data();
            const isOwner = proj.ownerUID === currentUser.uid;
            
            // Check if current user has already requested
            const requests = proj.requests || [];
            const hasRequested = requests.includes(currentUser.uid);
            
            const card = document.createElement('div');
            card.className = 'comm-card';
            card.style.position = 'relative';
            
            card.innerHTML = `
                <h3>${proj.title}</h3>
                <p>${proj.description}</p>
                <div class="meta">
                    <span><i class="fas fa-tools"></i> Skills: ${proj.skills}</span>
                    <span><i class="fas fa-user"></i> ${proj.ownerName}</span>
                </div>
                ${isOwner 
                    ? `<button class="btn-primary" style="background:var(--success)" onclick="alert('You have ${requests.length} pending requests!')">View Requests (${requests.length})</button>`
                    : hasRequested
                        ? `<button class="btn-primary" style="background:var(--text-muted)" disabled>Request Sent</button>`
                        : `<button class="btn-primary" onclick="requestToJoinProject('${docSnap.id}')">Request to Join</button>`
                }
                <button class="btn-report" onclick="reportContent('project', '${docSnap.id}')" title="Report Project"><i class="fas fa-flag"></i></button>
            `;
            grid.appendChild(card);
        });
    });
}

window.openProjectModal = function() {
    openCommModal('Post a Project Idea', `
        <label>Project Title</label>
        <input type="text" id="projTitle" placeholder="e.g. AI Study Assistant" style="padding:10px; border-radius:5px; border:1px solid var(--glass-border); background:var(--bg2); color:var(--text-color);">
        <label>Description</label>
        <textarea id="projDesc" rows="3" placeholder="What are you building?" style="padding:10px; border-radius:5px; border:1px solid var(--glass-border); background:var(--bg2); color:var(--text-color);"></textarea>
        <label>Skills Needed</label>
        <input type="text" id="projSkills" placeholder="e.g. React, Firebase, Python" style="padding:10px; border-radius:5px; border:1px solid var(--glass-border); background:var(--bg2); color:var(--text-color);">
    `, async () => {
        const title = document.getElementById('projTitle').value.trim();
        const desc = document.getElementById('projDesc').value.trim();
        const skills = document.getElementById('projSkills').value.trim();
        
        if(!title || !desc) {
            alert("Title and Description are required!");
            return;
        }
        
        try {
            await addDoc(collection(db, 'projectListings'), {
                title: title,
                description: desc,
                skills: skills,
                ownerUID: currentUser.uid,
                ownerName: userData.name || 'Student',
                requests: [], // array of UIDs who requested to join
                timestamp: serverTimestamp()
            });
            closeCommModal();
        } catch(err) {
            console.error("Error adding project:", err);
            alert("Failed to create project.");
        }
    });
}



window.requestToJoinProject = async function(projectId) {
    if(!confirm("Send a request to join this project?")) return;
    
    try {
        const projRef = doc(db, 'projectListings', projectId);
        await updateDoc(projRef, {
            requests: arrayUnion(currentUser.uid)
        });
        alert("Request sent successfully!");
    } catch(err) {
        console.error("Error sending request:", err);
        alert("Failed to send request.");
    }
}

// ===== Study Groups =====
let studyUnsubscribe = null;

window.loadStudyGroups = function() {
    if (studyUnsubscribe) studyUnsubscribe();
    
    const studyRef = collection(db, 'studyGroups');
    const q = query(studyRef, orderBy('timestamp', 'desc'));
    
    studyUnsubscribe = onSnapshot(q, (snapshot) => {
        const grid = document.getElementById('studyGrid');
        grid.innerHTML = '';
        if (snapshot.empty) {
            grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:var(--text-muted);">No study groups yet. Start one!</div>';
            return;
        }
        
        snapshot.forEach(docSnap => {
            const grp = docSnap.data();
            const members = grp.members || [];
            const isMember = members.includes(currentUser.uid);
            
            const card = document.createElement('div');
            card.className = 'comm-card';
            card.style.position = 'relative';
            
            card.innerHTML = `
                <h3>${grp.subject}</h3>
                <p><i class="fas fa-clock"></i> ${grp.schedule}</p>
                <div class="meta">
                    <span><i class="fas fa-users"></i> ${members.length} / ${grp.maxMembers} Members</span>
                    <span><i class="fas fa-user-graduate"></i> Host: ${grp.ownerName}</span>
                </div>
                ${isMember
                    ? `<button class="btn-primary" style="background:var(--error)" onclick="leaveStudyGroup('${docSnap.id}')">Leave Group</button>`
                    : members.length >= parseInt(grp.maxMembers)
                        ? `<button class="btn-primary" style="background:var(--text-muted)" disabled>Group Full</button>`
                        : `<button class="btn-primary" onclick="joinStudyGroup('${docSnap.id}')">Join Group</button>`
                }
                <button class="btn-report" onclick="reportContent('study', '${docSnap.id}')" title="Report Group"><i class="fas fa-flag"></i></button>
            `;
            grid.appendChild(card);
        });
    });
}

window.openStudyModal = function() {
    openCommModal('Create Study Group', `
        <label>Subject Topic</label>
        <input type="text" id="grpSubject" placeholder="e.g. Data Structures Prep" style="padding:10px; border-radius:5px; border:1px solid var(--glass-border); background:var(--bg2); color:var(--text-color);">
        <label>Schedule / Location</label>
        <input type="text" id="grpSchedule" placeholder="e.g. Tomorrow 5 PM at Library" style="padding:10px; border-radius:5px; border:1px solid var(--glass-border); background:var(--bg2); color:var(--text-color);">
        <label>Max Members</label>
        <input type="number" id="grpMax" value="5" min="2" max="20" style="padding:10px; border-radius:5px; border:1px solid var(--glass-border); background:var(--bg2); color:var(--text-color);">
    `, async () => {
        const subject = document.getElementById('grpSubject').value.trim();
        const schedule = document.getElementById('grpSchedule').value.trim();
        const maxMembers = document.getElementById('grpMax').value.trim();
        
        if(!subject || !schedule || !maxMembers) {
            alert("All fields are required!");
            return;
        }
        
        try {
            await addDoc(collection(db, 'studyGroups'), {
                subject: subject,
                schedule: schedule,
                maxMembers: parseInt(maxMembers),
                ownerUID: currentUser.uid,
                ownerName: userData.name || 'Student',
                members: [currentUser.uid], // Owner is automatically a member
                timestamp: serverTimestamp()
            });
            closeCommModal();
        } catch(err) {
            console.error("Error creating group:", err);
            alert("Failed to create group.");
        }
    });
}

import { arrayRemove } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

window.joinStudyGroup = async function(groupId) {
    try {
        const grpRef = doc(db, 'studyGroups', groupId);
        await updateDoc(grpRef, {
            members: arrayUnion(currentUser.uid)
        });
    } catch(err) {
        console.error("Error joining:", err);
        alert("Failed to join group.");
    }
}

window.leaveStudyGroup = async function(groupId) {
    if(!confirm("Are you sure you want to leave this study group?")) return;
    try {
        const grpRef = doc(db, 'studyGroups', groupId);
        await updateDoc(grpRef, {
            members: arrayRemove(currentUser.uid)
        });
    } catch(err) {
        console.error("Error leaving:", err);
        alert("Failed to leave group.");
    }
}

// ===== Polls =====
let pollsUnsubscribe = null;

window.loadPolls = function() {
    if (pollsUnsubscribe) pollsUnsubscribe();
    
    const pollsRef = collection(db, 'polls');
    const q = query(pollsRef, orderBy('timestamp', 'desc'));
    
    pollsUnsubscribe = onSnapshot(q, (snapshot) => {
        const grid = document.getElementById('pollsGrid');
        grid.innerHTML = '';
        if (snapshot.empty) {
            grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:var(--text-muted);">No polls yet.</div>';
            return;
        }
        
        snapshot.forEach(docSnap => {
            const poll = docSnap.data();
            const totalVotes = poll.options.reduce((acc, opt) => acc + (opt.votes.length || 0), 0);
            
            // Check if voted
            let votedOptIndex = -1;
            poll.options.forEach((opt, idx) => {
                if(opt.votes && opt.votes.includes(currentUser.uid)) {
                    votedOptIndex = idx;
                }
            });
            
            const card = document.createElement('div');
            card.className = 'comm-card';
            card.style.position = 'relative';
            
            let optionsHTML = '';
            poll.options.forEach((opt, idx) => {
                const optVotes = opt.votes ? opt.votes.length : 0;
                const pct = totalVotes > 0 ? Math.round((optVotes / totalVotes) * 100) : 0;
                const isMyVote = (votedOptIndex === idx);
                
                optionsHTML += `
                    <div style="margin-bottom:10px;">
                        <div style="display:flex; justify-content:space-between; font-size:13px; margin-bottom:5px;">
                            <span style="font-weight:${isMyVote?'bold':'normal'}">${opt.text} ${isMyVote?'(Your Vote)':''}</span>
                            <span>${pct}%</span>
                        </div>
                        <div style="background:var(--bg3); border-radius:10px; height:8px; overflow:hidden; cursor:pointer;" onclick="votePoll('${docSnap.id}', ${idx})">
                            <div style="background:var(--primary); width:${pct}%; height:100%; border-radius:10px; transition:0.3s;"></div>
                        </div>
                    </div>
                `;
            });
            
            card.innerHTML = `
                <h3>${poll.question}</h3>
                <div style="margin-top:15px; margin-bottom:15px;">
                    ${optionsHTML}
                </div>
                <div class="meta" style="margin-bottom:0; border:none; padding-bottom:0;">
                    <span><i class="fas fa-poll-h"></i> ${totalVotes} Total Votes</span>
                    <span>By ${poll.ownerName}</span>
                </div>
                <button class="btn-report" onclick="reportContent('poll', '${docSnap.id}')" title="Report Poll"><i class="fas fa-flag"></i></button>
            `;
            grid.appendChild(card);
        });
    });
}

window.openPollModal = function() {
    openCommModal('Create Student Poll', `
        <label>Poll Question</label>
        <input type="text" id="pollQuestion" placeholder="e.g. Which programming language should we cover next?" style="padding:10px; border-radius:5px; border:1px solid var(--glass-border); background:var(--bg2); color:var(--text-color); margin-bottom:15px;">
        
        <label>Options</label>
        <input type="text" id="pollOpt1" placeholder="Option 1" style="padding:10px; border-radius:5px; border:1px solid var(--glass-border); background:var(--bg2); color:var(--text-color); margin-bottom:10px;">
        <input type="text" id="pollOpt2" placeholder="Option 2" style="padding:10px; border-radius:5px; border:1px solid var(--glass-border); background:var(--bg2); color:var(--text-color); margin-bottom:10px;">
        <input type="text" id="pollOpt3" placeholder="Option 3 (Optional)" style="padding:10px; border-radius:5px; border:1px solid var(--glass-border); background:var(--bg2); color:var(--text-color); margin-bottom:10px;">
    `, async () => {
        const question = document.getElementById('pollQuestion').value.trim();
        const opt1 = document.getElementById('pollOpt1').value.trim();
        const opt2 = document.getElementById('pollOpt2').value.trim();
        const opt3 = document.getElementById('pollOpt3').value.trim();
        
        if(!question || !opt1 || !opt2) {
            alert("Question and at least 2 options are required!");
            return;
        }
        
        const options = [
            { text: opt1, votes: [] },
            { text: opt2, votes: [] }
        ];
        if(opt3) options.push({ text: opt3, votes: [] });
        
        try {
            await addDoc(collection(db, 'polls'), {
                question: question,
                options: options,
                ownerUID: currentUser.uid,
                ownerName: userData.name || 'Student',
                timestamp: serverTimestamp()
            });
            closeCommModal();
        } catch(err) {
            console.error("Error creating poll:", err);
            alert("Failed to create poll.");
        }
    });
}

window.votePoll = async function(pollId, optionIndex) {
    try {
        const pollRef = doc(db, 'polls', pollId);
        const pollDoc = await getDoc(pollRef);
        if(!pollDoc.exists()) return;
        
        const poll = pollDoc.data();
        let alreadyVoted = false;
        
        // Remove vote from any existing option
        poll.options.forEach(opt => {
            const idx = opt.votes.indexOf(currentUser.uid);
            if(idx > -1) {
                opt.votes.splice(idx, 1);
                alreadyVoted = true;
            }
        });
        
        // Add to new option
        poll.options[optionIndex].votes.push(currentUser.uid);
        
        await updateDoc(pollRef, {
            options: poll.options
        });
        
    } catch(err) {
        console.error("Error voting:", err);
        alert("Failed to register vote.");
    }
}

// ===== Discussion Forum =====
let forumUnsubscribe = null;

window.loadForum = function() {
    if (forumUnsubscribe) forumUnsubscribe();
    
    const forumRef = collection(db, 'forumThreads');
    const q = query(forumRef, orderBy('timestamp', 'desc'));
    
    forumUnsubscribe = onSnapshot(q, (snapshot) => {
        const list = document.getElementById('forumList');
        list.innerHTML = '';
        if (snapshot.empty) {
            list.innerHTML = '<div style="text-align:center;color:var(--text-muted);">No discussions yet. Start a thread!</div>';
            return;
        }
        
        snapshot.forEach(docSnap => {
            const thread = docSnap.data();
            const upvotes = thread.upvotes || [];
            const hasUpvoted = upvotes.includes(currentUser.uid);
            
            const card = document.createElement('div');
            card.className = 'comm-card';
            card.style.position = 'relative';
            
            card.innerHTML = `
                <div style="display:flex; gap:15px;">
                    <div style="display:flex; flex-direction:column; align-items:center; gap:5px;">
                        <button style="background:none; border:none; cursor:pointer; font-size:20px; color:${hasUpvoted ? 'var(--primary)' : 'var(--text-muted)'};" onclick="upvoteThread('${docSnap.id}')">
                            <i class="fas fa-arrow-up"></i>
                        </button>
                        <span style="font-weight:bold; color:var(--text-color);">${upvotes.length}</span>
                    </div>
                    <div style="flex:1;">
                        <h3 style="margin-bottom:5px;">${thread.title}</h3>
                        <p style="margin-bottom:10px;">${thread.body}</p>
                        <div class="meta" style="margin-bottom:0; border:none; padding-bottom:0;">
                            <span><i class="fas fa-tag"></i> ${thread.category}</span>
                            <span>By ${thread.authorName}</span>
                        </div>
                    </div>
                </div>
                <button class="btn-report" onclick="reportContent('forum', '${docSnap.id}')" title="Report Thread"><i class="fas fa-flag"></i></button>
            `;
            list.appendChild(card);
        });
    });
}

window.openForumModal = function() {
    openCommModal('New Discussion Thread', `
        <label>Category</label>
        <select id="forumCategory" style="padding:10px; border-radius:5px; border:1px solid var(--glass-border); background:var(--bg2); color:var(--text-color); margin-bottom:15px; width:100%;">
            <option value="General">General</option>
            <option value="Academics">Academics</option>
            <option value="Events">Events</option>
            <option value="Help">Help/Questions</option>
        </select>
        <label>Thread Title</label>
        <input type="text" id="forumTitle" placeholder="What do you want to discuss?" style="padding:10px; border-radius:5px; border:1px solid var(--glass-border); background:var(--bg2); color:var(--text-color); margin-bottom:15px;">
        <label>Message</label>
        <textarea id="forumBody" rows="4" placeholder="Write your post here..." style="padding:10px; border-radius:5px; border:1px solid var(--glass-border); background:var(--bg2); color:var(--text-color);"></textarea>
    `, async () => {
        const title = document.getElementById('forumTitle').value.trim();
        const body = document.getElementById('forumBody').value.trim();
        const category = document.getElementById('forumCategory').value;
        
        if(!title || !body) {
            alert("Title and message are required!");
            return;
        }
        
        try {
            await addDoc(collection(db, 'forumThreads'), {
                title: title,
                body: body,
                category: category,
                authorUID: currentUser.uid,
                authorName: userData.name || 'Student',
                upvotes: [],
                timestamp: serverTimestamp()
            });
            closeCommModal();
        } catch(err) {
            console.error("Error creating thread:", err);
            alert("Failed to create thread.");
        }
    });
}

window.upvoteThread = async function(threadId) {
    try {
        const threadRef = doc(db, 'forumThreads', threadId);
        const threadDoc = await getDoc(threadRef);
        if(!threadDoc.exists()) return;
        
        const upvotes = threadDoc.data().upvotes || [];
        if(upvotes.includes(currentUser.uid)) {
            // Remove upvote
            await updateDoc(threadRef, { upvotes: arrayRemove(currentUser.uid) });
        } else {
            // Add upvote
            await updateDoc(threadRef, { upvotes: arrayUnion(currentUser.uid) });
        }
    } catch(err) {
        console.error("Error upvoting:", err);
    }
}

// ===== Lost & Found =====
let lfUnsubscribe = null;

window.loadLostFound = function() {
    if (lfUnsubscribe) lfUnsubscribe();
    
    const lfRef = collection(db, 'lostAndFound');
    const q = query(lfRef, orderBy('timestamp', 'desc'));
    
    lfUnsubscribe = onSnapshot(q, (snapshot) => {
        const grid = document.getElementById('lostFoundGrid');
        grid.innerHTML = '';
        if (snapshot.empty) {
            grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:var(--text-muted);">No items reported yet.</div>';
            return;
        }
        
        snapshot.forEach(docSnap => {
            const item = docSnap.data();
            
            const card = document.createElement('div');
            card.className = 'comm-card';
            card.style.position = 'relative';
            if(item.status === 'resolved') {
                card.style.opacity = '0.6';
            }
            
            card.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                    <h3 style="margin:0;">${item.itemName}</h3>
                    <span style="padding:4px 8px; border-radius:12px; font-size:11px; font-weight:bold; color:white; background:${item.type === 'Lost' ? 'var(--error)' : 'var(--success)'}">${item.type}</span>
                </div>
                <p style="margin-bottom:10px;">${item.description}</p>
                <div style="font-size:12px; color:var(--text-color); margin-bottom:10px;">
                    <div><strong><i class="fas fa-map-marker-alt"></i> Location:</strong> ${item.location}</div>
                    <div><strong><i class="fas fa-phone"></i> Contact:</strong> ${item.contact}</div>
                </div>
                ${item.status === 'resolved' 
                    ? `<div style="text-align:center; color:var(--success); font-weight:bold; margin-top:10px;">RESOLVED</div>`
                    : item.reporterUID === currentUser.uid 
                        ? `<button class="btn-primary" style="background:var(--success); margin-top:10px;" onclick="resolveLostFound('${docSnap.id}')">Mark as Resolved</button>`
                        : ``
                }
                <button class="btn-report" onclick="reportContent('lostfound', '${docSnap.id}')" title="Report Item"><i class="fas fa-flag"></i></button>
            `;
            grid.appendChild(card);
        });
    });
}

window.openLostFoundModal = function() {
    openCommModal('Report Lost/Found Item', `
        <label>Type</label>
        <select id="lfType" style="padding:10px; border-radius:5px; border:1px solid var(--glass-border); background:var(--bg2); color:var(--text-color); margin-bottom:15px; width:100%;">
            <option value="Lost">I Lost Something</option>
            <option value="Found">I Found Something</option>
        </select>
        <label>Item Name</label>
        <input type="text" id="lfName" placeholder="e.g. Blue Water Bottle" style="padding:10px; border-radius:5px; border:1px solid var(--glass-border); background:var(--bg2); color:var(--text-color); margin-bottom:15px;">
        <label>Description</label>
        <textarea id="lfDesc" rows="3" placeholder="Provide details (color, brand, etc.)" style="padding:10px; border-radius:5px; border:1px solid var(--glass-border); background:var(--bg2); color:var(--text-color); margin-bottom:15px;"></textarea>
        <label>Location</label>
        <input type="text" id="lfLocation" placeholder="Where was it lost/found?" style="padding:10px; border-radius:5px; border:1px solid var(--glass-border); background:var(--bg2); color:var(--text-color); margin-bottom:15px;">
        <label>Contact Info</label>
        <input type="text" id="lfContact" placeholder="e.g. 9876543210 or your email" style="padding:10px; border-radius:5px; border:1px solid var(--glass-border); background:var(--bg2); color:var(--text-color); margin-bottom:15px;">
    `, async () => {
        const type = document.getElementById('lfType').value;
        const itemName = document.getElementById('lfName').value.trim();
        const desc = document.getElementById('lfDesc').value.trim();
        const location = document.getElementById('lfLocation').value.trim();
        const contact = document.getElementById('lfContact').value.trim();
        
        if(!itemName || !location || !contact) {
            alert("Item Name, Location, and Contact are required!");
            return;
        }
        
        try {
            await addDoc(collection(db, 'lostAndFound'), {
                type: type,
                itemName: itemName,
                description: desc,
                location: location,
                contact: contact,
                reporterUID: currentUser.uid,
                reporterName: userData.name || 'Student',
                status: 'active',
                timestamp: serverTimestamp()
            });
            closeCommModal();
        } catch(err) {
            console.error("Error reporting item:", err);
            alert("Failed to submit.");
        }
    });
}

window.resolveLostFound = async function(id) {
    if(!confirm("Mark this item as resolved? It will stay visible but marked as done.")) return;
    try {
        await updateDoc(doc(db, 'lostAndFound', id), {
            status: 'resolved'
        });
    } catch(err) {
        console.error("Error resolving:", err);
    }
}

// Hook up tab switching to load data dynamically
document.addEventListener('DOMContentLoaded', () => {
    // Override switchCommTab to also trigger data loading
    const oldSwitch = window.switchCommTab;
    window.switchCommTab = function(tabId) {
        if(oldSwitch) oldSwitch(tabId);
        
        if(tabId === 'chat') loadDepartmentChat();
        if(tabId === 'projects') loadProjects();
        if(tabId === 'study') loadStudyGroups();
        if(tabId === 'polls') loadPolls();
        if(tabId === 'forum') loadForum();
        if(tabId === 'lostfound') loadLostFound();
    }
});

