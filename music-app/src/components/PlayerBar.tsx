"use client";

import { usePlayer } from "@/context/PlayerContext";
import { Play, Pause, SkipBack, SkipForward, Disc } from "lucide-react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";

export default function PlayerBar() {
    const { currentTrack, isPlaying, togglePlay, nextTrack, prevTrack, progress, duration, seek } = usePlayer();

    if (!currentTrack) return null;

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    return (
        <AnimatePresence>
            <motion.div
                initial={{ y: 100 }}
                animate={{ y: 0 }}
                exit={{ y: 100 }}
                className="fixed bottom-0 left-0 right-0 z-50 bg-[#0d1b2a]/95 backdrop-blur-xl border-t border-white/10 h-24 px-6 flex items-center justify-between"
            >
                {/* Track Info */}
                <div className="flex items-center gap-4 w-1/4">
                    <div className="relative w-14 h-14 rounded-lg overflow-hidden bg-black/50 border border-white/5 flex-shrink-0">
                        {/* We don't have album art in Track interface yet easily, assuming it might be available or generic */}
                        {/* For now, generic or try to fetch if we update Track interface later */}
                        <div className="w-full h-full flex items-center justify-center">
                            <Disc size={24} className={`text-zinc-500 ${isPlaying ? 'animate-[spin_4s_linear_infinite]' : ''}`} />
                        </div>
                    </div>
                    <div className="min-w-0">
                        <h4 className="font-bold text-white truncate">{currentTrack.title}</h4>
                        {/* We need artist info in Track? Current interface has specific fields */}
                        <p className="text-xs text-zinc-400 truncate">Track {currentTrack.track_number}</p>
                    </div>
                </div>

                {/* Controls */}
                <div className="flex flex-col items-center flex-1 max-w-xl gap-2">
                    <div className="flex items-center gap-6">
                        <button onClick={prevTrack} className="text-zinc-400 hover:text-white transition-colors">
                            <SkipBack size={20} />
                        </button>
                        <button
                            onClick={togglePlay}
                            className="w-10 h-10 rounded-full bg-white text-black flex items-center justify-center hover:scale-105 transition-transform"
                        >
                            {isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" className="ml-0.5" />}
                        </button>
                        <button onClick={nextTrack} className="text-zinc-400 hover:text-white transition-colors">
                            <SkipForward size={20} />
                        </button>
                    </div>

                    {/* Progress Bar */}
                    <div className="w-full flex items-center gap-3 text-xs text-zinc-500 font-mono">
                        <span>{formatTime(progress)}</span>
                        <div className="flex-1 h-1 bg-white/10 rounded-full cursor-pointer relative group"
                            onClick={(e) => {
                                const rect = e.currentTarget.getBoundingClientRect();
                                const percent = (e.clientX - rect.left) / rect.width;
                                seek(percent * duration);
                            }}
                        >
                            <div
                                className="absolute top-0 left-0 h-full bg-[#f4d35e] rounded-full"
                                style={{ width: `${(progress / duration) * 100}%` }}
                            />
                            {/* Thumb on hover */}
                            <div
                                className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
                                style={{ left: `${(progress / duration) * 100}%` }}
                            />
                        </div>
                        <span>{formatTime(duration)}</span>
                    </div>
                </div>

                {/* Volume / Extra (Placeholder for now) */}
                <div className="w-1/4 flex justify-end">
                    {/* Volume slider could go here */}
                </div>
            </motion.div>
        </AnimatePresence>
    );
}
