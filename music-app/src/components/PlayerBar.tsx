"use client";

import { usePathname } from "next/navigation";

import { usePlayer } from "@/context/PlayerContext";
import { Play, Pause, SkipBack, SkipForward, Disc, Volume2, VolumeX, Loader2 } from "lucide-react";
import Image from "next/image";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

export default function PlayerBar() {
    const { currentTrack, currentAlbum, isPlaying, togglePlay, nextTrack, prevTrack, progress, duration, seek, volume, setVolume, isLoading, error } = usePlayer();
    const [isMuted, setIsMuted] = useState(false);
    const [prevVolume, setPrevVolume] = useState(1);
    const pathname = usePathname();

    // Hide player on landing page or if no track is playing
    if (!currentTrack || pathname === "/") return null;

    const formatTime = (seconds: number) => {
        if (!seconds || !isFinite(seconds) || isNaN(seconds)) return "0:00";
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    // Get track duration from metadata if audio duration not available
    const displayDuration = duration && isFinite(duration) ? duration : 0;

    const toggleMute = () => {
        if (isMuted) {
            setVolume(prevVolume);
            setIsMuted(false);
        } else {
            setPrevVolume(volume);
            setVolume(0);
            setIsMuted(true);
        }
    };

    return (
        <AnimatePresence>
            <motion.div
                initial={{ y: 100 }}
                animate={{ y: 0 }}
                exit={{ y: 100 }}
                className="fixed bottom-0 left-0 right-0 z-50 bg-[#0d1b2a]/95 backdrop-blur-xl border-t border-white/10 h-20 md:h-24 px-4 md:px-6 flex items-center justify-between gap-2"
            >
                {/* Track Info */}
                <div className="flex items-center gap-2 md:gap-4 flex-1 md:w-1/4 md:flex-none min-w-0">
                    <div className="relative w-10 h-10 md:w-14 md:h-14 rounded-lg overflow-hidden bg-black/50 border border-white/5 flex-shrink-0">
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
                        <h4 className="font-bold text-white truncate text-sm md:text-base">{currentTrack.title}</h4>
                        <p className="text-xs text-zinc-400 truncate">
                            {currentAlbum?.artist || `Track ${currentTrack.track_number}`}
                        </p>
                        {error && (
                            <p className="text-xs text-red-400 truncate mt-0.5">{error}</p>
                        )}
                    </div>
                </div>

                {/* Controls */}
                <div className="flex flex-col items-center flex-shrink-0 md:flex-1 md:max-w-xl gap-2">
                    <div className="flex items-center gap-4 md:gap-6">
                        <button onClick={prevTrack} className="hidden md:block text-zinc-400 hover:text-white transition-colors">
                            <SkipBack size={20} />
                        </button>
                        <button
                            onClick={togglePlay}
                            className="w-10 h-10 rounded-full bg-white text-black flex items-center justify-center hover:scale-105 transition-transform"
                        >
                            {isLoading ? (
                                <Loader2 size={20} className="animate-spin" />
                            ) : isPlaying ? (
                                <Pause size={20} fill="currentColor" />
                            ) : (
                                <Play size={20} fill="currentColor" className="ml-0.5" />
                            )}
                        </button>
                        <button onClick={nextTrack} className="text-zinc-400 hover:text-white transition-colors">
                            <SkipForward size={20} />
                        </button>
                    </div>

                    {/* Progress Bar */}
                    <div className="hidden md:flex w-full items-center gap-3 text-xs font-mono">
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

                {/* Volume Controls */}
                <div className="hidden md:flex w-1/4 justify-end items-center gap-2">
                    <button onClick={toggleMute} className="text-zinc-400 hover:text-white transition-colors">
                        {isMuted || volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
                    </button>
                    <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.01"
                        value={isMuted ? 0 : volume}
                        onChange={(e) => {
                            const v = parseFloat(e.target.value);
                            setVolume(v);
                            if (v > 0) setIsMuted(false);
                        }}
                        className="w-24 h-1 accent-[#f4d35e] bg-white/10 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white"
                    />
                </div>
            </motion.div>
        </AnimatePresence>
    );
}
