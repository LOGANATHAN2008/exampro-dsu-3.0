// theme.js - Global Theme Logic

// 1. Immediately apply the theme to the <html> tag to prevent flash of unstyled content (FOUC)
(function() {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'light') {
        document.documentElement.classList.add('light-mode');
    }
})();

// 2. Global Toggle Function
window.toggleTheme = function() {
    const htmlElement = document.documentElement;
    const body = document.body;
    let btnIcons = document.querySelectorAll('#themeToggleBtn i, .mobile-theme-toggle i');
    
    if (htmlElement.classList.contains('light-mode')) {
        // Switch to Dark
        htmlElement.classList.remove('light-mode');
        if (body) body.classList.remove('light-mode'); // for safety if any script uses body
        
        btnIcons.forEach(btnIcon => {
            btnIcon.className = 'fas fa-moon';
            btnIcon.style.color = '#6c63ff'; 
        });
        localStorage.setItem('theme', 'dark');
    } else {
        // Switch to Light
        htmlElement.classList.add('light-mode');
        if (body) body.classList.add('light-mode'); // for safety if any script uses body
        
        btnIcons.forEach(btnIcon => {
            btnIcon.className = 'fas fa-sun';
            btnIcon.style.color = '#f59e0b'; 
        });
        localStorage.setItem('theme', 'light');
    }
};

// 3. Update the icon correctly once the DOM loads
window.addEventListener('DOMContentLoaded', () => {
    // Keep body in sync just in case
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'light') {
        document.body.classList.add('light-mode');
    }

    const btnIcons = document.querySelectorAll('#themeToggleBtn i, .mobile-theme-toggle i');
    btnIcons.forEach(btnIcon => {
        if (savedTheme === 'light') {
            btnIcon.className = 'fas fa-sun';
            btnIcon.style.color = '#f59e0b';
        } else {
            btnIcon.className = 'fas fa-moon';
            btnIcon.style.color = '#6c63ff';
        }
    });
});

// 4. Inject Mobile Bottom Navigation
window.addEventListener('DOMContentLoaded', () => {
    // Only inject if not already present
    if (document.querySelector('.mobile-bottom-nav')) return;

    // Define the navigation items
    const navItems = [
        { name: 'Home', icon: 'fa-home', url: 'dashboard.html' },
        { name: 'Materials', icon: 'fa-book-reader', url: 'materials.html' },
        { name: 'Tests', icon: 'fa-clipboard-check', url: 'test.html' },
        { name: 'Results', icon: 'fa-chart-bar', url: 'result.html' },
        { name: 'Profile', icon: 'fa-user', url: 'profile.html' }
    ];
    
    // Determine current page index
    let currentPage = window.location.pathname.split('/').pop();
    if (!currentPage) currentPage = 'dashboard.html';
    
    // Do not inject navigation on authentication or standalone full-screen apps (like chats)
    if (['', 'index.html', 'about.html', 'login.html', 'register.html', 'admin.html', 'faculty.html', 'chats.html'].includes(currentPage.split('?')[0])) return;
    
    // Background Page Prefetching for Ultra-Fast Instant Transitions
    const prefetchPages = ['dashboard.html', 'materials.html', 'test.html', 'result.html', 'profile.html'];
    prefetchPages.forEach(p => {
        if (p !== currentPage) {
            const link = document.createElement('link');
            link.rel = 'prefetch';
            link.href = p;
            document.head.appendChild(link);
        }
    });

    const nav = document.createElement('nav');
    nav.className = 'mobile-bottom-nav';

    navItems.forEach(item => {
        const a = document.createElement('a');
        a.href = item.url;
        a.className = 'nav-item';
        
        // Mark active if matches current page
        if (currentPage === item.url || (currentPage === '' && item.url === 'dashboard.html')) {
            a.classList.add('active');
        }

        // Instant visual active state on tap (0ms latency response)
        a.addEventListener('click', (e) => {
            document.querySelectorAll('.mobile-bottom-nav .nav-item').forEach(el => el.classList.remove('active'));
            a.classList.add('active');
        });

        let iconHtml = '<i class="fas ' + item.icon + '"></i>';
        if (item.name === 'Profile') {
            const userPhoto = localStorage.getItem('userPhoto');
            if (userPhoto) {
                iconHtml = '<img src="' + userPhoto + '" style="width: 20px; height: 20px; border-radius: 50%; object-fit: cover; margin-bottom: 2px;">';
            }
        }

        a.innerHTML = iconHtml + '<span class="nav-text">' + item.name + '</span>';
        nav.appendChild(a);
    });

    document.body.appendChild(nav);
});

// 5. Swipe Navigation (iOS style)
window.addEventListener('DOMContentLoaded', () => {
    const pages = [
        'dashboard.html',
        'materials.html',
        'test.html',
        'result.html',
        'profile.html'
    ];
    
    // Determine current page index
    let currentPage = window.location.pathname.split('/').pop();
    if (!currentPage) currentPage = 'dashboard.html';
    
    let currentIndex = pages.indexOf(currentPage);
    
    // Only enable swipe if we are on one of the main nav pages
    if (currentIndex !== -1) {
        let touchstartX = 0;
        let touchendX = 0;
        let touchstartY = 0;
        let touchendY = 0;

        function handleGesture() {
            const xDiff = touchendX - touchstartX;
            const yDiff = touchendY - touchstartY;
            
            // Ensure the swipe is mostly horizontal, not a vertical scroll
            if (Math.abs(xDiff) > Math.abs(yDiff) && Math.abs(xDiff) > 50) {
                // Swiped Right (finger moved right) -> Go to PREV page
                if (xDiff > 0) {
                    if (currentIndex > 0) {
                        document.body.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
                        document.body.style.opacity = '0';
                        document.body.style.transform = 'translateX(20px)';
                        setTimeout(() => window.location.href = pages[currentIndex - 1], 150);
                    }
                } 
                // Swiped Left (finger moved left) -> Go to NEXT page
                else {
                    if (currentIndex < pages.length - 1) {
                        document.body.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
                        document.body.style.opacity = '0';
                        document.body.style.transform = 'translateX(-20px)';
                        setTimeout(() => window.location.href = pages[currentIndex + 1], 150);
                    }
                }
            }
        }

        let isDraggingNav = false;

        document.addEventListener('touchstart', e => {
            if (e.target.closest('.mobile-bottom-nav')) {
                isDraggingNav = true;
                touchstartX = e.changedTouches[0].screenX;
                touchstartY = e.changedTouches[0].screenY;
            } else {
                isDraggingNav = false;
            }
        }, { passive: true });

        document.addEventListener('touchend', e => {
            if (!isDraggingNav) return;
            touchendX = e.changedTouches[0].screenX;
            touchendY = e.changedTouches[0].screenY;
            handleGesture();
            isDraggingNav = false;
        }, { passive: true });
    }
});

// 6. Staggered Sidebar Animation Delays (Fast 15ms waterfall)
window.addEventListener('DOMContentLoaded', () => {
    const animateElements = document.querySelectorAll('.sidebar .nav-label, .sidebar .nav-item, .sidebar-user');
    animateElements.forEach((el, index) => {
        el.style.animationDelay = (index * 0.015) + 's';
    });
});

// 7. Staggered Card Delays (Ultra Snappy micro-delays)
const cardObserver = new MutationObserver((mutations) => {
    let addedCards = [];
    mutations.forEach(m => {
        m.addedNodes.forEach(node => {
            if (node.nodeType === 1) {
                if (node.matches && node.matches('.stat-card, .course-card, .test-card, .chart-card, .history-card, .review-card, .dsh-card, .result-hero, .stats-row, .material-card')) {
                    addedCards.push(node);
                }
                if (node.querySelectorAll) {
                    const children = node.querySelectorAll('.stat-card, .course-card, .test-card, .chart-card, .history-card, .review-card, .dsh-card, .result-hero, .stats-row, .material-card');
                    children.forEach(c => addedCards.push(c));
                }
            }
        });
    });
    
    if (addedCards.length > 0) {
        addedCards.forEach((card, index) => {
            card.style.animationDelay = (Math.min(index * 0.025, 0.12)) + 's';
        });
    }
});

if (document.body) {
    cardObserver.observe(document.body, { childList: true, subtree: true });
} else {
    document.addEventListener('DOMContentLoaded', () => {
        if (document.body) cardObserver.observe(document.body, { childList: true, subtree: true });
    });
}

// Static elements already in DOM
window.addEventListener('DOMContentLoaded', () => {
    const cards = document.querySelectorAll('.stat-card, .course-card, .test-card, .chart-card, .history-card, .review-card, .dsh-card, .result-hero, .stats-row, .material-card');
    cards.forEach((card, index) => {
        if (!card.style.animationDelay) {
            card.style.animationDelay = (Math.min(index * 0.025, 0.12)) + 's';
        }
    });
});

// Mark app as loaded
window.addEventListener('load', () => {
    sessionStorage.setItem('appLoaded', 'true');
});

// Global iOS Alert Override
window.alert = function(msg) {
    const overlay = document.createElement('div');
    overlay.className = 'ios-alert-overlay';
    
    const textHtml = String(msg).replace(/\n/g, '<br>');

    overlay.innerHTML = `
        <div class="ios-alert-box">
            <div class="ios-alert-title">ExamPro says</div>
            <div class="ios-alert-message">${textHtml}</div>
            <div class="ios-alert-buttons">
                <button class="ios-alert-btn" onclick="this.closest('.ios-alert-overlay').remove()">OK</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
};

// --- Global Notification Sound ---
window.playNotification = function() {
    let audio = document.getElementById('globalNotificationAudio');
    if (!audio) {
        audio = document.createElement('audio');
        audio.id = 'globalNotificationAudio';
        audio.src = 'notification.mp3';
        document.body.appendChild(audio);
    }
    audio.currentTime = 0;
    audio.play().catch(e => console.log('Audio play blocked:', e));
};
