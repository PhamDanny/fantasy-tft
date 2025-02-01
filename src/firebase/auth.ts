import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged
} from 'firebase/auth';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
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
  } catch (error: any) {
    // Convert Firebase auth errors to user-friendly messages
    if (error.code === 'auth/email-already-in-use') {
      throw new Error('An account with this email already exists. Please try logging in instead.');
    }
    throw error;
  }
};

export const signIn = async (email: string, password: string) => {
  const userCredential = await signInWithEmailAndPassword(auth, email, password);

  // Check if Firestore document exists
  const userDoc = await getDoc(doc(db, 'users', userCredential.user.uid));

  // If no document exists, throw special error
  if (!userDoc.exists()) {
    const error = new Error('Account needs setup');
    error.name = 'AccountSetupNeeded';
    throw error;
  }

  return userCredential;
};

export const signOut = async () => {
  return firebaseSignOut(auth);
};

export const useAuth = (callback: (user: any) => void) => {
  return onAuthStateChanged(auth, callback);
};

export const createUserDocument = async (userId: string, email: string, displayName: string) => {
  await setDoc(doc(db, 'users', userId), {
    displayName,
    email,
    createdAt: serverTimestamp(),
    leagues: []
  });
};