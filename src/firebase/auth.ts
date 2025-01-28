import { 
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged
} from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { auth, db } from './config';

export const signUp = async (email: string, password: string, displayName: string) => {
  const userCredential = await createUserWithEmailAndPassword(auth, email, password);
  
  // Create user document in Firestore
  await setDoc(doc(db, 'users', userCredential.user.uid), {
    uid: userCredential.user.uid,
    email,
    displayName,
    createdAt: new Date().toISOString(),
    leagues: [],  // Array of league IDs
    preferences: {
      notifications: true,
      emailUpdates: true
    }
  });

  return userCredential.user;
};

export const signIn = async (email: string, password: string) => {
  return signInWithEmailAndPassword(auth, email, password);
};

export const signOut = () => firebaseSignOut(auth);

export const useAuth = (callback: (user: any) => void) => {
  return onAuthStateChanged(auth, callback);
};