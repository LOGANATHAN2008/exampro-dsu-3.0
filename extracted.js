
        import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
        import { getFirestore, collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

        const firebaseConfig = {
            apiKey: "AIzaSyDKDT0kvwEm0cEdh_MpbTb8A9W3_xwAVxY",
            authDomain: "dsu-exam-system.firebaseapp.com",
            projectId: "dsu-exam-system",
            storageBucket: "dsu-exam-system.firebasestorage.app",
            messagingSenderId: "155083834622",
            appId: "1:155083834622:web:ff0a9780b88bad0b8811af"
        };

        const app = initializeApp(firebaseConfig);
        const db = getFirestore(app);

        document.getElementById('resultForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const regNo = document.getElementById('regNo').value.trim();
            const dob = document.getElementById('dob').value;
            
            const loader = document.getElementById('loader');
            const errorMsg = document.getElementById('errorMsg');
            const resultSec = document.getElementById('resultSection');
            
            loader.style.display = 'block';
            errorMsg.style.display = 'none';
            resultSec.style.display = 'none';
            
            try {
                // 1. Find the student
                const studentsRef = collection(db, 'students');
                const qStudent = query(studentsRef, where('registerNumber', '==', regNo), where('dob', '==', dob));
                const studentSnap = await getDocs(qStudent);
                
                if (studentSnap.empty) {
                    throw new Error("No student found with the provided Register Number and Date of Birth.");
                }
                
                const studentDoc = studentSnap.docs[0];
                const student = studentDoc.data();
                
                // 2. Display student info
                const photoHtml = student.photoURL 
                    ? `<img src="${student.photoURL}" class="student-photo" alt="Photo">`
                    : `<div class="student-photo"><i class="fas fa-user"></i></div>`;
                
                document.getElementById('studentInfo').innerHTML = `
                    ${photoHtml}
                    <div class="student-details">
                        <div><strong>Student Name:</strong> ${student.name || '-'}</div>
                        <div><strong>Register No:</strong> ${student.registerNumber || '-'}</div>
                        <div><strong>Course & Branch:</strong> ${student.branch || '-'}</div>
                        <div><strong>Department:</strong> ${student.department || '-'} (${student.section || '-'})</div>
                        <div><strong>Date of Birth:</strong> ${student.dob ? new Date(student.dob).toLocaleDateString('en-GB') : '-'}</div>
                        <div><strong>College:</strong> ${student.college || '-'}</div>
                    </div>
                `;
                
                // Set current date detailed
                const now = new Date();
                const dateOptions = { day: '2-digit', month: '2-digit', year: 'numeric' };
                const timeOptions = { hour: '2-digit', minute: '2-digit', hour12: true };
                document.getElementById('printDateDetailed').textContent = 
                    `${now.toLocaleDateString('en-GB', dateOptions)} ${now.toLocaleTimeString('en-US', timeOptions)}`;
                
                // Verification ID
                const randomCode = Math.floor(100 + Math.random() * 900);
                const verificationId = `${student.registerNumber}-${randomCode}`;
                document.getElementById('verificationId').textContent = verificationId;

                // Generate QR Code
                const qrContainer = document.getElementById('qrcode');
                qrContainer.innerHTML = '';
                
                // Create a verification URL that links back to this page with the student details
                const verifyUrl = `${window.location.origin}${window.location.pathname}?verify=${student.registerNumber}&dob=${student.dob}`;
                
                new QRCode(qrContainer, {
                    text: verifyUrl,
                    width: 70,
                    height: 70,
                    colorDark : "#4f46e5",
                    colorLight : "#ffffff",
                    correctLevel : QRCode.CorrectLevel.L
                });

                // 3. Find results
                const resultsRef = collection(db, 'results');
                const qResults = query(resultsRef, where('studentId', '==', studentDoc.id));
                const resultsSnap = await getDocs(qResults);
                
                const tbody = document.getElementById('resultsBody');
                const summaryDiv = document.getElementById('marksheetSummaryCards');
                
                if (resultsSnap.empty) {
                    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 20px;">No results published yet.</td></tr>';
                    summaryDiv.style.display = 'none';
                } else {
                    summaryDiv.style.display = 'flex';
                    const results = resultsSnap.docs.map(d => d.data());
                    // Sort by submission date if available (ascending for a marksheet makes more sense)
                    results.sort((a,b) => (a.submittedAt?.seconds || 0) - (b.submittedAt?.seconds || 0));
                    
                    let totalScore = 0;
                    let totalMax = 0;
                    let hasFailed = false;

                    tbody.innerHTML = results.map((r, index) => {
                        const score = Number(r.score) || 0;
                        const max = Number(r.totalMarks) || 0;
                        const perc = Number(r.percentage) || 0;
                        const isPass = perc >= 60;
                        
                        totalScore += score;
                        totalMax += max;
                        if (!isPass) hasFailed = true;

                        let grade = 'F';
                        if (perc >= 90) grade = 'O';
                        else if (perc >= 80) grade = 'A+';
                        else if (perc >= 70) grade = 'A';
                        else if (perc >= 60) grade = 'B+';
                        else if (perc >= 50) grade = 'B';
                        else if (perc >= 40) grade = 'C';

                        return `
                        <tr>
                            <td>${index + 1}</td>
                            <td>${r.testTitle || 'Test'}</td>
                            <td>${max}</td>
                            <td>${score}</td>
                            <td>${perc}%</td>
                            <td style="font-weight:700">${grade}</td>
                            <td class="${isPass ? 'pass' : 'fail'}">${isPass ? 'PASS' : 'FAIL'}</td>
                        </tr>
                        `;
                    }).join('');

                    const overallPerc = totalMax > 0 ? ((totalScore / totalMax) * 100).toFixed(1) : 0;
                    const finalResult = hasFailed ? 'FAIL' : 'PASS';
                    const finalColor = hasFailed ? '#ef4444' : '#10b981';

                    summaryDiv.innerHTML = `
                        <div class="summary-card">
                            <div class="summary-card-title">Total Marks</div>
                            <div class="summary-card-value">${totalScore} <span style="font-size:16px;color:#64748b">/ ${totalMax}</span></div>
                        </div>
                        <div class="summary-card">
                            <div class="summary-card-title">Overall Percentage</div>
                            <div class="summary-card-value">${overallPerc}%</div>
                        </div>
                        <div class="summary-card">
                            <div class="summary-card-title">Final Result</div>
                            <div class="summary-card-value" style="color: ${finalColor}">${finalResult}</div>
                        </div>
                    `;

                    // --- UNIQUE FEATURES ---
                    const aiContainer = document.getElementById('aiInsightsContainer');
                    const aiText = document.getElementById('aiInsightText');
                    aiContainer.style.display = 'flex';

                    // 1. AI Insights Text
                    let highestSub = results[0];
                    let lowestSub = results[0];
                    results.forEach(r => {
                        const p = Number(r.percentage) || 0;
                        if (p > (Number(highestSub.percentage)||0)) highestSub = r;
                        if (p < (Number(lowestSub.percentage)||0)) lowestSub = r;
                    });
                    
                    if (results.length > 0) {
                        let insight = `Excellent effort this semester! Your strongest subject was <strong>${highestSub.testTitle || 'Unknown'}</strong> where you scored a brilliant ${highestSub.percentage}%. `;
                        if (highestSub.testTitle !== lowestSub.testTitle) {
                            insight += `However, you have room for improvement in <strong>${lowestSub.testTitle || 'Unknown'}</strong> (${lowestSub.percentage}%). `;
                        }
                        if (!hasFailed && overallPerc >= 80) {
                            insight += `Overall, an outstanding performance! Keep up the great work!`;
                        } else if (!hasFailed) {
                            insight += `Overall, a solid performance. With a little more focus, you can reach the top!`;
                        } else {
                            insight += `Don't be discouraged by the setbacks. Focus on your weaker areas and you will bounce back stronger next time!`;
                        }
                        aiText.innerHTML = insight;
                    }

                    // 2. Chart.js Radar Chart
                    const ctx = document.getElementById('skillsRadarChart').getContext('2d');
                    if(window.myRadarChart) window.myRadarChart.destroy();
                    window.myRadarChart = new Chart(ctx, {
                        type: 'radar',
                        data: {
                            labels: results.map(r => r.testTitle ? r.testTitle.substring(0, 10) + '...' : 'Subject'),
                            datasets: [{
                                label: 'Skill Profile',
                                data: results.map(r => Number(r.percentage) || 0),
                                backgroundColor: 'rgba(79, 70, 229, 0.2)',
                                borderColor: 'rgba(79, 70, 229, 1)',
                                pointBackgroundColor: 'rgba(79, 70, 229, 1)',
                            }]
                        },
                        options: {
                            scales: { r: { min: 0, max: 100, ticks: { display: false } } },
                            plugins: { legend: { display: false } }
                        }
                    });

                    // 3. Confetti WOW Factor
                    if (!hasFailed && overallPerc >= 70) {
                        setTimeout(() => {
                            confetti({
                                particleCount: 150,
                                spread: 80,
                                origin: { y: 0.6 },
                                colors: ['#4f46e5', '#10b981', '#f59e0b', '#7c3aed']
                            });
                        }, 500);
                    }
                }
                
                loader.style.display = 'none';
                resultSec.style.display = 'block';
                
            } catch (err) {
                console.error(err);
                loader.style.display = 'none';
                errorMsg.textContent = err.message || "An error occurred while fetching results. Please try again.";
                errorMsg.style.display = 'block';
            }
        });

        window.shareResult = async function() {
            const btn = document.querySelector('.btn-share');
            const originalText = btn.innerHTML;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Preparing...';
            btn.disabled = true;

            try {
                const element = document.getElementById('resultSection');
                
                // Hide action bar for screenshot
                const actionBar = document.querySelector('.action-bar');
                actionBar.style.display = 'none';

                const canvas = await html2canvas(element, { scale: 2, useCORS: true });
                
                // Show action bar again
                actionBar.style.display = 'flex';

                canvas.toBlob(async (blob) => {
                    const file = new File([blob], 'exam_result.png', { type: 'image/png' });
                    const shareData = {
                        title: 'My Exam Results',
                        text: 'I just got my Exam Results on the ExamPro DSU Portal!',
                        url: window.location.href,
                        files: [file]
                    };

                    try {
                        if (navigator.canShare && navigator.canShare(shareData)) {
                            await navigator.share(shareData);
                        } else if (navigator.share) {
                            // Fallback to text only
                            await navigator.share({
                                title: 'My Exam Results',
                                text: 'I just got my Exam Results on the ExamPro DSU Portal!',
                                url: window.location.href
                            });
                        } else {
                            alert('Web Share is not supported in your browser.');
                        }
                    } catch (shareErr) {
                        console.log('User cancelled or error:', shareErr);
                    }
                    
                    btn.innerHTML = originalText;
                    btn.disabled = false;
                }, 'image/png');

            } catch (err) {
                console.error('Error generating image:', err);
                btn.innerHTML = originalText;
                btn.disabled = false;
                alert('Something went wrong while preparing the share image.');
            }
        };

        window.downloadResultPDF = function() {
            const regNo = document.getElementById('regNo').value.trim();
            const element = document.getElementById('resultSection');
            
            // html2pdf automatically ignores elements with data-html2canvas-ignore="true" attribute
            const opt = {
                margin:       10,
                filename:     `Result_${regNo || 'Export'}.pdf`,
                image:        { type: 'jpeg', quality: 0.98 },
                html2canvas:  { scale: 2, useCORS: true, scrollY: 0 },
                jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
            };

            html2pdf().set(opt).from(element).save();
        };

        // Auto-verify logic for QR Code scans
        window.addEventListener('DOMContentLoaded', () => {
            const urlParams = new URLSearchParams(window.location.search);
            const verifyRegNo = urlParams.get('verify');
            const verifyDob = urlParams.get('dob');
            
            if (verifyRegNo && verifyDob) {
                // Auto-fill the form
                document.getElementById('regNo').value = verifyRegNo;
                document.getElementById('dob').value = verifyDob;
                
                // Auto-submit to show results immediately
                document.getElementById('resultForm').dispatchEvent(new Event('submit'));
                
                // Clean up URL so it doesn't look messy
                window.history.replaceState({}, document.title, window.location.pathname);
            }
        });

        // Generate LinkedIn Badge
        window.generateBadge = async function() {
            const btn = document.querySelector('.btn-share i.fab.fa-linkedin').parentElement;
            const originalText = btn.innerHTML;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generating...';
            btn.disabled = true;

            try {
                // Temporarily create a badge element
                const badge = document.createElement('div');
                badge.style.width = '600px';
                badge.style.height = '600px';
                badge.style.background = 'linear-gradient(135deg, #4f46e5, #7c3aed)';
                badge.style.color = '#fff';
                badge.style.display = 'flex';
                badge.style.flexDirection = 'column';
                badge.style.justifyContent = 'center';
                badge.style.alignItems = 'center';
                badge.style.textAlign = 'center';
                badge.style.padding = '40px';
                badge.style.fontFamily = "'Inter', sans-serif";
                badge.style.position = 'fixed';
                badge.style.top = '-9999px';
                
                const sName = document.getElementById('studentInfo').querySelector('.student-details div:nth-child(1)').innerText.split(':')[1].trim();
                const sPerc = document.getElementById('marksheetSummaryCards').querySelector('.summary-card:nth-child(2) .summary-card-value').innerText;

                badge.innerHTML = `
                    <h1 style="font-size:48px; margin-bottom:20px; font-weight:800;">I DID IT! 🎉</h1>
                    <p style="font-size:24px; margin-bottom:40px; color:#e0e7ff;">I just successfully passed my semester exams at Dayananda Sagar University!</p>
                    <div style="background:rgba(255,255,255,0.1); padding:20px 40px; border-radius:20px; border:1px solid rgba(255,255,255,0.2);">
                        <div style="font-size:32px; font-weight:700;">${sName}</div>
                        <div style="font-size:20px; color:#c7d2fe; margin-top:5px;">Overall Performance: ${sPerc}</div>
                    </div>
                    <div style="margin-top:60px; font-size:16px; opacity:0.8;">#DSU #ExamPro #StudentSuccess</div>
                `;
                document.body.appendChild(badge);

                const canvas = await html2canvas(badge, { scale: 2 });
                document.body.removeChild(badge);

                canvas.toBlob(async (blob) => {
                    const file = new File([blob], 'linkedin_badge.png', { type: 'image/png' });
                    const shareData = {
                        title: 'My Exam Results',
                        text: 'I just passed my exams at DSU! 🎉 Check out my official digital badge!',
                        url: window.location.href,
                        files: [file]
                    };

                    try {
                        if (navigator.canShare && navigator.canShare(shareData)) {
                            await navigator.share(shareData);
                        } else {
                            // Fallback: download the badge directly
                            const link = document.createElement('a');
                            link.href = URL.createObjectURL(blob);
                            link.download = 'linkedin_badge.png';
                            link.click();
                            alert('Since Web Share isn\\'t supported, your Badge has been downloaded! You can now post it on LinkedIn.');
                        }
                    } catch (e) { console.log(e); }
                    
                    btn.innerHTML = originalText;
                    btn.disabled = false;
                }, 'image/png');
            } catch (err) {
                console.error(err);
                btn.innerHTML = originalText;
                btn.disabled = false;
            }
        };
    