"use client";

import { auth } from "@/lib/firebase/firebase";
import { AuthUser } from "@/types/Auth";
import { onAuthStateChanged } from "firebase/auth";
import { createContext, useContext, useEffect, useState } from "react";


const AuthContext = createContext<{ user: AuthUser | null; loading: boolean }>({ user: null, loading: true });

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {

    const [user, setUser] = useState<AuthUser | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {

        const unsubscribe = onAuthStateChanged(auth, (user) => {
            if(user) {
                setUser({
                    uid: user.uid,
                    email: user.email,
                    displayName: user.displayName,  
                    photoURL: user.photoURL,
                })
            } else {
                setUser(null);
            }
            setLoading(false);
        })

        return () => unsubscribe();

    }, [])


    return (
        <AuthContext.Provider value={{ user, loading }}>
            {children}
        </AuthContext.Provider>
    )
}