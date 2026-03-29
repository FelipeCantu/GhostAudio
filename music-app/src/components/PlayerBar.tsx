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
  X,
  SlidersHorizontal,
  Gauge,
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
    shuffleQueue,
    repeatMode,
    cycleRepeat,
    sleepMinutes,
    setSleepTimer,
    eqGains,
    setEqGain,
    getAnalyser,
    normalise,
    toggleNormalise,
  } = usePlayer();

  const [isMuted, setIsMuted] = useState(false);
  const [prevVolume, setPrevVolume] = useState(1);
  const [isExpanded, setIsExpanded] = useState(false);
  const [showQueue, setShowQueue] = useState(false);
  const [showEQ, setShowEQ] = useState(false);
  const visualizerRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef  = useRef<number | null>(null);
  const [discImgError, setDiscImgError] = useState(false);
  const [cdArtUrl, setCdArtUrl] = useState<string | null>(null);
  const [scrubbing, setScrubbing] = useState(false);
  const [scrubValue, setScrubValue] = useState(0);
  const [barHovered, setBarHovered] = useState(false);
  const pathname = usePathname();

  // In-component cache so the same MBID is never re-fetched across track changes
  const cdArtCache = useRef<Map<string, string | null>>(new Map());

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

  // ── Frequency visualizer ──────────────────────────────────────────────────
  useEffect(() => {
    const canvas = visualizerRef.current;
    if (!canvas) return;

    if (!isPlaying) {
      // Fade bars to zero when paused
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      const ctx2d = canvas.getContext("2d");
      if (ctx2d) ctx2d.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }

    const analyser = getAnalyser();
    if (!analyser) return;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    const ctx2d = canvas.getContext("2d");
    if (!ctx2d) return;

    // Mobile battery / GC optimisation: stop the rAF loop while the page is
    // hidden (background tab, screen off). requestAnimationFrame is supposed
    // to pause automatically when the page is not visible, but:
    //   • Some Android WebViews keep firing rAF at a reduced rate (~1 fps)
    //     which still forces GC pressure on the JS heap.
    //   • Chrome on Android may batch rAF callbacks when returning to the
    //     foreground, causing a CPU spike that can interrupt the audio decode
    //     thread for tens of milliseconds → audible glitch.
    // Stopping explicitly and restarting on visibility is the safest approach.
    let paused = false;

    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        paused = true;
        if (animFrameRef.current) {
          cancelAnimationFrame(animFrameRef.current);
          animFrameRef.current = null;
        }
      } else {
        paused = false;
        draw(); // restart the loop
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    const draw = () => {
      if (paused) return;
      animFrameRef.current = requestAnimationFrame(draw);
      analyser.getByteFrequencyData(dataArray);

      const { width, height } = canvas;
      ctx2d.clearRect(0, 0, width, height);

      // Show ~60% of bins (upper bins are mostly silence for music)
      const usableBins = Math.floor(bufferLength * 0.6);
      const barW = width / usableBins;

      for (let i = 0; i < usableBins; i++) {
        const v = dataArray[i] / 255;
        const barH = v * height;
        // Gold-to-orange gradient matching the app accent colours
        const hue = 45 - v * 15;
        const lightness = 55 + v * 15;
        ctx2d.fillStyle = `hsla(${hue}, 90%, ${lightness}%, ${0.5 + v * 0.5})`;
        ctx2d.fillRect(i * barW, height - barH, barW - 1, barH);
      }
    };

    draw();
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [isPlaying, getAnalyser]);

  // Fetch the "Medium" CD image from Cover Art Archive when track changes.
  // If the cover art URL is from CoverArtArchive, extract the MBID directly.
  // Otherwise, fall back to a MusicBrainz search by artist + album title.
  useEffect(() => {
    setCdArtUrl(null);
    setDiscImgError(false);
    if (!currentAlbum) return;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    const fetchMediumArt = async (mbid: string) => {
      const cached = cdArtCache.current.get(mbid);
      if (cached !== undefined) { setCdArtUrl(cached); return; }
      const r = await fetch(`/api/coverart/${mbid}`, { signal: controller.signal });
      const data = await r.json();
      const medium = (data.images as Array<{ types: string[]; image: string }> | undefined)
        ?.find((img) => Array.isArray(img.types) && img.types.includes("Medium"));
      const url = medium?.image ?? null;
      cdArtCache.current.set(mbid, url);
      setCdArtUrl(url);
    };

    const run = async () => {
      try {
        const art = currentAlbum.coverArt;
        // Path 1: MBID embedded in a CoverArtArchive URL
        const mbidInUrl = art?.match(/coverartarchive\.org\/release\/([0-9a-f-]{36})/i)?.[1];
        if (mbidInUrl) { await fetchMediumArt(mbidInUrl); return; }

        // Path 2: cover art from R2 or another source — search MusicBrainz
        const artist = currentAlbum.artist;
        const title = currentAlbum.title;
        if (!artist || !title) return;
        const searchKey = `mb::${artist}::${title}`;
        let mbid = cdArtCache.current.get(searchKey);
        if (mbid === undefined) {
          const q = `release:${encodeURIComponent(title)}+AND+artist:${encodeURIComponent(artist)}`;
          const r = await fetch(
            `https://musicbrainz.org/ws/2/release/?query=${q}&fmt=json&limit=1`,
            { signal: controller.signal, headers: { "User-Agent": "GhostApp/1.0 (ghost.app)" } }
          );
          const data = await r.json();
          mbid = (data.releases?.[0]?.id as string | undefined) ?? null;
          cdArtCache.current.set(searchKey, mbid);
        }
        if (mbid) await fetchMediumArt(mbid);
      } catch {
        // AbortError (timeout) or network failure — silently ignore
      } finally {
        clearTimeout(timeoutId);
      }
    };

    run();

    return () => {
      controller.abort();
      clearTimeout(timeoutId);
    };
  }, [currentAlbum?.coverArt, currentAlbum?.artist, currentAlbum?.title]);

  // Hide player on landing page or if no track loaded
  if (!currentTrack || pathname === "/") return null;

  const displayDuration = duration && isFinite(duration) ? duration : 0;
  const rangeValue = scrubbing ? scrubValue : progress;
  const displayPercent = displayDuration > 0 ? (rangeValue / displayDuration) * 100 : 0;
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

  // ── Scrubber handlers for <input type="range"> ──────────────────────────────
  // onChange fires on every frame during drag AND on click — update the preview.
  // We only call seek() on pointerUp so we don't hammer the audio element.
  const handleRangeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setScrubbing(true);
    setScrubValue(parseFloat(e.target.value));
  };

  const handleRangeCommit = (e: React.PointerEvent<HTMLInputElement>) => {
    const val = parseFloat((e.target as HTMLInputElement).value);
    seek(val);
    setScrubbing(false);
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
            className="fixed inset-0 z-[60] lg:hidden flex flex-col bg-[#060e16]"
          >
            {/* Blurred cover art backdrop — Spotify/Apple Music style */}
            {coverArt && (
              <>
                <div
                  className="absolute inset-0"
                  style={{
                    backgroundImage: `url(${coverArt})`,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                    filter: "blur(60px)",
                    transform: "scale(1.3)",
                    opacity: 0.85,
                  }}
                />
                {/* Gradient fade: art dominates top half → near-black at bottom for controls */}
                <div className="absolute inset-0 bg-gradient-to-b from-black/5 via-black/40 to-black/90" />
              </>
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
                  className="relative w-64 h-64 rounded-full overflow-hidden shadow-2xl shadow-black/60"
                  style={!isPlaying ? { animationPlayState: "paused" } : {}}
                >
                  {/* CD label — Medium image from Cover Art Archive, falls back to front cover */}
                  <div className="absolute inset-0">
                    {(cdArtUrl || coverArt) && !discImgError ? (
                      <img
                        src={cdArtUrl || coverArt!}
                        alt={currentAlbum?.title ?? "Now playing"}
                        className="w-full h-full object-cover"
                        loading="lazy"
                        onError={() => {
                          // If cdArtUrl failed, retry with plain coverArt
                          if (cdArtUrl) { setCdArtUrl(null); }
                          else { setDiscImgError(true); }
                        }}
                      />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-zinc-800 to-zinc-900 flex items-center justify-center">
                        <Disc size={80} className="text-zinc-600" />
                      </div>
                    )}
                  </div>

                  {/* Outer dark polycarbonate rim */}
                  <div
                    className="absolute inset-0 rounded-full"
                    style={{
                      background:
                        "radial-gradient(circle, transparent 83%, rgba(0,0,0,0.5) 87%, rgba(0,0,0,0.85) 100%)",
                    }}
                  />

                  {/* Iridescent CD data ring — subtle hint, not a wash */}
                  <div
                    className="absolute inset-0 rounded-full"
                    style={{
                      background:
                        "conic-gradient(from 0deg, #ff6b6b33, #ffd93d33, #6bcb7733, #4d96ff33, #c77dff33, #ff9f1c33, #ff6b6b33)",
                      maskImage:
                        "radial-gradient(circle, transparent 82%, black 84%, black 95%, transparent 97%)",
                      WebkitMaskImage:
                        "radial-gradient(circle, transparent 82%, black 84%, black 95%, transparent 97%)",
                    }}
                  />

                  {/* Surface sheen / light reflection — very subtle */}
                  <div
                    className="absolute inset-0 rounded-full"
                    style={{
                      background:
                        "linear-gradient(135deg, rgba(255,255,255,0.08) 0%, transparent 45%, rgba(0,0,0,0.10) 100%)",
                    }}
                  />

                  {/* Center hub hole */}
                  <div
                    className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-9 h-9 rounded-full z-10"
                    style={{
                      background:
                        "radial-gradient(circle, rgba(20,25,35,0.95) 40%, rgba(8,12,20,0.98) 100%)",
                      boxShadow:
                        "inset 0 1px 4px rgba(255,255,255,0.12), 0 0 0 1px rgba(255,255,255,0.07)",
                    }}
                  />
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

              {/* Progress bar — native range input, click or drag to seek */}
              <div className="mb-3">
                <input
                  type="range"
                  min={0}
                  max={displayDuration || 100}
                  step={0.1}
                  value={rangeValue}
                  onChange={handleRangeChange}
                  onPointerUp={handleRangeCommit}
                  aria-label="Track progress"
                  className={[
                    "w-full appearance-none cursor-pointer bg-transparent outline-none rounded-full",
                    "[&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:h-full",
                    "[&::-moz-range-track]:rounded-full [&::-moz-range-track]:h-full",
                    "[&::-webkit-slider-thumb]:appearance-none",
                    scrubbing
                      ? "[&::-webkit-slider-thumb]:w-6 [&::-webkit-slider-thumb]:h-6"
                      : "[&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5",
                    "[&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white",
                    "[&::-webkit-slider-thumb]:shadow-xl [&::-webkit-slider-thumb]:transition-all",
                    // Center thumb: -(thumbH − trackH) / 2
                    // normal: -(20 − 6) / 2 = −7px | scrubbing: -(24 − 8) / 2 = −8px
                    scrubbing
                      ? "[&::-webkit-slider-thumb]:-mt-[8px]"
                      : "[&::-webkit-slider-thumb]:-mt-[7px]",
                    "[&::-moz-range-thumb]:border-0",
                    scrubbing
                      ? "[&::-moz-range-thumb]:w-6 [&::-moz-range-thumb]:h-6"
                      : "[&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:h-5",
                    "[&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-white",
                  ].join(" ")}
                  style={{
                    height: scrubbing ? "8px" : "6px",
                    background: `linear-gradient(to right, #f4d35e ${displayPercent}%, rgba(255,255,255,0.15) ${displayPercent}%)`,
                    transition: "height 0.1s",
                  }}
                />
                <div className="flex justify-between mt-2 text-xs font-mono text-zinc-500">
                  <span>{formatTime(rangeValue)}</span>
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
                  onClick={() => {
                    if (!shuffleMode) {
                      setIsExpanded(false);
                      setShowQueue(true);
                    }
                    toggleShuffle();
                  }}
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

      {/* ── EQ panel ─────────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {showEQ && (
          <motion.div
            key="eq-panel"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.18 }}
            className="hidden md:block fixed right-4 z-[55] bg-[#0d1a26]/97 backdrop-blur-2xl border border-white/10 rounded-2xl p-5 shadow-2xl"
            style={{ bottom: "calc(var(--player-height, 80px) + 8px)" }}
          >
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Equaliser</span>
              <button
                onClick={() => setShowEQ(false)}
                className="text-zinc-500 hover:text-white transition-colors"
                aria-label="Close EQ"
              >
                <X size={14} />
              </button>
            </div>

            {/* 3 vertical sliders */}
            <div className="flex gap-6 items-end">
              {(["low", "mid", "high"] as const).map((band) => {
                const labels = { low: "Bass", mid: "Mid", high: "Treble" };
                const freqs  = { low: "80 Hz", mid: "3 kHz", high: "12 kHz" };
                return (
                  <div key={band} className="flex flex-col items-center gap-2">
                    <span className="text-[10px] text-zinc-400 tabular-nums w-8 text-center">
                      {eqGains[band] >= 0 ? "+" : ""}{eqGains[band].toFixed(1)} dB
                    </span>
                    <input
                      type="range"
                      min={-12}
                      max={12}
                      step={0.5}
                      value={eqGains[band]}
                      onChange={(e) => setEqGain(band, parseFloat(e.target.value))}
                      className="appearance-none cursor-pointer accent-[#f4d35e]"
                      style={{
                        writingMode: "vertical-lr",
                        // direction:rtl inverts min/max on Firefox — rotate instead,
                        // which is the correct cross-browser way to make "up = louder".
                        transform: "rotate(180deg)",
                        width: "20px",
                        height: "100px",
                      }}
                      aria-label={`${labels[band]} EQ`}
                    />
                    <span className="text-[10px] font-medium text-white">{labels[band]}</span>
                    <span className="text-[9px] text-zinc-500">{freqs[band]}</span>
                  </div>
                );
              })}
            </div>

            {/* Reset button */}
            <button
              onClick={() => {
                setEqGain("low",  2);
                setEqGain("mid",  1);
                setEqGain("high", 1.5);
              }}
              className="mt-4 w-full text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              Reset to defaults
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─────────────────────────────────────────────────────────────────────────
          Queue panel — Apple Music style
      ───────────────────────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {showQueue && (
          <>
            {/* Mobile backdrop */}
            <motion.div
              key="queue-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="lg:hidden fixed inset-0 bg-black/60 z-[54]"
              onClick={() => setShowQueue(false)}
            />

            {/* Panel */}
            <motion.div
              key="queue-panel"
              ref={queuePanelRef}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 16 }}
              transition={{ type: "spring", damping: 30, stiffness: 350 }}
              className={[
                "fixed z-[55] flex flex-col",
                "bg-[#0d1c2e]/98 backdrop-blur-2xl border border-white/10 rounded-2xl",
                "shadow-2xl shadow-black/70",
                // Mobile: full-width, sits above the player bar
                "inset-x-2 bottom-[138px] max-h-[58vh]",
                // Desktop: right-side panel above player bar
                "lg:inset-x-auto lg:right-4 lg:bottom-24 lg:w-[340px] lg:max-h-[65vh]",
              ].join(" ")}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-5 pt-4 pb-3 flex-shrink-0">
                <h3 className="text-base font-bold text-white">
                  {shuffleMode ? "Shuffle Queue" : "Playing Next"}
                </h3>
                <button
                  onClick={() => setShowQueue(false)}
                  className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/20 transition-colors"
                  aria-label="Close queue"
                >
                  <X size={14} />
                </button>
              </div>

              {/* Now Playing row */}
              <div className="px-4 pb-3 flex-shrink-0">
                <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2 px-1">
                  Now Playing
                </p>
                <div className="flex items-center gap-3 bg-white/6 rounded-xl px-3 py-2.5">
                  <div className="w-10 h-10 rounded-lg overflow-hidden bg-zinc-800 flex-shrink-0 shadow-md">
                    {coverArt ? (
                      <img src={coverArt} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Disc size={18} className="text-zinc-600" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-white truncate">{currentTrack.title}</p>
                    <p className="text-xs text-zinc-400 truncate">
                      {currentAlbum?.artist ?? ""}
                      {currentAlbum?.title ? ` · ${currentAlbum.title}` : ""}
                    </p>
                  </div>
                  {/* Animated equalizer bars */}
                  <div className="flex items-end gap-[3px] h-4 flex-shrink-0">
                    {[0.45, 0.6, 0.5].map((dur, i) => (
                      <motion.div
                        key={i}
                        className="w-[3px] rounded-full bg-[#f4d35e]"
                        animate={isPlaying ? { height: ["3px", "14px", "3px"] } : { height: "3px" }}
                        transition={
                          isPlaying
                            ? { duration: dur, repeat: Infinity, ease: "easeInOut", delay: i * 0.12 }
                            : {}
                        }
                      />
                    ))}
                  </div>
                </div>
              </div>

              {/* Up Next list */}
              {(() => {
                const displayQueue = shuffleMode && shuffleQueue.length > 0 ? shuffleQueue : queue;
                const currentIdx = displayQueue.findIndex(
                  (t) => t.audio_file === currentTrack.audio_file
                );
                const upcomingTracks =
                  currentIdx >= 0 ? displayQueue.slice(currentIdx + 1) : displayQueue;

                return (
                  <>
                    <div className="px-5 pb-2 flex-shrink-0 flex items-center justify-between">
                      <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
                        {shuffleMode ? "Shuffle · Up Next" : "Up Next"}
                      </p>
                      <span className="text-[10px] text-zinc-600">
                        {upcomingTracks.length} left
                      </span>
                    </div>

                    <div className="overflow-y-auto flex-1 pb-3">
                      {upcomingTracks.length === 0 ? (
                        <p className="text-sm text-zinc-600 text-center py-6 px-4">
                          Nothing up next
                        </p>
                      ) : (
                        upcomingTracks.map((track, i) => (
                          <button
                            key={`q-${track.id}-${i}`}
                            onClick={() => {
                              playTrack(track, queue, currentAlbum ?? undefined);
                              setShowQueue(false);
                            }}
                            className="w-full flex items-center gap-3 px-4 py-2 text-left hover:bg-white/5 transition-colors group"
                            aria-label={`Play ${track.title}`}
                          >
                            <div className="w-9 h-9 rounded-lg overflow-hidden bg-zinc-800 flex-shrink-0 shadow">
                              {coverArt ? (
                                <img
                                  src={coverArt}
                                  alt=""
                                  className="w-full h-full object-cover opacity-75 group-hover:opacity-100 transition-opacity"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                  <Disc size={14} className="text-zinc-700" />
                                </div>
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm text-zinc-200 truncate group-hover:text-white transition-colors">
                                {track.title}
                              </p>
                              <p className="text-xs text-zinc-500 truncate">
                                {currentAlbum?.artist ?? ""}
                              </p>
                            </div>
                            <span className="text-xs text-zinc-700 font-mono flex-shrink-0 group-hover:text-zinc-500 transition-colors">
                              {currentIdx + 1 + i + 1}
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                  </>
                );
              })()}
            </motion.div>
          </>
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
          {/* ── Frequency visualizer — desktop only, sits above progress bar ── */}
          <canvas
            ref={visualizerRef}
            width={1200}
            height={28}
            className="hidden md:block w-full"
            style={{ display: "block" }}
          />

          {/* Desktop progress bar — native range input, click or drag to seek */}
          <div
            className="hidden md:block relative"
            onMouseEnter={() => setBarHovered(true)}
            onMouseLeave={() => setBarHovered(false)}
          >
            <input
              type="range"
              min={0}
              max={displayDuration || 100}
              step={0.1}
              value={rangeValue}
              onChange={handleRangeChange}
              onPointerUp={handleRangeCommit}
              aria-label="Track progress"
              className={[
                "w-full appearance-none cursor-pointer bg-transparent outline-none",
                "transition-[height] duration-100",
                // Track height grows on hover/scrub
                scrubbing || barHovered ? "h-2" : "h-1",
                // Track
                "[&::-webkit-slider-runnable-track]:rounded-full",
                "[&::-webkit-slider-runnable-track]:h-full",
                "[&::-moz-range-track]:rounded-full",
                "[&::-moz-range-track]:h-full",
                // Thumb
                "[&::-webkit-slider-thumb]:appearance-none",
                "[&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3",
                "[&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white",
                "[&::-webkit-slider-thumb]:shadow-lg",
                // Center thumb: -(thumbH 12px − trackH) / 2
                // track h-1 (4px) → -4px | track h-2 (8px) → -2px
                scrubbing || barHovered
                  ? "[&::-webkit-slider-thumb]:-mt-[2px]"
                  : "[&::-webkit-slider-thumb]:-mt-[4px]",
                // Visibility
                scrubbing
                  ? "[&::-webkit-slider-thumb]:opacity-100 [&::-webkit-slider-thumb]:scale-125"
                  : barHovered
                  ? "[&::-webkit-slider-thumb]:opacity-100"
                  : "[&::-webkit-slider-thumb]:opacity-0",
                "[&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:h-3",
                "[&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-white",
              ].join(" ")}
              style={{
                background: `linear-gradient(to right, #f4d35e ${displayPercent}%, rgba(255,255,255,0.08) ${displayPercent}%)`,
              }}
            />
          </div>

          {/* Mobile progress line — 2px bar at top of mini player */}
          <div className="md:hidden h-[2px] bg-white/10">
            <div
              className="h-full bg-gradient-to-r from-[#f4d35e] to-[#ee964b]"
              style={{ width: `${displayPercent}%`, transition: "width 0.15s linear" }}
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
                onClick={() => {
                  if (!shuffleMode) setShowQueue(true);
                  toggleShuffle();
                }}
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

              {/* Normalise toggle */}
              <button
                onClick={toggleNormalise}
                className={`rounded-md transition-colors min-w-[32px] min-h-[32px] flex items-center justify-center ${
                  normalise
                    ? "text-[#f4d35e] bg-[#f4d35e]/10"
                    : "text-zinc-500 hover:text-zinc-300 hover:bg-white/6"
                }`}
                aria-label={normalise ? "Normalisation on" : "Normalisation off"}
                title="Volume normalisation (-3 dB)"
              >
                <Gauge size={16} />
              </button>

              {/* EQ toggle button */}
              <button
                onClick={() => setShowEQ((prev) => !prev)}
                className={`rounded-md transition-colors min-w-[32px] min-h-[32px] flex items-center justify-center ${
                  showEQ
                    ? "text-[#f4d35e] bg-[#f4d35e]/10"
                    : "text-zinc-500 hover:text-zinc-300 hover:bg-white/6"
                }`}
                aria-label={showEQ ? "Hide EQ" : "Show EQ"}
              >
                <SlidersHorizontal size={16} />
              </button>

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
              className="md:hidden text-zinc-600 hover:text-zinc-400 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
              aria-label="Expand player"
            >
              <ChevronDown size={18} className="rotate-180" />
            </button>
          </div>
        </motion.div>
      </AnimatePresence>
    </>
  );
}
