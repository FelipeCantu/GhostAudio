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
  Shuffle,
  Repeat,
  Repeat1,
  ListMusic,
  Moon,
} from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

function formatTime(seconds: number): string {
  if (!seconds || !isFinite(seconds) || isNaN(seconds)) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

// Cycle order for sleep timer: null means off
const SLEEP_STEPS: Array<number | null> = [null, 15, 30, 45, 60];

export default function PlayerBar() {
  const {
    currentTrack,
    currentAlbum,
    isPlaying,
    togglePlay,
    nextTrack,
    prevTrack,
    playTrack,
    progress,
    duration,
    seek,
    volume,
    setVolume,
    isLoading,
    error,
    queue,
    shuffleMode,
    toggleShuffle,
    repeatMode,
    cycleRepeat,
    sleepMinutes,
    setSleepTimer,
  } = usePlayer();

  const [isMuted, setIsMuted] = useState(false);
  const [prevVolume, setPrevVolume] = useState(1);
  const [isExpanded, setIsExpanded] = useState(false);
  const [showQueue, setShowQueue] = useState(false);
  const pathname = usePathname();

  // Refs for click-outside detection on the queue panel
  const queuePanelRef = useRef<HTMLDivElement>(null);
  const queueButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!showQueue) return;
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as Node;
      const outsidePanel = !queuePanelRef.current?.contains(target);
      const outsideButton = !queueButtonRef.current?.contains(target);
      if (outsidePanel && outsideButton) {
        setShowQueue(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [showQueue]);

  // Hide player on landing page or if no track loaded
  if (!currentTrack || pathname === "/") return null;

  const displayDuration = duration && isFinite(duration) ? duration : 0;
  const progressPercent = displayDuration > 0 ? (progress / displayDuration) * 100 : 0;
  const coverArt = currentAlbum?.coverArt;
  const repeatActive = repeatMode !== "off";
  const RepeatIcon = repeatMode === "one" ? Repeat1 : Repeat;

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

  const cycleSleepTimer = () => {
    const currentIdx = SLEEP_STEPS.indexOf(sleepMinutes);
    const nextValue = SLEEP_STEPS[(currentIdx + 1) % SLEEP_STEPS.length];
    setSleepTimer(nextValue);
  };

  return (
    <>
      {/* ─────────────────────────────────────────────────────────────────────────
          Full-screen expanded player (mobile only)
      ───────────────────────────────────────────────────────────────────────── */}
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
              {/* Header: close | Now Playing | Sleep */}
              <div className="flex items-center justify-between pt-6 pb-2">
                <button
                  onClick={() => setIsExpanded(false)}
                  className="p-2 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
                  aria-label="Collapse player"
                >
                  <ChevronDown size={22} />
                </button>

                <p className="text-xs font-bold uppercase tracking-widest text-zinc-400">
                  Now Playing
                </p>

                {/* Sleep timer button */}
                <button
                  onClick={cycleSleepTimer}
                  className={`relative rounded-full transition-colors min-w-[44px] min-h-[44px] flex flex-col items-center justify-center gap-0.5 ${
                    sleepMinutes !== null
                      ? "bg-[#f4d35e]/15 text-[#f4d35e]"
                      : "bg-white/10 text-zinc-400 hover:bg-white/20 hover:text-white"
                  }`}
                  aria-label={
                    sleepMinutes !== null
                      ? `Sleep timer active: ${sleepMinutes} minutes`
                      : "Set sleep timer"
                  }
                >
                  <Moon size={18} />
                  {sleepMinutes !== null && (
                    <span className="text-[9px] font-bold leading-none">{sleepMinutes}m</span>
                  )}
                </button>
              </div>

              {/* Large rotating album art */}
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

              {/* Track info */}
              <div className="mb-8 text-center">
                <h2 className="text-2xl font-bold text-white truncate mb-1">
                  {currentTrack.title}
                </h2>
                <p className="text-zinc-400 text-sm">
                  {currentAlbum?.artist || "Unknown Artist"}
                  {currentAlbum?.title ? ` · ${currentAlbum.title}` : ""}
                </p>
                {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
              </div>

              {/* Progress bar */}
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

              {/* Playback controls */}
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
              <div className="flex items-center gap-3 mb-6 px-2">
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

              {/* Shuffle + Repeat */}
              <div className="flex items-center justify-center gap-10 mb-10">
                <button
                  onClick={toggleShuffle}
                  className={`relative flex flex-col items-center min-w-[44px] min-h-[44px] justify-center transition-colors ${
                    shuffleMode ? "text-[#f4d35e]" : "text-zinc-500 hover:text-zinc-300"
                  }`}
                  aria-label={shuffleMode ? "Disable shuffle" : "Enable shuffle"}
                  aria-pressed={shuffleMode}
                >
                  <Shuffle size={22} />
                  {shuffleMode && (
                    <span className="absolute bottom-1.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-[#f4d35e]" />
                  )}
                </button>

                <button
                  onClick={cycleRepeat}
                  className={`relative flex flex-col items-center min-w-[44px] min-h-[44px] justify-center transition-colors ${
                    repeatActive ? "text-[#f4d35e]" : "text-zinc-500 hover:text-zinc-300"
                  }`}
                  aria-label={`Repeat mode: ${repeatMode}`}
                >
                  <RepeatIcon size={22} />
                  {repeatActive && (
                    <span className="absolute bottom-1.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-[#f4d35e]" />
                  )}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─────────────────────────────────────────────────────────────────────────
          Queue panel (desktop, slides in from right)
      ───────────────────────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {showQueue && (
          <motion.div
            key="queue-panel"
            ref={queuePanelRef}
            initial={{ opacity: 0, x: 12, scale: 0.97 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 12, scale: 0.97 }}
            transition={{ type: "spring", damping: 28, stiffness: 360 }}
            className="fixed right-4 bottom-24 lg:bottom-24 w-72 max-h-96 bg-[#0a1420]/98 backdrop-blur-xl border border-white/10 rounded-xl overflow-hidden z-40 shadow-2xl shadow-black/60"
          >
            {/* Panel header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/8 flex-shrink-0">
              <div className="flex items-center gap-2">
                <ListMusic size={14} className="text-zinc-400" />
                <span className="text-sm font-bold text-white">Queue</span>
              </div>
              <span className="text-xs text-zinc-500 tabular-nums">
                {queue.length} track{queue.length !== 1 ? "s" : ""}
              </span>
            </div>

            {/* Track list */}
            <div className="overflow-y-auto" style={{ maxHeight: "calc(24rem - 48px)" }}>
              {queue.length === 0 ? (
                <p className="text-sm text-zinc-500 text-center py-8 px-4">
                  No tracks in queue
                </p>
              ) : (
                queue.map((track, idx) => {
                  const isCurrent = track.id === currentTrack.id;
                  return (
                    <button
                      key={`queue-${track.id}-${idx}`}
                      onClick={() => {
                        playTrack(track, queue, currentAlbum ?? undefined);
                        setShowQueue(false);
                      }}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                        isCurrent
                          ? "bg-[#f4d35e]/8 hover:bg-[#f4d35e]/12"
                          : "hover:bg-white/6"
                      }`}
                      aria-label={`Play ${track.title}`}
                      aria-current={isCurrent ? "true" : undefined}
                    >
                      <span
                        className={`text-xs font-mono w-5 text-right flex-shrink-0 ${
                          isCurrent ? "text-[#f4d35e]" : "text-zinc-600"
                        }`}
                      >
                        {idx + 1}
                      </span>
                      <span
                        className={`text-sm truncate flex-1 ${
                          isCurrent
                            ? "text-[#f4d35e] font-semibold"
                            : "text-zinc-300"
                        }`}
                      >
                        {track.title}
                      </span>
                      {isCurrent && (
                        <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-[#f4d35e] animate-pulse" />
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─────────────────────────────────────────────────────────────────────────
          Persistent Player Bar
      ───────────────────────────────────────────────────────────────────────── */}
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
            "bottom-16 lg:bottom-0",
          ].join(" ")}
        >
          {/* Desktop progress bar — sits above the main bar */}
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
            {/* ── Left: Track info ── */}
            <button
              className="flex items-center gap-2.5 md:gap-4 flex-1 md:w-1/4 md:flex-none min-w-0 text-left lg:cursor-default"
              onClick={() => setIsExpanded(true)}
              aria-label="Expand player"
            >
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

            {/* ── Center: Desktop controls (shuffle · prev · play · next · repeat) ── */}
            <div className="hidden md:flex items-center gap-3 md:gap-4 flex-shrink-0">
              {/* Shuffle */}
              <button
                onClick={toggleShuffle}
                className={`relative flex flex-col items-center min-w-[32px] min-h-[32px] justify-center transition-colors ${
                  shuffleMode ? "text-[#f4d35e]" : "text-zinc-500 hover:text-zinc-300"
                }`}
                aria-label={shuffleMode ? "Disable shuffle" : "Enable shuffle"}
                aria-pressed={shuffleMode}
              >
                <Shuffle size={16} />
                {shuffleMode && (
                  <span className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-[#f4d35e]" />
                )}
              </button>

              <button
                onClick={prevTrack}
                className="text-zinc-400 hover:text-white transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center"
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

              {/* Repeat */}
              <button
                onClick={cycleRepeat}
                className={`relative flex flex-col items-center min-w-[32px] min-h-[32px] justify-center transition-colors ${
                  repeatActive ? "text-[#f4d35e]" : "text-zinc-500 hover:text-zinc-300"
                }`}
                aria-label={`Repeat mode: ${repeatMode}`}
              >
                <RepeatIcon size={16} />
                {repeatActive && (
                  <span className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-[#f4d35e]" />
                )}
              </button>
            </div>

            {/* ── Center: Mobile controls (play + skip) ── */}
            <div className="flex md:hidden items-center gap-3 flex-shrink-0">
              <button
                onClick={togglePlay}
                className="w-10 h-10 rounded-full bg-white text-black flex items-center justify-center hover:scale-105 active:scale-95 transition-transform shadow-lg"
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

            {/* ── Right: Desktop time + volume + queue ── */}
            <div className="hidden md:flex items-center gap-2 w-1/4 justify-end">
              <div className="flex items-center gap-1.5 font-mono text-xs text-zinc-500 mr-1">
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
                className="w-20 h-1 accent-[#f4d35e] bg-white/10 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white"
                aria-label="Volume"
              />

              {/* Queue toggle button */}
              <button
                ref={queueButtonRef}
                onClick={() => setShowQueue((prev) => !prev)}
                className={`ml-1 rounded-md transition-colors min-w-[32px] min-h-[32px] flex items-center justify-center ${
                  showQueue
                    ? "text-[#f4d35e] bg-[#f4d35e]/10"
                    : "text-zinc-500 hover:text-zinc-300 hover:bg-white/6"
                }`}
                aria-label={showQueue ? "Hide queue" : "Show queue"}
                aria-expanded={showQueue}
              >
                <ListMusic size={16} />
              </button>
            </div>

            {/* ── Mobile: expand chevron ── */}
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
