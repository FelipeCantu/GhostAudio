"use client";

import DashboardLayout from "@/components/DashboardLayout";
import { motion, AnimatePresence } from "framer-motion";
import {
  Disc,
  Search,
  X,
  Plus,
  Shuffle,
  LayoutGrid,
  List,
  Play,
} from "lucide-react";
import { useEffect, useState, useMemo, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { useImport } from "@/context/ImportContext";
import { usePlayer } from "@/context/PlayerContext";
import { api, Album, Track } from "@/services/api";
import AlbumCard from "@/components/AlbumCard";
import AlbumDetailView from "@/components/AlbumDetailView";
import Link from "next/link";
import Image from "next/image";

type SortMode = "recently_added" | "a_z" | "z_a" | "artist";
type ViewMode = "grid" | "list";

const SORT_OPTIONS: { key: SortMode; label: string }[] = [
  { key: "recently_added", label: "Recently Added" },
  { key: "a_z", label: "A–Z" },
  { key: "z_a", label: "Z–A" },
  { key: "artist", label: "By Artist" },
];

interface FlatTrack extends Track {
  albumInfo: { title: string; artist: string; coverArt?: string };
}

function fisherYates<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function LibraryPage() {
  const { token, user } = useAuth();
  const { importStatus } = useImport();
  const { playTrack } = usePlayer();
  const [albums, setAlbums] = useState<Album[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedAlbum, setSelectedAlbum] = useState<Album | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("recently_added");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");

  const loadAlbums = useCallback(async () => {
    if (!token) return;
    try {
      const data = await api.library.getAlbums(token, user?.id);
      setAlbums(data);
    } catch {
      setError("Failed to load your library.");
    } finally {
      setLoading(false);
    }
  }, [token, user?.id]);

  useEffect(() => {
    loadAlbums();
  }, [loadAlbums]);

  useEffect(() => {
    if (importStatus === "completed") {
      loadAlbums();
    }
  }, [importStatus, loadAlbums]);

  // Open album from global search (sessionStorage) or custom event
  useEffect(() => {
    const tryOpenPending = (albumList: Album[]) => {
      const pending = sessionStorage.getItem("pendingAlbumOpen");
      if (!pending) return;
      sessionStorage.removeItem("pendingAlbumOpen");
      const match = albumList.find((a: any) => (a._id || String(a.id)) === pending);
      if (match) setSelectedAlbum(match);
    };

    if (albums.length > 0) tryOpenPending(albums);
  }, [albums]);

  useEffect(() => {
    const handler = (e: Event) => {
      const albumId = (e as CustomEvent).detail?.albumId;
      if (!albumId) return;
      const match = albums.find((a: any) => (a._id || String(a.id)) === albumId);
      if (match) setSelectedAlbum(match);
    };
    window.addEventListener("openAlbum", handler);
    return () => window.removeEventListener("openAlbum", handler);
  }, [albums]);

  const handleDeleteAlbum = async (albumId: string) => {
    try {
      await api.library.deleteAlbum(albumId, user?.id);
      setAlbums((prev) =>
        prev.filter((a: any) => (a._id || a.id) !== albumId)
      );
    } catch (err) {
      console.error("Failed to delete album:", err);
    }
  };

  const handleAlbumClick = (album: Album) => {
    setSelectedAlbum(album);
  };

  // Shuffle All — flatten every track across all albums and play shuffled
  const handleShuffleAll = () => {
    if (albums.length === 0) return;

    const flat: FlatTrack[] = albums.flatMap((a) => {
      const coverArt = (a as any).coverArt || a.cover_art;
      return (a.tracks || []).map((t: any, idx: number): FlatTrack => ({
        id: t.id ?? idx + 1,
        title: t.title || `Track ${idx + 1}`,
        track_number: t.trackNumber || t.track_number || idx + 1,
        audio_file: t.audioFile || t.audio_file || "",
        duration: t.duration || "",
        albumInfo: {
          title: a.title,
          artist: a.artist,
          coverArt: coverArt ?? undefined,
        },
      }));
    });

    const shuffled = fisherYates(flat);
    if (shuffled.length === 0) return;

    // Strip albumInfo from Track objects for the queue (player expects Track[])
    const queue: Track[] = shuffled.map(({ albumInfo: _ai, ...t }) => t);
    const first = shuffled[0];
    playTrack(queue[0], queue, first.albumInfo);
  };

  // Sort + filter pipeline
  const sortedFilteredAlbums = useMemo(() => {
    let result = [...albums];

    // Filter by search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (a) =>
          a.title?.toLowerCase().includes(q) ||
          a.artist?.toLowerCase().includes(q)
      );
    }

    // Sort
    switch (sortMode) {
      case "a_z":
        result.sort((a, b) => (a.title || "").localeCompare(b.title || ""));
        break;
      case "z_a":
        result.sort((a, b) => (b.title || "").localeCompare(a.title || ""));
        break;
      case "artist":
        result.sort((a, b) =>
          (a.artist || "").localeCompare(b.artist || "")
        );
        break;
      case "recently_added":
      default:
        // API already returns newest first; maintain insertion order
        break;
    }

    return result;
  }, [albums, searchQuery, sortMode]);

  // Group by artist when sort === 'artist'
  const artistGroups = useMemo<Map<string, Album[]>>(() => {
    if (sortMode !== "artist") return new Map();
    const map = new Map<string, Album[]>();
    for (const album of sortedFilteredAlbums) {
      const key = album.artist || "Unknown Artist";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(album);
    }
    return map;
  }, [sortMode, sortedFilteredAlbums]);

  const sortLabel = SORT_OPTIONS.find((o) => o.key === sortMode)?.label ?? "";

  return (
    <DashboardLayout>
      <AnimatePresence mode="wait">
        {selectedAlbum ? (
          <motion.div
            key="detail"
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 30 }}
            transition={{ duration: 0.25 }}
            className="max-w-7xl mx-auto h-full"
          >
            <AlbumDetailView
              album={selectedAlbum}
              onBack={() => setSelectedAlbum(null)}
            />
          </motion.div>
        ) : (
          <motion.div
            key="grid"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            transition={{ duration: 0.25 }}
            className="max-w-7xl mx-auto"
          >
            {/* Page Header */}
            <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h1 className="text-2xl md:text-3xl font-bold text-foreground">
                  My Library
                </h1>
                <p className="text-muted-foreground text-sm mt-0.5">
                  {albums.length > 0
                    ? `${albums.length} album${albums.length !== 1 ? "s" : ""} · sorted by ${sortLabel.toLowerCase()}`
                    : "Your collection in high fidelity"}
                </p>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                {/* View Toggle */}
                {albums.length > 0 && (
                  <div className="flex items-center bg-black/30 border border-white/8 rounded-xl p-1 gap-1">
                    <button
                      onClick={() => setViewMode("grid")}
                      className={`p-2 rounded-lg transition-all min-w-[36px] min-h-[36px] flex items-center justify-center ${
                        viewMode === "grid"
                          ? "bg-[#f4d35e]/15 text-[#f4d35e]"
                          : "text-zinc-500 hover:text-zinc-300"
                      }`}
                      aria-label="Grid view"
                      aria-pressed={viewMode === "grid"}
                    >
                      <LayoutGrid size={16} />
                    </button>
                    <button
                      onClick={() => setViewMode("list")}
                      className={`p-2 rounded-lg transition-all min-w-[36px] min-h-[36px] flex items-center justify-center ${
                        viewMode === "list"
                          ? "bg-[#f4d35e]/15 text-[#f4d35e]"
                          : "text-zinc-500 hover:text-zinc-300"
                      }`}
                      aria-label="List view"
                      aria-pressed={viewMode === "list"}
                    >
                      <List size={16} />
                    </button>
                  </div>
                )}

                {/* Shuffle All */}
                {albums.length > 0 && (
                  <button
                    onClick={handleShuffleAll}
                    className="flex items-center gap-2 px-4 py-2.5 bg-white/5 border border-white/8 text-zinc-300 hover:text-white hover:bg-white/10 font-semibold rounded-xl transition-colors text-sm min-h-[44px]"
                    aria-label="Shuffle all tracks"
                  >
                    <Shuffle size={16} />
                    <span className="hidden sm:inline">Shuffle All</span>
                  </button>
                )}

                {/* Add Music */}
                <Link
                  href="/import"
                  className="flex items-center gap-2 px-4 py-2.5 bg-[#f4d35e]/10 border border-[#f4d35e]/20 text-[#f4d35e] font-semibold rounded-xl hover:bg-[#f4d35e]/20 transition-colors text-sm min-h-[44px]"
                >
                  <Plus size={17} />
                  <span className="hidden sm:inline">Add Music</span>
                </Link>
              </div>
            </div>

            {/* Search Bar */}
            {albums.length > 0 && (
              <div className="relative mb-4">
                <Search
                  size={17}
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none"
                />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search albums or artists..."
                  className="w-full bg-black/30 border border-white/8 rounded-xl pl-11 pr-10 py-3 text-white placeholder-zinc-500 text-sm focus:outline-none focus:border-[#f4d35e]/50 focus:bg-black/50 transition-all"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white transition-colors p-1"
                    aria-label="Clear search"
                  >
                    <X size={15} />
                  </button>
                )}
              </div>
            )}

            {/* Sort Pills */}
            {albums.length > 0 && (
              <div
                className="flex items-center gap-2 mb-6 overflow-x-auto pb-1 scrollbar-none"
                role="group"
                aria-label="Sort options"
              >
                {SORT_OPTIONS.map((opt) => (
                  <button
                    key={opt.key}
                    onClick={() => setSortMode(opt.key)}
                    className={`flex-shrink-0 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all ${
                      sortMode === opt.key
                        ? "bg-[#f4d35e]/15 text-[#f4d35e] border border-[#f4d35e]/30"
                        : "bg-white/5 text-zinc-400 border border-white/8 hover:text-zinc-200 hover:bg-white/8"
                    }`}
                    aria-pressed={sortMode === opt.key}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}

            {/* Content */}
            {loading ? (
              <div className="flex flex-col items-center justify-center py-32 gap-4">
                <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                <p className="text-zinc-500 text-sm animate-pulse">
                  Loading your library...
                </p>
              </div>
            ) : error ? (
              <div className="flex flex-col items-center justify-center py-20 text-center bg-red-500/8 rounded-3xl border border-red-500/15 px-6">
                <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mb-4">
                  <Disc size={32} className="text-red-400" />
                </div>
                <h3 className="text-lg font-bold text-red-400 mb-2">
                  Couldn&apos;t Load Library
                </h3>
                <p className="text-zinc-400 text-sm mb-5 max-w-sm">{error}</p>
                <button
                  onClick={() => {
                    setError("");
                    setLoading(true);
                    loadAlbums();
                  }}
                  className="px-5 py-2.5 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl text-sm font-medium hover:bg-red-500/20 transition-colors"
                >
                  Try Again
                </button>
              </div>
            ) : albums.length === 0 ? (
              /* Empty state */
              <motion.div
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex flex-col items-center justify-center py-24 text-center px-6"
              >
                <div className="relative mb-8">
                  <div className="w-28 h-28 rounded-full bg-gradient-to-br from-[#f4d35e]/15 to-[#ee964b]/15 flex items-center justify-center border border-[#f4d35e]/15">
                    <Disc
                      size={52}
                      className="text-[#f4d35e]/60 animate-[spin_8s_linear_infinite]"
                    />
                  </div>
                  <div className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-[#f4d35e]/20 border border-[#f4d35e]/30 flex items-center justify-center">
                    <Plus size={16} className="text-[#f4d35e]" />
                  </div>
                </div>
                <h3 className="text-2xl font-bold text-white mb-3">
                  Your library is empty
                </h3>
                <p className="text-zinc-400 max-w-sm mb-8 text-sm leading-relaxed">
                  Add your music collection — import audio files or rip CDs
                  with the desktop app. Your music, your way.
                </p>
                <Link
                  href="/import"
                  className="px-7 py-3.5 bg-[#f4d35e] text-[#0d3b66] font-bold rounded-xl hover:bg-[#ffd700] transition-all hover:scale-105 shadow-lg shadow-[#f4d35e]/20 text-sm inline-flex items-center gap-2"
                >
                  <Plus size={18} />
                  Import Your First Album
                </Link>
                <p className="text-zinc-600 text-xs mt-5">
                  Supports FLAC, WAV, MP3, AAC, and more
                </p>
              </motion.div>
            ) : sortedFilteredAlbums.length === 0 ? (
              /* No search results */
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-col items-center justify-center py-20 text-center"
              >
                <Search size={36} className="text-zinc-600 mb-4" />
                <h3 className="text-lg font-semibold text-white mb-2">
                  No results found
                </h3>
                <p className="text-zinc-500 text-sm mb-5">
                  Nothing matching &ldquo;{searchQuery}&rdquo; in your library.
                </p>
                <button
                  onClick={() => setSearchQuery("")}
                  className="text-[#f4d35e] text-sm hover:underline"
                >
                  Clear search
                </button>
              </motion.div>
            ) : sortMode === "artist" ? (
              /* ── Artist Grouped View ── */
              <div className="space-y-8">
                {Array.from(artistGroups.entries()).map(
                  ([artistName, artistAlbums]) => (
                    <motion.section
                      key={artistName}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2 }}
                      aria-label={artistName}
                    >
                      <h2 className="text-lg font-bold text-white border-b border-white/8 pb-2 mb-3">
                        {artistName}
                        <span className="ml-2 text-sm font-normal text-zinc-500">
                          {artistAlbums.length} album
                          {artistAlbums.length !== 1 ? "s" : ""}
                        </span>
                      </h2>
                      <div className="flex gap-4 overflow-x-auto pb-2 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                        {artistAlbums.map((album: any) => (
                          <div
                            key={album._id || album.id}
                            className="flex-shrink-0 w-40"
                          >
                            <AlbumCard
                              album={album}
                              onDelete={handleDeleteAlbum}
                              onClick={() => handleAlbumClick(album)}
                            />
                          </div>
                        ))}
                      </div>
                    </motion.section>
                  )
                )}
              </div>
            ) : viewMode === "grid" ? (
              /* ── Grid View ── */
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 md:gap-6">
                {sortedFilteredAlbums.map((album: any, idx: number) => (
                  <motion.div
                    key={album._id || album.id}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(idx * 0.04, 0.4) }}
                  >
                    <AlbumCard
                      album={album}
                      onDelete={handleDeleteAlbum}
                      onClick={() => handleAlbumClick(album)}
                    />
                  </motion.div>
                ))}
              </div>
            ) : (
              /* ── List View ── */
              <div className="space-y-1">
                {sortedFilteredAlbums.map((album: any, idx: number) => {
                  const albumId = album._id || album.id;
                  const coverArt = album.coverArt || album.cover_art;
                  return (
                    <motion.div
                      key={albumId}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: Math.min(idx * 0.03, 0.3) }}
                    >
                      <button
                        onClick={() => handleAlbumClick(album)}
                        className="w-full flex items-center gap-4 px-4 py-2.5 rounded-xl hover:bg-white/5 border border-transparent hover:border-white/8 transition-all group text-left"
                        aria-label={`Open ${album.title} by ${album.artist}`}
                      >
                        {/* Thumbnail */}
                        <div className="w-12 h-12 flex-shrink-0 rounded-lg overflow-hidden bg-black/40 border border-white/8">
                          {coverArt ? (
                            <Image
                              src={coverArt}
                              alt={album.title}
                              width={48}
                              height={48}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-zinc-600">
                              <Disc size={20} />
                            </div>
                          )}
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-white truncate group-hover:text-[#f4d35e] transition-colors">
                            {album.title}
                          </p>
                          <p className="text-xs text-zinc-400 truncate">
                            {album.artist}
                          </p>
                        </div>

                        {/* Track count */}
                        <span className="text-xs text-zinc-600 flex-shrink-0 hidden sm:block">
                          {album.tracks?.length ?? 0} tracks
                        </span>

                        {/* Play Button */}
                        <div className="flex-shrink-0 w-9 h-9 rounded-full bg-[#f4d35e]/0 group-hover:bg-[#f4d35e]/10 flex items-center justify-center transition-all">
                          <Play
                            size={16}
                            className="text-zinc-600 group-hover:text-[#f4d35e] transition-colors ml-0.5"
                            fill="currentColor"
                          />
                        </div>
                      </button>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </DashboardLayout>
  );
}
