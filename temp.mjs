
        import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
        import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
        import { getFirestore, doc, getDoc, collection, query, where, getDocs, onSnapshot, orderBy, limit, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

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
        const db = getFirestore(app);

        let currentUser = null;
        let perfChartInstance = null;

        onAuthStateChanged(auth, async (user) => {
            if (!user) {
                window.location.replace('login.html');
                return;
            }
            currentUser = user;
            document.body.classList.add('auth-verified');
            setupRealtimeFeatures(user);
            await loadDashboard(user);
        });

        async function setupRealtimeFeatures(user) {
            let studentDept = 'ALL';
            try {
                const sDoc = await getDoc(doc(db, 'students', user.uid));
                if (sDoc.exists() && sDoc.data().department) studentDept = sDoc.data().department;
            } catch(e) {}

            // Notifications Listener
            const qNotifs = query(collection(db, 'notifications'), orderBy('createdAt', 'desc'), limit(20));
            onSnapshot(qNotifs, (snap) => {
                const notifs = snap.docs
                    .map(d => ({id: d.id, ...d.data()}))
                    .filter(n => (n.departments || []).includes('ALL') || (n.departments || []).includes(studentDept) || n.targetUID === user.uid);
                updateNotificationsUI(notifs, user.uid);
            });

            // Announcements Listener (TICKER)
            onSnapshot(collection(db, 'announcements'), (snap) => {
                if (!snap.empty) {
                    const latest = snap.docs[0].data();
                    document.getElementById('announcementTicker').style.display = 'block';
                    document.getElementById('tickerText').textContent = latest.text;
                } else {
                    document.getElementById('announcementTicker').style.display = 'none';
                }
            });
            // Notices Listener
            onSnapshot(collection(db, 'notices'), (snap) => {
                const notices = snap.docs.map(d => ({id: d.id, ...d.data()}));
                renderNoticeBoard(notices);
            }, error => {
                console.error("Notices listener error:", error);
                const container = document.getElementById('noticeBoard');
                if(container) container.innerHTML = '<div style="text-align:center;padding:20px;color:var(--danger);font-size:13px;">Failed to load notices. Please deploy firestore.rules</div>';
            });
        }

        function renderNoticeBoard(list) {
            const container = document.getElementById('noticeBoard');
            if (!container) return;
            if (!list || !list.length) {
                container.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-muted);font-size:13px;">No official notices at this time.</div>';
                return;
            }

            const now = new Date();
            
            const sorted = list.sort((a, b) => {
                if (a.pinned && !b.pinned) return -1;
                if (!a.pinned && b.pinned) return 1;
                const aSec = (a.createdAt && a.createdAt.seconds) ? a.createdAt.seconds : 0;
                const bSec = (b.createdAt && b.createdAt.seconds) ? b.createdAt.seconds : 0;
                return bSec - aSec;
            });

            container.innerHTML = sorted.map(n => {
                const colors = { exam: 'var(--danger)', fee: 'var(--warning)', holiday: 'var(--success)', general: 'var(--info)' };
                const c = colors[n.category] || 'var(--info)';
                
                let isExpired = false;
                if (n.validUntil) {
                    const expiry = new Date(n.validUntil);
                    if (now > expiry) isExpired = true;
                }

                const dateStr = n.createdAt && n.createdAt.seconds ? new Date(n.createdAt.seconds * 1000).toLocaleDateString('en-IN', {day:'numeric', month:'short'}) : '';
                const pinBadge = n.pinned ? '<i class="fas fa-thumbtack" style="color:var(--danger);font-size:12px;" title="Pinned Notice"></i>' : '';
                
                let linkHtml = '';
                if (n.attachmentUrl) {
                    let dlUrl = n.attachmentUrl;
                    if (dlUrl.includes('cloudinary.com')) {
                        dlUrl = dlUrl.replace('/fl_attachment/', '/').replace('/upload/', '/upload/fl_attachment/');
                    }
                    linkHtml = `<a href="${dlUrl}" target="_blank" style="display:inline-block;margin-top:8px;font-size:11px;color:var(--primary);text-decoration:none;padding:4px 10px;background:rgba(108,99,255,.1);border-radius:4px;border:1px solid rgba(108,99,255,.2);"><i class="fas fa-file-download"></i> Download Attachment</a>`;
                }

                return `
                <div style="border:1px solid var(--glass-border);border-left:4px solid ${c};border-radius:8px;padding:12px;background:${isExpired ? 'rgba(0,0,0,0.05)' : 'var(--glass)'};opacity:${isExpired ? '0.6' : '1'};position:relative;">
                    ${isExpired ? '<div style="position:absolute;top:10px;right:10px;font-size:10px;font-weight:700;color:var(--text-muted);text-transform:uppercase;border:1px solid var(--glass-border);padding:2px 6px;border-radius:4px;">Expired</div>' : ''}
                    <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
                        <span style="font-size:10px;font-weight:700;color:${c};text-transform:uppercase;letter-spacing:0.5px;">${n.category}</span>
                        ${pinBadge}
                        <span style="font-size:11px;color:var(--text-muted);margin-left:auto;">${dateStr}</span>
                    </div>
                    <div style="font-size:14px;font-weight:600;margin-bottom:6px;line-height:1.3;${isExpired ? 'text-decoration:line-through;color:var(--text-muted)' : ''}">${n.title}</div>
                    <div style="font-size:12px;color:var(--text-muted);line-height:1.5;">${n.body}</div>
                    ${linkHtml}
                </div>`;
            }).join('');
        }

        function timeAgo(timestamp) {
            if (!timestamp) return 'Just now';
            const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp.seconds * 1000);
            const seconds = Math.floor((new Date() - date) / 1000);
            let interval = seconds / 31536000;
            if (interval > 1) return Math.floor(interval) + " yrs ago";
            interval = seconds / 2592000;
            if (interval > 1) return Math.floor(interval) + " mos ago";
            interval = seconds / 86400;
            if (interval >= 2) return Math.floor(interval) + " days ago";
            if (interval >= 1) return "Yesterday";
            interval = seconds / 3600;
            if (interval >= 1) return Math.floor(interval) + " hrs ago";
            interval = seconds / 60;
            if (interval >= 1) return Math.floor(interval) + " mins ago";
            return "Just now";
        }

        window.currentNotifIds = [];

        function updateNotificationsUI(notifs, uid) {
            const list = document.getElementById('notifList');
            const dot = document.getElementById('notifDot');
            const navBadge = document.querySelector('.nav-badge');
            
            window.currentNotifIds = notifs.map(n => n.id);
            const readState = JSON.parse(localStorage.getItem(`readNotifs_${uid}`) || '[]');
            const unreadCount = notifs.filter(n => !readState.includes(n.id)).length;

            if (notifs.length > 0) {
                list.innerHTML = notifs.map(n => {
                    const icon = n.type === 'test' ? 'fa-graduation-cap' : 'fa-bullhorn';
                    const isUnread = !readState.includes(n.id);
                    return `
                    <div class="notif-item" style="display:flex; gap:12px; align-items:flex-start; padding:12px; border-bottom:1px solid rgba(255,255,255,0.05); ${isUnread ? 'background:rgba(255,255,255,0.02);' : ''}">
                        <div style="background:rgba(108,99,255,0.1); color:var(--primary); width:36px; height:36px; border-radius:10px; display:flex; align-items:center; justify-content:center; flex-shrink:0;">
                            <i class="fas ${icon}"></i>
                        </div>
                        <div class="notif-content" style="flex:1;">
                            <div class="notif-title" style="font-size:13px; font-weight:700; color:var(--text); margin-bottom:4px;">${n.title}</div>
                            <div style="font-size:12px; color:var(--text-muted); margin-bottom:6px; line-height:1.4;">${n.message || ''}</div>
                            <div class="notif-time" style="font-size:11px; color:#64748b; font-weight:500;"><i class="fas fa-clock" style="margin-right:4px;"></i>${timeAgo(n.createdAt)}</div>
                        </div>
                        ${isUnread ? '<div style="width:8px;height:8px;background:var(--primary);border-radius:50%;margin-top:14px;"></div>' : ''}
                    </div>
                `}).join('');
                
                if (unreadCount > 0) {
                    if(dot) dot.style.display = 'block';
                    if(navBadge) navBadge.textContent = unreadCount;
                } else {
                    if(dot) dot.style.display = 'none';
                    if(navBadge) navBadge.textContent = '0';
                }
            } else {
                list.innerHTML = '<div style="text-align:center;padding:32px;color:var(--text-muted);font-size:13px">No new notifications</div>';
                if(dot) dot.style.display = 'none';
                if(navBadge) navBadge.textContent = '0';
            }
        }

        async function loadDashboard(user) {
            try {
                // Load student profile
                try {
                    const studentDoc = await getDoc(doc(db, 'students', user.uid));
                    if (studentDoc.exists()) {
                        const data = studentDoc.data();
                        document.getElementById('studentName').textContent = data.name || 'Student';
                        document.getElementById('sidebarName').textContent = data.name || 'Student';
                        if (data.photoURL) {
                            localStorage.setItem('userPhoto', data.photoURL);
                            document.getElementById('sidebarAvatar').innerHTML = `<img src="${data.photoURL}" alt="avatar">`;
                            const topAvatar = document.getElementById('topbarAvatar');
                            if (topAvatar) topAvatar.innerHTML = `<img src="${data.photoURL}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
                            // Also update hall ticket photo
                            const htPhoto = document.getElementById('dshHtPhoto');
                            if (htPhoto) htPhoto.innerHTML = `<img src="${data.photoURL}" style="width:100%;height:100%;object-fit:cover;border-radius:8px">`;
                        } else {
                            localStorage.removeItem('userPhoto');
                            document.getElementById('sidebarAvatar').innerHTML = '<i class="fas fa-user"></i>';
                            const topAvatar = document.getElementById('topbarAvatar');
                            if (topAvatar) topAvatar.innerHTML = '<i class="fas fa-user"></i>';
                            const htPhoto = document.getElementById('dshHtPhoto');
                            if (htPhoto) htPhoto.innerHTML = '<div style="background:#e2e8f0;width:100%;height:100%;border-radius:8px;display:flex;align-items:center;justify-content:center"><i class="fas fa-user" style="color:#94a3b8;font-size:32px"></i></div>';
                            
                            const bottomNavProfile = document.querySelector('.mobile-bottom-nav a[href="profile.html"]');
                            if (bottomNavProfile) {
                                bottomNavProfile.innerHTML = '<i class="fas fa-user"></i><span class="nav-text">Profile</span>';
                            }
                        }

                        // Dynamically update STUDENT_PROFILE mock with real Firebase data
                        if (typeof STUDENT_PROFILE !== 'undefined') {
                            STUDENT_PROFILE.name = data.name || STUDENT_PROFILE.name;
                            STUDENT_PROFILE.regNo = data.registerNumber || STUDENT_PROFILE.regNo;
                            STUDENT_PROFILE.rollNo = data.rollNumber || STUDENT_PROFILE.rollNo;
                            STUDENT_PROFILE.department = data.department || STUDENT_PROFILE.department;
                            STUDENT_PROFILE.photoURL = data.photoURL || STUDENT_PROFILE.photoURL;
                            STUDENT_PROFILE.branch = data.branch || STUDENT_PROFILE.branch;
                            STUDENT_PROFILE.section = data.section || STUDENT_PROFILE.section;

                            // Map Year to Semester roughly, or use year if semester isn't available
                            if (data.year) {
                                const yearMap = { '1': '1st/2nd Semester', '2': '3rd/4th Semester', '3': '5th/6th Semester', '4': '7th/8th Semester' };
                                STUDENT_PROFILE.semester = yearMap[data.year] || (data.year.includes('Year') ? data.year : `${data.year} Year`);
                            }
                            // Re-render Hall Ticket with real data
                            if (typeof renderHallTicket === 'function') renderHallTicket();
                        }
                    }
                } catch (err) {
                    console.warn("Error loading student profile:", err);
                }

                // Update Greeting and Date
                const now = new Date();
                const hours = now.getHours();
                let greet = "Good night!";
                if (hours >= 5 && hours < 12) greet = "Good morning!";
                else if (hours >= 12 && hours < 17) greet = "Good afternoon!";
                else if (hours >= 17 && hours < 21) greet = "Good evening!";

                document.getElementById('greetingTime').textContent = greet;
                document.getElementById('currentDay').textContent = now.toLocaleDateString('en-GB', {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long'
                });

                // Load tests
                const testsQuery = query(collection(db, 'tests'), limit(50));
                onSnapshot(testsQuery, (snap) => {
                    const now = new Date();
                    const userDept = (typeof STUDENT_PROFILE !== 'undefined') ? STUDENT_PROFILE.department : '';
                    
                    const filteredDocs = snap.docs.filter(d => {
                        const t = d.data();
                        if (!t.isActive) return false;
                        if (t.startTime) {
                            const start = t.startTime.toDate ? t.startTime.toDate() : new Date(t.startTime.seconds * 1000);
                            if (now < start) return false;
                        }
                        if (t.endTime) {
                            const end = t.endTime.toDate ? t.endTime.toDate() : new Date(t.endTime.seconds * 1000);
                            if (now > end) return false;
                        }
                        const depts = t.departments || ['ALL'];
                        if (!depts.includes('ALL') && !depts.includes(userDept)) return false;
                        return true;
                    });
                    
                    window._allTests = filteredDocs.map(d => ({ id: d.id, ...d.data() }));
                    updateStatTests(filteredDocs.length);
                    renderTests(window._allTests);
                });

                // Load EXAM EVENTS realtime from the new dedicated collection
                const examsQuery = query(collection(db, 'exam_schedule'), limit(100));
                onSnapshot(examsQuery, (snap) => {
                    const allExams = snap.docs.map(d => ({ id: d.id, ...d.data() }));

                    if (typeof EXAM_SCHEDULE !== 'undefined') {
                        const userDept = (typeof STUDENT_PROFILE !== 'undefined') ? STUDENT_PROFILE.department : 'ALL';
                        const filteredExams = allExams.filter(ex => {
                            if (!ex.departments || ex.departments.includes('ALL')) return true;
                            if (userDept && ex.departments.includes(userDept)) return true;
                            return false;
                        });

                        EXAM_SCHEDULE = filteredExams.map(ex => {
                            return {
                                id: ex.id,
                                subject: ex.subject || 'Unknown Subject',
                                subjectCode: ex.subjectCode || '-',
                                date: ex.date,
                                time: ex.time || '09:00',
                                duration: ex.duration || 180,
                                venue: ex.venue || 'TBD',
                                type: 'Semester Exam',
                                hallTicketReady: true,
                                syllabus: ex.departments || ['ALL'],
                                instructions: 'Bring ID card and Hall Ticket. Electronic gadgets are strictly prohibited.',
                            };
                        });

                        // Rebuild maps
                        if (typeof examDateMap !== 'undefined') {
                            for (let key in examDateMap) delete examDateMap[key];
                            window._examMap = {};
                            EXAM_SCHEDULE.forEach(ex => {
                                examDateMap[ex.date] = (examDateMap[ex.date] || []);
                                examDateMap[ex.date].push(ex);
                                window._examMap[ex.id] = ex;
                            });
                        }

                        // Re-render UI
                        if (typeof setSchedView === 'function') setSchedView(calViewMode || 'calendar');
                        if (typeof renderHallTicket === 'function') renderHallTicket();
                    }
                });

                // Load EXAM HISTORY realtime from results
                const histQuery = query(collection(db, 'results'), where('studentId', '==', user.uid));
                onSnapshot(histQuery, (snap) => {
                    EXAM_HISTORY = snap.docs.map(d => {
                        const r = d.data();
                        let dateStr = '2025-01-01';
                        if (r.submittedAt) {
                            const dateObj = new Date(r.submittedAt.seconds * 1000);
                            const y = dateObj.getFullYear();
                            const m = String(dateObj.getMonth() + 1).padStart(2, '0');
                            const day = String(dateObj.getDate()).padStart(2, '0');
                            dateStr = `${y}-${m}-${day}`;
                        }
                        
                        const pct = r.percentage || 0;
                        let grade = 'F';
                        if (pct >= 90) grade = 'O';
                        else if (pct >= 80) grade = 'A+';
                        else if (pct >= 70) grade = 'A';
                        else if (pct >= 60) grade = 'B+';
                        else if (pct >= 50) grade = 'B';
                        
                        return {
                            id: d.id,
                            subject: r.testTitle || r.testId || 'Unknown Subject',
                            subjectCode: r.testId ? r.testId.substring(0, 5).toUpperCase() : '-',
                            date: dateStr,
                            semester: r.semester || (typeof STUDENT_PROFILE !== 'undefined' ? STUDENT_PROFILE.semester : '1'),
                            marks: r.score || 0,
                            totalMarks: r.totalMarks || 100,
                            grade: grade,
                            status: pct >= 60 ? 'Pass' : 'Fail'
                        };
                    });
                    
                    if (typeof renderHistStats === 'function') renderHistStats();
                    if (typeof dshApplyFilters === 'function') dshApplyFilters();
                });

                // Load results
                const resultsQuery = query(collection(db, 'results'), where('studentId', '==', user.uid));
                onSnapshot(resultsQuery, (snap) => {
                    const results = snap.docs.map(d => d.data());
                    window._allResults = results;
                    updateStatCompleted(results.length);
                    const avgScore = results.length > 0 ? Math.round(results.reduce((s, r) => s + (r.percentage || 0), 0) / results.length) : 0;
                    document.getElementById('statAvgScore').textContent = avgScore + '%';
                    renderRecentScores(results);
                    renderChart(results);
                }, (err) => {
                    console.error("Results Snapshot Error:", err);
                });

                // Courses count - wrap in try-catch as it might fail if rules aren't deployed
                try {
                    const coursesCount = await getDocs(collection(db, 'courses'));
                    document.getElementById('statCourses').textContent = coursesCount.size;
                } catch (err) {
                    console.warn("Error loading courses count:", err);
                    document.getElementById('statCourses').textContent = "0";
                }

                // Announcements & Notifications Listener
                onSnapshot(query(collection(db, 'announcements'), orderBy('createdAt', 'desc'), limit(10)), snap => {
                    const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                    renderAnnouncements(list);
                });

                document.getElementById('loader').style.display = 'none';

            } catch (err) {
                console.error("Dashboard Load Global Error:", err);
                document.getElementById('loader').style.display = 'none';
                showToast('Error loading dashboard: ' + (err.message || 'Unknown error'), 'error');
            }
        }

        function updateStatTests(n) { document.getElementById('statTests').textContent = n; }
        function updateStatCompleted(n) { document.getElementById('statCompleted').textContent = n; }

        function renderTests(tests) {
            const grid = document.getElementById('testsGrid');
            if (!tests.length) {
                grid.innerHTML = `<div style="text-align:center;padding:32px;color:var(--text-muted)"><i class="fas fa-clipboard-list" style="font-size:36px;opacity:.3"></i><p style="margin-top:12px">No tests available</p></div>`;
                return;
            }
            const colors = ['#6c63ff', '#10b981', '#f59e0b', '#06b6d4', '#ef4444'];
            grid.innerHTML = tests.slice(0, 6).map((t, i) => `
        <div class="test-card" onclick="window.location.href='test.html?id=${t.id}'">
          <div class="test-icon" style="background:linear-gradient(135deg,${colors[i % colors.length]}30,${colors[i % colors.length]}60)">
            <i class="fas fa-file-alt" style="color:${colors[i % colors.length]}"></i>
          </div>
          <div class="test-info">
            <div class="title">${t.title || 'Untitled Test'}</div>
            <div class="meta">
              <span class="meta-item"><i class="fas fa-clock"></i> ${t.duration || 30} mins</span>
              <span class="meta-item"><i class="fas fa-question-circle"></i> ${t.questions?.length || 0} Qs</span>
              <span class="meta-item"><i class="fas fa-star"></i> ${t.totalMarks || 100} marks</span>
            </div>
          </div>
          <span class="test-status status-available">Available</span>
        </div>
      `).join('');
        }

        function renderRecentScores(results) {
            const el = document.getElementById('recentScores');
            if (!results.length) {
                el.innerHTML = `<p style="color:var(--text-muted);font-size:13px;text-align:center;padding:12px">No results yet</p>`;
                return;
            }
            el.innerHTML = results.slice(0, 5).map(r => `
        <div class="perf-item">
          <span class="perf-subject">${r.testTitle || 'Test'}</span>
          <div class="perf-bar-wrap"><div class="perf-bar" style="width:${r.percentage || 0}%;background:${(r.percentage || 0) >= 60 ? 'var(--success)' : 'var(--danger)'}"></div></div>
          <span class="perf-score" style="color:${(r.percentage || 0) >= 60 ? 'var(--success)' : 'var(--danger)'}">${r.percentage || 0}%</span>
        </div>
      `).join('');
        }

        function renderChart(results) {
            const pass = results.filter(r => (r.percentage || 0) >= 60).length;
            const fail = results.length - pass;
            const completed = results.length;
            const ctx = document.getElementById('perfChart').getContext('2d');
            if (perfChartInstance) perfChartInstance.destroy();
            perfChartInstance = new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels: ['Passed', 'Failed', 'Pending'],
                    datasets: [{
                        data: [pass, fail, Math.max(0, 5 - completed)],
                        backgroundColor: ['rgba(16,185,129,.8)', 'rgba(239,68,68,.8)', 'rgba(148,163,184,.3)'],
                        borderWidth: 0, borderRadius: 4
                    }]
                },
                options: {
                    responsive: true, maintainAspectRatio: false, cutout: '70%',
                    plugins: { legend: { labels: { color: '#94a3b8', font: { size: 11 } } } }
                }
            });
        }

        function renderAnnouncements(list) {
            const listEl = document.getElementById('notifList');
            const ticker = document.getElementById('announcementTicker');
            const tickerText = document.getElementById('tickerText');
            const badge = document.getElementById('notifBadge');

            if (!list.length) {
                if (listEl) listEl.innerHTML = '<div style="text-align:center;padding:32px;color:var(--text-muted);font-size:13px">No new notifications</div>';
                if (ticker) ticker.style.display = 'none';
                if (badge) badge.style.display = 'none';
                return;
            }

            // Ticker setup (show latest)
            if (ticker) ticker.style.display = 'block';
            if (tickerText) tickerText.textContent = list[0].message;
            if (badge) badge.style.display = 'block';

            // List setup
            if (listEl) {
                listEl.innerHTML = list.map(a => {
                    const colors = { info: 'var(--primary)', success: 'var(--success)', warn: 'var(--warn)', danger: 'var(--danger)' };
                    const icons = { info: 'fa-info-circle', success: 'fa-check-circle', warn: 'fa-exclamation-triangle', danger: 'fa-exclamation-circle' };
                    const time = a.createdAt ? new Date(a.createdAt.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Just now';

                    return `
                        <div class="notif-item ${a.type === 'info' ? '' : a.type}">
                            <div class="notif-icon"><i class="fas ${icons[a.type || 'info']}" style="color:${colors[a.type || 'info']}"></i></div>
                            <div style="flex:1">
                                <div class="notif-text" style="font-weight:600">${a.message}</div>
                                ${a.attachmentURL ? `<div style="margin-top:4px"><button onclick="downloadAnnouncementFile('${a.attachmentURL}')" style="color:var(--primary);font-size:11px;text-decoration:none;display:inline-flex;align-items:center;gap:4px;background:rgba(108,99,255,.1);padding:4px 8px;border-radius:4px;border:1px solid rgba(108,99,255,.2);cursor:pointer;font-family:inherit"><i class="fas fa-file-download"></i> Download File</button></div>` : ''}
                                <div class="notif-time">${time}</div>
                            </div>
                        </div>
                    `;
                }).join('');
            }
        }

        function showToast(msg, type = 'info', duration = 3000) {
            const container = document.getElementById('toastContainer') || document.body;
            const toast = document.createElement('div');
            toast.className = `toast-msg toast-${type}`;
            toast.style.cssText = `padding: 12px 20px; background: rgba(15, 15, 30, 0.95); border-radius: 10px; color: #fff; display: flex; align-items: center; gap: 10px; border: 1px solid rgba(255,255,255,0.1); margin-top: 8px; box-shadow: 0 10px 20px rgba(0, 0, 0, 0.3); animation: slideIn 0.3s ease-out; font-size: 13px; position: fixed; bottom: 20px; right: 20px; z-index: 9999;`;

            const icon = type === 'success' ? 'fa-check-circle' : (type === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle');
            toast.innerHTML = `<i class="fas ${icon}" style="color:${type === 'success' ? '#10b981' : (type === 'error' ? '#ef4444' : '#6c63ff')}"></i><span>${msg}</span>`;

            container.appendChild(toast);
            setTimeout(() => {
                toast.style.opacity = '0';
                toast.style.transform = 'translateX(100%)';
                toast.style.transition = '0.3s';
                setTimeout(() => toast.remove(), 300);
            }, duration);
        }

        window.downloadAnnouncementFile = function (url) {
            if (!url) return;
            let dlUrl = url;
            if (url.includes('cloudinary.com')) {
                // Ensure fl_attachment is present once
                dlUrl = url.replace('/fl_attachment/', '/').replace('/upload/', '/upload/fl_attachment/');
            }

            showToast('Opening download link...', 'info');
            showToast('If the site can\'t be reached, please check Cloudinary "Blocked for delivery" status!', 'warning', 6000);

            const a = document.createElement('a');
            a.href = dlUrl;
            a.target = '_blank';
            a.download = '';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        };

        window.handleLogout = async function () {
            await signOut(auth);
            window.location.href = 'login.html';
        };

        window._db = db;
        window._auth = auth;
        window._user = () => currentUser;
    
