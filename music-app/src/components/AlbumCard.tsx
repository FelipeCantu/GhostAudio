"use client";

import { useState } from "react";
import Image from "next/image";
import { Disc, Play } from "lucide-react";
import { Album } from "@/services/api";

import { usePlayer } from "@/context/PlayerContext";

interface AlbumCardProps {
    album: Album;
}

export default function AlbumCard({ album }: AlbumCardProps) {
    const [imgError, setImgError] = useState(false);
    const { playTrack } = usePlayer();

    const handlePlay = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (album.tracks && album.tracks.length > 0) {
            playTrack(album.tracks[0], album.tracks);
        }
    };

    return (
        <div className="group relative bg-card border border-white/5 rounded-2xl p-4 hover:bg-white/10 transition-colors cursor-pointer">
            {/* Cover Art */}
            <div className="relative aspect-square w-full rounded-xl overflow-hidden mb-4 bg-black/40 shadow-lg">
                {album.cover_art && !imgError ? (
                    <Image
                        src={album.cover_art}
                        alt={album.title}
                        fill
                        className="object-cover group-hover:scale-105 transition-transform duration-500"
                        onError={() => setImgError(true)}
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                        <Disc size={48} />
                    </div>
                )}

                {/* Play Overlay */}
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <button
                        onClick={handlePlay}
                        className="w-12 h-12 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-xl transform scale-90 group-hover:scale-100 transition-transform"
                    >
                        <Play size={24} fill="currentColor" />
                    </button>
                </div>
            </div>

            {/* Info */}
            <h3 className="font-bold text-foreground truncate">{album.title}</h3>
            <p className="text-sm text-muted-foreground truncate">{album.artist}</p>
        </div>
    );
}
