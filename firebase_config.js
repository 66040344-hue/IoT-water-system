// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, onValue, set, update, get } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// TODO: Replace with your app's Firebase project configuration
const firebaseConfig = {
  apiKey: "AIzaSyADIHDSyCdNU2TFRyinMbg1KAvufAQ-SYo",
  authDomain: "iot-water-system-98daf.firebaseapp.com",
  databaseURL: "https://iot-water-system-98daf-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "iot-water-system-98daf",
  storageBucket: "iot-water-system-98daf.firebasestorage.app",
  messagingSenderId: "868765660161",
  appId: "1:868765660161:web:23710f91fafb6c5fd2bc00",
  measurementId: "G-3L5DFHV0QK"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// Export for other files
export { db, ref, onValue, set, update, get };
