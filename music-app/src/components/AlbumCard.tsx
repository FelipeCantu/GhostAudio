"use client";

import { useState, useRef, useEffect } from "react";
import Image from "next/image";
import { Disc, Play, Trash2, ListPlus, Check } from "lucide-react";
import { Album, PlaylistItem } from "@/services/api";
import { usePlaylist } from "@/context/PlaylistContext";

interface AlbumCardProps {
  album: Album;
  onDelete?: (albumId: string) => void;
  onClick?: () => void;
}

export default function AlbumCard({ album, onDelete, onClick }: AlbumCardProps) {
  const { playlists, addItemsToPlaylist } = usePlaylist();
  const [imgError, setImgError] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showPlaylistMenu, setShowPlaylistMenu] = useState(false);
  const [addedFlash, setAddedFlash] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Handle both MongoDB (_id/coverArt) and Django (id/cover_art) formats
  const albumId = (album as any)._id || album.id;
  const coverArt = (album as any).coverArt || album.cover_art;

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowPlaylistMenu(false);
      }
    };
    if (showPlaylistMenu) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showPlaylistMenu]);

  const buildPlaylistItems = (): PlaylistItem[] => {
    const tracks = (album.tracks || []) as any[];
    return tracks.map((t, idx) => ({
      albumId: String(albumId),
      trackNumber: t.trackNumber || t.track_number || idx + 1,
      title: t.title || `Track ${idx + 1}`,
      artist: album.artist,
      albumTitle: album.title,
      audioFile: t.audioFile || t.audio_file || "",
      duration: t.duration || "",
      coverArt: coverArt || "",
    }));
  };

  const handleAddToPlaylist = async (e: React.MouseEvent, playlistId: string) => {
    e.stopPropagation();
    setShowPlaylistMenu(false);
    const items = buildPlaylistItems();
    await addItemsToPlaylist(playlistId, items);
    setAddedFlash(true);
    setTimeout(() => setAddedFlash(false), 1500);
  };

  const handlePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    onClick?.();
  };

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowConfirm(true);
  };

  const handleConfirmDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onDelete && albumId) onDelete(albumId);
    setShowConfirm(false);
  };

  const handleCancelDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowConfirm(false);
  };

  return (
    <div
      onClick={onClick}
      className="group relative bg-white/4 border border-white/5 rounded-2xl p-3 md:p-4 hover:bg-white/8 hover:border-white/10 transition-all duration-200 cursor-pointer"
    >
      {/* Delete Confirmation Overlay */}
      {showConfirm && (
        <div className="absolute inset-0 z-20 bg-black/85 backdrop-blur-sm rounded-2xl flex flex-col items-center justify-center p-4 gap-4">
          <p className="text-white text-sm font-semibold text-center px-2">
            Delete &ldquo;{album.title}&rdquo;?
          </p>
          <div className="flex gap-2">
            <button
              onClick={handleCancelDelete}
              className="px-4 py-2 text-xs font-semibold bg-white/10 hover:bg-white/20 text-white rounded-xl transition-colors min-h-[36px]"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirmDelete}
              className="px-4 py-2 text-xs font-semibold bg-red-600 hover:bg-red-500 text-white rounded-xl transition-colors min-h-[36px]"
            >
              Delete
            </button>
          </div>
        </div>
      )}

      {/* Action Buttons — always visible on touch devices, hover-only on desktop */}
      <div className="absolute top-2 right-2 z-10 flex gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-all duration-200">
        {/* Add to Playlist */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowPlaylistMenu((v) => !v);
            }}
            className={`p-2 rounded-xl bg-black/70 hover:bg-black/90 transition-all min-w-[32px] min-h-[32px] flex items-center justify-center ${
              addedFlash ? "text-[#f4d35e]" : "text-zinc-300 hover:text-[#f4d35e]"
            }`}
            title="Add to playlist"
            aria-label="Add album to playlist"
          >
            {addedFlash ? <Check size={15} /> : <ListPlus size={15} />}
          </button>

          {showPlaylistMenu && (
            <div className="absolute top-full right-0 mt-1.5 w-52 bg-[#0d1b2a] border border-white/10 rounded-2xl shadow-2xl z-50 overflow-hidden">
              <div className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-zinc-500 border-b border-white/5">
                Add to playlist
              </div>
              {playlists.filter((p) => !p.is_smart).length === 0 ? (
                <p className="px-3 py-3 text-xs text-zinc-500 italic">No manual playlists.</p>
              ) : (
                playlists
                  .filter((p) => !p.is_smart)
                  .map((pl) => (
                    <button
                      key={pl.id}
                      onClick={(e) => handleAddToPlaylist(e, pl.id)}
                      className="w-full text-left px-3 py-2.5 text-sm text-zinc-300 hover:bg-white/8 hover:text-white transition-colors truncate min-h-[40px]"
                    >
                      {pl.name}
                    </button>
                  ))
              )}
            </div>
          )}
        </div>

        {onDelete && (
          <button
            onClick={handleDeleteClick}
            className="p-2 rounded-xl bg-black/70 text-zinc-300 hover:text-red-400 hover:bg-black/90 transition-all min-w-[32px] min-h-[32px] flex items-center justify-center"
            title="Delete album"
            aria-label="Delete album"
          >
            <Trash2 size={15} />
          </button>
        )}
      </div>

      {/* Cover Art */}
      <div className="relative aspect-square w-full rounded-xl overflow-hidden mb-3 bg-black/40 shadow-md">
        {coverArt && !imgError ? (
          <Image
            src={coverArt}
            alt={album.title}
            fill
            className="object-cover group-hover:scale-105 transition-transform duration-500"
            onError={() => setImgError(true)}
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-zinc-800 to-zinc-900 text-zinc-600">
            <Disc size={40} />
          </div>
        )}

        {/* Play Overlay — shown on hover (desktop) or tap (mobile via active state) */}
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 active:opacity-100 transition-opacity duration-200 flex items-center justify-center">
          <button
            onClick={handlePlay}
            className="w-12 h-12 rounded-full bg-[#f4d35e] text-[#0d3b66] flex items-center justify-center shadow-xl transform scale-90 group-hover:scale-100 transition-transform duration-200 min-w-[44px] min-h-[44px]"
            aria-label={`Play ${album.title}`}
          >
            <Play size={22} fill="currentColor" className="ml-0.5" />
          </button>
        </div>
      </div>

      {/* Info */}
      <div className="space-y-0.5">
        <h3 className="font-semibold text-white truncate text-sm leading-tight">
          {album.title}
        </h3>
        <p className="text-xs text-zinc-400 truncate">{album.artist}</p>
      </div>
    </div>
  );
}
