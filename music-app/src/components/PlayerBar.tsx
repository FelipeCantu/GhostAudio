"use client";

import { usePlayer } from "@/context/PlayerContext";
import { Play, Pause, SkipBack, SkipForward, Disc } from "lucide-react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";

export default function PlayerBar() {
    const { currentTrack, currentAlbum, isPlaying, togglePlay, nextTrack, prevTrack, progress, duration, seek } = usePlayer();

    if (!currentTrack) return null;

    const formatTime = (seconds: number) => {
        if (!seconds || !isFinite(seconds) || isNaN(seconds)) return "0:00";
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    // Get track duration from metadata if audio duration not available
    const displayDuration = duration && isFinite(duration) ? duration : 0;

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
                        {currentAlbum?.coverArt ? (
                            <img
                                src={currentAlbum.coverArt}
                                alt={currentAlbum.title}
                                className="w-full h-full object-cover"
                            />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-zinc-800 to-zinc-900">
                                <Disc size={24} className={`text-zinc-500 ${isPlaying ? 'animate-[spin_4s_linear_infinite]' : ''}`} />
                            </div>
                        )}
                    </div>
                    <div className="min-w-0">
                        <h4 className="font-bold text-white truncate">{currentTrack.title}</h4>
                        <p className="text-xs text-zinc-400 truncate">
                            {currentAlbum?.artist || `Track ${currentTrack.track_number}`}
                        </p>
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
                    <div className="w-full flex items-center gap-3 text-xs font-mono">
                        <span className="text-zinc-400 min-w-[40px] text-right">{formatTime(progress)}</span>
                        <div className="flex-1 h-1.5 bg-white/10 rounded-full cursor-pointer relative group hover:h-2 transition-all"
                            onClick={(e) => {
                                if (displayDuration > 0) {
                                    const rect = e.currentTarget.getBoundingClientRect();
                                    const percent = (e.clientX - rect.left) / rect.width;
                                    seek(percent * displayDuration);
                                }
                            }}
                        >
                            {/* Background track */}
                            <div className="absolute inset-0 rounded-full overflow-hidden">
                                {/* Progress fill with glow */}
                                <div
                                    className="h-full bg-gradient-to-r from-[#f4d35e] to-[#ffd700] rounded-full transition-all duration-150 relative"
                                    style={{ width: displayDuration > 0 ? `${(progress / displayDuration) * 100}%` : '0%' }}
                                >
                                    {/* Glow effect */}
                                    <div className="absolute inset-0 bg-[#f4d35e] blur-sm opacity-50" />
                                </div>
                            </div>
                            {/* Thumb indicator - always visible when playing */}
                            <div
                                className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 bg-white rounded-full shadow-lg shadow-black/30 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                                style={{ left: displayDuration > 0 ? `${(progress / displayDuration) * 100}%` : '0%' }}
                            />
                        </div>
                        <span className="text-zinc-400 min-w-[40px]">{displayDuration > 0 ? formatTime(displayDuration) : '--:--'}</span>
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
