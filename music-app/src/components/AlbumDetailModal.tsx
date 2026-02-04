"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { X, Disc, Play, Pause } from "lucide-react";
import { usePlayer } from "@/context/PlayerContext";
import { Track } from "@/services/api";

interface AlbumDetailModalProps {
    album: any;
    isOpen: boolean;
    onClose: () => void;
}

export default function AlbumDetailModal({ album, isOpen, onClose }: AlbumDetailModalProps) {
    const { currentTrack, isPlaying, playTrack, togglePlay } = usePlayer();
    const [imgError, setImgError] = useState(false);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    if (!album) return null;

    // Handle MongoDB (coverArt) and Django (cover_art) formats
    const coverArt = album.coverArt || album.cover_art;

    // Map MongoDB tracks to player-compatible format
    const mapTrack = (track: any, index: number): Track => ({
        id: index + 1,
        title: track.title || `Track ${index + 1}`,
        track_number: track.trackNumber || track.track_number || index + 1,
        audio_file: track.audioFile || track.audio_file || '',
        duration: track.duration || ''
    });

    const tracks: Track[] = (album.tracks || []).map(mapTrack);

    const handlePlayTrack = (track: Track) => {
        playTrack(track, tracks);
    };

    const handlePlayAll = () => {
        if (tracks.length > 0) {
            playTrack(tracks[0], tracks);
        }
    };

    const isCurrentTrack = (track: Track) => {
        return currentTrack?.audio_file === track.audio_file;
    };

    const modalContent = (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm"
                    />

                    {/* Modal */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        className="fixed inset-4 md:inset-10 lg:inset-20 z-[101] overflow-hidden rounded-3xl bg-zinc-900 border border-white/10 shadow-2xl flex flex-col"
                    >
                        {/* Header */}
                        <div className="relative flex-shrink-0">
                            {/* Close Button */}
                            <button
                                onClick={onClose}
                                className="absolute top-4 right-4 z-10 p-2 rounded-full bg-black/50 hover:bg-black/70 text-white transition-colors"
                            >
                                <X size={20} />
                            </button>

                            {/* Album Header */}
                            <div className="flex flex-col md:flex-row gap-6 p-6 md:p-8 bg-gradient-to-b from-white/5 to-transparent">
                                {/* Cover Art */}
                                <div className="relative w-48 h-48 md:w-56 md:h-56 flex-shrink-0 rounded-xl overflow-hidden bg-black/40 shadow-2xl mx-auto md:mx-0">
                                    {coverArt && !imgError ? (
                                        <Image
                                            src={coverArt}
                                            alt={album.title}
                                            fill
                                            className="object-cover"
                                            onError={() => setImgError(true)}
                                        />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-zinc-600">
                                            <Disc size={80} />
                                        </div>
                                    )}
                                </div>

                                {/* Album Info */}
                                <div className="flex flex-col justify-end text-center md:text-left">
                                    <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">Album</p>
                                    <h1 className="text-3xl md:text-4xl font-bold text-white mb-2">{album.title}</h1>
                                    <p className="text-lg text-zinc-400 mb-4">{album.artist}</p>
                                    <div className="flex items-center gap-4 justify-center md:justify-start">
                                        <span className="text-sm text-zinc-500">{tracks.length} tracks</span>
                                        <button
                                            onClick={handlePlayAll}
                                            className="flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground font-bold rounded-full hover:bg-primary/90 transition-transform active:scale-95 shadow-lg shadow-primary/20"
                                        >
                                            <Play size={20} fill="currentColor" />
                                            Play All
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Track List */}
                        <div className="flex-1 overflow-y-auto p-6 md:p-8 pt-0">
                            {/* Table Header */}
                            <div className="grid grid-cols-[auto_1fr_auto] gap-4 px-4 py-2 text-xs font-medium text-zinc-500 uppercase tracking-wider border-b border-white/5 mb-2 sticky top-0 bg-zinc-900/95 backdrop-blur-sm z-10">
                                <div className="w-8 text-center">#</div>
                                <div>Title</div>
                                <div className="flex items-center gap-2">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                                </div>
                            </div>

                            <div className="space-y-1">
                                {tracks.map((track, index) => {
                                    const isCurrent = isCurrentTrack(track);
                                    const isPlayingCurrent = isCurrent && isPlaying;

                                    return (
                                        <div
                                            key={track.id}
                                            onClick={() => handlePlayTrack(track)}
                                            className={`group grid grid-cols-[auto_1fr_auto] gap-4 items-center p-3 rounded-lg cursor-pointer transition-colors ${isCurrent
                                                ? 'bg-white/10'
                                                : 'hover:bg-white/5'
                                                }`}
                                        >
                                            {/* Track Number / Play Icon */}
                                            <div className="w-8 flex items-center justify-center text-sm">
                                                {isPlayingCurrent ? (
                                                    <div className="flex items-end gap-0.5 h-4">
                                                        <span className="w-1 bg-primary rounded-full animate-[music-bar_1s_ease-in-out_infinite]" />
                                                        <span className="w-1 bg-primary rounded-full animate-[music-bar_1s_ease-in-out_infinite_0.2s]" />
                                                        <span className="w-1 bg-primary rounded-full animate-[music-bar_1s_ease-in-out_infinite_0.4s]" />
                                                    </div>
                                                ) : isCurrent ? (
                                                    <div className="text-primary">
                                                        <Pause size={16} fill="currentColor" />
                                                    </div>
                                                ) : (
                                                    <>
                                                        <span className="text-zinc-500 font-mono group-hover:hidden">{track.track_number}</span>
                                                        <span className="hidden group-hover:block text-white">
                                                            <Play size={16} fill="currentColor" />
                                                        </span>
                                                    </>
                                                )}
                                            </div>

                                            {/* Track Info */}
                                            <div className="min-w-0">
                                                <p className={`font-medium truncate transition-colors ${isCurrent ? 'text-primary' : 'text-zinc-200 group-hover:text-white'}`}>
                                                    {track.title}
                                                </p>
                                                <p className="text-xs text-zinc-500 truncate group-hover:text-zinc-400">
                                                    {album.artist}
                                                </p>
                                            </div>

                                            {/* Duration */}
                                            <div className={`text-sm font-mono ${isCurrent ? 'text-white' : 'text-zinc-500 group-hover:text-zinc-300'}`}>
                                                {track.duration || '--:--'}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );

    if (!mounted) return null;

    return createPortal(modalContent, document.body);
}
