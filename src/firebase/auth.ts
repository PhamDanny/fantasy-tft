import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  sendPasswordResetEmail as firebaseSendPasswordReset,
  User,
  verifyBeforeUpdateEmail
} from 'firebase/auth';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from './config';

export const signUp = async (email: string, password: string, displayName: string) => {
  try {
    // Create the auth user
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);

    // Create the user document in Firestore
    const userDoc = doc(db, 'users', userCredential.user.uid);
    await setDoc(userDoc, {
      displayName,
      email,
      createdAt: serverTimestamp(),
      leagues: []
    });

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

export const reloadUser = async () => {
  if (auth.currentUser) {
    await auth.currentUser.reload();
    return auth.currentUser;
  }
  return null;
};

export const useAuth = (callback: (user: User | null) => void) => {
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

export const sendPasswordResetEmail = async (email: string) => {
  return firebaseSendPasswordReset(auth, email);
};

export const updateUserEmail = async (user: User, newEmail: string) => {
  return verifyBeforeUpdateEmail(user, newEmail);
};