"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { usePlayer } from "@/context/PlayerContext";
import DashboardLayout from "@/components/DashboardLayout";
import Link from "next/link";
import { Disc, PlayCircle, Plus, Music2, Clock, TrendingUp, Import, History } from "lucide-react";
import { api } from "@/services/api";

interface DashboardStats {
  total_albums: number;
  total_tracks: number;
  recent_albums: Array<{
    id: string;
    _id?: string;
    title: string;
    artist: string;
    cover_art?: string;
    coverArt?: string;
  }>;
}

export default function Home() {
  const { user, isAuthenticated, isLoading, token } = useAuth();
  const { recentlyPlayed, playTrack } = usePlayer();
  const router = useRouter();
  const [stats, setStats] = useState<DashboardStats>({
    total_albums: 0,
    total_tracks: 0,
    recent_albums: [],
  });

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push("/login");
    }
  }, [isLoading, isAuthenticated, router]);

  useEffect(() => {
    const fetchStats = async () => {
      if (isAuthenticated && token) {
        try {
          const data = await api.library.getDashboardStats(token, user?.id);
          setStats(data);
        } catch (err) {
          console.error("Failed to load stats", err);
        }
      }
    };
    fetchStats();
  }, [isAuthenticated, token, user?.id]);

  if (isLoading) {
    return (
      <div className="min-h-screen w-full flex flex-col items-center justify-center bg-[#0d3b66] text-[#faf0ca] gap-4">
        <div className="w-14 h-14 border-4 border-[#f4d35e] border-t-transparent rounded-full animate-spin" />
        <p className="text-base font-medium animate-pulse text-[#faf0ca]/70">Loading DiZC...</p>
      </div>
    );
  }

  if (!isAuthenticated) return null;

  const greetingHour = new Date().getHours();
  const greeting =
    greetingHour < 12 ? "Good morning" : greetingHour < 18 ? "Good afternoon" : "Good evening";

  // Show last 5 recently played entries
  const recentFive = recentlyPlayed.slice(0, 5);

  return (
    <DashboardLayout>
      <div className="space-y-6 md:space-y-8">

        {/* Welcome Banner */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#f4d35e] via-[#f0c830] to-[#ee964b] p-6 md:p-10 text-[#0d3b66]"
        >
          <div className="relative z-10 max-w-xl">
            <p className="text-[#0d3b66]/60 text-sm font-semibold mb-1">{greeting}</p>
            <h1 className="text-3xl md:text-4xl font-bold mb-3 leading-tight">
              {user?.username ?? "Audiophile"}
            </h1>
            <p className="text-base md:text-lg font-medium opacity-80 mb-7 leading-relaxed">
              Your high-fidelity collection is ready to spin.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/library"
                className="px-5 py-3 bg-[#0d3b66] text-white font-bold rounded-xl hover:bg-[#0a2d50] transition-all hover:scale-105 flex items-center gap-2 text-sm min-h-[48px]"
              >
                <PlayCircle size={18} />
                Open Library
              </Link>
              <Link
                href="/import"
                className="px-5 py-3 bg-white/20 text-[#0d3b66] border border-[#0d3b66]/15 font-bold rounded-xl hover:bg-white/30 transition-all hover:scale-105 flex items-center gap-2 text-sm min-h-[48px]"
              >
                <Plus size={18} />
                Import Music
              </Link>
            </div>
          </div>

          {/* Decorative spinning vinyl */}
          <div className="absolute top-[-60px] right-[-60px] md:top-[-80px] md:right-[-80px] opacity-[0.12] animate-[spin_25s_linear_infinite] pointer-events-none">
            <Disc size={320} />
          </div>
          <div className="absolute bottom-[-40px] right-[120px] opacity-[0.07] animate-[spin_18s_linear_infinite_reverse] pointer-events-none">
            <Disc size={200} />
          </div>
        </motion.div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-4">
          {[
            {
              label: "Albums",
              value: stats.total_albums,
              icon: Disc,
              color: "text-[#f4d35e]",
              bg: "bg-[#f4d35e]/8",
              border: "border-[#f4d35e]/15",
            },
            {
              label: "Tracks",
              value: stats.total_tracks,
              icon: Music2,
              color: "text-[#ee964b]",
              bg: "bg-[#ee964b]/8",
              border: "border-[#ee964b]/15",
            },
          ].map((stat, i) => {
            const Icon = stat.icon;
            return (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 + i * 0.1 }}
                className={`p-5 md:p-6 rounded-2xl ${stat.bg} border ${stat.border}`}
              >
                <div className={`w-10 h-10 rounded-xl ${stat.bg} border ${stat.border} flex items-center justify-center mb-4`}>
                  <Icon size={20} className={stat.color} />
                </div>
                <p className="text-2xl md:text-3xl font-bold text-white mb-0.5">
                  {stat.value.toLocaleString()}
                </p>
                <p className="text-xs text-zinc-500 font-medium uppercase tracking-wider">
                  {stat.label}
                </p>
              </motion.div>
            );
          })}
        </div>

        {/* Recently Played — only shown when there's history */}
        {recentFive.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
          >
            <div className="flex items-center gap-2 mb-4">
              <History size={16} className="text-zinc-500" />
              <h3 className="text-base font-bold text-white">Recently Played</h3>
            </div>

            {/* Horizontal scroll row */}
            <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide -mx-1 px-1">
              {recentFive.map((entry, i) => {
                const cover = entry.albumInfo?.coverArt;
                return (
                  <motion.button
                    key={`recent-${entry.track.id}-${entry.playedAt}`}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.28 + i * 0.05 }}
                    onClick={() =>
                      playTrack(
                        entry.track,
                        undefined,
                        entry.albumInfo ?? undefined
                      )
                    }
                    className="flex flex-col items-center gap-2 flex-shrink-0 min-w-[80px] group"
                    aria-label={`Play ${entry.track.title}`}
                  >
                    {/* Cover art thumbnail */}
                    <div className="w-[60px] h-[60px] rounded-xl overflow-hidden bg-black/40 border border-white/8 flex-shrink-0 group-hover:border-[#f4d35e]/40 group-hover:shadow-lg group-hover:shadow-[#f4d35e]/10 transition-all">
                      {cover ? (
                        <img
                          src={cover}
                          alt={entry.albumInfo?.title ?? entry.track.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-zinc-800 to-zinc-900">
                          <Disc size={24} className="text-zinc-600 group-hover:text-zinc-400 transition-colors" />
                        </div>
                      )}
                    </div>
                    {/* Track title */}
                    <p className="text-xs text-zinc-400 group-hover:text-[#f4d35e] transition-colors text-center leading-tight w-full truncate px-0.5">
                      {entry.track.title}
                    </p>
                  </motion.button>
                );
              })}
            </div>
          </motion.div>
        )}

        {/* Recently Added */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="rounded-2xl bg-white/4 border border-white/6 p-5 md:p-6"
        >
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <Clock size={16} className="text-zinc-500" />
              <h3 className="text-base font-bold text-white">Recently Added</h3>
            </div>
            <Link
              href="/library"
              className="text-xs text-[#f4d35e] hover:text-[#ee964b] font-semibold transition-colors"
            >
              View All
            </Link>
          </div>

          {stats.recent_albums.length > 0 ? (
            <div className="space-y-2">
              {stats.recent_albums.map((album, i) => {
                const cover = album.coverArt || album.cover_art;
                return (
                  <motion.div
                    key={album._id || album.id}
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.35 + i * 0.05 }}
                    className="flex items-center gap-3 p-3 hover:bg-white/6 rounded-xl transition-colors group cursor-pointer min-h-[56px]"
                  >
                    <div className="w-11 h-11 bg-black/40 rounded-lg overflow-hidden relative flex-shrink-0 border border-white/5">
                      {cover ? (
                        <img
                          src={cover}
                          alt={album.title}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-zinc-700">
                          <Disc size={20} />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-white truncate text-sm group-hover:text-[#f4d35e] transition-colors">
                        {album.title}
                      </p>
                      <p className="text-xs text-zinc-500 truncate">{album.artist}</p>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-10 text-center gap-3">
              <div className="w-14 h-14 rounded-full bg-white/5 flex items-center justify-center">
                <Disc size={26} className="text-zinc-600 animate-[spin_8s_linear_infinite]" />
              </div>
              <div>
                <p className="text-sm font-medium text-zinc-400">Nothing here yet</p>
                <p className="text-xs text-zinc-600 mt-0.5">Import your first album to get started</p>
              </div>
              <Link
                href="/import"
                className="mt-2 px-5 py-2.5 bg-white/6 border border-white/8 text-white rounded-xl text-xs font-semibold hover:bg-white/10 transition-colors flex items-center gap-2"
              >
                <Import size={14} />
                Import Music
              </Link>
            </div>
          )}
        </motion.div>

        {/* Quick Actions */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp size={16} className="text-zinc-500" />
            <h3 className="text-base font-bold text-white">Quick Actions</h3>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[
              { label: "My Library", href: "/library", icon: Music2, desc: "Browse albums" },
              { label: "Import", href: "/import", icon: Disc, desc: "Add music" },
              { label: "New Playlist", href: "/playlists/new", icon: Plus, desc: "Create playlist" },
            ].map((action) => {
              const Icon = action.icon;
              return (
                <Link
                  key={action.href}
                  href={action.href}
                  className="p-4 rounded-2xl bg-white/4 border border-white/6 hover:border-[#f4d35e]/25 hover:bg-white/7 transition-all group flex flex-col gap-3 min-h-[96px]"
                >
                  <div className="w-9 h-9 rounded-xl bg-white/8 flex items-center justify-center group-hover:bg-[#f4d35e]/15 transition-colors">
                    <Icon size={18} className="text-zinc-400 group-hover:text-[#f4d35e] transition-colors" />
                  </div>
                  <div>
                    <p className="font-semibold text-white text-sm group-hover:text-[#f4d35e] transition-colors">
                      {action.label}
                    </p>
                    <p className="text-xs text-zinc-500">{action.desc}</p>
                  </div>
                </Link>
              );
            })}
          </div>
        </motion.div>

      </div>
    </DashboardLayout>
  );
}
