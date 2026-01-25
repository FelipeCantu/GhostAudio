"use client";

import { useState } from "react";
import Sidebar from "./Sidebar";
import { useAuth } from "@/context/AuthContext";
import { Menu } from "lucide-react";
import Image from "next/image";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
    const { isAuthenticated } = useAuth();
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

    if (!isAuthenticated) {
        return <>{children}</>;
    }

    return (
        <div className="flex min-h-screen bg-[#0d3b66] text-[#faf0ca]">
            {/* Background elements */}
            <div className="fixed inset-0 pointer-events-none z-0">
                <div className="absolute top-[-10%] left-[-10%] w-[50vw] h-[50vw] rounded-full bg-[#f4d35e]/5 blur-[120px] animate-pulse" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[50vw] h-[50vw] rounded-full bg-[#ee964b]/5 blur-[120px] animate-pulse delay-700" />
            </div>

            <Sidebar
                isOpen={isMobileMenuOpen}
                onClose={() => setIsMobileMenuOpen(false)}
            />

            {/* Main Content Area */}
            <div className="flex-1 flex flex-col min-w-0 lg:ml-64 transition-all duration-300">
                {/* Mobile Header */}
                <header className="lg:hidden sticky top-0 z-30 flex items-center justify-between px-4 py-3 bg-black/40 backdrop-blur-md border-b border-white/5">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => setIsMobileMenuOpen(true)}
                            className="p-2 -ml-2 text-zinc-300 hover:text-white rounded-lg hover:bg-white/5"
                        >
                            <Menu size={24} />
                        </button>
                        <div className="relative w-24 h-8">
                            <Image
                                src="/logo.png"
                                alt="DiZC"
                                fill
                                className="object-contain object-left"
                            />
                        </div>
                    </div>
                </header>

                <main className="flex-1 p-4 md:p-8 relative z-10 overflow-y-auto">
                    <div className="max-w-7xl mx-auto">
                        {children}
                    </div>
                </main>
            </div>
        </div>
    );
}
