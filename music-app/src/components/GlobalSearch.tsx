"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, X, Disc } from "lucide-react";
import Image from "next/image";
import { useRouter, usePathname } from "next/navigation";
import { Album } from "@/services/api";

interface GlobalSearchProps {
  albums: Album[];
  onOpenShortcuts: () => void;
  /** When true, programmatically open the search overlay (e.g. from mobile search button) */
  forceOpen?: boolean;
  onForceOpenConsumed?: () => void;
}

export default function GlobalSearch({ albums, onOpenShortcuts, forceOpen, onForceOpenConsumed }: GlobalSearchProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Handle programmatic open (e.g. mobile search button)
  useEffect(() => {
    if (forceOpen) {
      setIsOpen(true);
      onForceOpenConsumed?.();
    }
  }, [forceOpen, onForceOpenConsumed]);

  // Cmd/Ctrl+K to open; ? to open shortcuts (when no input focused)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Cmd/Ctrl+K
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setIsOpen(true);
        return;
      }
      // ? shortcut — only when no text input is active
      if (
        e.key === "?" &&
        !(e.target instanceof HTMLInputElement) &&
        !(e.target instanceof HTMLTextAreaElement)
      ) {
        e.preventDefault();
        onOpenShortcuts();
        return;
      }
      // Escape closes
      if (e.key === "Escape" && isOpen) {
        setIsOpen(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, onOpenShortcuts]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setSelectedIndex(0);
      // Small delay to allow animation to start
      const t = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [isOpen]);

  const close = useCallback(() => {
    setIsOpen(false);
    setQuery("");
    setSelectedIndex(0);
  }, []);

  const openAlbum = useCallback((album: Album) => {
    const albumId = (album as any)._id || String(album.id);
    sessionStorage.setItem("pendingAlbumOpen", albumId);
    close();
    if (pathname !== "/library") {
      router.push("/library");
    } else {
      // Already on library — dispatch a custom event so the page picks it up
      window.dispatchEvent(new CustomEvent("openAlbum", { detail: { albumId } }));
    }
  }, [close, pathname, router]);

  const results = query.trim().length === 0
    ? []
    : albums
        .filter((a) => {
          const q = query.toLowerCase();
          return (
            a.title?.toLowerCase().includes(q) ||
            a.artist?.toLowerCase().includes(q)
          );
        })
        .slice(0, 8);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      if (results[selectedIndex]) {
        openAlbum(results[selectedIndex]);
      }
    } else if (e.key === "Escape") {
      close();
    }
  };

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              key="search-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[70]"
              onClick={close}
              aria-hidden="true"
            />

            {/* Search Container */}
            <motion.div
              key="search-container"
              initial={{ opacity: 0, y: -12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -12, scale: 0.98 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              className="fixed top-[20%] left-1/2 -translate-x-1/2 w-full max-w-xl px-4 z-[71]"
              role="dialog"
              aria-modal="true"
              aria-label="Search library"
            >
              {/* Input */}
              <div className="relative">
                <Search
                  size={18}
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none"
                />
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setSelectedIndex(0);
                  }}
                  onKeyDown={handleKeyDown}
                  placeholder="Search albums and artists..."
                  className="w-full bg-[#0d1b2a] border border-white/15 rounded-2xl pl-12 pr-12 py-4 text-white placeholder-zinc-500 text-base focus:outline-none focus:border-[#f4d35e]/50 transition-all shadow-2xl"
                  aria-label="Search your library"
                  aria-autocomplete="list"
                  aria-controls="search-results"
                  aria-activedescendant={
                    results.length > 0
                      ? `search-result-${selectedIndex}`
                      : undefined
                  }
                />
                {query && (
                  <button
                    onClick={() => { setQuery(""); setSelectedIndex(0); inputRef.current?.focus(); }}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white transition-colors p-1 min-w-[28px] min-h-[28px] flex items-center justify-center"
                    aria-label="Clear search"
                  >
                    <X size={15} />
                  </button>
                )}
              </div>

              {/* Results Card */}
              <AnimatePresence>
                {results.length > 0 && (
                  <motion.div
                    key="results"
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 4 }}
                    transition={{ duration: 0.12 }}
                    id="search-results"
                    role="listbox"
                    aria-label="Search results"
                    className="mt-2 bg-[#0d1b2a] border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
                  >
                    {results.map((album, idx) => {
                      const albumId = (album as any)._id || album.id;
                      const coverArt = (album as any).coverArt || album.cover_art;
                      const isSelected = idx === selectedIndex;

                      return (
                        <button
                          key={String(albumId)}
                          id={`search-result-${idx}`}
                          role="option"
                          aria-selected={isSelected}
                          onClick={() => openAlbum(album)}
                          onMouseEnter={() => setSelectedIndex(idx)}
                          className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                            isSelected ? "bg-[#f4d35e]/8" : "hover:bg-white/5"
                          }`}
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
                          <div className="min-w-0 flex-1">
                            <p className={`text-sm font-semibold truncate ${isSelected ? "text-[#f4d35e]" : "text-white"}`}>
                              {album.title}
                            </p>
                            <p className="text-xs text-zinc-400 truncate">
                              {album.artist}
                            </p>
                          </div>

                          {/* Track count */}
                          <span className="text-xs text-zinc-600 flex-shrink-0">
                            {album.tracks?.length ?? 0} tracks
                          </span>
                        </button>
                      );
                    })}
                  </motion.div>
                )}

                {query.trim().length > 0 && results.length === 0 && (
                  <motion.div
                    key="no-results"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="mt-2 bg-[#0d1b2a] border border-white/10 rounded-2xl px-4 py-6 text-center"
                  >
                    <p className="text-zinc-400 text-sm">
                      No results for &ldquo;{query}&rdquo;
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Hint footer — desktop only, not useful on mobile */}
              <div className="hidden sm:flex items-center justify-end gap-3 mt-2 px-1">
                <span className="text-xs text-zinc-600">
                  <kbd className="inline-flex items-center px-1.5 py-0.5 bg-white/6 border border-white/8 rounded text-[10px] font-mono text-zinc-500">↑↓</kbd>{" "}
                  navigate
                </span>
                <span className="text-xs text-zinc-600">
                  <kbd className="inline-flex items-center px-1.5 py-0.5 bg-white/6 border border-white/8 rounded text-[10px] font-mono text-zinc-500">Enter</kbd>{" "}
                  select
                </span>
                <span className="text-xs text-zinc-600">
                  <kbd className="inline-flex items-center px-1.5 py-0.5 bg-white/6 border border-white/8 rounded text-[10px] font-mono text-zinc-500">Esc</kbd>{" "}
                  close
                </span>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
