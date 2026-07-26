# ExamPro DSU 3.0 🎓

ExamPro DSU 3.0 is a premium, real-time college examination and student portal system. It offers a secure and seamless experience for both students and administrators with modern glassmorphism UI/UX design.

## 🚀 Key Features

*   **Secure Authentication:** Passwordless OTP verification and Email/Password login powered by Firebase.
*   **Student Portal:** Real-time dashboard showing exam schedules, results, analytics (Chart.js), and notifications.
*   **Admin/Faculty Panel:** Comprehensive control over student data, department admins, exam creation, and result publishing.
*   **Live Online Examinations:** Secure test-taking environment with auto-grading, strict proctoring, and malpractice tracking.
*   **Communication Hub:** Direct messaging and global announcements with automated Email Alerts (integrated with EmailJS).
*   **Result Generation:** Instant result calculation and downloadable PDF reports (jsPDF).
*   **Premium UI/UX:** Dynamic light/dark themes, glassmorphism elements, and smooth micro-animations.

## 🛠️ Technology Stack

*   **Frontend:** HTML5, CSS3 (Custom Theme Variables), Vanilla JavaScript
*   **Backend & Database:** Firebase Authentication, Cloud Firestore (NoSQL)
*   **Integrations:** EmailJS (for OTP and Alert emails)
*   **Libraries:** Chart.js (Analytics), jsPDF (Report Generation)

## ⚙️ Setup & Installation

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/LOGANATHAN2008/exampro-dsu-3.0.git
    cd exampro-dsu-3.0
    ```
2.  **Firebase Configuration:**
    *   Create a project on [Firebase Console](https://console.firebase.google.com/).
    *   Enable **Firestore Database** and **Authentication** (Email/Password).
    *   Update `js/firebase-config.js` with your Firebase credentials.
    *   Deploy the `firestore.rules` file to your Firebase database to secure collections.
3.  **EmailJS Setup (Optional but recommended):**
    *   Create an [EmailJS](https://www.emailjs.com/) account.
    *   Set up templates for Welcome emails and OTPs.
    *   Add your Service ID, Template ID, and Public Key to the relevant JS functions.
4.  **Run Locally:**
    *   Use an extension like *Live Server* in VS Code to run the project.
    *   Open `index.html` or `login.html` to get started.

## 👥 Authors

*   Developed by **Loganathan** (https://loganathan.in)
