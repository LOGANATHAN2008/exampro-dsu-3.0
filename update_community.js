const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', '..', 'community.html');
let html = fs.readFileSync(filePath, 'utf8');

const startStr = '<!-- Dashboard Section Wrapper -->';
const endStr = '</main>';

const startIndex = html.indexOf(startStr);
const endIndex = html.indexOf(endStr);

if (startIndex !== -1 && endIndex !== -1) {
    const newContent = `
        <!-- Community Sections Wrapper -->
        <div class="community-tabs" style="display:flex;gap:10px;margin-bottom:20px;overflow-x:auto;padding-bottom:10px;">
            <button class="comm-tab active" onclick="switchCommTab('chat')"><i class="fas fa-comments"></i> Dept Chat</button>
            <button class="comm-tab" onclick="switchCommTab('projects')"><i class="fas fa-project-diagram"></i> Projects</button>
            <button class="comm-tab" onclick="switchCommTab('study')"><i class="fas fa-users"></i> Study Groups</button>
            <button class="comm-tab" onclick="switchCommTab('polls')"><i class="fas fa-poll"></i> Polls</button>
            <button class="comm-tab" onclick="switchCommTab('forum')"><i class="fas fa-comments-dollar"></i> Forum</button>
            <button class="comm-tab" onclick="switchCommTab('lostfound')"><i class="fas fa-search-location"></i> Lost & Found</button>
        </div>

        <style>
            .comm-tab { padding: 10px 15px; border-radius: 8px; border: 1px solid var(--glass-border); background: var(--bg1); cursor: pointer; color: var(--text-color); white-space: nowrap; }
            .comm-tab.active { background: var(--primary); color: white; border-color: var(--primary); }
            .comm-section { display: none; }
            .comm-section.active { display: block; }
            .chat-box { height: 400px; overflow-y: auto; background: var(--bg2); border-radius: 12px; padding: 15px; margin-bottom: 15px; border: 1px solid var(--glass-border); display: flex; flex-direction: column; gap: 10px; }
            .chat-msg { max-width: 80%; padding: 10px 15px; border-radius: 15px; font-size: 14px; line-height: 1.4; position: relative; }
            .chat-msg.mine { align-self: flex-end; background: var(--primary); color: white; border-bottom-right-radius: 4px; }
            .chat-msg.others { align-self: flex-start; background: var(--bg3); color: var(--text-color); border-bottom-left-radius: 4px; border: 1px solid var(--glass-border); }
            .chat-msg .sender { font-size: 11px; opacity: 0.8; margin-bottom: 4px; font-weight: 600; }
            .chat-msg .time { font-size: 10px; opacity: 0.6; text-align: right; margin-top: 4px; }
            .chat-input-area { display: flex; gap: 10px; }
            .chat-input-area input { flex: 1; padding: 12px 15px; border-radius: 8px; border: 1px solid var(--glass-border); background: var(--bg1); color: var(--text-color); }
            .chat-input-area button { padding: 0 20px; border-radius: 8px; background: var(--primary); color: white; border: none; cursor: pointer; font-weight: 600; transition: 0.2s; }
            .chat-input-area button:hover { background: var(--primary-dark); }
            .community-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 20px; margin-top: 20px; }
            .comm-card { background: var(--bg1); border: 1px solid var(--glass-border); border-radius: 12px; padding: 20px; box-shadow: 0 4px 15px rgba(0,0,0,0.05); }
            .comm-card h3 { margin-bottom: 10px; font-size: 18px; color: var(--text-color); }
            .comm-card p { font-size: 14px; color: var(--text-muted); margin-bottom: 15px; line-height: 1.5; }
            .comm-card .meta { display: flex; justify-content: space-between; font-size: 12px; color: var(--text-muted); margin-bottom: 15px; padding-bottom: 15px; border-bottom: 1px solid var(--glass-border); }
            .comm-card button { width: 100%; padding: 10px; border-radius: 8px; font-weight: 600; cursor: pointer; transition: 0.2s; }
            .btn-report { background: none; border: none; color: var(--error); font-size: 12px; cursor: pointer; position: absolute; top: 10px; right: -25px; opacity: 0; transition: 0.2s; }
            .chat-msg:hover .btn-report { opacity: 1; }
        </style>

        <section id="sec-chat" class="comm-section active">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 20px;">
                <h2><i class="fas fa-comments"></i> <span id="chatDeptName">Your Department</span> Chat</h2>
                <span class="badge" style="background:var(--success);color:white;padding:5px 10px;border-radius:20px;font-size:12px;">Live</span>
            </div>
            <div id="chatBox" class="chat-box">
                <div style="text-align:center; color:var(--text-muted); margin-top: 20px;">Loading messages...</div>
            </div>
            <div class="chat-input-area">
                <input type="text" id="chatInput" placeholder="Type your message..." onkeypress="if(event.key === 'Enter') sendChatMessage()">
                <button onclick="sendChatMessage()"><i class="fas fa-paper-plane"></i></button>
            </div>
        </section>

        <section id="sec-projects" class="comm-section">
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <h2><i class="fas fa-project-diagram"></i> Project Team Finder</h2>
                <button class="btn-primary" onclick="openProjectModal()"><i class="fas fa-plus"></i> Post Project</button>
            </div>
            <div id="projectsGrid" class="community-grid"></div>
        </section>

        <section id="sec-study" class="comm-section">
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <h2><i class="fas fa-users"></i> Study Groups</h2>
                <button class="btn-primary" onclick="openStudyModal()"><i class="fas fa-plus"></i> Create Group</button>
            </div>
            <div id="studyGrid" class="community-grid"></div>
        </section>

        <section id="sec-polls" class="comm-section">
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <h2><i class="fas fa-poll"></i> Student Polls</h2>
                <button class="btn-primary" onclick="openPollModal()"><i class="fas fa-plus"></i> Create Poll</button>
            </div>
            <div id="pollsGrid" class="community-grid"></div>
        </section>

        <section id="sec-forum" class="comm-section">
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <h2><i class="fas fa-comments-dollar"></i> Discussion Forum</h2>
                <button class="btn-primary" onclick="openForumModal()"><i class="fas fa-plus"></i> New Thread</button>
            </div>
            <div id="forumList" style="margin-top:20px; display:flex; flex-direction:column; gap:15px;"></div>
        </section>

        <section id="sec-lostfound" class="comm-section">
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <h2><i class="fas fa-search-location"></i> Lost & Found</h2>
                <button class="btn-primary" onclick="openLostFoundModal()"><i class="fas fa-plus"></i> Report Item</button>
            </div>
            <div id="lostFoundGrid" class="community-grid"></div>
        </section>
        
        <script>
            function switchCommTab(tabId) {
                document.querySelectorAll('.comm-tab').forEach(b => b.classList.remove('active'));
                document.querySelectorAll('.comm-section').forEach(s => s.classList.remove('active'));
                
                event.currentTarget.classList.add('active');
                document.getElementById('sec-' + tabId).classList.add('active');
            }
        </script>
    `;

    html = html.substring(0, startIndex) + newContent + '\n    ' + html.substring(endIndex);
    fs.writeFileSync(filePath, html);
    console.log('Replaced successfully!');
} else {
    console.log('Could not find markers');
}
