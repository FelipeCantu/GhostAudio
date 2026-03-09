"use client";

import DashboardLayout from "@/components/DashboardLayout";
import { motion, AnimatePresence } from "framer-motion";
import { Disc, Search, X, Plus, SlidersHorizontal } from "lucide-react";
import { useEffect, useState, useMemo } from "react";
import { useAuth } from "@/context/AuthContext";
import { useImport } from "@/context/ImportContext";
import { api, Album } from "@/services/api";
import AlbumCard from "@/components/AlbumCard";
import AlbumDetailView from "@/components/AlbumDetailView";
import Link from "next/link";

export default function LibraryPage() {
  const { token, user } = useAuth();
  const { importStatus } = useImport();
  const [albums, setAlbums] = useState<Album[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedAlbum, setSelectedAlbum] = useState<Album | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const loadAlbums = async () => {
    if (!token) return;
    try {
      const data = await api.library.getAlbums(token, user?.id);
      setAlbums(data);
    } catch {
      setError("Failed to load your library.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAlbums();
  }, [token, user?.id]);

  useEffect(() => {
    if (importStatus === "completed") {
      loadAlbums();
    }
  }, [importStatus]);

  const handleDeleteAlbum = async (albumId: string) => {
    try {
      await api.library.deleteAlbum(albumId, user?.id);
      setAlbums((prev) => prev.filter((a: any) => (a._id || a.id) !== albumId));
    } catch (err) {
      console.error("Failed to delete album:", err);
    }
  };

  const handleAlbumClick = (album: Album) => {
    setSelectedAlbum(album);
  };

  const filteredAlbums = useMemo(() => {
    if (!searchQuery.trim()) return albums;
    const q = searchQuery.toLowerCase();
    return albums.filter(
      (a) =>
        a.title?.toLowerCase().includes(q) || a.artist?.toLowerCase().includes(q)
    );
  }, [albums, searchQuery]);

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
                    ? `${albums.length} album${albums.length !== 1 ? "s" : ""} · Your collection in high fidelity`
                    : "Your collection in high fidelity"}
                </p>
              </div>

              {/* Import shortcut */}
              <Link
                href="/import"
                className="flex items-center gap-2 px-4 py-2.5 bg-[#f4d35e]/10 border border-[#f4d35e]/20 text-[#f4d35e] font-semibold rounded-xl hover:bg-[#f4d35e]/20 transition-colors text-sm flex-shrink-0 min-h-[44px]"
              >
                <Plus size={17} />
                Add Music
              </Link>
            </div>

            {/* Search Bar */}
            {albums.length > 0 && (
              <div className="relative mb-6">
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

            {/* Content */}
            {loading ? (
              <div className="flex flex-col items-center justify-center py-32 gap-4">
                <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                <p className="text-zinc-500 text-sm animate-pulse">Loading your library...</p>
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
                  onClick={() => { setError(""); setLoading(true); loadAlbums(); }}
                  className="px-5 py-2.5 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl text-sm font-medium hover:bg-red-500/20 transition-colors"
                >
                  Try Again
                </button>
              </div>
            ) : albums.length === 0 ? (
              /* Beautiful empty state */
              <motion.div
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex flex-col items-center justify-center py-24 text-center px-6"
              >
                <div className="relative mb-8">
                  <div className="w-28 h-28 rounded-full bg-gradient-to-br from-[#f4d35e]/15 to-[#ee964b]/15 flex items-center justify-center border border-[#f4d35e]/15">
                    <Disc size={52} className="text-[#f4d35e]/60 animate-[spin_8s_linear_infinite]" />
                  </div>
                  <div className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-[#f4d35e]/20 border border-[#f4d35e]/30 flex items-center justify-center">
                    <Plus size={16} className="text-[#f4d35e]" />
                  </div>
                </div>
                <h3 className="text-2xl font-bold text-white mb-3">
                  Your library is empty
                </h3>
                <p className="text-zinc-400 max-w-sm mb-8 text-sm leading-relaxed">
                  Add your music collection — import audio files or rip CDs with the desktop app.
                  Your music, your way.
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
            ) : filteredAlbums.length === 0 ? (
              /* No search results */
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-col items-center justify-center py-20 text-center"
              >
                <Search size={36} className="text-zinc-600 mb-4" />
                <h3 className="text-lg font-semibold text-white mb-2">No results found</h3>
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
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 md:gap-6">
                {filteredAlbums.map((album: any, idx: number) => (
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
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </DashboardLayout>
  );
}
