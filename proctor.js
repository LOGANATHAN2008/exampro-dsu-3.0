/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║           ExamPro DSU — AI Proctoring Module (proctor.js)        ║
 * ║  Modular · Lightweight · Plug-and-play for any exam page         ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 * Usage:
 *   await ExamProctor.init({ db, currentUser, selectedTest, onTerminate });
 *   ExamProctor.showGuidelines(onConfirm, onCancel);
 *   ExamProctor.start();   // call after exam view is shown + webcam confirmed
 *   ExamProctor.stop();    // call on exam submit
 *   ExamProctor.getLog();  // returns full violation log array
 *
 * Dependencies:
 *   face-api.js loaded dynamically via CDN (no install needed)
 */

const ExamProctor = (() => {
    'use strict';

    // ─── State ──────────────────────────────────────────────────────────
    const _state = {
        active: false,
        webcamStream: null,
        faceDetectionInterval: null,
        lookAwayTimer: null,
        lookAwayStart: null,
        tabWarnings: 0,
        faceWarnings: 0,
        violations: [],
        faceApiReady: false,
        db: null,
        currentUser: null,
        selectedTest: null,
        onTerminate: null,
        _tabSwitchHandler: null,
        _blurHandler: null,
    };

    // ─── Config ─────────────────────────────────────────────────────────
    const CONFIG = {
        TAB_WARN_LIMIT: 3,
        FACE_CHECK_MS: 4000,
        LOOK_AWAY_MS: 5000,
        FACE_API_CDN: 'https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/dist/face-api.min.js',
        FACE_API_MODELS: 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/',
    };

    // ═══════════════════════════════════════════════════════════════════
    // PUBLIC API
    // ═══════════════════════════════════════════════════════════════════

    async function init(options = {}) {
        _state.db           = options.db || null;
        _state.currentUser  = options.currentUser || null;
        _state.selectedTest = options.selectedTest || null;
        _state.onTerminate  = options.onTerminate || (() => {});
        _injectStyles();
        _injectDOM();
        await _loadFaceApi();
    }

    async function start() {
        if (_state.active) return true;
        const camOk = await _requestWebcam();
        if (!camOk) { _showCamBlocked(); return false; }
        _state.active = true;
        injectStatusBar();
        _updateStatus('green');
        _startFaceDetection();
        _registerTabListeners();
        _registerLockdownListeners();
        
        try {
            if (document.documentElement.requestFullscreen) {
                await document.documentElement.requestFullscreen();
            }
        } catch (e) { console.warn("Fullscreen request failed", e); }
        
        _showToast('🔒 AI Proctoring is active. Fullscreen locked.', 'info-proctor', 4500);
        return true;
    }

    function stop() {
        _state.active = false;
        if (_state.webcamStream) {
            _state.webcamStream.getTracks().forEach(t => t.stop());
            _state.webcamStream = null;
        }
        clearInterval(_state.faceDetectionInterval);
        clearTimeout(_state.lookAwayTimer);
        if (_state._tabSwitchHandler)
            document.removeEventListener('visibilitychange', _state._tabSwitchHandler);
        if (_state._blurHandler)
            window.removeEventListener('blur', _state._blurHandler);
        if (_state._fullscreenHandler) {
            document.removeEventListener('fullscreenchange', _state._fullscreenHandler);
            document.removeEventListener('webkitfullscreenchange', _state._fullscreenHandler);
        }
            
        _removeLockdownListeners();
        
        if (document.fullscreenElement) {
            document.exitFullscreen().catch(e => console.warn(e));
        }
        
        const widget = document.getElementById('proctor-webcam-widget');
        if (widget) widget.style.display = 'none';
    }

    function getLog()     { return [..._state.violations]; }
    function getSummary() {
        return {
            tabViolations:  _state.tabWarnings,
            faceViolations: _state.faceWarnings,
            total:          _state.violations.length,
            flagged:        _state.tabWarnings >= 2 || _state.faceWarnings >= 3,
        };
    }

    function showGuidelines(onConfirm, onCancel) {
        const modal = document.getElementById('proctor-guidelines');
        if (!modal) return;
        modal.classList.add('show');
        document.getElementById('proctor-guide-start').onclick  = () => { modal.classList.remove('show'); onConfirm && onConfirm(); };
        document.getElementById('proctor-guide-cancel').onclick = () => { modal.classList.remove('show'); onCancel  && onCancel();  };
    }

    function injectStatusBar() {
        if (document.getElementById('proctor-status-bar')) return;
        const header = document.querySelector('.test-header');
        if (!header) return;
        const bar = document.createElement('div');
        bar.id = 'proctor-status-bar';
        bar.className = 'ps-green';
        bar.innerHTML = '<span class="ps-dot"></span>Proctoring';
        header.appendChild(bar);
    }

    async function _dismissTabWarning() {
        try {
            if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
            else if (document.documentElement.webkitRequestFullscreen) await document.documentElement.webkitRequestFullscreen();
        } catch (e) {
            alert('Fullscreen mode is required. Please allow fullscreen to continue.');
            return;
        }
        document.getElementById('proctor-tab-overlay').classList.remove('show');
        const btn = document.querySelector('.proctor-tab-btn');
        if (btn) btn.style.display = '';
    }

    async function saveViolationLog() { return _persistLog(); }

    // ═══════════════════════════════════════════════════════════════════
    // PRIVATE: DOM
    // ═══════════════════════════════════════════════════════════════════

    function _injectStyles() {
        if (document.getElementById('proctor-styles')) return;
        const s = document.createElement('style');
        s.id = 'proctor-styles';
        s.textContent = `
/* ── Webcam Widget ── */
#proctor-webcam-widget{position:fixed;bottom:80px;right:20px;width:150px;height:150px;border-radius:16px;overflow:hidden;border:2px solid rgba(108,99,255,.6);box-shadow:0 8px 32px rgba(0,0,0,.5);z-index:8000;cursor:move;background:#000000;user-select:none}
#proctor-webcam-widget video{width:100%;height:100%;object-fit:cover;transform:scaleX(-1)}
#proctor-webcam-widget canvas{position:absolute;top:0;left:0;width:100%;height:100%;transform:scaleX(-1);pointer-events:none}
.proctor-wlabel{position:absolute;bottom:0;left:0;right:0;background:rgba(0,0,0,.65);font-size:9px;font-weight:700;text-align:center;padding:4px 0;color:rgba(255,255,255,.7);letter-spacing:.5px;text-transform:uppercase;pointer-events:none}
.proctor-wdot{position:absolute;top:8px;right:8px;width:8px;height:8px;border-radius:50%;background:#10b981;box-shadow:0 0 6px #10b981;animation:proc-pulse 2s ease-in-out infinite;pointer-events:none}
.proctor-wdot.yellow{background:#f59e0b;box-shadow:0 0 6px #f59e0b}
.proctor-wdot.red{background:#ef4444;box-shadow:0 0 6px #ef4444;animation:proc-fast .5s ease-in-out infinite}

/* ── Status Bar ── */
#proctor-status-bar{display:flex;align-items:center;gap:6px;padding:5px 12px;background:rgba(15,15,35,.9);border:1px solid rgba(255,255,255,.08);border-radius:20px;font-size:11px;font-weight:600;color:#94a3b8;white-space:nowrap}
#proctor-status-bar .ps-dot{width:7px;height:7px;border-radius:50%;flex-shrink:0}
#proctor-status-bar.ps-green .ps-dot{background:#10b981;box-shadow:0 0 5px #10b981}
#proctor-status-bar.ps-yellow .ps-dot{background:#f59e0b;box-shadow:0 0 5px #f59e0b}
#proctor-status-bar.ps-red .ps-dot{background:#ef4444;box-shadow:0 0 5px #ef4444}
#proctor-status-bar.ps-green{color:#10b981;border-color:rgba(16,185,129,.3)}
#proctor-status-bar.ps-yellow{color:#f59e0b;border-color:rgba(245,158,11,.3)}
#proctor-status-bar.ps-red{color:#ef4444;border-color:rgba(239,68,68,.3);animation:proc-fast .6s ease-in-out infinite}

/* ── Tab Warning Overlay ── */
#proctor-tab-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.92);backdrop-filter:blur(14px);z-index:9900;align-items:center;justify-content:center;text-align:center;padding:20px;font-family:'Inter',sans-serif;flex-direction:column}
#proctor-tab-overlay.show{display:flex}
.ptab-icon{font-size:72px;color:#ef4444;margin-bottom:16px;animation:proc-pulse 1s ease-in-out infinite}
.ptab-count{font-size:56px;font-weight:900;color:#ef4444;margin-bottom:4px}
.ptab-title{font-size:26px;font-weight:800;color:#ef4444;margin-bottom:10px}
.ptab-desc{font-size:14px;color:#94a3b8;max-width:420px;margin-bottom:28px;line-height:1.7}
.proctor-tab-btn{padding:13px 36px;background:linear-gradient(135deg,#6c63ff,#4f46e5);border:none;border-radius:12px;color:#fff;font-size:15px;font-weight:600;cursor:pointer;font-family:'Inter',sans-serif;transition:all .3s}
.proctor-tab-btn:hover{transform:translateY(-2px);box-shadow:0 8px 20px rgba(108,99,255,.4)}

/* ── Camera Blocked ── */
#proctor-cam-blocked{display:none;position:fixed;inset:0;background:rgba(15,15,35,.97);z-index:9950;align-items:center;justify-content:center;text-align:center;padding:24px;flex-direction:column;font-family:'Inter',sans-serif}
#proctor-cam-blocked.show{display:flex}
.pcb-icon{font-size:80px;margin-bottom:20px}
.pcb-title{font-size:24px;font-weight:800;color:#ef4444;margin-bottom:12px}
.pcb-desc{font-size:14px;color:#94a3b8;max-width:400px;line-height:1.7;margin-bottom:28px}
.pcb-btn{padding:12px 32px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.15);border-radius:12px;color:#e2e8f0;font-size:14px;font-weight:600;cursor:pointer;font-family:'Inter',sans-serif}

/* ── Guidelines Modal ── */
#proctor-guidelines{display:none;position:fixed;inset:0;background:rgba(0,0,0,.85);backdrop-filter:blur(10px);z-index:9800;align-items:center;justify-content:center;padding:16px}
#proctor-guidelines.show{display:flex}
.pg-card{background:rgba(26,26,62,.98);border:1px solid rgba(255,255,255,.1);border-radius:20px;padding:36px;max-width:520px;width:100%;font-family:'Inter',sans-serif;color:#e2e8f0;max-height:90vh;overflow-y:auto}
.pg-head{display:flex;align-items:center;gap:14px;margin-bottom:20px}
.pg-head-icon{font-size:36px}
.pg-head h2{font-size:20px;font-weight:800}
.pg-head p{font-size:12px;color:#94a3b8;margin-top:2px}
.pg-rules{list-style:none;padding:0;margin:0 0 24px;display:grid;gap:10px}
.pg-rules li{display:flex;align-items:flex-start;gap:12px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.07);border-radius:12px;padding:12px 14px;font-size:13px}
.pg-rules li .pgi{font-size:18px;flex-shrink:0;margin-top:1px}
.pg-rules li strong{display:block;font-weight:700;margin-bottom:2px;color:#fff}
.pg-rules li span{color:#94a3b8;line-height:1.5}
.pg-foot{display:flex;gap:12px}
.pg-btn-cancel{flex:1;padding:12px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12);border-radius:12px;color:#e2e8f0;font-family:'Inter',sans-serif;font-size:14px;cursor:pointer}
.pg-btn-start{flex:2;padding:12px;background:linear-gradient(135deg,#10b981,#059669);border:none;border-radius:12px;color:#fff;font-family:'Inter',sans-serif;font-size:14px;font-weight:700;cursor:pointer;transition:all .2s}
.pg-btn-start:hover{transform:translateY(-2px);box-shadow:0 8px 20px rgba(16,185,129,.35)}

/* ── Termination Screen ── */
#proctor-terminated{display:none;position:fixed;inset:0;background:rgba(15,15,35,.98);z-index:9990;align-items:center;justify-content:center;text-align:center;flex-direction:column;padding:24px;font-family:'Inter',sans-serif}
#proctor-terminated.show{display:flex}
.pt-icon{font-size:80px;margin-bottom:20px;color:#ef4444;animation:proc-pulse 1.2s ease-in-out infinite}
.pt-title{font-size:28px;font-weight:900;color:#ef4444;margin-bottom:12px}
.pt-desc{font-size:15px;color:#94a3b8;max-width:420px;line-height:1.7}

/* ── Proctoring Toasts ── */
#proctor-toasts{position:fixed;bottom:244px;right:20px;z-index:8500;display:flex;flex-direction:column;gap:8px;pointer-events:none}
.proctor-toast{padding:10px 16px;border-radius:12px;font-size:12px;font-weight:600;display:flex;align-items:center;gap:8px;max-width:260px;backdrop-filter:blur(10px);animation:proctor-in .3s ease;color:#fff;font-family:'Inter',sans-serif;pointer-events:all}
.proctor-toast.warn-proctor{background:rgba(239,68,68,.92)}
.proctor-toast.info-proctor{background:rgba(108,99,255,.92)}
.proctor-toast.ok-proctor{background:rgba(16,185,129,.92)}
.proctor-toast .ptc{margin-left:auto;cursor:pointer;opacity:.7;font-size:14px;flex-shrink:0}
.proctor-toast .ptc:hover{opacity:1}

@keyframes proc-pulse{0%,100%{opacity:1}50%{opacity:.4}}
@keyframes proc-fast{0%,100%{opacity:1}50%{opacity:.2}}
@keyframes proctor-in{from{transform:translateX(110%);opacity:0}to{transform:translateX(0);opacity:1}}
        `;
        document.head.appendChild(s);
    }

    function _injectDOM() {
        // Webcam Widget
        if (!document.getElementById('proctor-webcam-widget')) {
            const w = document.createElement('div');
            w.id = 'proctor-webcam-widget';
            w.style.display = 'none';
            w.innerHTML = `
                <video id="proctor-video" autoplay muted playsinline></video>
                <canvas id="proctor-canvas"></canvas>
                <div class="proctor-wdot" id="proctor-wdot"></div>
                <div class="proctor-wlabel">AI Proctoring</div>`;
            document.body.appendChild(w);
            _makeDraggable(w);
        }

        // Tab-Switch Overlay
        if (!document.getElementById('proctor-tab-overlay')) {
            const o = document.createElement('div');
            o.id = 'proctor-tab-overlay';
            o.innerHTML = `
                <i class="fas fa-exclamation-triangle ptab-icon"></i>
                <div class="ptab-count" id="proctor-tab-count">1</div>
                <div class="ptab-title">&#9888;&#65039; Tab Switch Detected!</div>
                <p class="ptab-desc" id="proctor-tab-desc">
                    You switched tabs, minimized the window, or exited fullscreen. This has been recorded.<br>
                    <strong id="proctor-warn-left">2 warnings remaining before auto-submit.</strong>
                </p>
                <button class="proctor-tab-btn" onclick="ExamProctor._dismissTabWarning()">
                    <i class="fas fa-arrow-left"></i>&nbsp; Return to Exam
                </button>`;
            document.body.appendChild(o);
        }

        // Camera Blocked
        if (!document.getElementById('proctor-cam-blocked')) {
            const b = document.createElement('div');
            b.id = 'proctor-cam-blocked';
            b.innerHTML = `
                <div class="pcb-icon">&#128247;</div>
                <div class="pcb-title">Camera Access Required</div>
                <p class="pcb-desc">Camera access is required to start this exam.<br>Please allow camera access in your browser and try again.</p>
                <button class="pcb-btn" onclick="location.reload()"><i class="fas fa-redo"></i>&nbsp; Retry</button>`;
            document.body.appendChild(b);
        }

        // Guidelines Modal
        if (!document.getElementById('proctor-guidelines')) {
            const g = document.createElement('div');
            g.id = 'proctor-guidelines';
            g.innerHTML = `
                <div class="pg-card">
                    <div class="pg-head">
                        <div class="pg-head-icon">&#129302;</div>
                        <div>
                            <h2>AI Proctoring Guidelines</h2>
                            <p>This exam uses AI-assisted proctoring. Please read carefully before starting.</p>
                        </div>
                    </div>
                    <ul class="pg-rules">
                        <li><span class="pgi">&#128247;</span><div><strong>Keep Your Face Visible</strong><span>Your face must be clearly visible throughout the exam. Leaving frame for more than 5 seconds will be logged.</span></div></li>
                        <li><span class="pgi">&#128683;</span><div><strong>No Other People</strong><span>Multiple faces in the frame will trigger a violation. Ensure you are alone in your workspace.</span></div></li>
                        <li><span class="pgi">&#128193;</span><div><strong>No Tab Switching</strong><span>Do not switch browser tabs, minimize the window, or open other apps. After 3 warnings, your exam is auto-submitted.</span></div></li>
                        <li><span class="pgi">&#128161;</span><div><strong>Good Lighting Required</strong><span>Sit in a well-lit area so the camera can detect your face clearly.</span></div></li>
                        <li><span class="pgi">&#128203;</span><div><strong>All Violations Are Logged</strong><span>Every proctoring event is recorded with timestamps and reviewed by faculty after submission.</span></div></li>
                    </ul>
                    <div class="pg-foot">
                        <button class="pg-btn-cancel" id="proctor-guide-cancel">Cancel</button>
                        <button class="pg-btn-start" id="proctor-guide-start"><i class="fas fa-camera"></i>&nbsp; Allow Camera &amp; Start Exam</button>
                    </div>
                </div>`;
            document.body.appendChild(g);
        }

        // Termination Screen
        if (!document.getElementById('proctor-terminated')) {
            const t = document.createElement('div');
            t.id = 'proctor-terminated';
            t.innerHTML = `
                <i class="fas fa-ban pt-icon"></i>
                <div class="pt-title">Exam Terminated</div>
                <p class="pt-desc">Your exam has been automatically submitted due to repeated proctoring violations.<br>This incident has been logged and will be reviewed by faculty.</p>`;
            document.body.appendChild(t);
        }

        // Toast Container
        if (!document.getElementById('proctor-toasts')) {
            const tc = document.createElement('div');
            tc.id = 'proctor-toasts';
            document.body.appendChild(tc);
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    // PRIVATE: WEBCAM
    // ═══════════════════════════════════════════════════════════════════

    async function _requestWebcam() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { width: 320, height: 240, facingMode: 'user' }, audio: false,
            });
            _state.webcamStream = stream;
            const video = document.getElementById('proctor-video');
            video.srcObject = stream;
            await new Promise(res => { video.onloadedmetadata = res; });
            await video.play();
            document.getElementById('proctor-webcam-widget').style.display = 'block';
            return true;
        } catch (err) {
            console.error('[ExamProctor] Webcam denied:', err);
            return false;
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    // PRIVATE: FACE-API.JS
    // ═══════════════════════════════════════════════════════════════════

    async function _loadFaceApi() {
        if (window.faceapi) { _state.faceApiReady = true; return; }
        return new Promise(resolve => {
            const sc = document.createElement('script');
            sc.src = CONFIG.FACE_API_CDN;
            sc.onload = async () => {
                try {
                    await Promise.all([
                        window.faceapi.nets.tinyFaceDetector.loadFromUri(CONFIG.FACE_API_MODELS),
                        window.faceapi.nets.faceLandmark68TinyNet.loadFromUri(CONFIG.FACE_API_MODELS),
                    ]);
                    _state.faceApiReady = true;
                    console.info('[ExamProctor] face-api.js ready ✓');
                } catch (e) {
                    console.warn('[ExamProctor] face-api models failed to load:', e);
                }
                resolve();
            };
            sc.onerror = () => { console.warn('[ExamProctor] face-api CDN failed.'); resolve(); };
            document.head.appendChild(sc);
        });
    }

    function _startFaceDetection() {
        if (!_state.faceApiReady) { console.warn('[ExamProctor] Face detection unavailable.'); return; }
        _state.faceDetectionInterval = setInterval(_detectFace, CONFIG.FACE_CHECK_MS);
    }

    async function _detectFace() {
        if (!_state.active || !_state.faceApiReady) return;
        const video = document.getElementById('proctor-video');
        if (!video || video.readyState < 2) return;
        try {
            const opts = new window.faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.3 });
            const detections = await window.faceapi.detectAllFaces(video, opts).withFaceLandmarks(true);
            const count = detections.length;
            _drawOverlay(detections);

            if (count === 0) {
                _handleNoFace();
            } else if (count > 1) {
                _clearLookAway();
                _handleMultipleFaces(count);
            } else {
                _clearLookAway();
                _checkHeadPose(detections[0]);
                _setWidgetDot('');
            }
        } catch (e) {
            console.warn('[ExamProctor] Detection error:', e);
        }
    }

    function _drawOverlay(detections) {
        const canvas = document.getElementById('proctor-canvas');
        const video  = document.getElementById('proctor-video');
        if (!canvas || !video || !window.faceapi) return;
        window.faceapi.matchDimensions(canvas, { width: 150, height: 150 });
        const resized = window.faceapi.resizeResults(detections, { width: 150, height: 150 });
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, 150, 150);
        resized.forEach(d => {
            const b = d.detection.box;
            ctx.strokeStyle = detections.length > 1 ? '#ef4444' : '#10b981';
            ctx.lineWidth = 2;
            ctx.strokeRect(b.x, b.y, b.width, b.height);
        });
    }

    function _handleNoFace() {
        _setWidgetDot('yellow');
        if (_state.lookAwayStart) return; // timer already running
        _state.lookAwayStart = Date.now();
        _state.lookAwayTimer = setTimeout(() => {
            _logViolation('face', 'No face detected for 5+ seconds');
            _state.faceWarnings++;
            _showToast('&#9888;&#65039; Face not detected — please stay in frame', 'warn-proctor');
            _setWidgetDot(_state.faceWarnings >= 3 ? 'red' : 'yellow');
            _updateStatus(_state.faceWarnings >= 3 ? 'red' : 'yellow');
            _state.lookAwayStart = null;
        }, CONFIG.LOOK_AWAY_MS);
    }

    function _handleMultipleFaces(count) {
        _logViolation('face', `Multiple faces detected: ${count}`);
        _state.faceWarnings++;
        _showToast(`&#9888;&#65039; Multiple faces detected (${count}) — only you should be visible`, 'warn-proctor');
        _setWidgetDot('red');
        _updateStatus('red');
    }

    function _checkHeadPose(detection) {
        if (!detection.landmarks) return;
        const lm = detection.landmarks;
        const nose = lm.getNose();
        const le   = lm.getLeftEye();
        const re   = lm.getRightEye();
        if (!nose.length || !le.length || !re.length) return;
        const noseTip = nose[3];
        const midX = (le.reduce((a, p) => a + p.x, 0) / le.length + re.reduce((a, p) => a + p.x, 0) / re.length) / 2;
        const span  = Math.abs(re[0].x - le[re.length - 1 < le.length - 1 ? 0 : re.length - 1].x);
        const ratio = Math.abs(noseTip.x - midX) / (span || 1);

        if (ratio > 0.45) {
            // Looking sideways — start timer
            if (!_state.lookAwayStart) {
                _state.lookAwayStart = Date.now();
                _state.lookAwayTimer = setTimeout(() => {
                    _logViolation('face', 'Student looking away for 5+ seconds (head pose)');
                    _state.faceWarnings++;
                    _showToast('&#9888;&#65039; Please look at the screen — looking away detected', 'warn-proctor');
                    _setWidgetDot(_state.faceWarnings >= 3 ? 'red' : 'yellow');
                    _updateStatus(_state.faceWarnings >= 3 ? 'red' : 'yellow');
                    _state.lookAwayStart = null;
                }, CONFIG.LOOK_AWAY_MS);
            }
        } else {
            _clearLookAway();
        }
    }

    function _clearLookAway() {
        clearTimeout(_state.lookAwayTimer);
        _state.lookAwayStart = null;
    }

    // ═══════════════════════════════════════════════════════════════════
    // PRIVATE: TAB SWITCH
    // ═══════════════════════════════════════════════════════════════════

    function _registerTabListeners() {
        _state._tabSwitchHandler = _handleTabSwitch;
        _state._blurHandler      = _handleWindowBlur;
        _state._fullscreenHandler = _handleFullscreenChange;
        document.addEventListener('visibilitychange', _state._tabSwitchHandler);
        window.addEventListener('blur', _state._blurHandler);
        document.addEventListener('fullscreenchange', _state._fullscreenHandler);
        document.addEventListener('webkitfullscreenchange', _state._fullscreenHandler);
    }

    function _registerLockdownListeners() {
        _state._contextMenuHandler = (e) => { e.preventDefault(); };
        _state._keyDownHandler = (e) => {
            // Prevent F12, Ctrl+Shift+I, Ctrl+C, Ctrl+V, etc.
            if (
                e.key === 'F12' ||
                (e.ctrlKey && e.shiftKey && e.key === 'I') ||
                (e.ctrlKey && e.shiftKey && e.key === 'J') ||
                (e.ctrlKey && e.key === 'U') ||
                (e.ctrlKey && (e.key === 'c' || e.key === 'C' || e.key === 'v' || e.key === 'V'))
            ) {
                e.preventDefault();
            }
            
            // Auto submit if escape is pressed (if in fullscreen, this triggers resize/blur, but we can catch Esc directly too)
        };
        
        document.addEventListener('contextmenu', _state._contextMenuHandler);
        document.addEventListener('keydown', _state._keyDownHandler);
    }

    function _removeLockdownListeners() {
        if (_state._contextMenuHandler) document.removeEventListener('contextmenu', _state._contextMenuHandler);
        if (_state._keyDownHandler) document.removeEventListener('keydown', _state._keyDownHandler);
    }

    function _handleTabSwitch() {
        if (!_state.active || document.visibilityState !== 'hidden') return;
        _triggerTabWarning('tab');
    }

    function _handleWindowBlur() {
        if (!_state.active) return;
        setTimeout(() => { if (!document.hasFocus() && _state.active) _triggerTabWarning('blur'); }, 350);
    }

    function _handleFullscreenChange() {
        if (!_state.active) return;
        if (!document.fullscreenElement && !document.webkitFullscreenElement) {
            _triggerTabWarning('fullscreen');
        }
    }

    function _triggerTabWarning(reason) {
        _state.tabWarnings++;
        const desc = reason === 'fullscreen' ? 'Fullscreen exit / Tab switch' : 'Tab switch / window blur';
        _logViolation('tab', `${desc} — warning ${_state.tabWarnings}/${CONFIG.TAB_WARN_LIMIT}`);

        const remaining = CONFIG.TAB_WARN_LIMIT - _state.tabWarnings;
        document.getElementById('proctor-tab-count').textContent = _state.tabWarnings;

        if (_state.tabWarnings >= CONFIG.TAB_WARN_LIMIT) {
            // Terminal violation
            document.getElementById('proctor-tab-desc').innerHTML =
                'This is your <strong>final violation</strong>. Your exam is being submitted now.';
            document.querySelector('.proctor-tab-btn') && (document.querySelector('.proctor-tab-btn').style.display = 'none');
            document.getElementById('proctor-tab-overlay').classList.add('show');
            _updateStatus('red');
            _persistLog();
            setTimeout(() => {
                document.getElementById('proctor-tab-overlay').classList.remove('show');
                _showTerminated();
                _state.onTerminate();
            }, 3000);
        } else {
            document.getElementById('proctor-warn-left').textContent =
                `${remaining} warning${remaining !== 1 ? 's' : ''} remaining before auto-submit.`;
            document.getElementById('proctor-tab-overlay').classList.add('show');
            _updateStatus(remaining === 1 ? 'red' : 'yellow');
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    // PRIVATE: VIOLATION LOG
    // ═══════════════════════════════════════════════════════════════════

    function _logViolation(type, description) {
        const entry = { type, description, timestamp: new Date().toISOString(), count: _state.violations.length + 1 };
        _state.violations.push(entry);
        console.warn('[ExamProctor] Violation:', entry);
    }

    async function _persistLog() {
        const log     = getLog();
        const summary = getSummary();

        // Always log to console for faculty review
        console.group('[ExamProctor] Proctoring Violation Report');
        console.table(log);
        console.log('Summary:', summary);
        console.groupEnd();

        // Save to Firestore if available
        if (_state.db && _state.currentUser && _state.selectedTest) {
            try {
                // Dynamic import works inside <script type="module"> context
                const { addDoc, collection, serverTimestamp } = await import(
                    'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js'
                );
                await addDoc(collection(_state.db, 'proctoringLogs'), {
                    studentId:    _state.currentUser.uid,
                    studentEmail: _state.currentUser.email || '',
                    testId:       _state.selectedTest.id,
                    testTitle:    _state.selectedTest.title || '',
                    violations:   log,
                    summary,
                    submittedAt:  serverTimestamp(),
                });
                console.info('[ExamProctor] Log saved to Firestore proctoringLogs ✓');
            } catch (e) {
                console.error('[ExamProctor] Firestore save error:', e);
            }
        }
        return log;
    }

    // ═══════════════════════════════════════════════════════════════════
    // PRIVATE: UI HELPERS
    // ═══════════════════════════════════════════════════════════════════

    function _showCamBlocked()  { document.getElementById('proctor-cam-blocked').classList.add('show'); }
    function _showTerminated()  { stop(); document.getElementById('proctor-terminated').classList.add('show'); }

    function _updateStatus(level) {
        const bar = document.getElementById('proctor-status-bar');
        if (!bar) return;
        bar.className = `ps-${level}`;
        bar.id = 'proctor-status-bar';
        const labels = { green: 'Proctoring: Clean', yellow: 'Proctoring: Warning', red: 'Proctoring: Flagged' };
        bar.innerHTML = `<span class="ps-dot"></span>${labels[level]}`;
    }

    function _setWidgetDot(cls) {
        const dot = document.getElementById('proctor-wdot');
        if (dot) dot.className = `proctor-wdot${cls ? ' ' + cls : ''}`;
    }

    function _showToast(msg, type, duration = 5000) {
        const c = document.getElementById('proctor-toasts');
        if (!c) return;
        const t = document.createElement('div');
        t.className = `proctor-toast ${type}`;
        t.innerHTML = `<span>${msg}</span><span class="ptc" onclick="this.parentElement.remove()">&#x2715;</span>`;
        c.appendChild(t);
        setTimeout(() => t.remove(), duration);
    }

    function _makeDraggable(el) {
        let drag = false, sx, sy, ox, oy;
        el.addEventListener('mousedown', e => {
            if (['VIDEO','CANVAS'].includes(e.target.tagName)) return;
            drag = true; sx = e.clientX; sy = e.clientY;
            ox = el.offsetLeft; oy = el.offsetTop;
            el.style.cursor = 'grabbing';
        });
        document.addEventListener('mousemove', e => {
            if (!drag) return;
            el.style.right = 'auto'; el.style.bottom = 'auto';
            el.style.left = `${ox + e.clientX - sx}px`;
            el.style.top  = `${oy + e.clientY - sy}px`;
        });
        document.addEventListener('mouseup', () => { drag = false; el.style.cursor = 'move'; });
    }

    // ─── Expose ─────────────────────────────────────────────────────────
    return { init, start, stop, getLog, getSummary, showGuidelines, injectStatusBar, saveViolationLog, _dismissTabWarning };

})();
