"use client";

import Link from "next/link";
import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarGroup,
    SidebarGroupLabel,
    SidebarHeader,
} from "../ui/sidebar";
import { useAuth } from "@/context/Authcontext";
import { logout } from "@/lib/user/authentication";
import { Button } from "../ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import {
    ImageIcon,
    Plus,
    Shield,
    Trophy,
    Users,
} from "lucide-react";


export default function AppSidebar() {
    const { user } = useAuth();
    const router = useRouter();
    const pathname = usePathname();
    const [isLoggingOut, setIsLoggingOut] = useState(false);
    const navLinkClass =
        "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-700";
    const activeNavLinkClass =
        "bg-slate-200 text-slate-800 hover:bg-slate-200 hover:text-slate-800";

    function getNavLinkClass(href: string, options?: { exact?: boolean; exclude?: string[] }) {
        const exact = options?.exact ?? false;
        const excludes = options?.exclude ?? [];
        const isPathMatch = exact
            ? pathname === href
            : pathname === href || pathname.startsWith(`${href}/`);
        const isExcluded = excludes.some(
            (excludedPath) => pathname === excludedPath || pathname.startsWith(`${excludedPath}/`)
        );
        const isActive = isPathMatch && !isExcluded;

        return `${navLinkClass} ${isActive ? activeNavLinkClass : ""}`;
    }

    async function handleLogout() {
        setIsLoggingOut(true);

        try {
            await logout();
            router.replace("/login");
        } finally {
            setIsLoggingOut(false);
        }
    }


    return (
        <Sidebar>

            <SidebarHeader>
                <CustomSidebarHeader />
            </SidebarHeader>

            <SidebarContent>

                <SidebarGroup>
                    <SidebarGroupLabel>Players</SidebarGroupLabel>
                    <Link href="/players" className={getNavLinkClass("/players", { exclude: ["/players/new"] })}>
                        <Users className="h-4 w-4" />
                        View Players
                    </Link>
                    <Link href="/players/new" className={getNavLinkClass("/players/new") }>
                        <Plus className="h-4 w-4" />
                        New Player
                    </Link>
                </SidebarGroup>

                <SidebarGroup>
                    <SidebarGroupLabel>Teams</SidebarGroupLabel>
                    <Link href="/teams" className={getNavLinkClass("/teams", { exclude: ["/teams/new"] })}>
                        <Shield className="h-4 w-4" />
                        View Teams
                    </Link>
                    <Link href="/teams/new" className={getNavLinkClass("/teams/new") }>
                        <Plus className="h-4 w-4" />
                        New Team
                    </Link>
                </SidebarGroup>

                <SidebarGroup>
                    <SidebarGroupLabel>Leagues</SidebarGroupLabel>
                    <Link href="/leagues" className={getNavLinkClass("/leagues", { exclude: ["/leagues/new"] })}>
                        <Trophy className="h-4 w-4" />
                        View Leagues
                    </Link>
                    <Link href="/leagues/new" className={getNavLinkClass("/leagues/new") }>
                        <Plus className="h-4 w-4" />
                        New League
                    </Link>
                </SidebarGroup>

                <SidebarGroup>
                    <SidebarGroupLabel>Media</SidebarGroupLabel>
                    <Link href="/media" className={getNavLinkClass("/media")}>
                        <ImageIcon className="h-4 w-4" />
                        View Media
                    </Link>
                </SidebarGroup>
                
            </SidebarContent>

            <SidebarFooter>
                <CustomSidebarFooter
                    name={user?.displayName ?? "Admin User"}
                    email={user?.email ?? "No email"}
                    photoUrl={user?.photoURL ?? null}
                    onLogout={handleLogout}
                    isLoggingOut={isLoggingOut}
                />
            </SidebarFooter>
        </Sidebar>
    )
}

function CustomSidebarHeader() {
    return (
        <div className="flex items-center gap-2 px-4 py-3">
            <img src="/TPG.svg" alt="Logo" className="h-8 w-8" />
            <span className="text-lg font-bold">Project Gameplan</span>
        </div>
    )
}

function CustomSidebarFooter({
    name,
    email,
    photoUrl,
    onLogout,
    isLoggingOut,
}: {
    name: string;
    email: string;
    photoUrl: string | null;
    onLogout: () => Promise<void>;
    isLoggingOut: boolean;
}) {
    const initials = getInitials(name, email);

    return (
        <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
            <div className="flex items-center gap-3">
                <Avatar>
                    <AvatarImage src={photoUrl ?? undefined} alt={name} />
                    <AvatarFallback>{initials}</AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-700">{name}</p>
                    <p className="truncate text-xs text-slate-500">{email}</p>
                </div>
            </div>
            <Button
                type="button"
                variant="outline"
                className="mt-3 w-full"
                disabled={isLoggingOut}
                onClick={onLogout}
            >
                {isLoggingOut ? "Logging out..." : "Log out"}
            </Button>
        </div>
    );
}

function getInitials(name: string, email: string) {
    const fullName = name.trim();

    if (fullName) {
        const parts = fullName.split(/\s+/).filter(Boolean);
        const initialsFromName = parts
            .slice(0, 2)
            .map((part) => part[0]?.toUpperCase() ?? "")
            .join("");

        if (initialsFromName) {
            return initialsFromName;
        }
    }

    const emailPrefix = email.split("@")[0]?.trim();
    return (emailPrefix?.slice(0, 2).toUpperCase() || "AU");
}

