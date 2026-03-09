'use client'
import { useAuth } from "@/context/Authcontext";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { WholePageLoading } from "../ui/wholepage-loading";


export default function ProtectedRoute({ children }: { children: React.ReactNode }) {


    const {user, loading} = useAuth();
    const router = useRouter();

    useEffect(() => {

        if(!loading && !user) {
            router.push("/login")
        }

    }, [loading, user, router]) 

    if(loading || !user) {
        return <WholePageLoading />
    }

    return children;
}