// Firebase App
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";

// Firebase Authentication
import { getAuth } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";

// Cloud Firestore
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

// Firebase Storage
import { getStorage } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-storage.js";

// Firebase Analytics
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-analytics.js";


// Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyDm9QdeXwUWSJ334eg5bQrmJjPriDDuZK8",
    authDomain: "oud-platform-613fe.firebaseapp.com",
    projectId: "oud-platform-613fe",
    storageBucket: "oud-platform-613fe.firebasestorage.app",
    messagingSenderId: "778856044796",
    appId: "1:778856044796:web:15d94bc2b3e9b3b6525f79",
    measurementId: "G-WMZVY9QTL9"
};


// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase services
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);
const analytics = getAnalytics(app);


// Export services
export { app, auth, db, storage, analytics };