import { getApp, getApps, initializeApp } from "firebase/app";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";
import { connectAuthEmulator, getAuth } from "firebase/auth";
import { connectStorageEmulator, getStorage } from "firebase/storage";

const firebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
      authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
      appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
      measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
}

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const storage = getStorage(app);

declare global {
  // eslint-disable-next-line no-var
  var __projectGameplanStorageEmulatorConnected: boolean | undefined;
}

if (process.env.NODE_ENV === "development") {
  const emulatorHost =
    process.env.NEXT_PUBLIC_FIRESTORE_EMULATOR_HOST ?? "127.0.0.1";
  const emulatorPort = Number(
    process.env.NEXT_PUBLIC_FIRESTORE_EMULATOR_PORT ?? 8080
  );
  const authEmulatorUrl =
    process.env.NEXT_PUBLIC_AUTH_EMULATOR_URL ?? "http://127.0.0.1:9099";

  connectFirestoreEmulator(db, emulatorHost, emulatorPort);
  connectAuthEmulator(auth, authEmulatorUrl);

  if (!globalThis.__projectGameplanStorageEmulatorConnected) {
    connectStorageEmulator(storage, emulatorHost, 9199);
    globalThis.__projectGameplanStorageEmulatorConnected = true;
  }
}

export { db, auth, storage };
