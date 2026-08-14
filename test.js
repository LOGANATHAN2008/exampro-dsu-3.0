
        import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
        import { getAuth, onAuthStateChanged, signOut, setPersistence, browserLocalPersistence } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
        import { getFirestore, collection, onSnapshot, getDocs, doc, getDoc, deleteDoc, addDoc, updateDoc, setDoc, serverTimestamp, query, orderBy, Timestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
        import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";

        const firebaseConfig = {
            apiKey: "AIzaSyDKDT0kvwEm0cEdh_MpbTb8A9W3_xwAVxY",
            authDomain: "dsu-exam-system.firebaseapp.com",
            projectId: "dsu-exam-system",
            storageBucket: "dsu-exam-system.firebasestorage.app",
            messagingSenderId: "155083834622",
            appId: "1:155083834622:web:ff0a9780b88bad0b8811af",
            measurementId: "G-1TPT1BR6GD"
        };
        const app = initializeApp(firebaseConfig);
        const auth = getAuth(app);
        await setPersistence(auth, browserLocalPersistence);
        const db = getFirestore(app);

        window.triggerSMS = async function(message) {
            const smsStudents = allStudents.filter(s => s.smsEnabled && s.phone && s.phone.length >= 10);
            if(smsStudents.length === 0) return;
            
            const numbers = smsStudents.map(s => s.phone).join(',');
            const authKey = 'YOUR_FAST2SMS_API_KEY';
            
            try {
                fetch(`https://www.fast2sms.com/dev/bulkV2?authorization=${authKey}&message=${encodeURIComponent(message)}&language=english&route=q&numbers=${numbers}`, {
                    method: 'GET'
                });
                console.log('SMS alerts triggered successfully to', numbers);
            } catch(e) { console.error('SMS Error', e); }
        };

        // Obfuscated Admin Emails
        const ADMIN_EMAILS = [
            atob("YWRtaW5AZHN1LmVkdQ=="), // admin@dsu.edu
            atob("bG9nYW5hdGhhbkBkc3UuZWR1"), // loganathan@dsu.edu
            atob("bWxvZ2FuYXRoYW4wODIwMDhAZ21haWwuY29t") // mloganathan082008@gmail.com
        ];

        // Cloudinary Config (Updated)
        const CLOUDINARY_CLOUD_NAME = "dxsa93rr2";
        const CLOUDINARY_UPLOAD_PRESET = "DSU EXAM";
        const CLOUDINARY_API_KEY = "935571736536156";
        const CLOUDINARY_API_SECRET = "qf9xX3oAjacl8tWWyhbrWNwKThs";

        let allStudents = [], allTests = [], allResults = [], allMal = [], allExamEvents = [];
        let deleteTargetId = null, editingTestId = null, editingExamEventId = null;
        let questionCount = 0;

        // ===== .TXT PARSER =====
        function parseTxtQuestions(text) {
            const questions = [];
            const blocks = text.split(/\n\s*\n/);
            for (const block of blocks) {
                const lines = block.trim().split('\n').map(l => l.trim()).filter(l => l);
                if (lines.length < 6) continue;
                let questionText = '';
                const options = [];
                let correctIndex = -1;
                for (const line of lines) {
                    if (/^(Question\s*[:.]?\s*)/i.test(line)) {
                        questionText = line.replace(/^Question\s*[:.]?\s*/i, '').trim();
                    } else if (/^[a-d]\s*[).\]]\s*/i.test(line)) {
                        options.push(line.replace(/^[a-d]\s*[).\]]\s*/i, '').trim());
                    } else if (/^Correct\s*(Answer|Ans)\s*[:.]?\s*/i.test(line)) {
                        const ansStr = line.replace(/^Correct\s*(Answer|Ans)\s*[:.]?\s*/i, '').trim().toLowerCase();
                        correctIndex = 'abcd'.indexOf(ansStr.replace(/[).\]\s]/g, '')[0]);
                    } else if (!questionText && options.length === 0) {
                        questionText = line;
                    }
                }
                if (questionText && options.length >= 2) {
                    questions.push({
                        question: questionText,
                        options: options.length >= 4 ? options.slice(0, 4) : [...options, ...Array(4 - options.length).fill('')],
                        correctIndex: correctIndex >= 0 ? correctIndex : 0
                    });
                }
            }
            return questions;
        }

        // ===== TEMPLATE DOWNLOAD =====
        window.downloadTemplate = function () {
            const template = `Question: What is an array?\na) A linear data structure that stores elements in contiguous memory\nb) A non-linear data structure\nc) A type of graph\nd) A type of tree\nCorrect Answer: a)\n\nQuestion: What is the time complexity of binary search?\na) O(n)\nb) O(log n)\nc) O(n^2)\nd) O(1)\nCorrect Answer: b)\n\nQuestion: Which sorting algorithm has O(n log n) average time complexity?\na) Bubble Sort\nb) Selection Sort\nc) Merge Sort\nd) Insertion Sort\nCorrect Answer: c)`;
            const blob = new Blob([template], { type: 'text/plain' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'question_template.txt';
            a.click();
            URL.revokeObjectURL(a.href);
            showToast('Template downloaded!', 'success');
        };

        // ===== FILE UPLOAD =====
        window.handleTxtUpload = function (file) {
            if (!file || !file.name.endsWith('.txt')) { showToast('Please upload a .txt file', 'error'); return; }
            const reader = new FileReader();
            reader.onload = (e) => {
                const questions = parseTxtQuestions(e.target.result);
                if (!questions.length) { showToast('No valid questions found. Check the format.', 'error'); return; }
                document.getElementById('questionBuilder').innerHTML = '';
                questionCount = 0;
                questions.forEach(q => addQuestionWithData(q));
                showToast(`${questions.length} questions loaded from file!`, 'success');
                const el = document.getElementById('uploadedCount');
                if (el) el.textContent = `${questions.length} questions loaded`;
            };
            reader.readAsText(file);
        };

        // Drag & drop
        setTimeout(() => {
            const dz = document.getElementById('dropZone');
            if (!dz) return;
            dz.addEventListener('dragover', e => { e.preventDefault(); dz.style.borderColor = 'var(--primary)'; dz.style.background = 'rgba(108,99,255,.08)'; });
            dz.addEventListener('dragleave', () => { dz.style.borderColor = ''; dz.style.background = ''; });
            dz.addEventListener('drop', e => { e.preventDefault(); dz.style.borderColor = ''; dz.style.background = ''; if (e.dataTransfer.files.length) window.handleTxtUpload(e.dataTransfer.files[0]); });
        }, 500);

        // ===== TEST STATUS HELPERS =====
        function getTestStatus(test) {
            const now = new Date();
            if (!test.isActive) return { label: 'Closed', class: 'chip-danger', icon: 'fa-lock' };
            if (test.startTime && test.endTime) {
                const start = test.startTime.toDate ? test.startTime.toDate() : new Date(test.startTime.seconds * 1000);
                const end = test.endTime.toDate ? test.endTime.toDate() : new Date(test.endTime.seconds * 1000);
                if (now < start) return { label: 'Scheduled', class: 'chip-warn', icon: 'fa-clock' };
                if (now > end) return { label: 'Expired', class: 'chip-danger', icon: 'fa-times-circle' };
                return { label: 'Live', class: 'chip-success', icon: 'fa-broadcast-tower' };
            }
            return { label: 'Open', class: 'chip-success', icon: 'fa-check-circle' };
        }

        function toLocalDT(date) {
            const offset = date.getTimezoneOffset();
            return new Date(date.getTime() - offset * 60 * 1000).toISOString().slice(0, 16);
        }

        function addQuestionWithData(qData) {
            questionCount++;
            const qb = document.getElementById('questionBuilder');
            const div = document.createElement('div');
            div.className = 'q-item'; div.id = `q-${questionCount}`;
            const qText = (qData?.question || '').replace(/"/g, '&quot;');
            div.innerHTML = `<div class="q-header"><span class="q-label">Q${questionCount}</span><button class="btn btn-danger btn-sm" onclick="this.closest('.q-item').remove()" style="padding:4px 10px"><i class="fas fa-times"></i></button></div><input class="form-control" style="margin-bottom:8px" value="${qText}" id="q${questionCount}_text"/><div class="options-list">${['A', 'B', 'C', 'D'].map((l, i) => `<div class="option-row"><input type="radio" name="correct_${questionCount}" value="${i}" id="r${questionCount}_${i}" ${qData && qData.correctIndex === i ? 'checked' : ''}/><label for="r${questionCount}_${i}" style="font-size:11px;font-weight:700;color:var(--primary);margin:0;text-transform:none;letter-spacing:0;min-width:16px">${l}</label><input type="text" id="q${questionCount}_opt${i}" value="${(qData?.options?.[i] || '').replace(/"/g, '&quot;')}"/></div>`).join('')}</div><div style="font-size:11px;color:var(--text-muted)">Select the radio button next to the correct answer.</div>`;
            qb.appendChild(div);
        }

        // ===== TOGGLE TEST STATUS =====
        window.toggleTestStatus = async function (id) {
            const t = allTests.find(x => x.id === id);
            if (!t) return;
            try {
                await updateDoc(doc(db, 'tests', id), { isActive: !t.isActive, updatedAt: serverTimestamp() });
                showToast(t.isActive ? 'Test closed!' : 'Test opened!', 'success');
            } catch (err) { showToast('Update failed: ' + err.message, 'error'); }
        };

        let currentAdmin = null;

        onAuthStateChanged(auth, async user => {
            if (!user) {
                window.location.replace('login.html');
                return;
            }
            
            const adminDoc = await getDoc(doc(db, 'admins', user.uid));
            const isAdminData = adminDoc.exists() ? adminDoc.data() : null;
            const isSuperAdmin = ADMIN_EMAILS.includes(user.email.toLowerCase()) || (isAdminData && isAdminData.role === 'super');
            
            if (!isSuperAdmin && (!isAdminData || isAdminData.role !== 'department')) {
                window.location.replace('login.html');
                return;
            }
            
            currentAdmin = { uid: user.uid, email: user.email, isSuper: isSuperAdmin, dept: isAdminData ? isAdminData.department : null };

            document.body.classList.add('admin-verified');
            document.getElementById('adminName').textContent = user.displayName || user.email.split('@')[0];
            
            if (isSuperAdmin) {
                const adminMgmtTab = document.getElementById('adminManagementTab');
                if (adminMgmtTab) adminMgmtTab.style.display = 'block';
            }

            loadAll();
        });

        async function loadAll() {
            // Students
            let stdQ = collection(db, 'students');
            if (!currentAdmin.isSuper && currentAdmin.dept) {
                stdQ = query(stdQ, where('department', '==', currentAdmin.dept));
            }
            onSnapshot(stdQ, snap => {
                allStudents = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                document.getElementById('studentCount').textContent = allStudents.length;
                document.getElementById('oStudents').textContent = allStudents.length;
                renderStudents(allStudents);
                if (allResults.length) renderResults(allResults);
                if (allMal.length) renderMalpractice(allMal);
            });
            // Staff
            onSnapshot(collection(db, 'staff'), snap => {
                const staff = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                renderStaff(staff);
            });
            // Tests
            onSnapshot(collection(db, 'tests'), snap => {
                allTests = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                if (!currentAdmin.isSuper && currentAdmin.dept) {
                    allTests = allTests.filter(t => (t.departments || []).includes('ALL') || (t.departments || []).includes(currentAdmin.dept));
                }
                document.getElementById('oTests').textContent = allTests.length;
                renderTests(allTests);
                if (allMal.length) renderMalpractice(allMal);
            });

            // Exam Schedule
            onSnapshot(collection(db, 'exam_schedule'), snap => {
                allExamEvents = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                renderExamEvents(allExamEvents);
                document.getElementById('oTests').textContent = allTests.length;
                renderTests(allTests);
                // Re-render sections that depend on test titles
                if (allMal.length) renderMalpractice(allMal);
            });
            // Results
            onSnapshot(collection(db, 'results'), snap => {
                allResults = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                const avg = allResults.length ? Math.round(allResults.reduce((s, r) => s + (r.percentage || 0), 0) / allResults.length) : 0;
                document.getElementById('oAvg').textContent = avg + '%';
                renderResults(allResults);
                renderCharts(allResults);
                document.getElementById('loader').style.display = 'none';
            });
            // Malpractice
            onSnapshot(collection(db, 'malpracticeLogs'), snap => {
                allMal = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                document.getElementById('malCount').textContent = allMal.length;
                document.getElementById('oMal').textContent = allMal.length;
                renderMalpractice(allMal);
            });
            // Announcements
            onSnapshot(collection(db, 'announcements'), snap => {
                const announcements = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                renderAnnouncements(announcements);
            });
            // Notices
            onSnapshot(collection(db, 'notices'), snap => {
                const notices = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                renderNotices(notices);
            }, error => {
                console.error("Notices listener error:", error);
                const body = document.getElementById('noticesBody');
                if(body) body.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--danger)">Failed to load notices. Please deploy firestore.rules</td></tr>`;
            });

            // Admins (Super Admin only)
            if (currentAdmin && currentAdmin.isSuper) {
                onSnapshot(collection(db, 'admins'), snap => {
                    const admins = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                    const tbody = document.getElementById('adminTableBody');
                    if(admins.length === 0) {
                        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center">No admins found</td></tr>';
                    } else {
                        tbody.innerHTML = admins.map(a => `<tr>
                            <td>${a.email || '-'}</td>
                            <td><span class="nav-badge" style="background:${a.role === 'super' ? 'var(--primary)' : 'var(--accent)'}">${a.role}</span></td>
                            <td>${a.department || 'ALL'}</td>
                            <td>
                                ${a.role !== 'super' ? `<button class="btn-icon" style="color:var(--danger)" onclick="deleteAdmin('${a.id}')"><i class="fas fa-trash"></i></button>` : ''}
                            </td>
                        </tr>`).join('');
                    }
                });
            }

            // Feedback
            onSnapshot(collection(db, 'feedback'), snap => {
                const feedbacks = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a,b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));
                const tbody = document.getElementById('feedbackTableBody');
                if(feedbacks.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="3" style="text-align:center">No feedback yet</td></tr>';
                } else {
                    tbody.innerHTML = feedbacks.map(f => `<tr>
                        <td style="white-space:nowrap">${f.timestamp ? new Date(f.timestamp.seconds * 1000).toLocaleDateString() : '-'}</td>
                        <td>${f.content || ''}</td>
                        <td>
                            <button class="btn-icon" style="color:var(--danger)" onclick="deleteFeedback('${f.id}')"><i class="fas fa-trash"></i></button>
                        </td>
                    </tr>`).join('');
                }
            });
        }

        function renderAnnouncements(list) {
            const body = document.getElementById('announcementsBody');
            if (!list.length) { body.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:24px;color:var(--text-muted)">No announcements yet.</td></tr>'; return; }
            const sorted = list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
            body.innerHTML = sorted.map(a => `<tr>
                <td style="font-size:11px;color:var(--text-muted)">${a.createdAt ? new Date(a.createdAt.seconds * 1000).toLocaleDateString('en-IN') : '-'}</td>
                <td style="font-weight:600">
                    ${a.message}
                    ${a.attachmentURL ? `<div style="margin-top:6px"><button onclick="downloadAnnouncementFile('${a.attachmentURL}')" style="color:var(--primary);font-size:11px;display:inline-flex;align-items:center;gap:4px;text-decoration:none;padding:6px 10px;background:rgba(108,99,255,.1);border-radius:4px;border:1px solid rgba(108,99,255,.2);cursor:pointer;font-family:inherit"><i class="fas fa-file-download"></i> Download File</button></div>` : ''}
                </td>
                <td><span class="chip chip-${a.type || 'info'}">${a.type || 'info'}</span></td>
                <td><button class="icon-action icon-del" onclick="deleteAnnouncement('${a.id}')"><i class="fas fa-trash"></i></button></td>
            </tr>`).join('');
        }

        window.downloadAnnouncementFile = function (url) {
            if (!url) return;
            let dlUrl = url;
            if (url.includes('cloudinary.com')) {
                dlUrl = url.replace('/fl_attachment/', '/');
            }
            window.open(dlUrl, '_blank');
        };

        window.postAnnouncement = async function () {
            const msg = document.getElementById('announcementMsg').value.trim();
            const type = document.getElementById('announcementType').value;
            const fileInput = document.getElementById('announcementFile');
            const file = fileInput.files[0];
            const btn = document.getElementById('postAnnounceBtn');

            if (!msg) return showToast('Please enter a message', 'error');

            // Limit file size to 10MB for Cloudinary free tier
            if (file && file.size > 10 * 1024 * 1024) {
                return showToast('File too large! Max 10MB allowed.', 'error');
            }

            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading to Cloudinary...';

            try {
                let attachmentURL = null;
                if (file) {
                    try {
                        console.log("Using Cloud Name:", CLOUDINARY_CLOUD_NAME);
                        console.log("Using Preset:", CLOUDINARY_UPLOAD_PRESET);
                        const formData = new FormData();
                        formData.append('file', file);
                        formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
                        formData.append('folder', 'exam_announcements');

                        const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/auto/upload`, {
                            method: 'POST',
                            body: formData
                        });

                        const data = await response.json();
                        if (data.secure_url) {
                            attachmentURL = data.secure_url;
                        } else {
                            throw new Error("Cloudinary says: " + (data.error?.message || "Unknown error"));
                        }
                    } catch (uploadErr) {
                        console.error("Cloudinary Detailed Error:", uploadErr);
                        throw new Error(uploadErr.message || "Network error during upload");
                    }
                }

                await addDoc(collection(db, 'announcements'), {
                    message: msg,
                    type,
                    attachmentURL: attachmentURL || null,
                    createdAt: serverTimestamp()
                });

                document.getElementById('announcementMsg').value = '';
                fileInput.value = '';
                showToast('Announcement posted with Cloudinary file!', 'success');
            } catch (err) {
                console.error("Post Error:", err);
                showToast(err.message || 'Failed to post announcement', 'error');
            } finally {
                btn.disabled = false;
                btn.innerHTML = 'Post Now';
            }
        };

        window.deleteAnnouncement = async function (id) {
            if (!confirm('Delete this announcement?')) return;
            try {
                await deleteDoc(doc(db, 'announcements', id));
                showToast('Announcement deleted', 'success');
            } catch { showToast('Delete failed', 'error'); }
        };

        function renderNotices(list) {
            const body = document.getElementById('noticesBody');
            if (!list.length) { body.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--text-muted)">No notices yet.</td></tr>'; return; }
            
            const sorted = list.sort((a, b) => {
                if (a.pinned && !b.pinned) return -1;
                if (!a.pinned && b.pinned) return 1;
                const aSec = (a.createdAt && a.createdAt.seconds) ? a.createdAt.seconds : 0;
                const bSec = (b.createdAt && b.createdAt.seconds) ? b.createdAt.seconds : 0;
                return bSec - aSec;
            });
            
            body.innerHTML = sorted.map(n => {
                const colors = { exam: 'danger', fee: 'warning', holiday: 'success', general: 'info' };
                const c = colors[n.category] || 'info';
                const dateStr = n.createdAt && n.createdAt.seconds ? new Date(n.createdAt.seconds * 1000).toLocaleDateString('en-IN') : '-';
                const pinnedIcon = n.pinned ? '<i class="fas fa-thumbtack" style="color:var(--danger);margin-right:4px;" title="Pinned"></i>' : '';
                const popupIcon = n.isPopup ? '<i class="fas fa-external-link-alt" style="color:var(--warn);" title="Popup Ad"></i>' : '';
                return `<tr>
                    <td style="text-align:center">${pinnedIcon}${popupIcon}</td>
                    <td style="font-size:11px;color:var(--text-muted)">${dateStr}</td>
                    <td style="max-width: 400px; white-space: normal; word-break: break-word; overflow-wrap: anywhere;">
                        <div style="font-weight:600;word-break:break-word;overflow-wrap:anywhere;">${n.title}</div>
                        <div style="font-size:12px;color:var(--text-muted);margin-top:4px;word-break:break-word;overflow-wrap:anywhere;">${n.body}</div>
                        ${n.attachmentUrl ? `<div style="margin-top:6px"><button onclick="downloadAnnouncementFile('${n.attachmentUrl}')" style="color:var(--primary);font-size:11px;display:inline-flex;align-items:center;gap:4px;text-decoration:none;padding:6px 10px;background:rgba(108,99,255,.1);border-radius:4px;border:1px solid rgba(108,99,255,.2);cursor:pointer;font-family:inherit"><i class="fas fa-file-download"></i> Attachment</button></div>` : ''}
                    </td>
                    <td><span class="chip chip-${c}">${n.category}</span></td>
                    <td style="font-size:12px">${n.validUntil || '-'}</td>
                    <td><button class="icon-action icon-del" onclick="deleteNotice('${n.id}')"><i class="fas fa-trash"></i></button></td>
                </tr>`;
            }).join('');
        }

        window.postNotice = async function () {
            const title = document.getElementById('noticeTitle').value.trim();
            const body = document.getElementById('noticeBody').value.trim();
            const category = document.getElementById('noticeCategory').value;
            const validUntil = document.getElementById('noticeValidUntil').value;
            const pinned = document.getElementById('noticePinned').checked;
            const isPopup = document.getElementById('noticePopup').checked;
            
            const fileInput = document.getElementById('noticeFile');
            const file = fileInput.files[0];
            const btn = document.getElementById('postNoticeBtn');

            if (!title || !body) return showToast('Please enter both title and body', 'error');

            if (file && file.size > 10 * 1024 * 1024) {
                return showToast('File too large! Max 10MB allowed.', 'error');
            }

            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading...';

            try {
                let attachmentUrl = null;
                if (file) {
                    const formData = new FormData();
                    formData.append('file', file);
                    formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
                    formData.append('folder', 'exam_notices');

                    const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/auto/upload`, {
                        method: 'POST',
                        body: formData
                    });

                    const data = await response.json();
                    if (data.secure_url) {
                        attachmentUrl = data.secure_url;
                    } else {
                        throw new Error("Cloudinary says: " + (data.error?.message || "Unknown error"));
                    }
                }

                await addDoc(collection(db, 'notices'), {
                    title,
                    body,
                    category,
                    validUntil: validUntil || null,
                    pinned,
                    isPopup,
                    attachmentUrl,
                    createdAt: serverTimestamp(),
                    createdBy: auth.currentUser ? auth.currentUser.email : 'Admin'
                });

                document.getElementById('noticeTitle').value = '';
                document.getElementById('noticeBody').value = '';
                document.getElementById('noticeValidUntil').value = '';
                document.getElementById('noticePinned').checked = false;
                document.getElementById('noticePopup').checked = false;
                fileInput.value = '';
                showToast('Notice posted successfully!', 'success');
                triggerSMS(`New Notice: ${title}. Login to ExamPro to view details!`);
            } catch (err) {
                console.error("Post Error:", err);
                showToast(err.message || 'Failed to post notice', 'error');
            } finally {
                btn.disabled = false;
                btn.innerHTML = 'Post Notice';
            }
        };

        window.deleteNotice = async function (id) {
            if (!confirm('Delete this notice?')) return;
            try {
                await deleteDoc(doc(db, 'notices', id));
                showToast('Notice deleted', 'success');
            } catch { showToast('Delete failed', 'error'); }
        };

        function renderStudents(students) {
            const validDepts = ['BCA', 'MCA', 'BSc CS', 'BSc IT', 'BBA', 'BCom', 'BTech', 'MTech', 'MBA'];
            const body = document.getElementById('studentsBody');
            if (!students.length) { body.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:32px;color:var(--text-muted)">No students found.</td></tr>`; return; }
            body.innerHTML = students.map((s, i) => {
                const deptStr = s.department || '-';
                const warning = (!validDepts.includes(s.department) && s.department) ? `<span class="chip" style="background:var(--danger);color:#fff;margin-left:6px;font-size:10px;"><i class="fas fa-exclamation-triangle"></i> needs fixing</span>` : '';
                return `
    <tr>
      <td style="color:var(--text-muted)">${i + 1}</td>
      <td><div class="student-row">
        <div class="avatar-sm">${s.photoURL ? `<img src="${s.photoURL}">` : (s.name || 'S')[0]}</div>
        <div><div class="s-name">${s.name || '-'}</div><div class="s-email">${s.email || ''}</div></div>
      </div></td>
      <td>${s.registerNumber || '-'}</td>
      <td><span class="chip chip-info">${s.branch || '-'}</span></td>
      <td>${deptStr}${warning}</td>
      <td>${s.section || '-'}</td>
      <td style="color:var(--text-muted)">${s.createdAt ? new Date(s.createdAt.seconds * 1000).toLocaleDateString('en-IN') : '-'}</td>
      <td><div class="actions-cell">
        <button class="icon-action icon-view" onclick="viewStudent('${s.id}')" title="View"><i class="fas fa-eye"></i></button>
        <button class="icon-action icon-del" onclick="deleteStudent('${s.id}')" title="Delete"><i class="fas fa-trash"></i></button>
      </div></td>
    </tr>`;
            }).join('');
        }

        function renderTests(tests) {
            allTests = tests;
            const body = document.getElementById('testsBody');
            if (!tests.length) { body.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:32px;color:var(--text-muted)">No tests yet. Create one!</td></tr>`; return; }
            body.innerHTML = tests.map(t => {
                const status = getTestStatus(t);
                const depts = (t.departments || ['ALL']).join(', ');
                return `
    <tr>
      <td><b>${t.title || 'Untitled'}</b></td>
      <td>${t.subject || '-'}</td>
      <td>${t.questions?.length || 0}</td>
      <td>${t.duration || 30} min</td>
      <td><span class="chip ${status.class}"><i class="fas ${status.icon}"></i> ${status.label}</span></td>
      <td style="font-size:11px;color:var(--text-muted)">${depts}</td>
      <td><div class="actions-cell">
        <button class="icon-action" onclick="toggleTestStatus('${t.id}')" title="${t.isActive ? 'Close Test' : 'Open Test'}"><i class="fas ${t.isActive ? 'fa-toggle-on' : 'fa-toggle-off'}" style="color:${t.isActive ? 'var(--success)' : 'var(--text-muted)'};font-size:18px"></i></button>
        <button class="icon-action icon-edit" onclick="editTest('${t.id}')" title="Edit"><i class="fas fa-edit"></i></button>
        <button class="icon-action icon-del" onclick="deleteTestById('${t.id}')" title="Delete"><i class="fas fa-trash"></i></button>
      </div></td>
    </tr>`;
            }).join('');
        }

        function renderResults(results) {
            const body = document.getElementById('resultsBody');
            if (!results.length) { body.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:32px;color:var(--text-muted)">No results yet.</td></tr>`; return; }
            body.innerHTML = results.map(r => {
                const pass = (r.percentage || 0) >= 60;
                const date = r.submittedAt ? new Date(r.submittedAt.seconds * 1000).toLocaleDateString('en-IN') : '-';
                const student = allStudents.find(s => s.id === r.studentId);
                return `<tr>
      <td>${student?.name || r.studentId.slice(0, 8) + '...'}</td>
      <td>${r.testTitle || r.testId}</td>
      <td>${r.score}/${r.totalMarks}</td>
      <td><b style="color:${pass ? 'var(--success)' : 'var(--danger)'}">${r.percentage}%</b></td>
      <td style="color:var(--success)">${r.correct}</td>
      <td style="color:var(--danger)">${r.wrong}</td>
      <td><span class="chip ${pass ? 'chip-success' : 'chip-danger'}">${pass ? 'Pass' : 'Fail'}</span></td>
      <td style="color:var(--text-muted)">${date}</td>
    </tr>`;
            }).join('');
        }

        function renderMalpractice(logs) {
            const body = document.getElementById('malBody');
            if (!logs.length) { body.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:32px;color:var(--text-muted)"><i class="fas fa-check-circle" style="color:var(--success)"></i> No malpractice detected!</td></tr>`; return; }
            body.innerHTML = logs.map(l => {
                const student = allStudents.find(s => s.id === l.studentId);
                const test = allTests.find(t => t.id === l.testId);
                return `<tr>
    <td style="font-weight:600">${student?.name || (l.studentId?.slice(0, 8) + '...')}</td>
    <td style="color:var(--text-muted)">${test?.title || (l.testId?.slice(0, 8) + '...')}</td>
    <td><span class="chip chip-danger">${l.attempts} switches</span></td>
    <td style="color:var(--text-muted)">${l.timestamp ? new Date(l.timestamp.seconds * 1000).toLocaleString('en-IN') : '-'}</td>
  </tr>`;
            }).join('');
        }

        function renderCharts(results) {
            const pass = results.filter(r => (r.percentage || 0) >= 60).length;
            const fail = results.length - pass;
            const pfc = document.getElementById('overviewChart');
            if (pfc) {
                new Chart(pfc, {
                    type: 'doughnut', data: { labels: ['Passed', 'Failed'], datasets: [{ data: [pass, fail], backgroundColor: ['rgba(16,185,129,.8)', 'rgba(239,68,68,.8)'], borderWidth: 0, borderRadius: 4 }] },
                    options: { responsive: true, maintainAspectRatio: false, cutout: '65%', plugins: { legend: { labels: { color: '#94a3b8', font: { size: 11 } } } } }
                });
            }
            const tc = document.getElementById('trendChart');
            if (tc && results.length) {
                const sorted = [...results].sort((a, b) => (a.submittedAt?.seconds || 0) - (b.submittedAt?.seconds || 0));
                new Chart(tc, {
                    type: 'line', data: { labels: sorted.map((_, i) => `#${i + 1}`), datasets: [{ label: 'Score %', data: sorted.map(r => r.percentage || 0), borderColor: '#6c63ff', backgroundColor: 'rgba(108,99,255,.15)', borderWidth: 2, tension: .4, fill: true, pointBackgroundColor: '#6c63ff', pointRadius: 3 }] },
                    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { ticks: { color: '#94a3b8', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,.05)' } }, y: { ticks: { color: '#94a3b8', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,.05)' }, min: 0, max: 100 } } }
                });
            }
            renderLeaderboard();
        }

        function renderLeaderboard() {
            const body = document.getElementById('leaderboardBody');
            if (!allResults.length) { body.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--text-muted)">No data available.</td></tr>'; return; }

            const stats = {};
            allResults.forEach(r => {
                if (!stats[r.studentId]) stats[r.studentId] = { t: 0, pSum: 0, max: 0 };
                stats[r.studentId].t++;
                stats[r.studentId].pSum += r.percentage;
                if (r.percentage > stats[r.studentId].max) stats[r.studentId].max = r.percentage;
            });

            const winners = Object.keys(stats).map(sid => {
                const s = allStudents.find(x => x.id === sid);
                return {
                    name: s?.name || sid,
                    photo: s?.photoURL,
                    reg: s?.registerNumber,
                    tests: stats[sid].t,
                    avg: (stats[sid].pSum / stats[sid].t).toFixed(1),
                    max: stats[sid].max
                };
            }).sort((a, b) => b.avg - a.avg).slice(0, 10);

            body.innerHTML = winners.map((w, i) => `<tr>
                <td style="font-weight:800;color:${i === 0 ? '#ffd700' : i === 1 ? '#c0c0c0' : i === 2 ? '#cd7f32' : 'var(--text-muted)'}">#${i + 1}</td>
                <td><div class="student-row">
                    <div class="avatar-sm">${w.photo ? `<img src="${w.photo}">` : w.name[0]}</div>
                    <div><div class="s-name">${w.name}</div><div class="s-email">${w.reg || ''}</div></div>
                </div></td>
                <td>${w.tests}</td>
                <td><b style="color:var(--primary)">${w.avg}%</b></td>
                <td><b style="color:var(--success)">${w.max}%</b></td>
            </tr>`).join('');
        }

        window.viewStudent = async function (id) {
            const s = allStudents.find(x => x.id === id);
            if (!s) return;
            const sResults = allResults.filter(r => r.studentId === id);
            const pass = sResults.filter(r => (r.percentage || 0) >= 60).length;
            document.getElementById('studentDetailContent').innerHTML = `
    <div class="student-profile-card">
      <div class="big-avatar">${s.photoURL ? `<img src="${s.photoURL}">` : (s.name || 'S')[0]}</div>
      <div class="sd-name">${s.name || 'Student'}</div>
      <div class="sd-reg">${s.registerNumber || ''}</div>
      <div class="detail-chips" style="margin-top:12px">
        <div class="detail-chip"><i class="fas fa-envelope"></i>${s.email || '-'}</div>
        <div class="detail-chip"><i class="fas fa-university"></i>${s.college || '-'}</div>
        <div class="detail-chip"><i class="fas fa-code-branch"></i>${s.branch || '-'} • ${s.section || '-'}</div>
        <div class="detail-chip"><i class="fas fa-calendar"></i>${s.year || '-'}</div>
        <div class="detail-chip" style="display:flex; align-items:center; gap:8px;">
            <i class="fas fa-birthday-cake"></i> DOB:
            <input type="date" id="adminEditDob" value="${s.dob || ''}" style="background:transparent; border:1px solid rgba(255,255,255,0.2); color:var(--text); padding:2px 6px; border-radius:4px; font-family:inherit; font-size:12px;" />
            <button onclick="adminUpdateDob('${s.id}')" style="background:var(--primary); color:#fff; border:none; padding:3px 8px; border-radius:4px; cursor:pointer; font-size:11px;">Save</button>
        </div>
        <div class="detail-chip" style="display:flex; align-items:center; gap:8px;">
            <i class="fas fa-building"></i> Dept:
            <select id="adminEditDept" style="background:transparent; border:1px solid rgba(255,255,255,0.2); color:var(--text); padding:2px 6px; border-radius:4px; font-family:inherit; font-size:12px;">
                <option value="" disabled ${!['BCA', 'MCA', 'BSc CS', 'BSc IT', 'BBA', 'BCom', 'BTech', 'MTech', 'MBA'].includes(s.department) ? 'selected' : ''}>Invalid (${s.department || '-'})</option>
                ${['BCA', 'MCA', 'BSc CS', 'BSc IT', 'BBA', 'BCom', 'BTech', 'MTech', 'MBA'].map(d => `<option value="${d}" ${s.department === d ? 'selected' : ''}>${d}</option>`).join('')}
            </select>
            <button onclick="adminUpdateDept('${s.id}')" style="background:var(--primary); color:#fff; border:none; padding:3px 8px; border-radius:4px; cursor:pointer; font-size:11px;">Save</button>
        </div>
      </div>
    </div>
    <div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:14px">
        <div style="background:rgba(108,99,255,.1);border-radius:10px;padding:12px;text-align:center"><div style="font-size:22px;font-weight:800">${sResults.length}</div><div style="font-size:11px;color:var(--text-muted)">Tests Taken</div></div>
        <div style="background:rgba(16,185,129,.1);border-radius:10px;padding:12px;text-align:center"><div style="font-size:22px;font-weight:800;color:var(--success)">${pass}</div><div style="font-size:11px;color:var(--text-muted)">Passed</div></div>
        <div style="background:rgba(239,68,68,.1);border-radius:10px;padding:12px;text-align:center"><div style="font-size:22px;font-weight:800;color:var(--danger)">${sResults.length - pass}</div><div style="font-size:11px;color:var(--text-muted)">Failed</div></div>
      </div>
      <div class="chart-mini"><canvas id="studentChart"></canvas></div>
      <div style="margin-top:12px;font-size:12px;font-weight:700;color:var(--text-muted);margin-bottom:8px">RECENT RESULTS</div>
      ${sResults.slice(0, 5).map(r => `<div style="display:flex;justify-content:space-between;padding:8px 10px;border-radius:8px;background:rgba(255,255,255,.03);margin-bottom:4px;font-size:12px"><span>${r.testTitle || 'Test'}</span><span style="color:${(r.percentage || 0) >= 60 ? 'var(--success)' : 'var(--danger)'};font-weight:700">${r.percentage}%</span></div>`).join('') || '<p style="color:var(--text-muted);font-size:12px">No results yet.</p>'}
      <div style="margin-top:15px; border-top:1px solid rgba(255,255,255,0.1); padding-top:15px;">
        <textarea id="directMessageContent" rows="3" placeholder="Type a direct message to this student..." style="width:100%; padding:10px; border-radius:8px; background:var(--bg1); border:1px solid rgba(255,255,255,0.1); color:var(--text); font-family:inherit; margin-bottom:8px;"></textarea>
        <button onclick="sendDirectMessage('${s.id}')" class="btn btn-primary" style="width:100%"><i class="fas fa-paper-plane"></i> Send Message</button>
      </div>
    </div>`;
            document.getElementById('studentModal').classList.add('active');
            setTimeout(() => {
                const ctx = document.getElementById('studentChart');
                if (!ctx || !sResults.length) return;
                new Chart(ctx, { type: 'bar', data: { labels: sResults.map(r => r.testTitle || 'Test'), datasets: [{ label: 'Score %', data: sResults.map(r => r.percentage || 0), backgroundColor: sResults.map(r => (r.percentage || 0) >= 60 ? 'rgba(16,185,129,.7)' : 'rgba(239,68,68,.7)'), borderRadius: 6, borderSkipped: false }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { ticks: { color: '#94a3b8', font: { size: 9 } }, grid: { display: false } }, y: { ticks: { color: '#94a3b8', font: { size: 9 } }, grid: { color: 'rgba(255,255,255,.04)' }, min: 0, max: 100 } } } });
            }, 100);
        };

        window.closeStudentModal = () => document.getElementById('studentModal').classList.remove('active');

        window.deleteAdmin = async function(id) {
            if(!confirm('Delete this admin?')) return;
            try { await deleteDoc(doc(db, 'admins', id)); showToast('Admin deleted', 'success'); }
            catch(e) { showToast('Error deleting', 'error'); }
        };
        
        window.deleteFeedback = async function(id) {
            if(!confirm('Delete this feedback?')) return;
            try { await deleteDoc(doc(db, 'feedback', id)); showToast('Feedback deleted', 'success'); }
            catch(e) { showToast('Error deleting', 'error'); }
        };
        
        window.showAddAdminModal = function() {
            document.getElementById('newAdminEmail').value = '';
            document.getElementById('addAdminModal').classList.add('active');
        };

        window.saveNewAdmin = async function() {
            const email = document.getElementById('newAdminEmail').value.trim().toLowerCase();
            const dept = document.getElementById('newAdminDept').value;
            if(!email) return showToast('Enter email', 'error');
            
            const stdQuery = query(collection(db, 'students'), where('email', '==', email));
            const stdSnap = await getDocs(stdQuery);
            let uid = null;
            if (!stdSnap.empty) {
                uid = stdSnap.docs[0].id;
            } else {
                return showToast('User not found in students. They must register first.', 'error');
            }
            
            try {
                await setDoc(doc(db, 'admins', uid), {
                    email: email,
                    role: 'department',
                    department: dept,
                    createdAt: serverTimestamp()
                });
                showToast('Admin added successfully!', 'success');
                document.getElementById('addAdminModal').classList.remove('active');
            } catch(e) {
                console.error(e);
                showToast('Failed to add admin', 'error');
            }
        };

        window.sendDirectMessage = async function(studentId) {
            const content = document.getElementById('directMessageContent').value.trim();
            if(!content) return showToast('Enter a message', 'error');
            try {
                await addDoc(collection(db, 'directMessages'), {
                    studentId: studentId,
                    content: content,
                    senderName: document.getElementById('adminName').textContent,
                    timestamp: serverTimestamp(),
                    read: false
                });
                showToast('Message sent!', 'success');
                document.getElementById('directMessageContent').value = '';
            } catch(e) {
                console.error(e);
                showToast('Failed to send message', 'error');
            }
        };

        window.adminUpdateDob = async function(id) {
            const dob = document.getElementById('adminEditDob').value;
            try {
                await updateDoc(doc(db, 'students', id), { dob });
                showToast('DOB updated', 'success');
                renderStudents(allStudents);
            } catch (err) {
                showToast('Update failed', 'error');
            }
        };

        window.adminUpdateDept = async function(id) {
            const val = document.getElementById('adminEditDept').value;
            if(!val) return showToast('Select a valid department', 'error');
            try {
                await updateDoc(doc(db, 'students', id), { department: val });
                const idx = allStudents.findIndex(x => x.id === id);
                if(idx > -1) allStudents[idx].department = val;
                showToast('Department updated', 'success');
                renderStudents(allStudents);
            } catch(e) {
                showToast('Update failed', 'error');
            }
        };

        window.deleteStudent = function (id) {
            deleteTargetId = id;
            document.getElementById('deleteModal').classList.add('active');
        };

        window.confirmDelete = async function () {
            if (!deleteTargetId) return;
            const btn = document.getElementById('deleteConfirmBtn');
            btn.disabled = true; btn.textContent = 'Deleting...';
            try {
                await deleteDoc(doc(db, 'students', deleteTargetId));
                document.getElementById('deleteModal').classList.remove('active');
                showToast('Student deleted.', 'success');
                deleteTargetId = null;
            } catch { showToast('Delete failed.', 'error'); }
            btn.disabled = false; btn.innerHTML = 'Delete';
        };

        // Test Creation (Enhanced)
        window.openTestModal = function () {
            editingTestId = null;
            document.getElementById('testModalTitle').textContent = 'Create Test';
            document.getElementById('t_title').value = ''; document.getElementById('t_subject').value = '';
            document.getElementById('t_duration').value = 30; document.getElementById('t_marks').value = 100;
            document.getElementById('t_mpq').value = 5; document.getElementById('t_desc').value = '';
            document.getElementById('t_startTime').value = '';
            document.getElementById('t_endTime').value = '';
            document.getElementById('t_isActive').checked = false;
            document.querySelectorAll('.dept-checkbox').forEach(cb => cb.checked = false);
            const uc = document.getElementById('uploadedCount'); if (uc) uc.textContent = '';
            const fi = document.getElementById('txtFileInput'); if (fi) fi.value = '';
            document.getElementById('questionBuilder').innerHTML = ''; questionCount = 0;
            addQuestionWithData(); addQuestionWithData();
            document.getElementById('testModal').classList.add('active');
        };

        window.closeTestModal = () => { document.getElementById('testModal').classList.remove('active'); editingTestId = null; };

        window.addQuestion = function () {
            questionCount++;
            const qb = document.getElementById('questionBuilder');
            const div = document.createElement('div');
            div.className = 'q-item'; div.id = `q-${questionCount}`;
            div.innerHTML = `
    <div class="q-header">
      <span class="q-label">Q${questionCount}</span>
      <button class="btn btn-danger btn-sm" onclick="this.closest('.q-item').remove()" style="padding:4px 10px"><i class="fas fa-times"></i></button>
    </div>
    <input class="form-control" style="margin-bottom:8px" placeholder="Enter question text..." id="q${questionCount}_text"/>
    <div class="options-list">
      ${['A', 'B', 'C', 'D'].map((l, i) => `
        <div class="option-row">
          <input type="radio" name="correct_${questionCount}" value="${i}" id="r${questionCount}_${i}"/>
          <label for="r${questionCount}_${i}" style="font-size:11px;font-weight:700;color:var(--primary);margin:0;text-transform:none;letter-spacing:0;min-width:16px">${l}</label>
          <input type="text" id="q${questionCount}_opt${i}" placeholder="Option ${l}"/>
        </div>`).join('')}
    </div>
    <div style="font-size:11px;color:var(--text-muted)">Select the radio button next to the correct answer.</div>`;
            qb.appendChild(div);
        };

        window.saveTest = async function () {
            const title = document.getElementById('t_title').value.trim();
            if (!title) { showToast('Enter test title', 'error'); return; }
            const btn = document.getElementById('saveTestBtn');
            btn.disabled = true; btn.innerHTML = '<span style="display:inline-block;width:14px;height:14px;border:2px solid rgba(255,255,255,.4);border-top-color:#fff;border-radius:50%;animation:spin .7s linear infinite;margin-right:6px"></span>Saving...';

            const questions = [];
            document.querySelectorAll('.q-item').forEach(item => {
                const id = item.id.replace('q-', '');
                const text = document.getElementById(`q${id}_text`)?.value.trim();
                if (!text) return;
                const opts = ['A', 'B', 'C', 'D'].map((_, i) => document.getElementById(`q${id}_opt${i}`)?.value.trim() || '');
                const correctEl = item.querySelector(`input[name="correct_${id}"]:checked`);
                questions.push({ question: text, options: opts, correctIndex: correctEl ? parseInt(correctEl.value) : 0 });
            });

            const departments = [];
            document.querySelectorAll('.dept-checkbox:checked').forEach(cb => departments.push(cb.value));
            const startTimeVal = document.getElementById('t_startTime').value;
            const endTimeVal = document.getElementById('t_endTime').value;

            const testData = {
                title, subject: document.getElementById('t_subject').value,
                duration: parseInt(document.getElementById('t_duration').value) || 30,
                totalMarks: parseInt(document.getElementById('t_marks').value) || 100,
                marksPerQuestion: parseInt(document.getElementById('t_mpq').value) || 5,
                description: document.getElementById('t_desc').value,
                questions,
                departments: departments.length > 0 ? departments : ['ALL'],
                isActive: document.getElementById('t_isActive').checked,
                startTime: startTimeVal ? Timestamp.fromDate(new Date(startTimeVal)) : null,
                endTime: endTimeVal ? Timestamp.fromDate(new Date(endTimeVal)) : null,
                createdAt: serverTimestamp(), updatedAt: serverTimestamp()
            };

            try {
                if (editingTestId) {
                    await updateDoc(doc(db, 'tests', editingTestId), testData);
                } else {
                    const newTestRef = await addDoc(collection(db, 'tests'), testData);
                    triggerSMS(`New Test Available: ${testData.title}. Login to ExamPro to check it out!`);
                    try {
                        await addDoc(collection(db, 'notifications'), {
                            type: 'test',
                            title: `New Test: ${testData.title}`,
                            message: `A new test "${testData.title}" (${testData.subject}) has been scheduled. Duration: ${testData.duration} mins.`,
                            departments: testData.departments,
                            testId: newTestRef.id,
                            createdAt: serverTimestamp()
                        });
                    } catch (notifErr) {
                        console.error("Failed to auto-create notification:", notifErr);
                    }
                }
                closeTestModal();
                showToast(editingTestId ? 'Test updated!' : 'Test created!', 'success');
            } catch (err) { showToast('Save failed: ' + err.message, 'error'); }
            btn.disabled = false; btn.innerHTML = '<i class="fas fa-save"></i> Save Test';
        };

        window.editTest = function (id) {
            const t = allTests.find(x => x.id === id);
            if (!t) return;
            editingTestId = id;
            document.getElementById('testModalTitle').textContent = 'Edit Test';
            document.getElementById('t_title').value = t.title || '';
            document.getElementById('t_subject').value = t.subject || '';
            document.getElementById('t_duration').value = t.duration || 30;
            document.getElementById('t_marks').value = t.totalMarks || 100;
            document.getElementById('t_mpq').value = t.marksPerQuestion || 5;
            document.getElementById('t_desc').value = t.description || '';
            // Schedule fields
            if (t.startTime) {
                const d = t.startTime.toDate ? t.startTime.toDate() : new Date(t.startTime.seconds * 1000);
                document.getElementById('t_startTime').value = toLocalDT(d);
            } else document.getElementById('t_startTime').value = '';
            if (t.endTime) {
                const d = t.endTime.toDate ? t.endTime.toDate() : new Date(t.endTime.seconds * 1000);
                document.getElementById('t_endTime').value = toLocalDT(d);
            } else document.getElementById('t_endTime').value = '';
            document.getElementById('t_isActive').checked = t.isActive || false;
            // Department checkboxes
            document.querySelectorAll('.dept-checkbox').forEach(cb => {
                cb.checked = (t.departments || []).includes(cb.value) || (t.departments || []).includes('ALL');
            });
            // Load questions
            document.getElementById('questionBuilder').innerHTML = ''; questionCount = 0;
            (t.questions || []).forEach(q => addQuestionWithData(q));
            document.getElementById('testModal').classList.add('active');
        };

        window.deleteTestById = async function (id) {
            if (!confirm('Delete this test?')) return;
            try { await deleteDoc(doc(db, 'tests', id)); showToast('Test deleted.', 'success'); }
            catch { showToast('Delete failed.', 'error'); }
        };

        window.exportCSV = function () {
            const headers = ['Name', 'Email', 'Register No', 'College', 'Branch', 'Department', 'Section', 'Year', 'Joined'];
            const studentsOnly = allStudents.filter(s => s.role !== 'admin');
            const rows = studentsOnly.map(s => [s.name || '', s.email || '', s.registerNumber || '', s.college || '', s.branch || '', s.department || '', s.section || '', s.year || '', s.createdAt ? new Date(s.createdAt.seconds * 1000).toLocaleDateString('en-IN') : '']);
            const csv = [headers, ...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\n');
            const a = document.createElement('a');
            a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
            a.download = `students_export_${new Date().toISOString().slice(0, 10)}.csv`;
            a.click();
            showToast('CSV exported (Students only)!', 'success');
        };

        // ===== STUDENT IMPORT =====
        window.downloadStudentTemplate = function () {
            const headers = ['Name', 'Email', 'RegisterNo', 'College', 'Branch', 'Department', 'Section', 'Year'];
            const sample = ['John Doe', 'john@dsu.edu', '1DS22CS001', 'Dayananda Sagar University', 'Main Campus (Harohalli)', 'Engineering', 'A', '1st Year'];
            const csv = [headers, sample].map(r => r.map(v => `"${v}"`).join(',')).join('\n');
            const blob = new Blob([csv], { type: 'text/csv' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'student_import_template.csv';
            a.click();
            showToast('Template downloaded!', 'success');
        };

        window.handleStudentImport = function (file) {
            if (!file) return;
            if (!file.name.endsWith('.csv')) { showToast('Please upload a .csv file', 'error'); return; }

            const reader = new FileReader();
            reader.onload = async (e) => {
                const text = e.target.result;
                const rows = text.split('\n').map(r => r.trim()).filter(r => r);
                if (rows.length < 2) { showToast('No data found in file', 'error'); return; }

                const headers = rows[0].split(',').map(h => h.replace(/"/g, '').trim());
                const importedStudents = [];

                for (let i = 1; i < rows.length; i++) {
                    const values = rows[i].split(',').map(v => v.replace(/"/g, '').trim());
                    if (values.length < headers.length) continue;

                    const student = {};
                    headers.forEach((h, idx) => {
                        let key = h.toLowerCase().replace(/\s+/g, '');
                        if (key === 'registerno') key = 'registerNumber';
                        student[key] = values[idx];
                    });

                    if (student.email && student.name) {
                        importedStudents.push(student);
                    }
                }

                if (!importedStudents.length) { showToast('No valid students found', 'error'); return; }

                showToast(`Importing ${importedStudents.length} students...`, 'info');
                let count = 0;
                for (const s of importedStudents) {
                    try {
                        // For import, we generate a mock UID or use email as identifier if needed
                        // But since we can't create Auth users from client side without their pass, 
                        // we'll just add them as records to 'students' collection.
                        // Ideally, they should sign up themselves, but this serves as a pre-registration list.
                        const tempId = 'imported_' + Math.random().toString(36).substr(2, 9);
                        await setDoc(doc(db, 'students', tempId), {
                            ...s,
                            uid: tempId,
                            role: 'student',
                            isImported: true,
                            createdAt: serverTimestamp()
                        });
                        count++;
                    } catch (err) { console.error('Import error:', err); }
                }
                showToast(`Successfully imported ${count} students!`, 'success');
                document.getElementById('studentImportInput').value = '';
            };
            reader.readAsText(file);
        };

        window.exportResultsCSV = function () {
            if (!allResults.length) { showToast('No results to export', 'error'); return; }
            const headers = ['Student Name', 'Test Title', 'Score', 'Total Marks', 'Percentage', 'Correct', 'Wrong', 'Grade', 'Date'];
            const rows = allResults.map(r => {
                const student = allStudents.find(s => s.id === r.studentId);
                const pass = (r.percentage || 0) >= 60;
                return [
                    student?.name || r.studentId,
                    r.testTitle || r.testId,
                    r.score || 0,
                    r.totalMarks || 0,
                    `${r.percentage || 0}%`,
                    r.correct || 0,
                    r.wrong || 0,
                    pass ? 'Pass' : 'Fail',
                    r.submittedAt ? new Date(r.submittedAt.seconds * 1000).toLocaleString('en-IN') : '-'
                ];
            });
            const csv = [headers, ...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\n');
            const a = document.createElement('a');
            a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
            a.download = `exam_results_${new Date().toISOString().slice(0, 10)}.csv`;
            a.click();
            showToast('Results exported!', 'success');
        };

        // ===== STAFF MANAGEMENT =====

        // ===== EXAM SCHEDULE LOGIC =====
        window.openExamEventModal = function () {
            editingExamEventId = null;
            document.getElementById('examEventModalTitle').textContent = 'Add Exam Event';
            document.getElementById('examEventForm').reset();
            document.getElementById('examEventModal').classList.add('active');
        };
        window.closeExamEventModal = function () {
            document.getElementById('examEventModal').classList.remove('active');
        };

        window.saveExamEvent = async function (e) {
            e.preventDefault();
            const btn = document.getElementById('examEventSaveBtn');
            btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';

            const depts = [];
            document.querySelectorAll('.ee-dept-checkbox:checked').forEach(cb => depts.push(cb.value));

            const eventData = {
                subject: document.getElementById('ee_subject').value.trim(),
                subjectCode: document.getElementById('ee_code').value.trim(),
                date: document.getElementById('ee_date').value,
                time: document.getElementById('ee_time').value,
                duration: parseInt(document.getElementById('ee_duration').value) || 180,
                venue: document.getElementById('ee_venue').value.trim(),
                departments: depts.length > 0 ? depts : ['ALL'],
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            };

            try {
                if (editingExamEventId) {
                    await updateDoc(doc(db, 'exam_schedule', editingExamEventId), eventData);
                    showToast('Exam event updated!', 'success');
                } else {
                    await addDoc(collection(db, 'exam_schedule'), eventData);
                    showToast('Exam event created!', 'success');
                }
                closeExamEventModal();
            } catch (err) {
                showToast('Save failed: ' + err.message, 'error');
            }
            btn.disabled = false; btn.innerHTML = '<i class="fas fa-save"></i> Save Event';
        };

        window.deleteExamEvent = async function (id) {
            if (confirm('Are you sure you want to delete this exam event?')) {
                try {
                    await deleteDoc(doc(db, 'exam_schedule', id));
                    showToast('Exam event deleted!', 'success');
                } catch (err) {
                    showToast('Error deleting: ' + err.message, 'error');
                }
            }
        };

        window.editExamEvent = function (id) {
            const ev = allExamEvents.find(x => x.id === id);
            if (!ev) return;
            editingExamEventId = id;
            document.getElementById('examEventModalTitle').textContent = 'Edit Exam Event';
            document.getElementById('ee_subject').value = ev.subject || '';
            document.getElementById('ee_code').value = ev.subjectCode || '';
            document.getElementById('ee_date').value = ev.date || '';
            document.getElementById('ee_time').value = ev.time || '';
            document.getElementById('ee_duration').value = ev.duration || 180;
            document.getElementById('ee_venue').value = ev.venue || '';

            document.querySelectorAll('.ee-dept-checkbox').forEach(cb => {
                cb.checked = (ev.departments || []).includes(cb.value);
            });
            document.getElementById('examEventModal').classList.add('active');
        };

        function renderExamEvents(events) {
            allExamEvents = events;
            const body = document.getElementById('examScheduleBody');
            if (!events.length) { body.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:32px;color:var(--text-muted)">No scheduled exams.</td></tr>`; return; }

            const sorted = [...events].sort((a, b) => new Date(a.date) - new Date(b.date));

            body.innerHTML = sorted.map(ev => {
                const depts = (ev.departments || ['ALL']).join(', ');

                let formattedTime = ev.time;
                if (ev.time) {
                    const [h, m] = ev.time.split(':');
                    const ampm = h >= 12 ? 'PM' : 'AM';
                    const h12 = h % 12 || 12;
                    formattedTime = `${h12}:${m} ${ampm}`;
                }

                return `
    <tr>
      <td><b>${ev.subject || 'Untitled'}</b></td>
      <td>${ev.subjectCode || '-'}</td>
      <td>${ev.date || '-'}</td>
      <td>${formattedTime || '-'}</td>
      <td>${ev.duration || 180} min</td>
      <td>${ev.venue || '-'}</td>
      <td style="font-size:11px;color:var(--text-muted)">${depts}</td>
      <td><div class="actions-cell">
        <button class="icon-action icon-edit" onclick="editExamEvent('${ev.id}')" title="Edit"><i class="fas fa-edit"></i></button>
        <button class="icon-action icon-del" onclick="deleteExamEvent('${ev.id}')" title="Delete"><i class="fas fa-trash"></i></button>
      </div></td>
    </tr>`;
            }).join('');
        }

        window.downloadExamEventTemplate = function () {
            const csv = "Subject Name,Subject Code,Date (YYYY-MM-DD),Time (HH:MM),Duration (mins),Venue,Departments (Comma Separated)\nOperating Systems,CS102,2026-08-15,10:00,180,Block A Hall 101,BCA\nEngineering Mathematics,MA101,2026-08-16,14:00,180,Block B Hall 204,ALL";
            const blob = new Blob([csv], { type: 'text/csv' });
            const a = document.createElement('a');
            a.href = window.URL.createObjectURL(blob);
            a.download = 'exam_events_template.csv';
            a.click();
        };

        window.handleExamEventImport = function (file) {
            if (!file) return;
            if (!file.name.endsWith('.csv')) { showToast('Please upload a .csv file', 'error'); return; }

            const reader = new FileReader();
            reader.onload = async (e) => {
                const text = e.target.result;
                const rows = text.split('\n').map(r => r.trim()).filter(r => r);
                if (rows.length < 2) { showToast('No data found in file', 'error'); return; }

                const headers = rows[0].split(',').map(h => h.replace(/"/g, '').trim());
                let imported = 0;

                for (let i = 1; i < rows.length; i++) {
                    const values = rows[i].split(',').map(v => v.replace(/"/g, '').trim());
                    if (values.length < 7) continue; // Requires 7 columns

                    const deptsStr = values[6] || 'ALL';
                    const depts = deptsStr.split(';').map(d => d.trim()).filter(d => d);

                    const eventData = {
                        subject: values[0] || 'Unknown',
                        subjectCode: values[1] || 'UNK',
                        date: values[2] || '',
                        time: values[3] || '10:00',
                        duration: parseInt(values[4]) || 180,
                        venue: values[5] || 'TBD',
                        departments: depts.length > 0 ? depts : ['ALL'],
                        createdAt: serverTimestamp(),
                        updatedAt: serverTimestamp()
                    };

                    if (eventData.date) {
                        try {
                            await addDoc(collection(db, 'exam_schedule'), eventData);
                            imported++;
                        } catch (err) {
                            console.error('Import error row ' + i, err);
                        }
                    }
                }
                showToast(`Successfully imported ${imported} exam events!`, 'success');
                document.getElementById('examEventImportInput').value = '';
            };
            reader.readAsText(file);
        };
        let allStaff = [];
        let editingStaffId = null;

        window.openStaffModal = function () {
            editingStaffId = null;
            document.getElementById('staffModalTitle').textContent = 'Add Staff';
            document.getElementById('staffForm').reset();
            document.getElementById('staffModal').classList.add('active');
        };

        window.closeStaffModal = function () {
            document.getElementById('staffModal').classList.remove('active');
        };

        window.saveStaff = async function (e) {
            e.preventDefault();
            const btn = document.getElementById('staffSaveBtn');
            btn.disabled = true;

            const staffData = {
                name: document.getElementById('s_name').value,
                email: document.getElementById('s_email').value,
                role: document.getElementById('s_role').value,
                department: document.getElementById('s_dept').value,
                updatedAt: serverTimestamp()
            };

            try {
                if (editingStaffId) {
                    await updateDoc(doc(db, 'staff', editingStaffId), staffData);
                    showToast('Staff updated!', 'success');
                } else {
                    staffData.createdAt = serverTimestamp();
                    await addDoc(collection(db, 'staff'), staffData);
                    showToast('Staff added!', 'success');
                }
                closeStaffModal();
            } catch (err) {
                showToast('Save failed: ' + err.message, 'error');
            }
            btn.disabled = false;
        };

        function renderStaff(staff) {
            allStaff = staff;
            const body = document.getElementById('staffBody');
            if (!staff.length) {
                body.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:32px;color:var(--text-muted)">No staff records found.</td></tr>';
                return;
            }
            body.innerHTML = staff.map(s => `
                <tr>
                    <td>
                        <div class="student-row">
                            <div class="avatar-sm" style="background:var(--accent)">${(s.name || 'S')[0]}</div>
                            <div><div class="s-name">${s.name}</div><div class="s-email">${s.email}</div></div>
                        </div>
                    </td>
                    <td>${s.role}</td>
                    <td>${s.department}</td>
                    <td>
                        <div class="actions-cell">
                            <button class="icon-action icon-edit" onclick="editStaff('${s.id}')"><i class="fas fa-edit"></i></button>
                            <button class="icon-action icon-del" onclick="deleteStaff('${s.id}')"><i class="fas fa-trash"></i></button>
                        </div>
                    </td>
                </tr>
            `).join('');
        }

        window.editStaff = function (id) {
            const s = allStaff.find(x => x.id === id);
            if (!s) return;
            editingStaffId = id;
            document.getElementById('staffModalTitle').textContent = 'Edit Staff';
            document.getElementById('s_name').value = s.name;
            document.getElementById('s_email').value = s.email;
            document.getElementById('s_role').value = s.role;
            document.getElementById('s_dept').value = s.department;
            document.getElementById('staffModal').classList.add('active');
        };

        window.deleteStaff = async function (id) {
            if (!confirm('Are you sure you want to delete this staff member?')) return;
            try {
                await deleteDoc(doc(db, 'staff', id));
                showToast('Staff deleted.', 'success');
            } catch (err) {
                showToast('Delete failed.', 'error');
            }
        };

        window.searchStudents = function (val) {
            const filtered = allStudents.filter(s =>
                s.name?.toLowerCase().includes(val.toLowerCase()) ||
                s.email?.toLowerCase().includes(val.toLowerCase()) ||
                s.registerNumber?.toLowerCase().includes(val.toLowerCase()) ||
                s.branch?.toLowerCase().includes(val.toLowerCase())
            );
            renderStudents(filtered);
        };

        window.handleLogout = async () => { await signOut(auth); window.location.href = 'login.html'; };
        window._db = db;
    
