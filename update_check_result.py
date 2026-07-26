import re

with open('check-result.html', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace CSS
css_old = r'''        \.result-section \{
            display: none;
            margin-top: 30px;
        \}.*?\.fail \{ color: #ef4444; font-weight: 600; \}'''
css_new = r'''        .result-section {
            display: none;
            margin-top: 30px;
            background: #fff;
            padding: 30px;
            border-radius: 8px;
            border: 1px solid #eee;
            box-shadow: 0 4px 20px rgba(0,0,0,0.05);
        }
        .marksheet-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            border-bottom: 2px solid #005a8d;
            padding-bottom: 15px;
            margin-bottom: 20px;
        }
        .marksheet-logo {
            height: 70px;
            width: auto;
        }
        .marksheet-title-block {
            text-align: center;
            flex: 1;
        }
        .marksheet-title-block h2 {
            margin: 0;
            color: #005a8d;
            font-size: 22px;
            font-weight: 800;
            text-transform: uppercase;
        }
        .marksheet-title-block p {
            margin: 4px 0 10px 0;
            font-size: 13px;
            color: #555;
        }
        .statement-title {
            margin: 0;
            font-size: 14px;
            font-weight: 700;
            background: #005a8d;
            color: #fff;
            display: inline-block;
            padding: 5px 16px;
            border-radius: 20px;
        }
        .marksheet-student-info {
            display: flex;
            gap: 20px;
            margin-bottom: 25px;
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            padding: 15px;
            border-radius: 8px;
        }
        .student-photo {
            width: 100px;
            height: 100px;
            object-fit: cover;
            border: 3px solid #fff;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            border-radius: 6px;
            background: #e2e8f0;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 30px;
            color: #94a3b8;
        }
        .student-details {
            flex: 1;
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 8px 15px;
            font-size: 14px;
        }
        .student-details div {
            margin-bottom: 4px;
            color: #475569;
        }
        .student-details strong {
            color: #0f172a;
            display: inline-block;
            width: 120px;
        }
        .results-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 25px;
        }
        .results-table th, .results-table td {
            border: 1px solid #cbd5e1;
            padding: 12px;
            text-align: center;
            font-size: 14px;
        }
        .results-table th {
            background: #f1f5f9;
            font-weight: 700;
            color: #1e293b;
        }
        .results-table td:nth-child(2) {
            text-align: left;
            font-weight: 600;
        }
        .pass { color: #10b981; font-weight: 700; }
        .fail { color: #ef4444; font-weight: 700; }
        .marksheet-summary {
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            padding: 15px;
            border-radius: 8px;
            display: flex;
            justify-content: space-around;
            margin-bottom: 30px;
        }
        .summary-item {
            text-align: center;
        }
        .summary-item .label {
            font-size: 12px;
            color: #64748b;
            text-transform: uppercase;
            font-weight: 700;
            margin-bottom: 4px;
        }
        .summary-item .value {
            font-size: 20px;
            font-weight: 800;
            color: #0f172a;
        }
        .marksheet-footer {
            display: flex;
            justify-content: space-between;
            align-items: flex-end;
            margin-top: 40px;
            font-size: 14px;
            font-weight: 600;
            color: #334155;
            padding-top: 20px;
            border-top: 1px solid #cbd5e1;
        }'''
content = re.sub(css_old, css_new, content, flags=re.DOTALL)

# Replace HTML
html_old = r'''        <div class="result-section" id="resultSection">.*?</div>\s*</div>'''
html_new = r'''        <div class="result-section" id="resultSection">
            <!-- Marksheet Header -->
            <div class="marksheet-header">
                <img src="dsu_logo.png" alt="DSU Logo" class="marksheet-logo">
                <div class="marksheet-title-block">
                    <h2>DAYANANDA SAGAR UNIVERSITY</h2>
                    <p>Hosur Rd, Kudlu Gate, Srinivasa Nagar, Bengaluru, Karnataka 560068</p>
                    <div class="statement-title">PROVISIONAL STATEMENT OF MARKS</div>
                </div>
                <div style="width: 80px;"></div> <!-- Spacer for symmetry -->
            </div>

            <div class="marksheet-student-info" id="studentInfo">
                <!-- Populated by JS -->
            </div>
            
            <div style="overflow-x:auto;">
                <table class="results-table">
                    <thead>
                        <tr>
                            <th>Sl. No.</th>
                            <th>Exam / Test Title</th>
                            <th>Max Marks</th>
                            <th>Marks Obtained</th>
                            <th>Percentage</th>
                            <th>Result</th>
                        </tr>
                    </thead>
                    <tbody id="resultsBody">
                        <!-- Populated by JS -->
                    </tbody>
                </table>
            </div>

            <div class="marksheet-summary" id="marksheetSummary">
                <!-- Populated by JS -->
            </div>
            
            <div class="marksheet-footer">
                <div>
                    <p>Date: <span id="printDate"></span></p>
                </div>
                <div style="text-align: right;">
                    <p style="margin-bottom: 30px;">Controller of Examinations</p>
                    <p style="border-top: 1px dashed #334155; padding-top: 5px;">Signature</p>
                </div>
            </div>

            <div class="action-bar" data-html2canvas-ignore="true">
                <a href="index.html" class="back-link"><i class="fas fa-arrow-left"></i> Back to Home</a>
                <button type="button" class="btn-download-pdf" onclick="downloadResultPDF()"><i class="fas fa-download"></i> Download PDF</button>
            </div>
        </div>
    </div>'''
content = re.sub(html_old, html_new, content, flags=re.DOTALL)

# Replace JS logic
js_old = r'''                // 2\. Display student info
                document\.getElementById\('studentInfo'\)\.innerHTML = `.*?}\)\.join\(''\);
                }'''
js_new = r'''                // 2. Display student info
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
                
                // Set current date
                document.getElementById('printDate').textContent = new Date().toLocaleDateString('en-GB');

                // 3. Find results
                const resultsRef = collection(db, 'results');
                const qResults = query(resultsRef, where('studentId', '==', studentDoc.id));
                const resultsSnap = await getDocs(qResults);
                
                const tbody = document.getElementById('resultsBody');
                const summaryDiv = document.getElementById('marksheetSummary');
                
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

                        return `
                        <tr>
                            <td>${index + 1}</td>
                            <td>${r.testTitle || 'Test'}</td>
                            <td>${max}</td>
                            <td>${score}</td>
                            <td>${perc}%</td>
                            <td class="${isPass ? 'pass' : 'fail'}">${isPass ? 'PASS' : 'FAIL'}</td>
                        </tr>
                        `;
                    }).join('');

                    const overallPerc = totalMax > 0 ? Math.round((totalScore / totalMax) * 100) : 0;
                    const finalResult = hasFailed ? 'FAIL' : 'PASS';
                    const finalClass = hasFailed ? 'fail' : 'pass';

                    summaryDiv.innerHTML = `
                        <div class="summary-item">
                            <div class="label">Total Marks</div>
                            <div class="value">${totalScore} / ${totalMax}</div>
                        </div>
                        <div class="summary-item">
                            <div class="label">Overall Percentage</div>
                            <div class="value">${overallPerc}%</div>
                        </div>
                        <div class="summary-item">
                            <div class="label">Final Result</div>
                            <div class="value ${finalClass}">${finalResult}</div>
                        </div>
                    `;
                }'''
content = re.sub(js_old, js_new, content, flags=re.DOTALL)

with open('check-result.html', 'w', encoding='utf-8') as f:
    f.write(content)
print('Done!')
