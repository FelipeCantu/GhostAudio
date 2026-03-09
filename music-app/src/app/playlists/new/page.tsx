"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { usePlaylist } from "@/context/PlaylistContext";
import { SmartRule } from "@/services/api";
import DashboardLayout from "@/components/DashboardLayout";
import { motion } from "framer-motion";
import { ListMusic, Zap, ArrowLeft, Loader2 } from "lucide-react";

export default function NewPlaylistPage() {
  const { createPlaylist } = usePlaylist();
  const router = useRouter();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isSmart, setIsSmart] = useState(false);
  const [ruleType, setRuleType] = useState<SmartRule["type"]>("recently_added");
  const [artistValue, setArtistValue] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Playlist name is required.");
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      const smartRule: SmartRule | null = isSmart
        ? { type: ruleType, value: ruleType === "by_artist" ? artistValue : undefined }
        : null;
      const playlist = await createPlaylist(
        name.trim(),
        description.trim(),
        isSmart,
        smartRule
      );
      router.push(`/playlists/${playlist.id}`);
    } catch (e: any) {
      setError(e.message || "Failed to create playlist.");
      setIsSubmitting(false);
    }
  };

  return (
    <DashboardLayout>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="max-w-lg mx-auto"
      >
        {/* Back button */}
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-zinc-500 hover:text-white transition-colors text-sm mb-6 group min-h-[44px]"
        >
          <ArrowLeft
            size={16}
            className="group-hover:-translate-x-1 transition-transform"
          />
          Back
        </button>

        <div className="mb-8">
          <h1 className="text-2xl md:text-3xl font-bold text-white mb-1">New Playlist</h1>
          <p className="text-zinc-500 text-sm">
            Create a manual playlist or let smart rules keep it fresh.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Playlist type toggle — first so it's clear */}
          <div>
            <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-3">
              Playlist Type
            </label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { value: false, label: "Manual", icon: ListMusic, desc: "Add tracks yourself" },
                { value: true, label: "Smart", icon: Zap, desc: "Auto-populated by rules" },
              ].map(({ value, label, icon: Icon, desc }) => (
                <button
                  key={String(value)}
                  type="button"
                  onClick={() => setIsSmart(value)}
                  className={[
                    "flex flex-col items-start gap-2 p-4 rounded-2xl text-left transition-all border min-h-[80px]",
                    isSmart === value
                      ? "bg-[#f4d35e]/10 border-[#f4d35e]/30 text-[#f4d35e]"
                      : "bg-white/4 border-white/6 text-zinc-400 hover:border-white/12 hover:text-zinc-200",
                  ].join(" ")}
                >
                  <Icon size={18} />
                  <div>
                    <p className="font-bold text-sm">{label}</p>
                    <p className="text-[10px] opacity-70">{desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Name */}
          <div>
            <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">
              Name <span className="text-[#f4d35e]">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Playlist"
              className="w-full bg-black/30 border border-white/8 rounded-xl px-4 py-3 text-white placeholder-zinc-600 focus:outline-none focus:border-[#f4d35e]/50 focus:ring-1 focus:ring-[#f4d35e]/25 transition-all text-sm min-h-[48px]"
              autoFocus
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">
              Description
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description"
              className="w-full bg-black/30 border border-white/8 rounded-xl px-4 py-3 text-white placeholder-zinc-600 focus:outline-none focus:border-[#f4d35e]/50 focus:ring-1 focus:ring-[#f4d35e]/25 transition-all text-sm min-h-[48px]"
            />
          </div>

          {/* Smart rules */}
          {isSmart && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="space-y-4 p-5 rounded-2xl bg-[#f4d35e]/5 border border-[#f4d35e]/15"
            >
              <div>
                <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">
                  Rule
                </label>
                <select
                  value={ruleType}
                  onChange={(e) => setRuleType(e.target.value as SmartRule["type"])}
                  className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-[#f4d35e]/50 transition-all cursor-pointer min-h-[48px]"
                >
                  <option value="recently_added">Recently Added (last 10 albums)</option>
                  <option value="by_artist">By Artist</option>
                  <option value="random">Random (50 tracks)</option>
                </select>
              </div>

              {ruleType === "by_artist" && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                >
                  <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">
                    Artist Name
                  </label>
                  <input
                    type="text"
                    value={artistValue}
                    onChange={(e) => setArtistValue(e.target.value)}
                    placeholder="e.g. The Beatles"
                    className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-zinc-600 text-sm focus:outline-none focus:border-[#f4d35e]/50 transition-all min-h-[48px]"
                  />
                </motion.div>
              )}
            </motion.div>
          )}

          {error && (
            <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-sm">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={() => router.back()}
              className="flex-1 py-3.5 rounded-xl bg-white/6 border border-white/8 text-zinc-300 hover:bg-white/10 hover:text-white transition-colors font-semibold text-sm min-h-[52px]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 py-3.5 rounded-xl bg-[#f4d35e] text-[#0d3b66] font-bold hover:bg-[#ffd700] transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed text-sm min-h-[52px] flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Creating...
                </>
              ) : (
                "Create Playlist"
              )}
            </button>
          </div>
        </form>
      </motion.div>
    </DashboardLayout>
  );
}
