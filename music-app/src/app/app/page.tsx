"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useAuth } from "@/context/AuthContext";
import DashboardLayout from "@/components/DashboardLayout";
import Link from "next/link";
import { Disc, PlayCircle, Plus } from "lucide-react";
import { api } from "@/services/api";

export default function Home() {
    const { user, isAuthenticated, isLoading, token } = useAuth();
    const router = useRouter();
    const [stats, setStats] = useState({ total_albums: 0, total_tracks: 0, recent_albums: [] });

    useEffect(() => {
        if (!isLoading && !isAuthenticated) {
            router.push("/login");
        }
    }, [isLoading, isAuthenticated, router]);

    useEffect(() => {
        const fetchStats = async () => {
            if (isAuthenticated && token) {
                try {
                    const data = await api.library.getDashboardStats(token);
                    setStats(data);
                } catch (err) {
                    console.error("Failed to load stats", err);
                }
            }
        };
        fetchStats();
    }, [isAuthenticated, token]);

    if (isLoading) {
        return (
            <div className="min-h-screen w-full flex flex-col items-center justify-center bg-[#0d3b66] text-[#faf0ca]">
                <div className="w-16 h-16 border-4 border-[#f4d35e] border-t-transparent rounded-full animate-spin mb-4" />
                <p className="text-xl font-medium animate-pulse">Loading DiZC...</p>
            </div>
        );
    }

    if (!isAuthenticated) return null;

    return (
        <DashboardLayout>
            <div className="space-y-10">

                {/* Welcome Section */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6 }}
                    className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-[#f4d35e] to-[#ee964b] p-8 md:p-12 text-[#0d3b66]"
                >
                    <div className="relative z-10 max-w-2xl">
                        <h1 className="text-4xl md:text-5xl font-bold mb-4">
                            Welcome back, {user?.username}
                        </h1>
                        <p className="text-lg md:text-xl font-medium opacity-90 mb-8">
                            Ready to spin some discs? Your high-fidelity collection is waiting.
                        </p>
                        <div className="flex flex-wrap gap-4">
                            <Link
                                href="/library"
                                className="px-6 py-3 bg-[#0d3b66] text-white font-bold rounded-xl hover:bg-black/80 transition-transform hover:scale-105 flex items-center gap-2"
                            >
                                <PlayCircle size={20} />
                                Go to Library
                            </Link>
                            <Link
                                href="/import"
                                className="px-6 py-3 bg-white/20 backdrop-blur-md text-[#0d3b66] border border-[#0d3b66]/20 font-bold rounded-xl hover:bg-white/30 transition-transform hover:scale-105 flex items-center gap-2"
                            >
                                <Plus size={20} />
                                Import New
                            </Link>
                        </div>
                    </div>

                    {/* Decorative Vinyl */}
                    <div className="absolute top-[-50px] right-[-50px] md:top-[-100px] md:right-[-100px] opacity-20 animate-[spin_20s_linear_infinite]">
                        <Disc size={400} />
                    </div>
                </motion.div>

                {/* Quick Stats & Recent */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <motion.div
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.2 }}
                        className="p-6 rounded-2xl bg-white/5 border border-white/10"
                    >
                        <h3 className="text-xl font-bold mb-4 text-white">Quick Stats</h3>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="p-4 rounded-xl bg-black/40">
                                <p className="text-sm text-zinc-400">Total Albums</p>
                                <p className="text-2xl font-bold text-[#f4d35e]">{stats.total_albums}</p>
                            </div>
                            <div className="p-4 rounded-xl bg-black/40">
                                <p className="text-sm text-zinc-400">Total Tracks</p>
                                <p className="text-2xl font-bold text-[#ee964b]">{stats.total_tracks}</p>
                            </div>
                        </div>
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.3 }}
                        className="p-6 rounded-2xl bg-white/5 border border-white/10"
                    >
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-xl font-bold text-white">Recently Added</h3>
                            <Link href="/library" className="text-sm text-[#f4d35e] hover:underline">View All</Link>
                        </div>

                        {stats.recent_albums.length > 0 ? (
                            <div className="space-y-3">
                                {stats.recent_albums.map((album: any) => (
                                    <div key={album.id} className="flex items-center gap-3 p-2 hover:bg-white/5 rounded-lg transition-colors">
                                        <div className="w-12 h-12 bg-zinc-800 rounded-md overflow-hidden relative flex-shrink-0">
                                            {album.cover_art ? (
                                                <img src={album.cover_art} alt={album.title} className="w-full h-full object-cover" />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center text-zinc-600">
                                                    <Disc size={20} />
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="font-semibold text-white truncate">{album.title}</p>
                                            <p className="text-sm text-zinc-400 truncate">{album.artist}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center py-8 text-center space-y-2">
                                <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center">
                                    <Disc className="text-zinc-400" />
                                </div>
                                <p className="text-sm text-zinc-500">No recent activity</p>
                            </div>
                        )}
                    </motion.div>
                </div>

            </div>
        </DashboardLayout>
    );
}
