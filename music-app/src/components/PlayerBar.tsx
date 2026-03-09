"use client";

import { usePathname } from "next/navigation";
import { usePlayer } from "@/context/PlayerContext";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Disc,
  Volume2,
  VolumeX,
  Loader2,
  ChevronDown,
  X,
} from "lucide-react";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

function formatTime(seconds: number): string {
  if (!seconds || !isFinite(seconds) || isNaN(seconds)) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export default function PlayerBar() {
  const {
    currentTrack,
    currentAlbum,
    isPlaying,
    togglePlay,
    nextTrack,
    prevTrack,
    progress,
    duration,
    seek,
    volume,
    setVolume,
    isLoading,
    error,
  } = usePlayer();

  const [isMuted, setIsMuted] = useState(false);
  const [prevVolume, setPrevVolume] = useState(1);
  const [isExpanded, setIsExpanded] = useState(false);
  const pathname = usePathname();

  // Hide player on landing page or if no track is playing
  if (!currentTrack || pathname === "/") return null;

  const displayDuration =
    duration && isFinite(duration) ? duration : 0;
  const progressPercent =
    displayDuration > 0 ? (progress / displayDuration) * 100 : 0;

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

  const handleSeek = (
    e: React.MouseEvent<HTMLDivElement>,
    containerEl: HTMLDivElement | null
  ) => {
    if (!containerEl || displayDuration <= 0) return;
    const rect = containerEl.getBoundingClientRect();
    const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    seek(percent * displayDuration);
  };

  const coverArt = currentAlbum?.coverArt;

  return (
    <>
      {/* ── Full-screen expanded player (mobile only) ── */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            key="expanded-player"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className="fixed inset-0 z-[60] lg:hidden flex flex-col"
            style={{
              background: "linear-gradient(180deg, #0d1b2a 0%, #0a1520 60%, #060e16 100%)",
            }}
          >
            {/* Blurred cover art backdrop */}
            {coverArt && (
              <div
                className="absolute inset-0 opacity-20"
                style={{
                  backgroundImage: `url(${coverArt})`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                  filter: "blur(40px)",
                }}
              />
            )}

            <div className="relative z-10 flex flex-col h-full px-6 pt-safe">
              {/* Drag handle / close */}
              <div className="flex items-center justify-between pt-6 pb-2">
                <button
                  onClick={() => setIsExpanded(false)}
                  className="p-2 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
                  aria-label="Collapse player"
                >
                  <ChevronDown size={22} />
                </button>
                <p className="text-xs font-bold uppercase tracking-widest text-zinc-400">Now Playing</p>
                <div className="w-[44px]" />
              </div>

              {/* Album Art — large */}
              <div className="flex-1 flex items-center justify-center py-8">
                <motion.div
                  animate={{ rotate: isPlaying ? 360 : 0 }}
                  transition={{
                    repeat: Infinity,
                    duration: 20,
                    ease: "linear",
                    ...(isPlaying ? {} : { repeatType: "loop" }),
                  }}
                  className="w-64 h-64 rounded-full overflow-hidden bg-gradient-to-br from-zinc-800 to-zinc-900 shadow-2xl shadow-black/50 border border-white/10 flex items-center justify-center"
                  style={isPlaying ? {} : { animationPlayState: "paused" }}
                >
                  {coverArt ? (
                    <img
                      src={coverArt}
                      alt={currentAlbum?.title ?? "Now playing"}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <Disc size={80} className="text-zinc-600" />
                  )}
                </motion.div>
              </div>

              {/* Track Info */}
              <div className="mb-8 text-center">
                <h2 className="text-2xl font-bold text-white truncate mb-1">
                  {currentTrack.title}
                </h2>
                <p className="text-zinc-400 text-sm">
                  {currentAlbum?.artist || "Unknown Artist"}
                  {currentAlbum?.title ? ` · ${currentAlbum.title}` : ""}
                </p>
                {error && (
                  <p className="text-xs text-red-400 mt-2">{error}</p>
                )}
              </div>

              {/* Progress */}
              <div className="mb-6">
                <div
                  className="relative h-1.5 bg-white/10 rounded-full cursor-pointer active:h-2 transition-all"
                  onClick={(e) => handleSeek(e, e.currentTarget)}
                  role="slider"
                  aria-label="Track progress"
                  aria-valuenow={Math.round(progressPercent)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <div
                    className="h-full bg-gradient-to-r from-[#f4d35e] to-[#ee964b] rounded-full relative"
                    style={{ width: `${progressPercent}%` }}
                  >
                    <div className="absolute inset-0 bg-[#f4d35e] blur-sm opacity-60 rounded-full" />
                  </div>
                  <div
                    className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 bg-white rounded-full shadow-lg z-10"
                    style={{ left: `${progressPercent}%` }}
                  />
                </div>
                <div className="flex justify-between mt-2 text-xs font-mono text-zinc-500">
                  <span>{formatTime(progress)}</span>
                  <span>{displayDuration > 0 ? formatTime(displayDuration) : "--:--"}</span>
                </div>
              </div>

              {/* Controls */}
              <div className="flex items-center justify-center gap-10 mb-8">
                <button
                  onClick={prevTrack}
                  className="text-zinc-400 hover:text-white transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
                  aria-label="Previous track"
                >
                  <SkipBack size={28} />
                </button>
                <button
                  onClick={togglePlay}
                  className="w-16 h-16 rounded-full bg-[#f4d35e] text-[#0d3b66] flex items-center justify-center hover:scale-105 active:scale-95 transition-transform shadow-xl shadow-[#f4d35e]/30"
                  aria-label={isPlaying ? "Pause" : "Play"}
                >
                  {isLoading ? (
                    <Loader2 size={28} className="animate-spin" />
                  ) : isPlaying ? (
                    <Pause size={28} fill="currentColor" />
                  ) : (
                    <Play size={28} fill="currentColor" className="ml-1" />
                  )}
                </button>
                <button
                  onClick={nextTrack}
                  className="text-zinc-400 hover:text-white transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
                  aria-label="Next track"
                >
                  <SkipForward size={28} />
                </button>
              </div>

              {/* Volume */}
              <div className="flex items-center gap-3 mb-10 px-2">
                <button
                  onClick={toggleMute}
                  className="text-zinc-400 hover:text-white transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
                  aria-label={isMuted ? "Unmute" : "Mute"}
                >
                  {isMuted || volume === 0 ? <VolumeX size={20} /> : <Volume2 size={20} />}
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
                  className="flex-1 h-1 accent-[#f4d35e] bg-white/10 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[#f4d35e]"
                  aria-label="Volume"
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Persistent Player Bar ── */}
      <AnimatePresence>
        <motion.div
          key="player-bar"
          initial={{ y: 100 }}
          animate={{ y: 0 }}
          exit={{ y: 100 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className={[
            "fixed left-0 right-0 z-50",
            "bg-[#0a1420]/97 backdrop-blur-2xl border-t border-white/8",
            /* On mobile: sit just above the bottom nav (64px) */
            "bottom-16 lg:bottom-0",
          ].join(" ")}
        >
          {/* Desktop Progress Bar — shown above main bar */}
          <div
            className="hidden md:block h-1 bg-white/8 cursor-pointer relative group"
            onClick={(e) => handleSeek(e, e.currentTarget)}
            role="slider"
            aria-label="Track progress"
            aria-valuenow={Math.round(progressPercent)}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="h-full bg-gradient-to-r from-[#f4d35e] to-[#ee964b] relative transition-all duration-150"
              style={{ width: `${progressPercent}%` }}
            >
              <div className="absolute inset-0 bg-[#f4d35e]/50 blur-sm" />
            </div>
            <div
              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 bg-white rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity z-10"
              style={{ left: `${progressPercent}%` }}
            />
          </div>

          <div className="h-16 md:h-20 px-3 md:px-6 flex items-center justify-between gap-2">
            {/* Track Info — clickable on mobile to expand */}
            <button
              className="flex items-center gap-2.5 md:gap-4 flex-1 md:w-1/4 md:flex-none min-w-0 text-left lg:cursor-default"
              onClick={() => setIsExpanded(true)}
              aria-label="Expand player"
            >
              {/* Cover Art */}
              <div className="relative w-10 h-10 md:w-12 md:h-12 rounded-lg overflow-hidden bg-black/50 border border-white/8 flex-shrink-0">
                {coverArt ? (
                  <img
                    src={coverArt}
                    alt={currentAlbum?.title ?? "Now playing"}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-zinc-800 to-zinc-900">
                    <Disc
                      size={20}
                      className={`text-zinc-500 ${isPlaying ? "animate-[spin_4s_linear_infinite]" : ""}`}
                    />
                  </div>
                )}
              </div>

              <div className="min-w-0">
                <p className="font-semibold text-white truncate text-sm leading-tight">
                  {currentTrack.title}
                </p>
                <p className="text-xs text-zinc-400 truncate">
                  {currentAlbum?.artist ?? `Track ${currentTrack.track_number}`}
                </p>
                {error && (
                  <p className="text-[10px] text-red-400 truncate mt-0.5">{error}</p>
                )}
              </div>
            </button>

            {/* Center Controls */}
            <div className="flex items-center gap-3 md:gap-6 flex-shrink-0">
              <button
                onClick={prevTrack}
                className="hidden md:flex text-zinc-400 hover:text-white transition-colors min-w-[36px] min-h-[36px] items-center justify-center"
                aria-label="Previous track"
              >
                <SkipBack size={20} />
              </button>

              <button
                onClick={togglePlay}
                className="w-10 h-10 md:w-11 md:h-11 rounded-full bg-white text-black flex items-center justify-center hover:scale-105 active:scale-95 transition-transform shadow-lg"
                aria-label={isPlaying ? "Pause" : "Play"}
              >
                {isLoading ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : isPlaying ? (
                  <Pause size={18} fill="currentColor" />
                ) : (
                  <Play size={18} fill="currentColor" className="ml-0.5" />
                )}
              </button>

              <button
                onClick={nextTrack}
                className="text-zinc-400 hover:text-white transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center"
                aria-label="Next track"
              >
                <SkipForward size={20} />
              </button>
            </div>

            {/* Desktop: Time + Volume */}
            <div className="hidden md:flex items-center gap-3 w-1/4 justify-end">
              <div className="flex items-center gap-2 font-mono text-xs text-zinc-500 mr-2">
                <span>{formatTime(progress)}</span>
                <span>/</span>
                <span>{displayDuration > 0 ? formatTime(displayDuration) : "--:--"}</span>
              </div>
              <button
                onClick={toggleMute}
                className="text-zinc-400 hover:text-white transition-colors min-w-[32px] min-h-[32px] flex items-center justify-center"
                aria-label={isMuted ? "Unmute" : "Mute"}
              >
                {isMuted || volume === 0 ? <VolumeX size={17} /> : <Volume2 size={17} />}
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
                aria-label="Volume"
              />
            </div>

            {/* Mobile: expand chevron hint */}
            <button
              onClick={() => setIsExpanded(true)}
              className="md:hidden text-zinc-600 hover:text-zinc-400 transition-colors min-w-[32px] min-h-[32px] flex items-center justify-center"
              aria-label="Expand player"
            >
              <ChevronDown size={16} className="rotate-180" />
            </button>
          </div>
        </motion.div>
      </AnimatePresence>
    </>
  );
}
