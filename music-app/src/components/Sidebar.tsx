"use client";

import { useAuth } from "@/context/AuthContext";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Image from "next/image";
import { Home, Disc, Library, LogOut, User, Settings as SettingsIcon, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface SidebarProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function Sidebar({ isOpen, onClose }: SidebarProps) {
    const { user, logout } = useAuth();
    const pathname = usePathname();

    const links = [
        { name: "Home", href: "/app", icon: Home },
        { name: "My Library", href: "/library", icon: Library },
        { name: "Import CD", href: "/import", icon: Disc },
        { name: "Settings", href: "/settings", icon: SettingsIcon },
    ];

    const isActive = (path: string) => pathname === path;

    return (
        <>
            {/* Mobile Overlay */}
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 bg-black/80 z-40 lg:hidden backdrop-blur-sm"
                    />
                )}
            </AnimatePresence>

            <motion.div
                className={`h-screen w-64 bg-black/95 lg:bg-black/60 backdrop-blur-xl border-r border-white/10 flex flex-col fixed left-0 top-0 z-50 shadow-2xl transition-transform duration-300 lg:translate-x-0 ${isOpen ? "translate-x-0" : "-translate-x-full"
                    }`}
            >
                {/* Mobile Close Button */}
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 p-2 text-zinc-400 hover:text-white lg:hidden"
                >
                    <X size={24} />
                </button>

                {/* Logo Area */}
                <div className="pt-8 pb-4 flex justify-center">
                    <div className="relative w-24 h-24 filter drop-shadow-[0_0_15px_rgba(244,211,94,0.1)] transition-transform hover:scale-105 duration-500">
                        <Image
                            src="/logo.png"
                            alt="DiZC"
                            fill
                            className="object-contain"
                            priority
                        />
                    </div>
                </div>

                {/* Navigation */}
                <nav className="flex-1 px-4 py-8 space-y-2">
                    {links.map((link) => {
                        const Icon = link.icon;
                        const active = isActive(link.href);

                        return (
                            <Link
                                key={link.href}
                                href={link.href}
                                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group ${active
                                    ? "bg-[#f4d35e]/10 text-[#f4d35e] border border-[#f4d35e]/20 shadow-[0_0_15px_rgba(244,211,94,0.1)]"
                                    : "text-zinc-400 hover:text-white hover:bg-white/5"
                                    }`}
                            >
                                <Icon size={20} className={active ? "text-[#f4d35e]" : "group-hover:text-white transition-colors"} />
                                <span className="font-medium">{link.name}</span>
                            </Link>
                        );
                    })}
                </nav>

                {/* User Profile */}
                <div className="p-4 border-t border-white/5">
                    <Link
                        href="/settings"
                        className="bg-white/5 rounded-2xl p-4 flex items-center gap-3 border border-white/5 hover:border-white/10 transition-colors group cursor-pointer"
                    >
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#f4d35e] to-[#ee964b] flex items-center justify-center text-[#0d3b66] font-bold shadow-lg group-hover:scale-105 transition-transform">
                            {user?.username?.charAt(0).toUpperCase() || <User size={20} />}
                        </div>
                        <div className="flex-1 overflow-hidden">
                            <p className="text-sm font-medium text-white truncate group-hover:text-[#f4d35e] transition-colors">{user?.username || "Ghost User"}</p>
                            <p className="text-xs text-zinc-500 truncate">Melophile</p>
                        </div>
                        <div
                            onClick={(e) => {
                                e.preventDefault();
                                logout();
                            }}
                            className="p-2 rounded-lg hover:bg-red-500/10 text-zinc-500 hover:text-red-400 transition-colors z-10"
                            title="Logout"
                        >
                            <LogOut size={18} />
                        </div>
                    </Link>
                </div>
            </motion.div>
        </>
    );
}
