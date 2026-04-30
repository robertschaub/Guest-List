// Firebase configuration for the guestlist web app.
// 1) Create a Firebase project
// 2) Enable Firestore Database in Native mode
// 3) Enable Authentication > Sign-in method > Anonymous
// 4) Paste your Firebase web app config below

window.GUESTLIST_APP_CONFIG = {
  firebaseConfig: {
    apiKey: "AIzaSyD3rw5R3kTXMYPc95XRdRXZLHA-_vgIUik",
    authDomain: "guest-list-mvp.firebaseapp.com",
    projectId: "guest-list-mvp",
    storageBucket: "guest-list-mvp.firebasestorage.app",
    messagingSenderId: "18533148309",
    appId: "1:18533148309:web:51b3632982ff8430785d9c",
    measurementId: "G-NQYPLLXDFQ"
  },
  app: {
    defaultEventName: "Event Gästeliste",
    knownEvents: [
      {
        id: "the-garden-w-dj-prospa",
        name: "THE GARDEN w/ DJ Prospa",
        date: "2026-05-01"
      },
      {
        id: "the-garden-w-me",
        name: "THE GARDEN w/ &ME",
        date: "2026-05-02"
      }
    ],
    categories: ["GA", "Member GA", "Member VIP", "On Stage", "Mitarbeiter"],
    statuses: ["open", "checked_in", "no_show"]
  }
};
