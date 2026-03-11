"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { usePlaylist } from "@/context/PlaylistContext";
import DashboardLayout from "@/components/DashboardLayout";
import PlaylistCoverArt from "@/components/PlaylistCoverArt";
import { Plus, ListMusic, Zap } from "lucide-react";

export default function PlaylistsPage() {
  const { playlists } = usePlaylist();
  const [filter, setFilter] = useState<"all" | "manual" | "smart">("all");

  const filtered = playlists.filter((p) => {
    if (filter === "manual") return !p.is_smart;
    if (filter === "smart") return p.is_smart;
    return true;
  });

  return (
    <DashboardLayout>
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-white">Playlists</h1>
            <p className="text-zinc-500 text-sm mt-0.5">
              {playlists.length} playlist{playlists.length !== 1 ? "s" : ""}
            </p>
          </div>
          <Link
            href="/playlists/new"
            className="flex items-center gap-2 px-4 py-2.5 bg-[#f4d35e]/10 border border-[#f4d35e]/20 text-[#f4d35e] font-semibold rounded-xl hover:bg-[#f4d35e]/20 transition-colors text-sm min-h-[44px]"
          >
            <Plus size={17} />
            <span className="hidden sm:inline">New Playlist</span>
          </Link>
        </div>

        {/* Filter pills */}
        {playlists.length > 0 && (
          <div className="flex gap-2 mb-6">
            {(["all", "manual", "smart"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`flex-shrink-0 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all capitalize ${
                  filter === f
                    ? "bg-[#f4d35e]/15 text-[#f4d35e] border border-[#f4d35e]/30"
                    : "bg-white/5 text-zinc-400 border border-white/8 hover:text-zinc-200 hover:bg-white/8"
                }`}
                aria-pressed={filter === f}
              >
                {f}
              </button>
            ))}
          </div>
        )}

        {/* Playlist grid */}
        {playlists.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center justify-center py-24 text-center px-6"
          >
            <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center mb-6 border border-white/8">
              <ListMusic size={36} className="text-zinc-600" />
            </div>
            <h3 className="text-xl font-bold text-white mb-2">No playlists yet</h3>
            <p className="text-zinc-400 text-sm max-w-xs mb-7 leading-relaxed">
              Create your first playlist to organize your music the way you like.
            </p>
            <Link
              href="/playlists/new"
              className="px-7 py-3.5 bg-[#f4d35e] text-[#0d3b66] font-bold rounded-xl hover:bg-[#ffd700] transition-all hover:scale-105 shadow-lg shadow-[#f4d35e]/20 text-sm inline-flex items-center gap-2"
            >
              <Plus size={18} />
              Create Playlist
            </Link>
          </motion.div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <p className="text-zinc-500 text-sm">No {filter} playlists.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {filtered.map((pl, i) => (
              <motion.div
                key={pl.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.04, 0.3) }}
              >
                <Link
                  href={`/playlists/${pl.id}`}
                  className="group block bg-white/4 border border-white/5 rounded-2xl p-3 hover:bg-white/8 hover:border-white/10 transition-all duration-200"
                >
                  {/* Cover art */}
                  <div className="relative aspect-square w-full rounded-xl overflow-hidden mb-3 bg-black/40 shadow-md flex items-center justify-center">
                    <PlaylistCoverArt
                      coverArts={pl.cover_arts || []}
                      size={120}
                    />
                  </div>

                  {/* Info */}
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-1.5">
                      {pl.is_smart && (
                        <Zap size={11} className="text-[#f4d35e] flex-shrink-0" fill="currentColor" />
                      )}
                      <h3 className="font-semibold text-white truncate text-sm leading-tight">
                        {pl.name}
                      </h3>
                    </div>
                    <p className="text-xs text-zinc-400 truncate">
                      {pl.item_count} {pl.item_count === 1 ? "track" : "tracks"}
                    </p>
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>
        )}
      </motion.div>
    </DashboardLayout>
  );
}
