// Firebase configuration for the guestlist web app.
// 1) Create a Firebase project
// 2) Enable Firestore Database in Native mode
// 3) Enable Authentication > Sign-in method > Anonymous
// 4) Paste your Firebase web app config below

window.GUESTLIST_APP_CONFIG = {
  firebaseConfig: {
    apiKey: "PASTE_FIREBASE_API_KEY",
    authDomain: "PASTE_PROJECT_ID.firebaseapp.com",
    projectId: "PASTE_PROJECT_ID",
    storageBucket: "PASTE_PROJECT_ID.appspot.com",
    messagingSenderId: "PASTE_MESSAGING_SENDER_ID",
    appId: "PASTE_APP_ID"
  },
  app: {
    defaultEventName: "Event Gästeliste",
    categories: ["GA", "Member GA", "Member VIP", "On Stage", "Mitarbeiter"],
    statuses: ["open", "checked_in", "no_show"]
  }
};
