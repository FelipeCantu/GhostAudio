"use client";

import React, { createContext, useContext, useState, useRef, useEffect } from "react";
import { Track, Playlist } from "@/services/api";

interface AlbumInfo {
    title: string;
    artist: string;
    coverArt?: string;
}

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
}

const PlayerContext = createContext<PlayerContextType | undefined>(undefined);

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

    // We use a ref for the audio element to manage it imperatively
    const audioRef = useRef<HTMLAudioElement | null>(null);

    useEffect(() => {
        // Initialize Audio object only on client side
        audioRef.current = new Audio();

        const audio = audioRef.current; // capture ref for cleanup

        const handleTimeUpdate = () => {
            setProgress(audio.currentTime);
            // Also check duration on time update as a fallback
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
        const handleEnded = () => nextTrack();

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
    }, []);

    const setVolume = (v: number) => {
        const clamped = Math.max(0, Math.min(1, v));
        setVolumeState(clamped);
        if (audioRef.current) {
            audioRef.current.volume = clamped;
        }
    };

    const playTrack = (track: Track, newQueue?: Track[], albumInfo?: AlbumInfo) => {
        console.log("[Player] playTrack called with:", track);

        // Handle both camelCase (MongoDB) and snake_case (Django) field names
        const audioFile = (track as any).audioFile || track.audio_file;

        if (!audioFile) {
            console.error("[Player] ERROR: No audio file on track!", track);
            return;
        }

        if (newQueue) {
            setQueue(newQueue);
        }

        if (albumInfo) {
            setCurrentAlbum(albumInfo);
        }

        setCurrentTrack(track);
        setIsPlaying(true);
        setIsLoading(true);
        setError(null);
        // Reset progress and duration for new track
        setProgress(0);
        setDuration(0);

        if (audioRef.current) {
            // In Electron, use custom 'localfile' protocol for local audio files
            let src = audioFile;
            console.log("[Player] Original audio file:", src);
            const isLocalPath = src && !src.startsWith('http') && !src.startsWith('localfile://') && !src.startsWith('file://');
            const isElectron = typeof window !== 'undefined' && (window as any).electronAPI !== undefined;
            if (isLocalPath) {
                if (!isElectron) {
                    setError("This track is stored locally and can only be played in the Desktop App.");
                    setIsPlaying(false);
                    setIsLoading(false);
                    return;
                }
                // Use localfile:// protocol which is handled by Electron main process
                src = `localfile://${src.replace(/\\/g, '/')}`;
            }
            console.log("[Player] Playing src:", src);

            audioRef.current.volume = volume;
            audioRef.current.src = src;
            audioRef.current.play().catch(e => console.error("[Player] Playback failed:", e));
        }
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
            artist: '',
            coverArt: playlist.cover_arts?.[0],
        };
        playTrack(tracks[startIndex], tracks, albumInfo);
    };

    const togglePlay = () => {
        if (!currentTrack) return;

        if (isPlaying) {
            audioRef.current?.pause();
        } else {
            audioRef.current?.play().catch(e => console.error("Playback failed:", e));
        }
        setIsPlaying(!isPlaying);
    };

    const nextTrack = () => {
        if (!currentTrack || queue.length === 0) return;

        const currentIndex = queue.findIndex(t => t.id === currentTrack.id);
        if (currentIndex < queue.length - 1) {
            playTrack(queue[currentIndex + 1]);
        } else {
            // End of queue
            setIsPlaying(false);
            setProgress(0);
        }
    };

    const prevTrack = () => {
        if (!currentTrack || queue.length === 0) return;

        // If we are more than 3 seconds in, restart track
        if (audioRef.current && audioRef.current.currentTime > 3) {
            audioRef.current.currentTime = 0;
            return;
        }

        const currentIndex = queue.findIndex(t => t.id === currentTrack.id);
        if (currentIndex > 0) {
            playTrack(queue[currentIndex - 1]);
        }
    };

    const seek = (time: number) => {
        if (audioRef.current) {
            audioRef.current.currentTime = time;
            setProgress(time);
        }
    }

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
            error
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
