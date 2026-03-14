"use client";

import React, { createContext, useContext, useState, useRef, useEffect, useCallback } from "react";
import { Track, Playlist } from "@/services/api";

interface AlbumInfo {
    title: string;
    artist: string;
    coverArt?: string;
}

interface RecentlyPlayedEntry {
    track: Track;
    albumInfo: AlbumInfo | null;
    playedAt: number;
}

type RepeatMode = "off" | "one" | "all";

interface PlayerContextType {
    currentTrack: Track | null;
    currentAlbum: AlbumInfo | null;
    isPlaying: boolean;
    queue: Track[];
    playTrack: (track: Track, newQueue?: Track[], albumInfo?: AlbumInfo) => void;
    playPlaylist: (playlist: Playlist, startIndex?: number) => void;
    togglePlay: () => void;
    nextTrack: () => void;
    prevTrack: () => void;
    progress: number;
    duration: number;
    seek: (time: number) => void;
    volume: number;
    setVolume: (v: number) => void;
    isLoading: boolean;
    error: string | null;
    // Shuffle + Repeat
    shuffleMode: boolean;
    toggleShuffle: () => void;
    repeatMode: RepeatMode;
    cycleRepeat: () => void;
    // Shuffle queue (pre-generated order, empty when shuffle is off)
    shuffleQueue: Track[];
    // Recently played + play counts
    recentlyPlayed: RecentlyPlayedEntry[];
    playCounts: Record<string, number>;
    // Sleep timer
    sleepMinutes: number | null;
    setSleepTimer: (minutes: number | null) => void;
}

const PlayerContext = createContext<PlayerContextType | undefined>(undefined);

const RECENTLY_PLAYED_KEY = "dizc_recently_played";
const PLAY_COUNTS_KEY = "dizc_play_counts";
const VOLUME_KEY = "dizc_volume";
const MAX_RECENTLY_PLAYED = 20;

function getTrackKey(track: Track, albumInfo?: AlbumInfo | null): string {
    return `${track.title}::${albumInfo?.artist ?? ""}`;
}

function loadFromStorage<T>(key: string, fallback: T): T {
    if (typeof window === "undefined") return fallback;
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return fallback;
        return JSON.parse(raw) as T;
    } catch {
        return fallback;
    }
}

function saveToStorage(key: string, value: unknown): void {
    if (typeof window === "undefined") return;
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch {
        // quota exceeded or private browsing — fail silently
    }
}

export function PlayerProvider({ children }: { children: React.ReactNode }) {
    const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
    const [currentAlbum, setCurrentAlbum] = useState<AlbumInfo | null>(null);
    const [queue, setQueue] = useState<Track[]>([]);
    const [isPlaying, setIsPlaying] = useState(false);
    const [progress, setProgress] = useState(0);
    const [duration, setDuration] = useState(0);
    const [volume, setVolumeState] = useState(() => {
        if (typeof window === "undefined") return 1;
        const stored = parseFloat(localStorage.getItem(VOLUME_KEY) ?? "1");
        return isNaN(stored) ? 1 : Math.max(0, Math.min(1, stored));
    });
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // New state
    const [shuffleMode, setShuffleMode] = useState(false);
    const [repeatMode, setRepeatMode] = useState<RepeatMode>("off");
    const [recentlyPlayed, setRecentlyPlayed] = useState<RecentlyPlayedEntry[]>([]);
    const [playCounts, setPlayCounts] = useState<Record<string, number>>({});
    const [sleepMinutes, setSleepMinutesState] = useState<number | null>(null);
    const [shuffleQueue, setShuffleQueue] = useState<Track[]>([]);

    // Refs for the audio element and stale-closure-safe state
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const currentTrackRef = useRef<Track | null>(null);
    const currentAlbumRef = useRef<AlbumInfo | null>(null);
    const queueRef = useRef<Track[]>([]);
    const shuffleModeRef = useRef(false);
    const repeatModeRef = useRef<RepeatMode>("off");
    const sleepTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    // Stable ref to nextTrackFromRefs so the audio `ended` handler (registered
    // once at mount) always calls the latest version without being stale.
    const nextTrackFromRefsRef = useRef<() => void>(() => {});
    // True while a track-switch is in progress — suppresses spurious abort/pause
    // events that the browser fires when the src is changed mid-playback.
    const isTransitioningRef = useRef(false);
    // Volume ref (always tracks latest user volume, avoids stale closures)
    const fadeTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const volumeRef = useRef(volume);
    // Second audio element used to pre-buffer the next track for gapless playback
    const preloadRef = useRef<HTMLAudioElement | null>(null);
    const preloadedSrcRef = useRef<string | null>(null);
    // Pre-generated shuffled track order — lets us know exactly what comes next
    const shuffleQueueRef = useRef<Track[]>([]);
    const shuffleIndexRef = useRef(0);

    // Extract albumInfo embedded on a track (e.g. from handleShuffleAll),
    // falling back to the provided default.
    function resolveAlbum(track: Track, fallback: AlbumInfo | null): AlbumInfo | null {
        const embedded = (track as unknown as Record<string, unknown>).albumInfo;
        return (embedded as AlbumInfo | undefined) ?? fallback;
    }

    // Fisher-Yates shuffle — returns a new shuffled array.
    function shuffleArray<T>(arr: T[]): T[] {
        const a = [...arr];
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
    }

    // Build a new shuffled play order from `tracks`, placing `currentTrack`
    // at position 0 so the currently-playing song isn't immediately repeated.
    function generateShuffleQueue(tracks: Track[], currentTrack: Track | null): void {
        if (tracks.length === 0) return;
        const others = currentTrack
            ? tracks.filter(t => t.audio_file !== currentTrack.audio_file)
            : tracks;
        const shuffled = shuffleArray(others);
        const newQueue = currentTrack ? [currentTrack, ...shuffled] : shuffled;
        shuffleQueueRef.current = newQueue;
        shuffleIndexRef.current = 0;
        setShuffleQueue(newQueue);
    }

    // Returns the fully-resolved src URL for the upcoming next track.
    // Reads only from refs so it's safe to call from mount-time event handlers.
    function resolveNextSrc(): string | null {
        let next: Track | undefined;

        if (shuffleModeRef.current) {
            // Use the pre-generated shuffle queue — next track is always known
            const sq = shuffleQueueRef.current;
            const nextIdx = shuffleIndexRef.current + 1;
            if (nextIdx >= sq.length) return null; // end of shuffle queue
            next = sq[nextIdx];
        } else {
            const track = currentTrackRef.current;
            const q = queueRef.current;
            if (!track || q.length === 0) return null;
            if (repeatModeRef.current === "one") {
                next = track;
            } else {
                const idx = q.findIndex(t => t.audio_file === track.audio_file);
                if (idx < q.length - 1) next = q[idx + 1];
                else if (repeatModeRef.current === "all") next = q[0];
            }
        }

        if (!next) return null;

        const af = (next as unknown as Record<string, unknown>).audioFile as string | undefined ?? next.audio_file;
        if (!af) return null;

        const isLocal = !af.startsWith("http") && !af.startsWith("localfile://") && !af.startsWith("file://");
        if (isLocal) {
            const isElectron = typeof window !== "undefined" &&
                (window as unknown as Record<string, unknown>).electronAPI !== undefined;
            return isElectron ? `localfile://${af.replace(/\\/g, "/")}` : null;
        }
        return af;
    }

    // Keep refs in sync with state
    useEffect(() => { currentTrackRef.current = currentTrack; }, [currentTrack]);
    useEffect(() => { currentAlbumRef.current = currentAlbum; }, [currentAlbum]);
    useEffect(() => { queueRef.current = queue; }, [queue]);
    useEffect(() => { shuffleModeRef.current = shuffleMode; }, [shuffleMode]);
    useEffect(() => { repeatModeRef.current = repeatMode; }, [repeatMode]);
    useEffect(() => { volumeRef.current = volume; }, [volume]);

    // Load persisted data on mount (SSR-safe)
    useEffect(() => {
        setRecentlyPlayed(loadFromStorage<RecentlyPlayedEntry[]>(RECENTLY_PLAYED_KEY, []));
        setPlayCounts(loadFromStorage<Record<string, number>>(PLAY_COUNTS_KEY, {}));
    }, []);

    // ─── Helpers ────────────────────────────────────────────────────────────────

    const addToRecentlyPlayed = useCallback((track: Track, albumInfo: AlbumInfo | null) => {
        setRecentlyPlayed(prev => {
            // Remove any existing entry for this track (dedup by title)
            const filtered = prev.filter(e => e.track.title !== track.title);
            const next = [{ track, albumInfo, playedAt: Date.now() }, ...filtered].slice(0, MAX_RECENTLY_PLAYED);
            saveToStorage(RECENTLY_PLAYED_KEY, next);
            return next;
        });
    }, []);

    const incrementPlayCount = useCallback((track: Track, albumInfo: AlbumInfo | null) => {
        const key = getTrackKey(track, albumInfo);
        setPlayCounts(prev => {
            const next = { ...prev, [key]: (prev[key] ?? 0) + 1 };
            saveToStorage(PLAY_COUNTS_KEY, next);
            return next;
        });
    }, []);

    // ─── Internal play function that accepts resolved src ────────────────────────

    const playTrackInternal = useCallback((
        track: Track,
        albumInfo: AlbumInfo | null,
        resolvedQueue: Track[],
        skipAddToRecent = false,
    ) => {
        const audioFile = (track as unknown as Record<string, unknown>).audioFile as string | undefined ?? track.audio_file;

        if (!audioFile) {
            console.error("[Player] ERROR: No audio file on track!", track);
            setError("This track has no audio file.");
            setIsLoading(false);
            setIsPlaying(false);
            return;
        }

        const audio = audioRef.current;
        if (!audio) return;

        // Resolve src before any async operation
        let src = audioFile;
        const isLocalPath = src && !src.startsWith("http") && !src.startsWith("localfile://") && !src.startsWith("file://");
        const isElectron = typeof window !== "undefined" && (window as unknown as Record<string, unknown>).electronAPI !== undefined;
        if (isLocalPath) {
            if (!isElectron) {
                setError("This track is stored locally and can only be played in the Desktop App.");
                setIsPlaying(false);
                setIsLoading(false);
                return;
            }
            src = `localfile://${src.replace(/\\/g, "/")}`;
        }

        // Update UI state immediately so the new track info appears right away
        if (!skipAddToRecent) addToRecentlyPlayed(track, albumInfo);
        setCurrentTrack(track);
        currentTrackRef.current = track;
        setCurrentAlbum(albumInfo);
        currentAlbumRef.current = albumInfo;

        // Keep shuffle queue in sync ─────────────────────────────────────────
        if (shuffleModeRef.current) {
            if (resolvedQueue !== queueRef.current) {
                // New source (different album/playlist) — build a fresh shuffle order
                generateShuffleQueue(resolvedQueue, track);
            } else {
                // Same queue — just move the pointer to where we are now
                const idx = shuffleQueueRef.current.findIndex(t => t.audio_file === audioFile);
                if (idx !== -1) shuffleIndexRef.current = idx;
            }
        }

        setQueue(resolvedQueue);
        queueRef.current = resolvedQueue;
        setIsPlaying(true);
        setIsLoading(true);
        setError(null);
        setProgress(0);
        setDuration(0);

        // Cancel any in-progress fade
        if (fadeTimerRef.current !== null) {
            clearInterval(fadeTimerRef.current);
            fadeTimerRef.current = null;
        }

        // If we're switching away from what was preloaded, reset so the next
        // preload cycle picks the correct upcoming track.
        if (preloadedSrcRef.current !== src) {
            preloadedSrcRef.current = null;
        }

        console.log("[Player] Playing src:", src);

        isTransitioningRef.current = true;
        audio.volume = volumeRef.current;
        audio.src = src;
        audio.play().catch(e => {
            isTransitioningRef.current = false;
            if (e.name !== "AbortError") console.error("[Player] Playback failed:", e);
        });
    }, [addToRecentlyPlayed]);

    // ─── nextTrack (ref-safe, used inside ended handler) ─────────────────────────

    const nextTrackFromRefs = useCallback(() => {
        const track = currentTrackRef.current;
        const q = queueRef.current;
        const album = currentAlbumRef.current;

        if (!track) return;

        // Repeat one — restart current track
        if (repeatModeRef.current === "one") {
            if (audioRef.current) {
                audioRef.current.currentTime = 0;
                audioRef.current.play().catch(e => {
                    if (e.name !== "AbortError") console.error("[Player] Repeat-one play failed:", e);
                });
            }
            return;
        }

        if (q.length === 0) return;

        // Shuffle — advance through the pre-generated shuffle queue
        if (shuffleModeRef.current) {
            const sq = shuffleQueueRef.current;
            const nextIdx = shuffleIndexRef.current + 1;
            if (nextIdx < sq.length) {
                shuffleIndexRef.current = nextIdx;
                playTrackInternal(sq[nextIdx], resolveAlbum(sq[nextIdx], album), q);
            } else if (repeatModeRef.current === "all") {
                // Finished the shuffle queue — reshuffle and loop
                generateShuffleQueue(q, null);
                const first = shuffleQueueRef.current[0];
                if (first) playTrackInternal(first, resolveAlbum(first, album), q);
            } else {
                setIsPlaying(false);
                setProgress(0);
            }
            return;
        }

        const currentIndex = q.findIndex(t => t.audio_file === track.audio_file);

        if (currentIndex < q.length - 1) {
            const next = q[currentIndex + 1];
            playTrackInternal(next, resolveAlbum(next, album), q);
        } else if (repeatModeRef.current === "all") {
            // Loop back to start
            playTrackInternal(q[0], resolveAlbum(q[0], album), q);
        } else {
            // End of queue, stop
            setIsPlaying(false);
            setProgress(0);
        }
    }, [playTrackInternal]);

    // Keep the ref always pointing to the latest version of nextTrackFromRefs
    useEffect(() => {
        nextTrackFromRefsRef.current = nextTrackFromRefs;
    }, [nextTrackFromRefs]);

    // ─── Media Session API (lock screen / notification controls) ─────────────────

    // Update metadata whenever the track or album changes
    useEffect(() => {
        if (!("mediaSession" in navigator)) return;
        if (!currentTrack) return;

        const artwork: MediaImage[] = [];
        if (currentAlbum?.coverArt) {
            artwork.push({ src: currentAlbum.coverArt, sizes: "512x512", type: "image/jpeg" });
        }

        navigator.mediaSession.metadata = new MediaMetadata({
            title: currentTrack.title,
            artist: currentAlbum?.artist ?? "",
            album: currentAlbum?.title ?? "",
            artwork,
        });
    }, [currentTrack, currentAlbum]);

    // Sync playback state with the OS
    useEffect(() => {
        if (!("mediaSession" in navigator)) return;
        navigator.mediaSession.playbackState = isPlaying ? "playing" : "paused";
    }, [isPlaying]);

    // Update position state so the lock screen scrubber is accurate
    useEffect(() => {
        if (!("mediaSession" in navigator)) return;
        if (!duration || !isFinite(duration) || duration <= 0) return;
        try {
            navigator.mediaSession.setPositionState({
                duration,
                playbackRate: 1,
                position: Math.min(progress, duration),
            });
        } catch {
            // setPositionState may throw if duration/position are invalid
        }
    }, [progress, duration]);

    // Register action handlers once on mount; read state through refs to avoid stale closures
    useEffect(() => {
        if (!("mediaSession" in navigator)) return;

        navigator.mediaSession.setActionHandler("play", () => {
            audioRef.current?.play().catch(() => {});
            setIsPlaying(true);
        });
        navigator.mediaSession.setActionHandler("pause", () => {
            audioRef.current?.pause();
            setIsPlaying(false);
        });
        navigator.mediaSession.setActionHandler("nexttrack", () => {
            nextTrackFromRefsRef.current();
        });
        navigator.mediaSession.setActionHandler("previoustrack", () => {
            // If more than 3 s in, restart; otherwise go to previous
            if (audioRef.current && audioRef.current.currentTime > 3) {
                audioRef.current.currentTime = 0;
            } else {
                const track = currentTrackRef.current;
                const q = queueRef.current;
                const album = currentAlbumRef.current;
                if (!track || q.length === 0) return;
                const idx = q.findIndex(t => t.audio_file === track.audio_file);
                if (idx > 0) {
                    const prev = q[idx - 1];
                    playTrackInternal(prev, resolveAlbum(prev, album), q);
                }
            }
        });
        navigator.mediaSession.setActionHandler("seekto", (details) => {
            if (details.seekTime !== undefined && audioRef.current) {
                audioRef.current.currentTime = details.seekTime;
                setProgress(details.seekTime);
            }
        });

        return () => {
            (["play", "pause", "nexttrack", "previoustrack", "seekto"] as MediaSessionAction[]).forEach(
                (action) => {
                    try { navigator.mediaSession.setActionHandler(action, null); } catch { /* ignore */ }
                }
            );
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [playTrackInternal]);

    // ─── Audio element setup ──────────────────────────────────────────────────────

    useEffect(() => {
        audioRef.current = new Audio();
        audioRef.current.preload = "auto";
        audioRef.current.volume = loadFromStorage<number>(VOLUME_KEY, 1);
        preloadRef.current = new Audio();
        preloadRef.current.preload = "auto";
        const audio = audioRef.current;

        const handleTimeUpdate = () => {
            setProgress(audio.currentTime);
            if (audio.duration && isFinite(audio.duration) && audio.duration > 0) {
                setDuration(audio.duration);

                // When within 15 s of the end, start buffering the next track so
                // the transition is gapless (browser caches the data before it's needed).
                const remaining = audio.duration - audio.currentTime;
                if (remaining > 0 && remaining < 15 && preloadRef.current) {
                    const nextSrc = resolveNextSrc();
                    if (nextSrc && preloadedSrcRef.current !== nextSrc) {
                        preloadedSrcRef.current = nextSrc;
                        preloadRef.current.src = nextSrc;
                        preloadRef.current.load();
                    }
                }
            }
        };
        const handleLoadedMetadata = () => {
            console.log("[Player] Metadata loaded, duration:", audio.duration);
            if (audio.duration && isFinite(audio.duration)) {
                setDuration(audio.duration);
            }
        };
        const handleDurationChange = () => {
            console.log("[Player] Duration changed:", audio.duration);
            if (audio.duration && isFinite(audio.duration)) {
                setDuration(audio.duration);
            }
        };
        const handleCanPlay = () => {
            console.log("[Player] Can play, duration:", audio.duration);
            if (audio.duration && isFinite(audio.duration)) {
                setDuration(audio.duration);
            }
        };

        // Use refs to avoid stale closures — this handler is registered once at
        // mount, so all mutable state is read through refs.
        const handleEnded = () => {
            const track = currentTrackRef.current;
            const album = currentAlbumRef.current;
            if (track) {
                incrementPlayCount(track, album);
                addToRecentlyPlayed(track, album);
            }
            // Call through the ref so we always invoke the latest version
            nextTrackFromRefsRef.current();
        };

        const handleError = (e: Event) => {
            const audioEl = e.target as HTMLAudioElement;
            const msg = audioEl.error?.message || `Audio error (code ${audioEl.error?.code})`;
            console.error("[Player] Audio error:", msg);
            console.error("[Player] Failed src:", audioEl.src);
            setError(msg);
            setIsLoading(false);
            setIsPlaying(false);
        };
        const handleWaiting = () => setIsLoading(true);
        const handlePlaying = () => {
            isTransitioningRef.current = false;
            setIsLoading(false);
            setError(null);
            setIsPlaying(true);
        };
        // Sync isPlaying if the browser/OS pauses audio externally
        // (e.g. another tab steals audio focus, headphones disconnect, mobile lock screen)
        // Ignore pause events that fire as a side-effect of changing the src.
        const handlePause = () => {
            if (isTransitioningRef.current) return;
            setIsPlaying(false);
        };

        // Browser paused the download (e.g. buffered enough, or network idle).
        // No action needed — playback continues from the buffer; keep UI state as-is.
        const handleSuspend = () => {
            // If audio is unexpectedly paused while we think we're playing, the
            // handlePause listener already handles state sync. Nothing more to do.
        };

        // Network stall — no data arriving. Wait 3 s then try to recover by
        // re-seeking to the current position, which re-triggers buffering.
        // This fires whether the audio is paused or not (it can stall while
        // technically still in a "playing" state), so don't gate on paused.
        const handleStalled = () => {
            if (audioRef.current !== audio) return;
            const currentTime = audio.currentTime;
            setTimeout(() => {
                if (audioRef.current !== audio) return;
                try { audio.currentTime = currentTime; } catch { /* ignore */ }
                if (!audio.paused) {
                    audio.play().catch(() => {});
                }
            }, 3000);
        };

        // The media load was aborted (e.g. src changed mid-load).
        // Ignore aborts that are caused by our own track-switch transitions.
        const handleAbort = () => {
            if (isTransitioningRef.current) return;
            setIsLoading(false);
            setIsPlaying(false);
        };

        // Some Electron versions pause audio when the window is hidden.
        // On becoming visible again, sync React state with actual audio state.
        const handleVisibilityChange = () => {
            if (document.visibilityState === "visible" && audioRef.current) {
                if (!audioRef.current.paused) {
                    setIsPlaying(true);
                }
            }
        };

        audio.addEventListener("timeupdate", handleTimeUpdate);
        audio.addEventListener("loadedmetadata", handleLoadedMetadata);
        audio.addEventListener("durationchange", handleDurationChange);
        audio.addEventListener("canplay", handleCanPlay);
        audio.addEventListener("ended", handleEnded);
        audio.addEventListener("error", handleError);
        audio.addEventListener("waiting", handleWaiting);
        audio.addEventListener("playing", handlePlaying);
        audio.addEventListener("pause", handlePause);
        audio.addEventListener("suspend", handleSuspend);
        audio.addEventListener("stalled", handleStalled);
        audio.addEventListener("abort", handleAbort);
        document.addEventListener("visibilitychange", handleVisibilityChange);

        return () => {
            audio.pause();
            if (preloadRef.current) {
                preloadRef.current.src = "";
                preloadRef.current = null;
            }
            audio.removeEventListener("timeupdate", handleTimeUpdate);
            audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
            audio.removeEventListener("durationchange", handleDurationChange);
            audio.removeEventListener("canplay", handleCanPlay);
            audio.removeEventListener("ended", handleEnded);
            audio.removeEventListener("error", handleError);
            audio.removeEventListener("waiting", handleWaiting);
            audio.removeEventListener("playing", handlePlaying);
            audio.removeEventListener("pause", handlePause);
            audio.removeEventListener("suspend", handleSuspend);
            audio.removeEventListener("stalled", handleStalled);
            audio.removeEventListener("abort", handleAbort);
            document.removeEventListener("visibilitychange", handleVisibilityChange);
        };
        // nextTrackFromRefs and incrementPlayCount/addToRecentlyPlayed are stable useCallback refs
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ─── Public API ───────────────────────────────────────────────────────────────

    const setVolume = (v: number) => {
        const clamped = Math.max(0, Math.min(1, v));
        setVolumeState(clamped);
        volumeRef.current = clamped;
        saveToStorage(VOLUME_KEY, clamped);
        if (audioRef.current) {
            audioRef.current.volume = clamped;
        }
    };

    const playTrack = (track: Track, newQueue?: Track[], albumInfo?: AlbumInfo) => {
        console.log("[Player] playTrack called with:", track);
        const resolvedQueue = newQueue ?? queueRef.current;
        const resolvedAlbum = albumInfo ?? resolveAlbum(track, currentAlbumRef.current);
        playTrackInternal(track, resolvedAlbum, resolvedQueue);
    };

    const playPlaylist = (playlist: Playlist, startIndex = 0) => {
        const items = playlist.items || [];
        if (items.length === 0) return;
        const tracks: Track[] = items.map((item, idx) => ({
            id: idx + 1,
            title: item.title,
            track_number: item.trackNumber,
            audio_file: item.audioFile,
            duration: item.duration,
        }));
        const albumInfo: AlbumInfo = {
            title: playlist.name,
            artist: "",
            coverArt: playlist.cover_arts?.[0],
        };
        playTrackInternal(tracks[startIndex], albumInfo, tracks);
    };

    const togglePlay = () => {
        if (!currentTrackRef.current) return;
        if (isPlaying) {
            audioRef.current?.pause();
            // handlePause listener will set isPlaying(false)
        } else {
            audioRef.current?.play().catch(e => console.error("Playback failed:", e));
            // handlePlaying listener will set isPlaying(true)
        }
    };

    const nextTrack = () => {
        nextTrackFromRefs();
    };

    const prevTrack = () => {
        const track = currentTrackRef.current;
        const q = queueRef.current;
        const album = currentAlbumRef.current;

        if (!track) return;

        // If more than 3 seconds in, restart track
        if (audioRef.current && audioRef.current.currentTime > 3) {
            audioRef.current.currentTime = 0;
            return;
        }

        if (q.length === 0) return;

        // Shuffle — go back in the pre-generated shuffle queue
        if (shuffleModeRef.current) {
            const prevIdx = shuffleIndexRef.current - 1;
            if (prevIdx >= 0) {
                shuffleIndexRef.current = prevIdx;
                const prev = shuffleQueueRef.current[prevIdx];
                playTrackInternal(prev, resolveAlbum(prev, album), q);
            }
            // If already at the first track in the shuffle queue, do nothing
            return;
        }

        const currentIndex = q.findIndex(t => t.audio_file === track.audio_file);
        if (currentIndex > 0) {
            const prev = q[currentIndex - 1];
            playTrackInternal(prev, resolveAlbum(prev, album), q);
        } else if (repeatModeRef.current === "all") {
            // Wrap to end
            const last = q[q.length - 1];
            playTrackInternal(last, resolveAlbum(last, album), q);
        }
    };

    const seek = (time: number) => {
        if (audioRef.current) {
            audioRef.current.currentTime = time;
            setProgress(time);
        }
    };

    const toggleShuffle = () => {
        const next = !shuffleModeRef.current;
        shuffleModeRef.current = next;
        setShuffleMode(next);
        if (next) {
            generateShuffleQueue(queueRef.current, currentTrackRef.current);
        } else {
            shuffleQueueRef.current = [];
            shuffleIndexRef.current = 0;
            setShuffleQueue([]);
        }
    };

    const cycleRepeat = () => {
        setRepeatMode(prev => {
            const order: RepeatMode[] = ["off", "all", "one"];
            const next = order[(order.indexOf(prev) + 1) % order.length];
            repeatModeRef.current = next;
            return next;
        });
    };

    const setSleepTimer = (minutes: number | null) => {
        // Clear any existing timer
        if (sleepTimeoutRef.current !== null) {
            clearTimeout(sleepTimeoutRef.current);
            sleepTimeoutRef.current = null;
        }

        setSleepMinutesState(minutes);

        if (minutes !== null && minutes > 0) {
            sleepTimeoutRef.current = setTimeout(() => {
                // Pause playback
                if (audioRef.current) {
                    audioRef.current.pause();
                }
                setIsPlaying(false);
                setSleepMinutesState(null);
                sleepTimeoutRef.current = null;
            }, minutes * 60 * 1000);
        }
    };

    return (
        <PlayerContext.Provider value={{
            currentTrack,
            currentAlbum,
            isPlaying,
            queue,
            playTrack,
            playPlaylist,
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
            shuffleMode,
            toggleShuffle,
            repeatMode,
            cycleRepeat,
            shuffleQueue,
            recentlyPlayed,
            playCounts,
            sleepMinutes,
            setSleepTimer,
        }}>
            {children}
        </PlayerContext.Provider>
    );
}

export const usePlayer = () => {
    const context = useContext(PlayerContext);
    if (!context) {
        throw new Error("usePlayer must be used within a PlayerProvider");
    }
    return context;
};
