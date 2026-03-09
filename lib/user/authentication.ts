import {
    sendPasswordResetEmail,
    signInWithEmailAndPassword,
    signOut,
} from "firebase/auth"
import { auth } from "../firebase/firebase"

export const signin = async (email: string, password: string) => {

    const userCredential = await signInWithEmailAndPassword(auth, email, password);

    return userCredential.user;

}

export const forgotPassword = async (email: string) => {

    await sendPasswordResetEmail(auth, email);

}

export const logout = async () => {

    await signOut(auth);

}