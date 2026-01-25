"use client";

import Image from "next/image";
import { Disc, Play } from "lucide-react";
import { Album } from "@/services/api";

interface AlbumCardProps {
    album: Album;
}

export default function AlbumCard({ album }: AlbumCardProps) {
    return (
        <div className="group relative bg-white/5 border border-white/5 rounded-2xl p-4 hover:bg-white/10 transition-colors cursor-pointer">
            {/* Cover Art */}
            <div className="relative aspect-square w-full rounded-xl overflow-hidden mb-4 bg-black/40 shadow-lg">
                {album.cover_art ? (
                    <Image
                        src={album.cover_art}
                        alt={album.title}
                        fill
                        className="object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center text-zinc-700">
                        <Disc size={48} />
                    </div>
                )}

                {/* Play Overlay */}
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <button className="w-12 h-12 rounded-full bg-[#f4d35e] text-[#0d3b66] flex items-center justify-center shadow-xl transform scale-90 group-hover:scale-100 transition-transform">
                        <Play size={24} fill="currentColor" />
                    </button>
                </div>
            </div>

            {/* Info */}
            <h3 className="font-bold text-white truncate">{album.title}</h3>
            <p className="text-sm text-zinc-400 truncate">{album.artist}</p>
        </div>
    );
}
