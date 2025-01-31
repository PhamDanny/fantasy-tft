import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged
} from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from './config';

export const signUp = async (email: string, password: string, displayName: string) => {
  try {
    console.log("Starting signup process...");

    // Create the auth user
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    console.log("Auth user created:", userCredential.user.uid);

    // Create the user document in Firestore
    const userDoc = doc(db, 'users', userCredential.user.uid);
    console.log("Attempting Firestore write to:", userDoc.path);

    await setDoc(userDoc, {
      displayName,
      email,
      createdAt: serverTimestamp(),
      leagues: []
    });

    console.log("Firestore user document created successfully");
    return userCredential;
  } catch (error) {
    console.error("Error in signUp:", error);
    throw error;
  }
};

export const signIn = async (email: string, password: string) => {
  return signInWithEmailAndPassword(auth, email, password);
};

export const signOut = async () => {
  return firebaseSignOut(auth);
};

export const useAuth = (callback: (user: any) => void) => {
  return onAuthStateChanged(auth, callback);
};