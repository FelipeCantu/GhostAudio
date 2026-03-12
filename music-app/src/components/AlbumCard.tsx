"use client";

import { useState, useRef, useEffect } from "react";
import Image from "next/image";
import { Disc, Play, Trash2, ListPlus, Check, MoreHorizontal } from "lucide-react";
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
  const [showMenu, setShowMenu] = useState(false);
  const [addedFlash, setAddedFlash] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const albumId = (album as any)._id || album.id;
  const coverArt = (album as any).coverArt || album.cover_art;

  // Close menu on outside click
  useEffect(() => {
    if (!showMenu) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showMenu]);

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
    setShowMenu(false);
    const items = buildPlaylistItems();
    await addItemsToPlaylist(playlistId, items);
    setAddedFlash(true);
    setTimeout(() => setAddedFlash(false), 1500);
  };

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowMenu(false);
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
    <div className="group relative bg-white/4 border border-white/5 rounded-2xl p-3 md:p-4 hover:bg-white/8 hover:border-white/10 transition-all duration-200">

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

      {/* Cover Art — tappable to open album */}
      <div
        onClick={onClick}
        className="relative aspect-square w-full rounded-xl overflow-hidden mb-3 bg-black/40 shadow-md cursor-pointer"
      >
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

        {/* Play overlay — desktop hover only */}
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center pointer-events-none sm:pointer-events-auto">
          <div className="w-12 h-12 rounded-full bg-[#f4d35e] text-[#0d3b66] flex items-center justify-center shadow-xl transform scale-90 group-hover:scale-100 transition-transform duration-200">
            <Play size={22} fill="currentColor" className="ml-0.5" />
          </div>
        </div>
      </div>

      {/* Info row — title, artist, and ••• menu */}
      <div className="flex items-start gap-1">
        {/* Text — tappable to open album */}
        <div
          onClick={onClick}
          className="flex-1 min-w-0 cursor-pointer space-y-0.5"
        >
          <h3 className={`font-semibold text-white truncate text-sm leading-tight ${addedFlash ? "text-[#f4d35e]" : ""}`}>
            {addedFlash ? <><Check size={11} className="inline mr-1 mb-0.5" />Added</> : album.title}
          </h3>
          <p className="text-xs text-zinc-400 truncate">{album.artist}</p>
        </div>

        {/* ••• context menu button */}
        <div className="relative flex-shrink-0" ref={menuRef}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowMenu((v) => !v);
            }}
            className="p-1.5 rounded-lg text-zinc-600 hover:text-zinc-300 hover:bg-white/8 transition-all min-w-[32px] min-h-[32px] flex items-center justify-center"
            aria-label="More options"
          >
            <MoreHorizontal size={16} />
          </button>

          {showMenu && (
            <div className="absolute bottom-full right-0 mb-1.5 w-48 bg-zinc-900 border border-white/10 rounded-2xl shadow-2xl z-50 overflow-hidden">
              {/* Play */}
              <button
                onClick={(e) => { e.stopPropagation(); setShowMenu(false); onClick?.(); }}
                className="w-full flex items-center gap-3 px-4 py-3 text-sm text-zinc-200 hover:bg-white/8 hover:text-white transition-colors"
              >
                <Play size={14} fill="currentColor" className="text-zinc-400" />
                Play Album
              </button>

              {/* Add to Playlist */}
              {playlists.filter((p) => !p.is_smart).length > 0 && (
                <div className="border-t border-white/5">
                  <p className="px-4 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-zinc-600">
                    Add to playlist
                  </p>
                  <div className="max-h-36 overflow-y-auto">
                    {playlists
                      .filter((p) => !p.is_smart)
                      .map((pl) => (
                        <button
                          key={pl.id}
                          onClick={(e) => handleAddToPlaylist(e, pl.id)}
                          className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-zinc-300 hover:bg-white/8 hover:text-white transition-colors"
                        >
                          <ListPlus size={13} className="text-zinc-500 flex-shrink-0" />
                          <span className="truncate">{pl.name}</span>
                        </button>
                      ))}
                  </div>
                </div>
              )}

              {/* Delete */}
              {onDelete && (
                <div className="border-t border-white/5">
                  <button
                    onClick={handleDeleteClick}
                    className="w-full flex items-center gap-3 px-4 py-3 text-sm text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-colors"
                  >
                    <Trash2 size={14} />
                    Delete Album
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
