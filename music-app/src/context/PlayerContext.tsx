"use client";

import React, { createContext, useContext, useState, useRef, useEffect } from "react";
import { Track } from "@/services/api";

interface PlayerContextType {
    currentTrack: Track | null;
    isPlaying: boolean;
    queue: Track[];
    playTrack: (track: Track, newQueue?: Track[]) => void;
    togglePlay: () => void;
    nextTrack: () => void;
    prevTrack: () => void;
    progress: number;
    duration: number;
    seek: (time: number) => void;
}

const PlayerContext = createContext<PlayerContextType | undefined>(undefined);

export function PlayerProvider({ children }: { children: React.ReactNode }) {
    const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
    const [queue, setQueue] = useState<Track[]>([]);
    const [isPlaying, setIsPlaying] = useState(false);
    const [progress, setProgress] = useState(0);
    const [duration, setDuration] = useState(0);

    // We use a ref for the audio element to manage it imperatively
    const audioRef = useRef<HTMLAudioElement | null>(null);

    useEffect(() => {
        // Initialize Audio object only on client side
        audioRef.current = new Audio();

        const audio = audioRef.current; // capture ref for cleanup

        const handleTimeUpdate = () => setProgress(audio.currentTime);
        const handleLoadedMetadata = () => setDuration(audio.duration);
        const handleEnded = () => nextTrack();

        audio.addEventListener("timeupdate", handleTimeUpdate);
        audio.addEventListener("loadedmetadata", handleLoadedMetadata);
        audio.addEventListener("ended", handleEnded);

        return () => {
            audio.pause();
            audio.removeEventListener("timeupdate", handleTimeUpdate);
            audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
            audio.removeEventListener("ended", handleEnded);
        };
    }, []);

    const playTrack = (track: Track, newQueue?: Track[]) => {
        if (newQueue) {
            setQueue(newQueue);
        }

        setCurrentTrack(track);
        setIsPlaying(true);

        if (audioRef.current) {
            // Handle valid URL? 
            // If it's a file path (from Electron), we might need to prefix 'file://' 
            // or serve it via a local server. Electron usually handles local files if security allows.
            // For now, assume audio_file is a valid src.
            // If it's a local path like "C:/Users...", browsers block it.
            // Electron needs 'atom://' or 'file://' protocol, but standard fetch might fail.
            // Let's try direct setting.

            // NOTE: In Electron, local files might need 'file:///' prefix.
            let src = track.audio_file;
            if (!src.startsWith('http') && !src.startsWith('file://')) {
                src = `file://${src}`;
            }

            audioRef.current.src = src;
            audioRef.current.play().catch(e => console.error("Playback failed:", e));
        }
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
            isPlaying,
            queue,
            playTrack,
            togglePlay,
            nextTrack,
            prevTrack,
            progress,
            duration,
            seek
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
