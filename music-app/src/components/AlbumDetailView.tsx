"use client";

import { useState } from "react";
import Image from "next/image";
import { ArrowLeft, Disc, Play, Pause, Clock } from "lucide-react";
import { usePlayer } from "@/context/PlayerContext";
import { Album, Track } from "@/services/api";

interface AlbumDetailViewProps {
    album: Album;
    onBack: () => void;
}

export default function AlbumDetailView({ album, onBack }: AlbumDetailViewProps) {
    const { currentTrack, isPlaying, playTrack } = usePlayer();
    const [imgError, setImgError] = useState(false);

    if (!album) return null;

    // Handle MongoDB (coverArt) and Django (cover_art) formats
    const coverArt = (album as any).coverArt || album.cover_art;

    // Map MongoDB tracks to player-compatible format
    const mapTrack = (track: any, index: number): Track => {
        return {
            id: index + 1,
            title: track.title || `Track ${index + 1}`,
            track_number: track.trackNumber || track.track_number || index + 1,
            audio_file: track.audioFile || track.audio_file || '',
            duration: track.duration || ''
        };
    };

    const tracks: Track[] = (album.tracks || []).map(mapTrack);

    // Album info for the player
    const albumInfo = {
        title: album.title,
        artist: album.artist,
        coverArt: coverArt
    };

    const handlePlayTrack = (track: Track) => {
        playTrack(track, tracks, albumInfo);
    };

    const handlePlayAll = () => {
        if (tracks.length > 0) {
            playTrack(tracks[0], tracks, albumInfo);
        }
    };

    const isCurrentTrack = (track: Track) => {
        return currentTrack?.audio_file === track.audio_file;
    };

    return (
        <div className="relative flex flex-col h-full animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Background Blur Effect */}
            {coverArt && (
                <div className="absolute top-0 left-0 w-full h-[500px] overflow-hidden -z-10 opacity-20 mask-image-gradient">
                    <Image
                        src={coverArt}
                        alt=""
                        fill
                        className="object-cover blur-[100px]"
                    />
                    <div className="absolute inset-0 bg-gradient-to-b from-transparent via-background/80 to-background" />
                </div>
            )}

            {/* Back Button */}
            <div className="mb-6">
                <button
                    onClick={onBack}
                    className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white transition-all group backdrop-blur-md border border-white/5"
                >
                    <ArrowLeft size={20} className="group-hover:-translate-x-1 transition-transform" />
                    Back to Library
                </button>
            </div>

            {/* Header Section */}
            <div className="flex flex-col md:flex-row gap-8 mb-10">
                {/* Cover Art */}
                <div className="relative z-10 w-64 h-64 md:w-80 md:h-80 flex-shrink-0 rounded-2xl overflow-hidden bg-black/40 shadow-2xl mx-auto md:mx-0 border border-white/10 group">
                    {coverArt && !imgError ? (
                        <Image
                            src={coverArt}
                            alt={album.title}
                            fill
                            className="object-cover transition-transform duration-700 group-hover:scale-105"
                            priority
                            onError={() => setImgError(true)}
                        />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center text-zinc-800 bg-zinc-900">
                            <Disc size={80} />
                        </div>
                    )}
                </div>

                {/* Album Info */}
                <div className="flex flex-col justify-end text-center md:text-left flex-1 min-w-0">
                    <p className="text-sm font-bold uppercase tracking-widest text-primary mb-2">Album</p>
                    <h1 className="text-4xl md:text-6xl font-black text-white mb-2 tracking-tight leading-tight">{album.title}</h1>
                    <div className="flex items-center gap-3 justify-center md:justify-start text-xl text-zinc-300 mb-6">
                        <span className="font-medium text-white">{album.artist}</span>
                        <span className="w-1.5 h-1.5 rounded-full bg-zinc-600" />
                        <span className="text-zinc-400">{new Date((album as any).createdAt || album.created_at).getFullYear() || new Date().getFullYear()}</span>
                        <span className="w-1.5 h-1.5 rounded-full bg-zinc-600" />
                        <span className="text-zinc-400">{tracks.length} tracks</span>
                    </div>

                    <div className="flex items-center gap-4 justify-center md:justify-start">
                        <button
                            onClick={handlePlayAll}
                            className="flex items-center gap-3 px-8 py-4 bg-primary text-primary-foreground font-bold rounded-full hover:bg-primary/90 hover:scale-105 transition-all shadow-lg shadow-primary/25"
                        >
                            <Play size={24} fill="currentColor" />
                            Play Album
                        </button>
                        <button className="p-4 rounded-full bg-white/5 text-white hover:bg-white/10 transition-colors border border-white/5">
                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" /></svg>
                        </button>
                        <button className="p-4 rounded-full bg-white/5 text-white hover:bg-white/10 transition-colors border border-white/5">
                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /><circle cx="5" cy="12" r="1" /></svg>
                        </button>
                    </div>
                </div>
            </div>

            {/* Tracks List */}
            <div className="flex-1">
                {/* Table Header */}
                <div className="grid grid-cols-[auto_1fr_auto] gap-4 px-6 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider border-b border-white/5 mb-2">
                    <div className="w-8 text-center">#</div>
                    <div>Title</div>
                    <div className="flex items-center justify-end gap-2">
                        <Clock size={14} />
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
                                className={`group grid grid-cols-[auto_1fr_auto] gap-4 items-center px-4 py-3 rounded-lg cursor-pointer transition-all border border-transparent ${isCurrent
                                    ? 'bg-primary/10 border-primary/20'
                                    : 'hover:bg-white/5 hover:border-white/5'
                                    }`}
                            >
                                {/* Track Number / Play Icon */}
                                <div className="w-8 flex items-center justify-center text-sm font-medium">
                                    {isPlayingCurrent ? (
                                        <div className="flex items-end gap-1 h-3">
                                            <span className="w-0.5 h-full bg-primary animate-[music-bar_0.5s_ease-in-out_infinite]" />
                                            <span className="w-0.5 h-2/3 bg-primary animate-[music-bar_0.5s_ease-in-out_infinite_0.1s]" />
                                            <span className="w-0.5 h-full bg-primary animate-[music-bar_0.5s_ease-in-out_infinite_0.2s]" />
                                        </div>
                                    ) : isCurrent ? (
                                        <span className="text-primary">
                                            <Pause size={16} fill="currentColor" />
                                        </span>
                                    ) : (
                                        <>
                                            <span className="text-zinc-500 group-hover:hidden">{track.track_number}</span>
                                            <span className="hidden group-hover:block text-white">
                                                <Play size={16} fill="currentColor" />
                                            </span>
                                        </>
                                    )}
                                </div>

                                {/* Track Info */}
                                <div className="min-w-0 flex flex-col justify-center">
                                    <p className={`text-base font-medium truncate transition-colors ${isCurrent ? 'text-primary' : 'text-zinc-200 group-hover:text-white'}`}>
                                        {track.title}
                                    </p>
                                    <p className="text-sm text-zinc-500 truncate group-hover:text-zinc-400">
                                        {album.artist}
                                    </p>
                                </div>

                                {/* Duration */}
                                <div className={`text-sm font-medium font-mono ${isCurrent ? 'text-white' : 'text-zinc-500 group-hover:text-zinc-300'}`}>
                                    {track.duration || '--:--'}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
