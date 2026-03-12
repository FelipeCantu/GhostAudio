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
  UserRound,
  Music,
  ChevronLeft,
  Zap,
} from "lucide-react";
import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { useAuth } from "@/context/AuthContext";
import { useImport } from "@/context/ImportContext";
import { usePlayer } from "@/context/PlayerContext";
import { usePlaylist } from "@/context/PlaylistContext";
import { api, Album, Track } from "@/services/api";
import AlbumCard from "@/components/AlbumCard";
import AlbumDetailView from "@/components/AlbumDetailView";
import Link from "next/link";
import Image from "next/image";

// ─── Types ────────────────────────────────────────────────────────────────────

type SortMode = "recently_added" | "a_z" | "z_a" | "artist";
type ViewMode = "grid" | "list";
type TabId = "playlists" | "artists" | "albums" | "songs";

const SORT_OPTIONS: { key: SortMode; label: string }[] = [
  { key: "recently_added", label: "Recently Added" },
  { key: "a_z", label: "A–Z" },
  { key: "z_a", label: "Z–A" },
  { key: "artist", label: "By Artist" },
];

interface FlatTrack extends Track {
  albumInfo: { title: string; artist: string; coverArt?: string };
}

interface ArtistEntry {
  name: string;
  albums: Album[];
  coverArts: string[];
  trackCount: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fisherYates<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildFlatTracks(albums: Album[]): FlatTrack[] {
  return albums.flatMap((a) => {
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
}

/** Returns true only for http/https URLs — local paths and localfile:// won't load in the browser */
function isWebUrl(url: string | undefined): url is string {
  return !!url && (url.startsWith("http://") || url.startsWith("https://"));
}

function formatDuration(raw: string | undefined): string {
  if (!raw) return "";
  // Already formatted as m:ss
  if (raw.includes(":")) return raw;
  const secs = parseFloat(raw);
  if (isNaN(secs)) return "";
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;

}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface CoverMosaicProps {
  images: string[];
  size?: number;
  placeholderIcon: React.ReactNode;
  className?: string;
}

function CoverMosaic({ images, size = 48, placeholderIcon, className = "" }: CoverMosaicProps) {
  const slots = images.slice(0, 4);
  const isEmpty = slots.length === 0;

  if (isEmpty) {
    return (
      <div
        className={`flex-shrink-0 rounded-xl overflow-hidden bg-white/5 border border-white/8 flex items-center justify-center text-zinc-600 ${className}`}
        style={{ width: size, height: size }}
      >
        {placeholderIcon}
      </div>
    );
  }

  if (slots.length === 1) {
    return (
      <div
        className={`flex-shrink-0 rounded-xl overflow-hidden bg-black/40 border border-white/8 ${className}`}
        style={{ width: size, height: size }}
      >
        <Image
          src={slots[0]}
          alt=""
          width={size}
          height={size}
          className="w-full h-full object-cover"
        />
      </div>
    );
  }

  // 2×2 mosaic
  const filled = [...slots];
  while (filled.length < 4) filled.push("");

  return (
    <div
      className={`flex-shrink-0 rounded-xl overflow-hidden border border-white/8 grid grid-cols-2 ${className}`}
      style={{ width: size, height: size }}
    >
      {filled.map((src, i) =>
        src ? (
          <Image
            key={i}
            src={src}
            alt=""
            width={size / 2}
            height={size / 2}
            className="w-full h-full object-cover"
          />
        ) : (
          <div key={i} className="w-full h-full bg-white/5 flex items-center justify-center text-zinc-700">
            <Disc size={10} />
          </div>
        )
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function LibraryPage() {
  const { token, user } = useAuth();
  const { importStatus } = useImport();
  const { playTrack, currentTrack } = usePlayer();
  const { playlists } = usePlaylist();

  // Albums state
  const [albums, setAlbums] = useState<Album[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedAlbum, setSelectedAlbum] = useState<Album | null>(null);

  // Tab state
  const [activeTab, setActiveTab] = useState<TabId>("albums");
  const [searchQuery, setSearchQuery] = useState("");
  // Debounced value used for filtering — avoids recomputing on every keystroke
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedQuery(searchQuery), 200);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [searchQuery]);

  // Albums tab state
  const [sortMode, setSortMode] = useState<SortMode>("recently_added");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");

  // Artists tab state
  const [selectedArtist, setSelectedArtist] = useState<ArtistEntry | null>(null);

  // ─── Data loading ─────────────────────────────────────────────────────────

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

  // Open album from global search (sessionStorage)
  useEffect(() => {
    const tryOpenPending = (albumList: Album[]) => {
      const pending = sessionStorage.getItem("pendingAlbumOpen");
      if (!pending) return;
      sessionStorage.removeItem("pendingAlbumOpen");
      const match = albumList.find((a: any) => (a._id || String(a.id)) === pending);
      if (match) {
        setActiveTab("albums");
        setSelectedAlbum(match);
      }
    };
    if (albums.length > 0) tryOpenPending(albums);
  }, [albums]);

  // Open album from custom event
  useEffect(() => {
    const handler = (e: Event) => {
      const albumId = (e as CustomEvent).detail?.albumId;
      if (!albumId) return;
      const match = albums.find((a: any) => (a._id || String(a.id)) === albumId);
      if (match) {
        setActiveTab("albums");
        setSelectedAlbum(match);
      }
    };
    window.addEventListener("openAlbum", handler);
    return () => window.removeEventListener("openAlbum", handler);
  }, [albums]);

  // ─── Handlers ─────────────────────────────────────────────────────────────

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

  const handleTabChange = (tab: TabId) => {
    setActiveTab(tab);
    setSearchQuery("");
    setSelectedArtist(null);
  };

  // Shuffle All — flatten every track and play shuffled
  const handleShuffleAll = () => {
    if (albums.length === 0) return;
    const flat = buildFlatTracks(albums);
    const shuffled = fisherYates(flat);
    if (shuffled.length === 0) return;
    playTrack(shuffled[0] as unknown as Track, shuffled as unknown as Track[], shuffled[0].albumInfo);
  };

  const handleShuffleArtist = (artist: ArtistEntry) => {
    const flat = buildFlatTracks(artist.albums);
    const shuffled = fisherYates(flat);
    if (shuffled.length === 0) return;
    playTrack(shuffled[0] as unknown as Track, shuffled as unknown as Track[], shuffled[0].albumInfo);
  };

  // ─── Derived data ──────────────────────────────────────────────────────────

  // Albums tab: sort + filter
  const sortedFilteredAlbums = useMemo(() => {
    let result = [...albums];
    if (debouncedQuery.trim()) {
      const q = debouncedQuery.toLowerCase();
      result = result.filter(
        (a) =>
          a.title?.toLowerCase().includes(q) ||
          a.artist?.toLowerCase().includes(q)
      );
    }
    switch (sortMode) {
      case "a_z":
        result.sort((a, b) => (a.title || "").localeCompare(b.title || ""));
        break;
      case "z_a":
        result.sort((a, b) => (b.title || "").localeCompare(a.title || ""));
        break;
      case "artist":
        result.sort((a, b) => (a.artist || "").localeCompare(b.artist || ""));
        break;
      case "recently_added":
      default:
        break;
    }
    return result;
  }, [albums, debouncedQuery, sortMode]);

  const albumsArtistGroups = useMemo<Map<string, Album[]>>(() => {
    if (sortMode !== "artist") return new Map();
    const map = new Map<string, Album[]>();
    for (const album of sortedFilteredAlbums) {
      const key = album.artist || "Unknown Artist";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(album);
    }
    return map;
  }, [sortMode, sortedFilteredAlbums]);

  // Artists tab: derive artist entries
  const allArtists = useMemo<ArtistEntry[]>(() => {
    const map = new Map<string, Album[]>();
    for (const album of albums) {
      const key = album.artist || "Unknown Artist";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(album);
    }
    return Array.from(map.entries())
      .map(([name, artistAlbums]) => {
        const coverArts = artistAlbums
          .map((a) => (a as any).coverArt || a.cover_art)
          .filter(isWebUrl) as string[];
        const trackCount = artistAlbums.reduce(
          (sum, a) => sum + (a.tracks?.length ?? 0),
          0
        );
        return { name, albums: artistAlbums, coverArts, trackCount };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [albums]);

  const filteredArtists = useMemo(() => {
    if (!debouncedQuery.trim()) return allArtists;
    const q = debouncedQuery.toLowerCase();
    return allArtists.filter((a) => a.name.toLowerCase().includes(q));
  }, [allArtists, debouncedQuery]);

  // Songs tab: flat track list
  const allTracks = useMemo<FlatTrack[]>(() => buildFlatTracks(albums), [albums]);

  const filteredTracks = useMemo(() => {
    if (!debouncedQuery.trim()) return allTracks;
    const q = debouncedQuery.toLowerCase();
    return allTracks.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.albumInfo.artist.toLowerCase().includes(q) ||
        t.albumInfo.title.toLowerCase().includes(q)
    );
  }, [allTracks, debouncedQuery]);

  // Playlists tab
  const filteredPlaylists = useMemo(() => {
    if (!debouncedQuery.trim()) return playlists;
    const q = debouncedQuery.toLowerCase();
    return playlists.filter((p) => p.name.toLowerCase().includes(q));
  }, [playlists, debouncedQuery]);

  // ─── Tab badge counts ──────────────────────────────────────────────────────

  const tabCounts: Record<TabId, number> = {
    playlists: playlists.length,
    artists: allArtists.length,
    albums: albums.length,
    songs: allTracks.length,
  };

  const sortLabel = SORT_OPTIONS.find((o) => o.key === sortMode)?.label ?? "";

  const TABS: { id: TabId; label: string }[] = [
    { id: "playlists", label: "Playlists" },
    { id: "artists", label: "Artists" },
    { id: "albums", label: "Albums" },
    { id: "songs", label: "Songs" },
  ];

  // ─── Render ───────────────────────────────────────────────────────────────

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
            key="library"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            transition={{ duration: 0.25 }}
            className="max-w-7xl mx-auto"
          >
            {/* ── Page Header ── */}
            <div className="mb-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h1 className="text-2xl md:text-3xl font-bold text-foreground">
                  My Library
                </h1>
                <p className="text-muted-foreground text-sm mt-0.5">
                  {albums.length > 0
                    ? `${albums.length} album${albums.length !== 1 ? "s" : ""} · ${allTracks.length} song${allTracks.length !== 1 ? "s" : ""}`
                    : "Your collection in high fidelity"}
                </p>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                {/* View toggle — Albums tab only */}
                {activeTab === "albums" && albums.length > 0 && (
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

                {/* Shuffle All — Albums + Songs tabs */}
                {(activeTab === "albums" || activeTab === "songs") && albums.length > 0 && (
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

            {/* ── Tab Bar ── */}
            <div
              className="flex items-center gap-1 border-b border-white/8 mb-5 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
              role="tablist"
              aria-label="Library sections"
            >
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  role="tab"
                  aria-selected={activeTab === tab.id}
                  onClick={() => handleTabChange(tab.id)}
                  className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold whitespace-nowrap border-b-2 transition-all -mb-px ${
                    activeTab === tab.id
                      ? "border-[#f4d35e] text-white"
                      : "border-transparent text-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  {tab.label}
                  {tabCounts[tab.id] > 0 && (
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center leading-none ${
                        activeTab === tab.id
                          ? "bg-[#f4d35e]/20 text-[#f4d35e]"
                          : "bg-white/8 text-zinc-500"
                      }`}
                    >
                      {tabCounts[tab.id]}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* ── Search Bar ── */}
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
                  placeholder={
                    activeTab === "playlists"
                      ? "Search playlists..."
                      : activeTab === "artists"
                      ? "Search artists..."
                      : activeTab === "albums"
                      ? "Search albums or artists..."
                      : "Search songs, artists, or albums..."
                  }
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

            {/* ── Sort Pills (Albums tab only) ── */}
            {activeTab === "albums" && albums.length > 0 && (
              <div
                className="flex items-center gap-2 mb-5 overflow-x-auto pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
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

            {/* ── Tab Content ── */}
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
              /* Empty library state */
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
            ) : (
              <AnimatePresence mode="wait">
                {/* ════════════ PLAYLISTS TAB ════════════ */}
                {activeTab === "playlists" && (
                  <motion.div
                    key="tab-playlists"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.2 }}
                  >
                    {filteredPlaylists.length === 0 ? (
                      <EmptyTabState
                        icon={<Disc size={32} className="text-zinc-600" />}
                        title={searchQuery ? "No playlists found" : "No playlists yet"}
                        subtitle={
                          searchQuery
                            ? `Nothing matching "${searchQuery}"`
                            : "Create a playlist to organise your tracks."
                        }
                        action={
                          searchQuery ? (
                            <button
                              onClick={() => setSearchQuery("")}
                              className="text-[#f4d35e] text-sm hover:underline"
                            >
                              Clear search
                            </button>
                          ) : (
                            <Link
                              href="/playlists/new"
                              className="px-5 py-2.5 bg-[#f4d35e]/10 border border-[#f4d35e]/20 text-[#f4d35e] rounded-xl text-sm font-medium hover:bg-[#f4d35e]/20 transition-colors inline-flex items-center gap-2"
                            >
                              <Plus size={15} />
                              New Playlist
                            </Link>
                          )
                        }
                      />
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                        {filteredPlaylists.map((playlist, idx) => {
                          const trackCount =
                            playlist.item_count ?? playlist.items?.length ?? 0;
                          return (
                            <motion.div
                              key={playlist.id}
                              initial={{ opacity: 0, y: 12 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: Math.min(idx * 0.04, 0.4) }}
                            >
                              <Link
                                href={`/playlists/${playlist.id}`}
                                className="group block bg-white/4 border border-white/5 rounded-2xl p-3 hover:bg-white/8 hover:border-white/10 transition-all duration-200"
                              >
                                {/* Cover mosaic */}
                                <div className="relative aspect-square w-full rounded-xl overflow-hidden mb-3 bg-black/40">
                                  <PlaylistMosaic
                                    coverArts={playlist.cover_arts ?? []}
                                  />
                                  {/* Smart badge overlay */}
                                  {playlist.is_smart && (
                                    <div className="absolute top-2 left-2 flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-[#f4d35e]/90 text-[#0d3b66]">
                                      <Zap size={10} fill="currentColor" />
                                      <span className="text-[9px] font-black uppercase tracking-wide">
                                        Smart
                                      </span>
                                    </div>
                                  )}
                                  {/* Play overlay */}
                                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                    <div className="w-12 h-12 rounded-full bg-[#f4d35e] text-[#0d3b66] flex items-center justify-center shadow-xl">
                                      <Play size={22} fill="currentColor" className="ml-0.5" />
                                    </div>
                                  </div>
                                </div>
                                <p className="text-sm font-semibold text-white truncate group-hover:text-[#f4d35e] transition-colors">
                                  {playlist.name}
                                </p>
                                <p className="text-xs text-zinc-400 mt-0.5">
                                  {trackCount} track{trackCount !== 1 ? "s" : ""}
                                </p>
                              </Link>
                            </motion.div>
                          );
                        })}
                      </div>
                    )}
                  </motion.div>
                )}

                {/* ════════════ ARTISTS TAB ════════════ */}
                {activeTab === "artists" && (
                  <motion.div
                    key="tab-artists"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.2 }}
                  >
                    <AnimatePresence mode="wait">
                      {selectedArtist ? (
                        /* ── Artist Detail Panel ── */
                        <motion.div
                          key={`artist-detail-${selectedArtist.name}`}
                          initial={{ opacity: 0, x: 20 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: 20 }}
                          transition={{ duration: 0.2 }}
                        >
                          <div className="flex items-center justify-between mb-5">
                            <div className="flex items-center gap-3">
                              <button
                                onClick={() => setSelectedArtist(null)}
                                className="flex items-center gap-1.5 text-zinc-400 hover:text-white transition-colors text-sm min-h-[44px] px-1"
                                aria-label="Back to artists"
                              >
                                <ChevronLeft size={18} />
                                <span>Artists</span>
                              </button>
                              <span className="text-zinc-600">/</span>
                              <h2 className="text-lg font-bold text-white truncate">
                                {selectedArtist.name}
                              </h2>
                            </div>
                            <button
                              onClick={() => handleShuffleArtist(selectedArtist)}
                              className="flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/8 text-zinc-300 hover:text-white hover:bg-white/10 font-semibold rounded-xl transition-colors text-sm min-h-[44px]"
                            >
                              <Shuffle size={15} />
                              <span className="hidden sm:inline">Shuffle</span>
                            </button>
                          </div>

                          <p className="text-zinc-500 text-sm mb-5">
                            {selectedArtist.albums.length} album{selectedArtist.albums.length !== 1 ? "s" : ""}{" "}
                            &middot; {selectedArtist.trackCount} song{selectedArtist.trackCount !== 1 ? "s" : ""}
                          </p>

                          <div className="flex gap-4 overflow-x-auto pb-2 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                            {selectedArtist.albums.map((album: any) => (
                              <div key={album._id || album.id} className="flex-shrink-0 w-40">
                                <AlbumCard
                                  album={album}
                                  onDelete={handleDeleteAlbum}
                                  onClick={() => handleAlbumClick(album)}
                                />
                              </div>
                            ))}
                          </div>
                        </motion.div>
                      ) : (
                        /* ── Artist List ── */
                        <motion.div
                          key="artist-list"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.15 }}
                        >
                          {filteredArtists.length === 0 ? (
                            <EmptyTabState
                              icon={<UserRound size={32} className="text-zinc-600" />}
                              title="No artists found"
                              subtitle={`Nothing matching "${searchQuery}"`}
                              action={
                                <button
                                  onClick={() => setSearchQuery("")}
                                  className="text-[#f4d35e] text-sm hover:underline"
                                >
                                  Clear search
                                </button>
                              }
                            />
                          ) : (
                            <div className="space-y-1">
                              {filteredArtists.map((artist, idx) => (
                                <motion.div
                                  key={artist.name}
                                  initial={{ opacity: 0, x: -8 }}
                                  animate={{ opacity: 1, x: 0 }}
                                  transition={{ delay: Math.min(idx * 0.025, 0.35) }}
                                >
                                  <div className="flex items-center gap-4 px-3 py-2.5 rounded-xl hover:bg-white/5 border border-transparent hover:border-white/8 transition-all group">
                                    {/* Artist collage */}
                                    <button
                                      onClick={() => setSelectedArtist(artist)}
                                      className="flex items-center gap-4 flex-1 min-w-0 text-left"
                                      aria-label={`View ${artist.name}`}
                                    >
                                      <CoverMosaic
                                        images={artist.coverArts}
                                        size={48}
                                        placeholderIcon={<UserRound size={20} />}
                                        className="rounded-xl"
                                      />
                                      <div className="flex-1 min-w-0">
                                        <p className="text-sm font-semibold text-white truncate group-hover:text-[#f4d35e] transition-colors">
                                          {artist.name}
                                        </p>
                                        <p className="text-xs text-zinc-400 mt-0.5">
                                          {artist.albums.length} album{artist.albums.length !== 1 ? "s" : ""}{" "}
                                          &middot; {artist.trackCount} song{artist.trackCount !== 1 ? "s" : ""}
                                        </p>
                                      </div>
                                    </button>

                                    {/* Play button */}
                                    <button
                                      onClick={() => handleShuffleArtist(artist)}
                                      className="flex-shrink-0 w-9 h-9 rounded-full opacity-0 group-hover:opacity-100 sm:opacity-0 sm:group-hover:opacity-100 bg-[#f4d35e]/10 hover:bg-[#f4d35e]/20 flex items-center justify-center transition-all min-w-[36px] min-h-[36px]"
                                      aria-label={`Shuffle ${artist.name}`}
                                    >
                                      <Play
                                        size={15}
                                        className="text-[#f4d35e] ml-0.5"
                                        fill="currentColor"
                                      />
                                    </button>
                                  </div>
                                </motion.div>
                              ))}
                            </div>
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                )}

                {/* ════════════ ALBUMS TAB ════════════ */}
                {activeTab === "albums" && (
                  <motion.div
                    key="tab-albums"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.2 }}
                  >
                    {sortedFilteredAlbums.length === 0 ? (
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
                      /* Artist-grouped album view */
                      <div className="space-y-8">
                        {Array.from(albumsArtistGroups.entries()).map(
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
                      /* List view */
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
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-semibold text-white truncate group-hover:text-[#f4d35e] transition-colors">
                                    {album.title}
                                  </p>
                                  <p className="text-xs text-zinc-400 truncate">
                                    {album.artist}
                                  </p>
                                </div>
                                <span className="text-xs text-zinc-600 flex-shrink-0 hidden sm:block">
                                  {album.tracks?.length ?? 0} tracks
                                </span>
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

                {/* ════════════ SONGS TAB ════════════ */}
                {activeTab === "songs" && (
                  <motion.div
                    key="tab-songs"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.2 }}
                  >
                    {filteredTracks.length === 0 ? (
                      <EmptyTabState
                        icon={<Music size={32} className="text-zinc-600" />}
                        title="No songs found"
                        subtitle={
                          searchQuery
                            ? `Nothing matching "${searchQuery}"`
                            : "Import some music to see your songs here."
                        }
                        action={
                          searchQuery ? (
                            <button
                              onClick={() => setSearchQuery("")}
                              className="text-[#f4d35e] text-sm hover:underline"
                            >
                              Clear search
                            </button>
                          ) : undefined
                        }
                      />
                    ) : (
                      <>
                        {/* Column headers */}
                        <div className="hidden sm:grid grid-cols-[2.5rem_1fr_1fr_4rem] gap-3 px-3 mb-1 text-[10px] font-bold uppercase tracking-wider text-zinc-600 select-none">
                          <span />
                          <span>Title</span>
                          <span>Album</span>
                          <span className="text-right">Time</span>
                        </div>
                        <div className="space-y-0.5">
                          {filteredTracks.map((track, idx) => {
                            const isActive = !!currentTrack && currentTrack.audio_file === track.audio_file;
                            const coverArt = isWebUrl(track.albumInfo.coverArt) ? track.albumInfo.coverArt : undefined;
                            return (
                              <button
                                key={`${track.audio_file}-${idx}`}
                                onClick={() =>
                                  playTrack(
                                    track as unknown as Track,
                                    filteredTracks as unknown as Track[],
                                    track.albumInfo
                                  )
                                }
                                className={`w-full grid grid-cols-[2.5rem_1fr] sm:grid-cols-[2.5rem_1fr_1fr_4rem] gap-3 items-center px-3 py-2 rounded-xl transition-all group text-left ${
                                  isActive
                                    ? "bg-[#f4d35e]/8 border border-[#f4d35e]/15"
                                    : "hover:bg-white/5 border border-transparent hover:border-white/5"
                                }`}
                                aria-label={`Play ${track.title}`}
                              >
                                {/* Cover art thumbnail with play/equalizer overlay */}
                                <div className="relative w-10 h-10 flex-shrink-0 rounded-lg overflow-hidden bg-white/5 border border-white/8">
                                  {/* Placeholder always behind the img */}
                                  <div className="absolute inset-0 flex items-center justify-center text-zinc-700">
                                    <Music size={16} />
                                  </div>
                                  {coverArt && (
                                    <img
                                      src={coverArt}
                                      alt=""
                                      className="absolute inset-0 w-full h-full object-cover"
                                      loading="lazy"
                                      onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                                    />
                                  )}
                                  {/* Overlay: play icon on hover, equalizer when active */}
                                  <div className={`absolute inset-0 flex items-center justify-center transition-opacity ${
                                    isActive
                                      ? "bg-black/50 opacity-100"
                                      : "bg-black/50 opacity-0 group-hover:opacity-100"
                                  }`}>
                                    {isActive ? (
                                      <span className="flex gap-[2px] items-end h-3.5">
                                        <span className="w-[3px] bg-[#f4d35e] rounded-full animate-[bounce_0.7s_ease-in-out_infinite]" style={{ height: "55%" }} />
                                        <span className="w-[3px] bg-[#f4d35e] rounded-full animate-[bounce_0.7s_ease-in-out_0.15s_infinite]" style={{ height: "100%" }} />
                                        <span className="w-[3px] bg-[#f4d35e] rounded-full animate-[bounce_0.7s_ease-in-out_0.3s_infinite]" style={{ height: "70%" }} />
                                      </span>
                                    ) : (
                                      <Play size={14} className="text-white ml-0.5" fill="currentColor" />
                                    )}
                                  </div>
                                </div>

                                {/* Title + artist stacked */}
                                <div className="min-w-0">
                                  <p className={`text-sm font-semibold truncate leading-tight ${
                                    isActive ? "text-[#f4d35e]" : "text-white group-hover:text-[#f4d35e] transition-colors"
                                  }`}>
                                    {track.title}
                                  </p>
                                  <p className="text-xs text-zinc-400 truncate mt-0.5 leading-tight">
                                    {track.albumInfo.artist}
                                  </p>
                                </div>

                                {/* Album */}
                                <span className="text-xs text-zinc-500 truncate hidden sm:block">
                                  {track.albumInfo.title}
                                </span>

                                {/* Duration */}
                                <span className="text-xs text-zinc-600 text-right hidden sm:block tabular-nums">
                                  {formatDuration(track.duration)}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </DashboardLayout>
  );
}

// ─── Playlist Mosaic ──────────────────────────────────────────────────────────

function PlaylistMosaic({ coverArts }: { coverArts: string[] }) {
  const slots = coverArts.slice(0, 4);

  if (slots.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-zinc-800 to-zinc-900 text-zinc-600">
        <Disc size={40} />
      </div>
    );
  }

  if (slots.length === 1) {
    return (
      <Image
        src={slots[0]}
        alt=""
        fill
        className="object-cover"
        sizes="(max-width: 640px) 50vw, 25vw"
      />
    );
  }

  const filled = [...slots];
  while (filled.length < 4) filled.push("");

  return (
    <div className="w-full h-full grid grid-cols-2">
      {filled.map((src, i) =>
        src ? (
          <div key={i} className="relative overflow-hidden">
            <Image
              src={src}
              alt=""
              fill
              className="object-cover"
              sizes="(max-width: 640px) 25vw, 12vw"
            />
          </div>
        ) : (
          <div key={i} className="bg-zinc-800 flex items-center justify-center text-zinc-700">
            <Disc size={14} />
          </div>
        )
      )}
    </div>
  );
}

// ─── Empty Tab State ──────────────────────────────────────────────────────────

interface EmptyTabStateProps {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  action?: React.ReactNode;
}

function EmptyTabState({ icon, title, subtitle, action }: EmptyTabStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-col items-center justify-center py-20 text-center"
    >
      <div className="mb-4">{icon}</div>
      <h3 className="text-lg font-semibold text-white mb-2">{title}</h3>
      <p className="text-zinc-500 text-sm mb-5 max-w-xs">{subtitle}</p>
      {action}
    </motion.div>
  );
}
