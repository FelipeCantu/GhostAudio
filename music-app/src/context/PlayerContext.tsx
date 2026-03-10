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
    const [volume, setVolumeState] = useState(1);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // New state
    const [shuffleMode, setShuffleMode] = useState(false);
    const [repeatMode, setRepeatMode] = useState<RepeatMode>("off");
    const [recentlyPlayed, setRecentlyPlayed] = useState<RecentlyPlayedEntry[]>([]);
    const [playCounts, setPlayCounts] = useState<Record<string, number>>({});
    const [sleepMinutes, setSleepMinutesState] = useState<number | null>(null);

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

    // Keep refs in sync with state
    useEffect(() => { currentTrackRef.current = currentTrack; }, [currentTrack]);
    useEffect(() => { currentAlbumRef.current = currentAlbum; }, [currentAlbum]);
    useEffect(() => { queueRef.current = queue; }, [queue]);
    useEffect(() => { shuffleModeRef.current = shuffleMode; }, [shuffleMode]);
    useEffect(() => { repeatModeRef.current = repeatMode; }, [repeatMode]);

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
        const audioFile = (track as Record<string, unknown>).audioFile as string | undefined ?? track.audio_file;

        if (!audioFile) {
            console.error("[Player] ERROR: No audio file on track!", track);
            return;
        }

        if (!skipAddToRecent) {
            addToRecentlyPlayed(track, albumInfo);
        }

        setCurrentTrack(track);
        currentTrackRef.current = track;
        setCurrentAlbum(albumInfo);
        currentAlbumRef.current = albumInfo;
        setQueue(resolvedQueue);
        queueRef.current = resolvedQueue;
        setIsPlaying(true);
        setIsLoading(true);
        setError(null);
        setProgress(0);
        setDuration(0);

        if (audioRef.current) {
            let src = audioFile;
            const isLocalPath = src && !src.startsWith("http") && !src.startsWith("localfile://") && !src.startsWith("file://");
            const isElectron = typeof window !== "undefined" && (window as Record<string, unknown>).electronAPI !== undefined;
            if (isLocalPath) {
                if (!isElectron) {
                    setError("This track is stored locally and can only be played in the Desktop App.");
                    setIsPlaying(false);
                    setIsLoading(false);
                    return;
                }
                src = `localfile://${src.replace(/\\/g, "/")}`;
            }
            console.log("[Player] Playing src:", src);
            audioRef.current.volume = volume;
            audioRef.current.src = src;
            audioRef.current.play().catch(e => {
                if (e.name !== "AbortError") console.error("[Player] Playback failed:", e);
            });
        }
    }, [addToRecentlyPlayed, volume]);

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

        // Shuffle — pick random track that isn't the current one
        if (shuffleModeRef.current && q.length > 1) {
            const others = q.filter(t => t.id !== track.id);
            const next = others[Math.floor(Math.random() * others.length)];
            playTrackInternal(next, album, q);
            return;
        }

        const currentIndex = q.findIndex(t => t.id === track.id);

        if (currentIndex < q.length - 1) {
            playTrackInternal(q[currentIndex + 1], album, q);
        } else if (repeatModeRef.current === "all") {
            // Loop back to start
            playTrackInternal(q[0], album, q);
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

    // ─── Audio element setup ──────────────────────────────────────────────────────

    useEffect(() => {
        audioRef.current = new Audio();
        const audio = audioRef.current;

        const handleTimeUpdate = () => {
            setProgress(audio.currentTime);
            if (audio.duration && isFinite(audio.duration) && audio.duration > 0) {
                setDuration(audio.duration);
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
        };
        const handleWaiting = () => setIsLoading(true);
        const handlePlaying = () => {
            setIsLoading(false);
            setError(null);
        };

        audio.addEventListener("timeupdate", handleTimeUpdate);
        audio.addEventListener("loadedmetadata", handleLoadedMetadata);
        audio.addEventListener("durationchange", handleDurationChange);
        audio.addEventListener("canplay", handleCanPlay);
        audio.addEventListener("ended", handleEnded);
        audio.addEventListener("error", handleError);
        audio.addEventListener("waiting", handleWaiting);
        audio.addEventListener("playing", handlePlaying);

        return () => {
            audio.pause();
            audio.removeEventListener("timeupdate", handleTimeUpdate);
            audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
            audio.removeEventListener("durationchange", handleDurationChange);
            audio.removeEventListener("canplay", handleCanPlay);
            audio.removeEventListener("ended", handleEnded);
            audio.removeEventListener("error", handleError);
            audio.removeEventListener("waiting", handleWaiting);
            audio.removeEventListener("playing", handlePlaying);
        };
        // nextTrackFromRefs and incrementPlayCount/addToRecentlyPlayed are stable useCallback refs
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ─── Public API ───────────────────────────────────────────────────────────────

    const setVolume = (v: number) => {
        const clamped = Math.max(0, Math.min(1, v));
        setVolumeState(clamped);
        if (audioRef.current) {
            audioRef.current.volume = clamped;
        }
    };

    const playTrack = (track: Track, newQueue?: Track[], albumInfo?: AlbumInfo) => {
        console.log("[Player] playTrack called with:", track);
        const resolvedQueue = newQueue ?? queueRef.current;
        const resolvedAlbum = albumInfo ?? currentAlbumRef.current;
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
        } else {
            audioRef.current?.play().catch(e => console.error("Playback failed:", e));
        }
        setIsPlaying(prev => !prev);
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

        // Shuffle — pick random track
        if (shuffleModeRef.current && q.length > 1) {
            const others = q.filter(t => t.id !== track.id);
            const prev = others[Math.floor(Math.random() * others.length)];
            playTrackInternal(prev, album, q);
            return;
        }

        const currentIndex = q.findIndex(t => t.id === track.id);
        if (currentIndex > 0) {
            playTrackInternal(q[currentIndex - 1], album, q);
        } else if (repeatModeRef.current === "all") {
            // Wrap to end
            playTrackInternal(q[q.length - 1], album, q);
        }
    };

    const seek = (time: number) => {
        if (audioRef.current) {
            audioRef.current.currentTime = time;
            setProgress(time);
        }
    };

    const toggleShuffle = () => {
        setShuffleMode(prev => {
            const next = !prev;
            shuffleModeRef.current = next;
            return next;
        });
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
