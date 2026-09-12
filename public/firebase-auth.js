// ============================================================
// DarkLink — Firebase Authentication & Multi-Device Sync
// ============================================================
import { initializeApp } from https://www.gstatic.com/firebasejs/11.4.0/firebase-app.js;
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged } from https://www.gstatic.com/firebasejs/11.4.0/firebase-auth.js;
import { getFirestore, collection, doc, setDoc, getDoc, onSnapshot } from https://www.gstatic.com/firebasejs/11.4.0/firebase-firestore.js;

const firebaseConfig = {
  apiKey: AIzaSyBFaiE65LdwmfEBZg0T-oAMYaXza4YTBR4,
  authDomain: darklink-92e49.firebaseapp.com,
  projectId: darklink-92e49,
  storageBucket: darklink-92e49.firebasestorage.app,
  messagingSenderId: 878285017289,
  appId: 1:878285017289:web:647bfd5f60410f97f77d18,
  measurementId: G-M79G58ZZ64
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

let currentUser = null;

export function initFirebaseAuth(onUserChanged, onDevicesUpdated) {
  const btnGoogleAuth = document.getElementById(btnGoogleAuth);
  const googleAuthText = document.getElementById(googleAuthText);

  onAuthStateChanged(auth, (user) => {
    currentUser = user;
    if (user) {
      console.log([DarkLink Firebase] Signed in:, user.email);
      if (googleAuthText) googleAuthText.textContent = user.displayName ? user.displayName.split( )[0] : user.email.split(@)[0];
      if (btnGoogleAuth) {
        btnGoogleAuth.classList.add(signed-in);
        btnGoogleAuth.title = Signed in as  (Click to Sign Out);
      }

      // Listen to devices registered under this user's Google account
      listenToUserDevices(user.uid, onDevicesUpdated);
      if (onUserChanged) onUserChanged(user);
    } else {
      console.log([DarkLink Firebase] User signed out);
      if (googleAuthText) googleAuthText.textContent = Sign In;
      if (btnGoogleAuth) {
        btnGoogleAuth.classList.remove(signed-in);
        btnGoogleAuth.title = Sign in with Google;
      }
      if (onUserChanged) onUserChanged(null);
    }
  });

  if (btnGoogleAuth) {
    btnGoogleAuth.addEventListener(click, () => {
      if (currentUser) {
        if (confirm(Sign out of Google Account ()?)) {
          signOut(auth);
        }
      } else {
        signInWithPopup(auth, provider).catch((err) => {
          console.error([DarkLink Firebase] Sign-in error:, err);
          alert(Sign-in failed:  + err.message);
        });
      }
    });
  }
}

function listenToUserDevices(uid, onDevicesUpdated) {
  const devicesRef = collection(db, users, uid, devices);
  onSnapshot(devicesRef, (snapshot) => {
    const devices = [];
    snapshot.forEach((docSnap) => {
      devices.push({ id: docSnap.id, ...docSnap.data() });
    });
    if (onDevicesUpdated) onDevicesUpdated(devices);
  }, (err) => {
    console.warn([DarkLink Firebase] Firestore listener:, err.message);
  });
}

// Function to register or update device status in Firestore
export async function registerDeviceInFirestore(deviceId, deviceData) {
  if (!currentUser) return;
  try {
    const devDocRef = doc(db, users, currentUser.uid, devices, deviceId);
    await setDoc(devDocRef, {
      ...deviceData,
      lastSeen: new Date().toISOString()
    }, { merge: true });
    console.log([DarkLink Firebase] Device registered in Firestore:, deviceId);
  } catch (err) {
    console.error([DarkLink Firebase] Failed to register device:, err);
  }
}
