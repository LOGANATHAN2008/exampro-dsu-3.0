// ============================================
// Admin Tests Module - ExamPro DSU
// Handles test CRUD, .txt upload, scheduling
// ============================================

import {
    db, DEPARTMENTS,
    collection, onSnapshot, getDocs, doc, getDoc,
    deleteDoc, addDoc, updateDoc, setDoc, serverTimestamp,
    query, orderBy, where, Timestamp
} from './firebase-config.js';

let allTests = [];
let editingTestId = null;
let questionCount = 0;

// ============ .TXT PARSER ============

function parseTxtQuestions(text) {
    const questions = [];
    const blocks = text.split(/\n\s*\n/); // Split by blank lines

    for (const block of blocks) {
        const lines = block.trim().split('\n').map(l => l.trim()).filter(l => l);
        if (lines.length < 6) continue; // Need question + 4 options + answer

        let questionText = '';
        const options = [];
        let correctIndex = -1;

        for (const line of lines) {
            // Match question line
            if (/^(Question\s*[:.]?\s*)/i.test(line)) {
                questionText = line.replace(/^Question\s*[:.]?\s*/i, '').trim();
            }
            // Match options a) b) c) d)
            else if (/^[a-d]\s*[).\]]\s*/i.test(line)) {
                const optText = line.replace(/^[a-d]\s*[).\]]\s*/i, '').trim();
                options.push(optText);
            }
            // Match correct answer line
            else if (/^Correct\s*(Answer|Ans)\s*[:.]?\s*/i.test(line)) {
                const ansStr = line.replace(/^Correct\s*(Answer|Ans)\s*[:.]?\s*/i, '').trim().toLowerCase();
                const ansLetter = ansStr.replace(/[).\]\s]/g, '')[0];
                correctIndex = 'abcd'.indexOf(ansLetter);
            }
            // If no prefix, treat as question text continuation
            else if (!questionText && options.length === 0) {
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

// ============ TEMPLATE DOWNLOAD ============

function downloadTemplate() {
    const template = `Question: What is an array?
a) A linear data structure that stores elements in contiguous memory
b) A non-linear data structure
c) A type of graph
d) A type of tree
Correct Answer: a)

Question: What is the time complexity of binary search?
a) O(n)
b) O(log n)
c) O(n^2)
d) O(1)
Correct Answer: b)

Question: Which sorting algorithm has O(n log n) average time complexity?
a) Bubble Sort
b) Selection Sort
c) Merge Sort
d) Insertion Sort
Correct Answer: c)

Question: What data structure uses FIFO principle?
a) Stack
b) Queue
c) Array
d) Tree
Correct Answer: b)

Question: What is the worst-case time complexity of Quick Sort?
a) O(n)
b) O(n log n)
c) O(n^2)
d) O(log n)
Correct Answer: c)`;

    const blob = new Blob([template], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'question_template.txt';
    a.click();
    URL.revokeObjectURL(a.href);
}

// ============ QUESTION BUILDER ============

function addQuestion(qData = null) {
    questionCount++;
    const qb = document.getElementById('questionBuilder');
    const div = document.createElement('div');
    div.className = 'q-item';
    div.id = `q-${questionCount}`;
    div.innerHTML = `
    <div class="q-header">
      <span class="q-label">Q${questionCount}</span>
      <button class="btn btn-danger btn-sm" onclick="this.closest('.q-item').remove()" style="padding:4px 10px"><i class="fas fa-times"></i></button>
    </div>
    <input class="form-control" style="margin-bottom:8px" placeholder="Enter question text..." id="q${questionCount}_text" value="${qData?.question || ''}"/>
    <div class="options-list">
      ${['A', 'B', 'C', 'D'].map((l, i) => `
        <div class="option-row">
          <input type="radio" name="correct_${questionCount}" value="${i}" id="r${questionCount}_${i}" ${qData && qData.correctIndex === i ? 'checked' : ''}/>
          <label for="r${questionCount}_${i}" style="font-size:11px;font-weight:700;color:var(--primary);margin:0;text-transform:none;letter-spacing:0;min-width:16px">${l}</label>
          <input type="text" id="q${questionCount}_opt${i}" placeholder="Option ${l}" value="${qData?.options?.[i] || ''}"/>
        </div>`).join('')}
    </div>
    <div style="font-size:11px;color:var(--text-muted)">Select the radio button next to the correct answer.</div>`;
    qb.appendChild(div);
}

function clearQuestionBuilder() {
    document.getElementById('questionBuilder').innerHTML = '';
    questionCount = 0;
}

// ============ FILE UPLOAD HANDLER ============

function handleTxtUpload(file) {
    if (!file || !file.name.endsWith('.txt')) {
        window.showToast('Please upload a .txt file', 'error');
        return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
        const text = e.target.result;
        const questions = parseTxtQuestions(text);

        if (questions.length === 0) {
            window.showToast('No valid questions found in file. Check the format.', 'error');
            return;
        }

        // Clear existing questions and add parsed ones
        clearQuestionBuilder();
        questions.forEach(q => addQuestion(q));
        window.showToast(`✅ ${questions.length} questions loaded from file!`, 'success');

        // Update question count display
        const countEl = document.getElementById('uploadedCount');
        if (countEl) countEl.textContent = `${questions.length} questions loaded`;
    };
    reader.readAsText(file);
}

// ============ TEST MODAL ============

function openTestModal() {
    editingTestId = null;
    document.getElementById('testModalTitle').textContent = 'Create Test';
    document.getElementById('t_title').value = '';
    document.getElementById('t_subject').value = '';
    document.getElementById('t_duration').value = 30;
    document.getElementById('t_marks').value = 100;
    document.getElementById('t_mpq').value = 5;
    document.getElementById('t_desc').value = '';
    document.getElementById('t_startTime').value = '';
    document.getElementById('t_endTime').value = '';
    document.getElementById('t_isActive').checked = false;

    // Reset department checkboxes
    document.querySelectorAll('.dept-checkbox').forEach(cb => cb.checked = false);

    // Reset upload info
    const countEl = document.getElementById('uploadedCount');
    if (countEl) countEl.textContent = '';
    const fileInput = document.getElementById('txtFileInput');
    if (fileInput) fileInput.value = '';

    clearQuestionBuilder();
    addQuestion();
    addQuestion();
    document.getElementById('testModal').classList.add('active');
}

function closeTestModal() {
    document.getElementById('testModal').classList.remove('active');
    editingTestId = null;
}

function collectQuestions() {
    const questions = [];
    document.querySelectorAll('.q-item').forEach(item => {
        const id = item.id.replace('q-', '');
        const text = document.getElementById(`q${id}_text`)?.value.trim();
        if (!text) return;
        const opts = ['A', 'B', 'C', 'D'].map((_, i) => document.getElementById(`q${id}_opt${i}`)?.value.trim() || '');
        const correctEl = item.querySelector(`input[name="correct_${id}"]:checked`);
        questions.push({ question: text, options: opts, correctIndex: correctEl ? parseInt(correctEl.value) : 0 });
    });
    return questions;
}

async function saveTest() {
    const title = document.getElementById('t_title').value.trim();
    if (!title) { window.showToast('Enter test title', 'error'); return; }

    const btn = document.getElementById('saveTestBtn');
    btn.disabled = true;
    btn.innerHTML = '<span style="display:inline-block;width:14px;height:14px;border:2px solid rgba(255,255,255,.4);border-top-color:#fff;border-radius:50%;animation:spin .7s linear infinite;margin-right:6px"></span>Saving...';

    const questions = collectQuestions();

    // Get selected departments
    const departments = [];
    document.querySelectorAll('.dept-checkbox:checked').forEach(cb => {
        departments.push(cb.value);
    });

    // Get schedule times
    const startTimeVal = document.getElementById('t_startTime').value;
    const endTimeVal = document.getElementById('t_endTime').value;
    const isActive = document.getElementById('t_isActive').checked;

    const testData = {
        title,
        subject: document.getElementById('t_subject').value,
        duration: parseInt(document.getElementById('t_duration').value) || 30,
        totalMarks: parseInt(document.getElementById('t_marks').value) || 100,
        marksPerQuestion: parseInt(document.getElementById('t_mpq').value) || 5,
        description: document.getElementById('t_desc').value,
        questions,
        departments: departments.length > 0 ? departments : ['ALL'],
        isActive: isActive,
        startTime: startTimeVal ? Timestamp.fromDate(new Date(startTimeVal)) : null,
        endTime: endTimeVal ? Timestamp.fromDate(new Date(endTimeVal)) : null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
    };

    try {
        if (editingTestId) {
            delete testData.createdAt;
            await updateDoc(doc(db, 'tests', editingTestId), testData);
        } else {
            const newTestRef = await addDoc(collection(db, 'tests'), testData);
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
        window.showToast(editingTestId ? 'Test updated!' : 'Test created!', 'success');
    } catch (err) {
        window.showToast('Save failed: ' + err.message, 'error');
    }
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-save"></i> Save Test';
}

async function editTest(id) {
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

    // Set schedule
    if (t.startTime) {
        const d = t.startTime.toDate ? t.startTime.toDate() : new Date(t.startTime.seconds * 1000);
        document.getElementById('t_startTime').value = toLocalDateTimeString(d);
    } else {
        document.getElementById('t_startTime').value = '';
    }

    if (t.endTime) {
        const d = t.endTime.toDate ? t.endTime.toDate() : new Date(t.endTime.seconds * 1000);
        document.getElementById('t_endTime').value = toLocalDateTimeString(d);
    } else {
        document.getElementById('t_endTime').value = '';
    }

    document.getElementById('t_isActive').checked = t.isActive || false;

    // Set department checkboxes
    document.querySelectorAll('.dept-checkbox').forEach(cb => {
        cb.checked = (t.departments || []).includes(cb.value) || (t.departments || []).includes('ALL');
    });

    // Load questions
    clearQuestionBuilder();
    (t.questions || []).forEach(q => addQuestion(q));

    document.getElementById('testModal').classList.add('active');
}

function toLocalDateTimeString(date) {
    const offset = date.getTimezoneOffset();
    const local = new Date(date.getTime() - offset * 60 * 1000);
    return local.toISOString().slice(0, 16);
}

async function deleteTestById(id) {
    if (!confirm('Delete this test?')) return;
    try {
        await deleteDoc(doc(db, 'tests', id));
        window.showToast('Test deleted.', 'success');
    } catch {
        window.showToast('Delete failed.', 'error');
    }
}

async function toggleTestStatus(id) {
    const t = allTests.find(x => x.id === id);
    if (!t) return;
    try {
        await updateDoc(doc(db, 'tests', id), {
            isActive: !t.isActive,
            updatedAt: serverTimestamp()
        });
        window.showToast(t.isActive ? 'Test closed!' : 'Test opened!', 'success');
    } catch (err) {
        window.showToast('Update failed: ' + err.message, 'error');
    }
}

// ============ TEST STATUS HELPERS ============

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

    if (test.isActive) return { label: 'Open', class: 'chip-success', icon: 'fa-check-circle' };
    return { label: 'Draft', class: 'chip-info', icon: 'fa-file' };
}

function formatDateTime(ts) {
    if (!ts) return '-';
    const d = ts.toDate ? ts.toDate() : new Date(ts.seconds * 1000);
    return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ============ RENDER TESTS TABLE ============

function renderTests(tests) {
    allTests = tests;
    const body = document.getElementById('testsBody');
    if (!tests.length) {
        body.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:32px;color:var(--text-muted)">No tests yet. Create one!</td></tr>`;
        return;
    }
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
        <button class="icon-action icon-toggle" onclick="toggleTestStatus('${t.id}')" title="${t.isActive ? 'Close Test' : 'Open Test'}">
          <i class="fas ${t.isActive ? 'fa-toggle-on' : 'fa-toggle-off'}" style="color:${t.isActive ? 'var(--success)' : 'var(--text-muted)'}"></i>
        </button>
        <button class="icon-action icon-edit" onclick="editTest('${t.id}')" title="Edit"><i class="fas fa-edit"></i></button>
        <button class="icon-action icon-del" onclick="deleteTestById('${t.id}')" title="Delete"><i class="fas fa-trash"></i></button>
      </div></td>
    </tr>`;
    }).join('');
}

// ============ EXPORTS ============

export {
    allTests, editingTestId, questionCount,
    parseTxtQuestions, downloadTemplate,
    addQuestion, clearQuestionBuilder, handleTxtUpload,
    openTestModal, closeTestModal, saveTest, editTest,
    deleteTestById, toggleTestStatus,
    getTestStatus, formatDateTime, renderTests,
    collectQuestions
};
