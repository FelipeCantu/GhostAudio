"use client";

import { useState } from "react";
import Image from "next/image";
import { Disc, Play, Trash2 } from "lucide-react";
import { Album } from "@/services/api";

interface AlbumCardProps {
    album: Album;
    onDelete?: (albumId: string) => void;
    onClick?: () => void;
}

export default function AlbumCard({ album, onDelete, onClick }: AlbumCardProps) {
    const [imgError, setImgError] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);

    // Handle both MongoDB (_id/coverArt) and Django (id/cover_art) formats
    const albumId = (album as any)._id || album.id;
    const coverArt = (album as any).coverArt || album.cover_art;

    const handlePlay = (e: React.MouseEvent) => {
        e.stopPropagation();
        // Open the album detail view so user can pick a song
        if (onClick) {
            onClick();
        }
    };

    const handleDeleteClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        setShowConfirm(true);
    };

    const handleConfirmDelete = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (onDelete && albumId) {
            onDelete(albumId);
        }
        setShowConfirm(false);
    };

    const handleCancelDelete = (e: React.MouseEvent) => {
        e.stopPropagation();
        setShowConfirm(false);
    };

    return (
        <div
            onClick={onClick}
            className="group relative bg-card border border-white/5 rounded-2xl p-4 hover:bg-white/10 transition-colors cursor-pointer"
        >
            {/* Delete Confirmation Overlay */}
            {showConfirm && (
                <div className="absolute inset-0 z-20 bg-black/80 backdrop-blur-sm rounded-2xl flex flex-col items-center justify-center p-4">
                    <p className="text-white text-sm font-medium text-center mb-4">Delete "{album.title}"?</p>
                    <div className="flex gap-2">
                        <button
                            onClick={handleCancelDelete}
                            className="px-3 py-1.5 text-xs font-medium bg-zinc-700 hover:bg-zinc-600 text-white rounded-lg transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleConfirmDelete}
                            className="px-3 py-1.5 text-xs font-medium bg-red-600 hover:bg-red-500 text-white rounded-lg transition-colors"
                        >
                            Delete
                        </button>
                    </div>
                </div>
            )}

            {/* Delete Button */}
            {onDelete && (
                <button
                    onClick={handleDeleteClick}
                    className="absolute top-2 right-2 z-10 p-1.5 rounded-lg bg-black/60 text-zinc-400 hover:text-red-400 hover:bg-black/80 opacity-0 group-hover:opacity-100 transition-all"
                    title="Delete album"
                >
                    <Trash2 size={16} />
                </button>
            )}

            {/* Cover Art */}
            <div className="relative aspect-square w-full rounded-xl overflow-hidden mb-4 bg-black/40 shadow-lg">
                {coverArt && !imgError ? (
                    <Image
                        src={coverArt}
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
