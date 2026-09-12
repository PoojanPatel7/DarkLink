// ============================================================
// DarkLink — Firebase Authentication & Multi-Device Sync
// ============================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.4.0/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.4.0/firebase-auth.js";
import { getFirestore, collection, doc, setDoc, getDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/11.4.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBFaiE65LdwmfEBZg0T-oAMYaXza4YTBR4",
  authDomain: "darklink-92e49.firebaseapp.com",
  projectId: "darklink-92e49",
  storageBucket: "darklink-92e49.firebasestorage.app",
  messagingSenderId: "878285017289",
  appId: "1:878285017289:web:647bfd5f60410f97f77d18",
  measurementId: "G-M79G58ZZ64"
};

// Initialize Firebase
export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const provider = new GoogleAuthProvider();

let currentUser = null;
let firestoreDevices = [];

export function initFirebaseAuth(onUserChanged, onDevicesUpdated) {
  const authScreen = document.getElementById("authScreen");
  const mainAppContainer = document.getElementById("mainAppContainer");
  const btnGoogleSignInMain = document.getElementById("btnGoogleSignInMain");
  const userEmailBadge = document.getElementById("userEmailBadge");
  const userAvatarCircle = document.getElementById("userAvatarCircle");
  const modalUserEmail = document.getElementById("modalUserEmail");
  const btnSignOut = document.getElementById("btnSignOut");

  function triggerGoogleSignIn() {
    if (btnGoogleSignInMain) btnGoogleSignInMain.disabled = true;
    signInWithPopup(auth, provider)
      .catch((err) => {
        console.error("[DarkLink Firebase] Sign-in error:", err);
        alert("Google Sign-In failed: " + err.message);
      })
      .finally(() => {
        if (btnGoogleSignInMain) btnGoogleSignInMain.disabled = false;
      });
  }

  if (btnGoogleSignInMain) {
    btnGoogleSignInMain.addEventListener("click", triggerGoogleSignIn);
  }

  if (btnSignOut) {
    btnSignOut.addEventListener("click", () => {
      if (confirm("Sign out of DarkLink?")) {
        signOut(auth);
      }
    });
  }

  // Authentication state listener
  onAuthStateChanged(auth, (user) => {
    currentUser = user;
    if (user) {
      console.log("[DarkLink Firebase] Authenticated:", user.email);

      // 1. Transition from Auth Screen to Main Page
      if (authScreen) authScreen.classList.add("hidden");
      if (mainAppContainer) mainAppContainer.classList.remove("hidden");

      // 2. Display User Profile Info
      const shortEmail = user.email || "Google User";
      if (userEmailBadge) userEmailBadge.textContent = shortEmail;
      if (modalUserEmail) modalUserEmail.textContent = shortEmail;

      if (userAvatarCircle) {
        if (user.photoURL) {
          userAvatarCircle.innerHTML = `<img src="${user.photoURL}" alt="avatar" style="width:100%;height:100%;border-radius:50%;object-fit:cover;" />`;
        } else {
          userAvatarCircle.textContent = (user.displayName ? user.displayName[0] : user.email[0]).toUpperCase();
        }
      }

      // 3. Listen to devices registered under this user's Google account in Firestore
      listenToUserDevices(user.uid, (devices) => {
        firestoreDevices = devices;
        if (onDevicesUpdated) onDevicesUpdated(devices);
      });

      if (onUserChanged) onUserChanged(user);
    } else {
      console.log("[DarkLink Firebase] User signed out / unauthenticated");
      // Show Auth Screen, hide Main Page
      if (authScreen) authScreen.classList.remove("hidden");
      if (mainAppContainer) mainAppContainer.classList.add("hidden");

      if (onUserChanged) onUserChanged(null);
    }
  });
}

function listenToUserDevices(uid, onDevicesUpdated) {
  const devicesRef = collection(db, "users", uid, "devices");
  onSnapshot(devicesRef, (snapshot) => {
    const devices = [];
    snapshot.forEach((docSnap) => {
      devices.push({ id: docSnap.id, ...docSnap.data() });
    });
    if (onDevicesUpdated) onDevicesUpdated(devices);
  }, (err) => {
    console.warn("[DarkLink Firebase] Firestore listener error:", err.message);
  });
}

// Function to register or update device status in Firestore
export async function registerDeviceInFirestore(deviceId, deviceData) {
  if (!currentUser) return;
  try {
    const devDocRef = doc(db, "users", currentUser.uid, "devices", deviceId);
    await setDoc(devDocRef, {
      ...deviceData,
      lastSeen: new Date().toISOString()
    }, { merge: true });
    console.log("[DarkLink Firebase] Device registered in Firestore:", deviceId);
  } catch (err) {
    console.error("[DarkLink Firebase] Failed to register device:", err);
  }
}

// Global hook for app.js
window.DarkLinkAuth = {
  getUser: () => currentUser,
  getDevices: () => firestoreDevices,
  registerDevice: registerDeviceInFirestore,
  signOut: () => signOut(auth)
};
