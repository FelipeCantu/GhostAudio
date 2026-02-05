"use client";

import { motion } from "framer-motion";
import { Play, SkipForward, SkipBack, Disc } from "lucide-react";
import Image from "next/image";

export function ProductShowcase() {
    return (
        <section className="relative w-full py-20 px-6 sm:px-10 flex justify-center perspective-1000">
            <motion.div
                initial={{ opacity: 0, y: 100, rotateX: 20 }}
                whileInView={{ opacity: 1, y: 0, rotateX: 0 }}
                viewport={{ once: true, margin: "-100px" }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                className="relative max-w-5xl w-full bg-[#0d1b2a]/80 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden group hover:scale-[1.02] transition-transform duration-500"
            >
                {/* Fake Window Header */}
                <div className="h-10 bg-white/5 border-b border-white/5 flex items-center px-4 gap-2">
                    <div className="w-3 h-3 rounded-full bg-red-500/80" />
                    <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
                    <div className="w-3 h-3 rounded-full bg-green-500/80" />
                    <div className="ml-4 text-xs text-zinc-500 font-mono">DiZC Player - High Fidelity</div>
                </div>

                {/* Mock UI Content */}
                <div className="p-6 grid grid-cols-12 gap-6 h-[500px] overflow-hidden">
                    {/* Sidebar Mock */}
                    <div className="col-span-3 hidden md:flex flex-col gap-4 border-r border-white/5 pr-4">
                        <div className="h-8 w-24 bg-white/10 rounded animate-pulse" />
                        <div className="space-y-2 mt-4">
                            {[1, 2, 3, 4, 5].map((i) => (
                                <div key={i} className="h-6 w-full bg-white/5 rounded-md" />
                            ))}
                        </div>
                        <div className="mt-auto h-32 w-full bg-white/5 rounded-lg" />
                    </div>

                    {/* Main Content Mock */}
                    <div className="col-span-12 md:col-span-9 flex flex-col">
                        {/* Hero Album Mock */}
                        <div className="flex items-end gap-6 mb-8">
                            <div className="w-48 h-48 bg-gradient-to-br from-[#f4d35e] to-[#ee964b] rounded-lg shadow-lg flex items-center justify-center">
                                <Disc size={64} className="text-[#0d1b2a] opacity-50" />
                            </div>
                            <div className="space-y-3 pb-2">
                                <div className="h-4 w-20 bg-white/20 rounded-full" />
                                <div className="h-10 w-64 bg-white/10 rounded-lg" />
                                <div className="h-4 w-32 bg-white/10 rounded-full" />
                            </div>
                        </div>

                        {/* Tracklist Mock */}
                        <div className="space-y-3">
                            {[1, 2, 3, 4].map((i) => (
                                <div key={i} className="flex items-center gap-4 p-3 rounded-lg bg-white/5 border border-white/5 hover:bg-white/10 transition-colors">
                                    <div className="w-8 text-center text-zinc-500 text-sm">{i}</div>
                                    <div className="flex-1">
                                        <div className="h-4 w-40 bg-white/10 rounded mb-1" />
                                        <div className="h-3 w-24 bg-white/5 rounded" />
                                    </div>
                                    <div className="h-4 w-12 bg-white/5 rounded" />
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Player Bar Mock */}
                <div className="absolute bottom-0 left-0 right-0 h-20 bg-[#0b1420] border-t border-white/10 flex items-center px-6 justify-between">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-white/10 rounded" />
                        <div className="space-y-1">
                            <div className="h-3 w-24 bg-white/10 rounded" />
                            <div className="h-2 w-16 bg-white/5 rounded" />
                        </div>
                    </div>
                    <div className="flex items-center gap-4">
                        <SkipBack size={20} className="text-zinc-500" />
                        <div className="w-10 h-10 rounded-full bg-white text-black flex items-center justify-center">
                            <Play size={20} fill="currentColor" className="ml-0.5" />
                        </div>
                        <SkipForward size={20} className="text-zinc-500" />
                    </div>
                    <div className="w-32 h-1 bg-white/10 rounded-full" />
                </div>

                {/* Glow behind */}
                <div className="absolute -inset-10 bg-gradient-to-r from-[#f4d35e]/20 to-[#ee964b]/20 blur-3xl -z-10" />
            </motion.div>
        </section>
    );
}
