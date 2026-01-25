"use client";

import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/context/AuthContext";
import { motion } from "framer-motion";
import { User, Shield, HardDrive, LogOut } from "lucide-react";

export default function SettingsPage() {
    const { user, logout } = useAuth();

    return (
        <DashboardLayout>
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="max-w-3xl mx-auto space-y-8"
            >
                <div>
                    <h1 className="text-3xl font-bold text-white mb-2">Settings</h1>
                    <p className="text-zinc-400">Manage your account and preferences.</p>
                </div>

                {/* Profile Section */}
                <div className="bg-white/5 border border-white/10 rounded-3xl p-4 md:p-8 backdrop-blur-sm">
                    <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                        <User className="text-[#f4d35e]" />
                        Profile
                    </h2>
                    <div className="flex items-center gap-6">
                        <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[#f4d35e] to-[#ee964b] flex items-center justify-center text-[#0d3b66] text-3xl font-bold shadow-lg">
                            {user?.username?.charAt(0).toUpperCase() || "U"}
                        </div>
                        <div className="space-y-1">
                            <p className="text-sm text-zinc-500 uppercase tracking-widest font-semibold">Username</p>
                            <p className="text-2xl text-white font-medium">{user?.username || "Guest"}</p>
                            <p className="text-sm text-zinc-400">Melophile status: <span className="text-[#f4d35e]">Gold</span></p>
                        </div>
                    </div>
                </div>

                {/* Preferences (Visual/Mock) */}
                <div className="bg-white/5 border border-white/10 rounded-3xl p-4 md:p-8 backdrop-blur-sm">
                    <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                        <HardDrive className="text-[#f4d35e]" />
                        System Preferences
                    </h2>
                    <div className="space-y-4">
                        <div className="flex items-center justify-between p-4 bg-black/20 rounded-xl">
                            <div>
                                <p className="text-white font-medium">Dark Mode</p>
                                <p className="text-xs text-zinc-500">Only the darkest for your eyes</p>
                            </div>
                            <div className="px-3 py-1 rounded-full bg-[#f4d35e]/20 text-[#f4d35e] text-xs font-bold border border-[#f4d35e]/20">
                                ALWAYS ON
                            </div>
                        </div>
                        <div className="flex items-center justify-between p-4 bg-black/20 rounded-xl">
                            <div>
                                <p className="text-white font-medium">Audio Quality</p>
                                <p className="text-xs text-zinc-500">Default ripping format</p>
                            </div>
                            <select className="bg-black/40 border border-white/10 text-zinc-300 text-sm rounded-lg px-3 py-1 outline-none focus:border-[#f4d35e]">
                                <option>FLAC (Lossless)</option>
                                <option>MP3 (320kbps)</option>
                                <option>WAV (Uncompressed)</option>
                            </select>
                        </div>
                    </div>
                </div>

                {/* Danger Zone */}
                <div className="bg-red-500/5 border border-red-500/10 rounded-3xl p-4 md:p-8 backdrop-blur-sm">
                    <h2 className="text-xl font-bold text-red-400 mb-6 flex items-center gap-2">
                        <Shield />
                        Account Actions
                    </h2>
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-zinc-300 font-medium">Sign Out</p>
                            <p className="text-xs text-zinc-500">End your current session</p>
                        </div>
                        <button
                            onClick={() => logout()}
                            className="px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg border border-red-500/20 transition-colors flex items-center gap-2"
                        >
                            <LogOut size={16} />
                            Logout
                        </button>
                    </div>
                </div>

            </motion.div>
        </DashboardLayout>
    );
}
