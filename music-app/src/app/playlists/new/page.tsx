"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { usePlaylist } from "@/context/PlaylistContext";
import { SmartRule } from "@/services/api";
import DashboardLayout from "@/components/DashboardLayout";

export default function NewPlaylistPage() {
    const { createPlaylist } = usePlaylist();
    const router = useRouter();

    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [isSmart, setIsSmart] = useState(false);
    const [ruleType, setRuleType] = useState<SmartRule['type']>("recently_added");
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
                ? { type: ruleType, value: ruleType === 'by_artist' ? artistValue : undefined }
                : null;
            const playlist = await createPlaylist(name.trim(), description.trim(), isSmart, smartRule);
            router.push(`/playlists/${playlist.id}`);
        } catch (e: any) {
            setError(e.message || "Failed to create playlist.");
            setIsSubmitting(false);
        }
    };

    return (
        <DashboardLayout>
            <div className="max-w-lg mx-auto py-8">
                <h1 className="text-3xl font-black text-white mb-1">New Playlist</h1>
                <p className="text-zinc-400 text-sm mb-8">Create a manual or smart playlist.</p>

                <form onSubmit={handleSubmit} className="space-y-5">
                    <div>
                        <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Name *</label>
                        <input
                            type="text"
                            value={name}
                            onChange={e => setName(e.target.value)}
                            placeholder="My Playlist"
                            className="w-full bg-zinc-900 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:border-[#f4d35e]/50 transition-colors"
                            autoFocus
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Description</label>
                        <input
                            type="text"
                            value={description}
                            onChange={e => setDescription(e.target.value)}
                            placeholder="Optional description"
                            className="w-full bg-zinc-900 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:border-[#f4d35e]/50 transition-colors"
                        />
                    </div>

                    {/* Manual / Smart toggle */}
                    <div>
                        <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Type</label>
                        <div className="flex gap-2">
                            <button
                                type="button"
                                onClick={() => setIsSmart(false)}
                                className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors ${!isSmart ? 'bg-[#f4d35e]/15 text-[#f4d35e] border border-[#f4d35e]/30' : 'bg-zinc-800 text-zinc-400 border border-white/5 hover:bg-zinc-700'}`}
                            >
                                Manual
                            </button>
                            <button
                                type="button"
                                onClick={() => setIsSmart(true)}
                                className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors ${isSmart ? 'bg-[#f4d35e]/15 text-[#f4d35e] border border-[#f4d35e]/30' : 'bg-zinc-800 text-zinc-400 border border-white/5 hover:bg-zinc-700'}`}
                            >
                                Smart
                            </button>
                        </div>
                    </div>

                    {isSmart && (
                        <div className="space-y-4 p-4 rounded-xl bg-zinc-900 border border-white/5">
                            <div>
                                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Rule</label>
                                <select
                                    value={ruleType}
                                    onChange={e => setRuleType(e.target.value as SmartRule['type'])}
                                    className="w-full bg-zinc-800 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#f4d35e]/50 transition-colors"
                                >
                                    <option value="recently_added">Recently Added (last 10 albums)</option>
                                    <option value="by_artist">By Artist</option>
                                    <option value="random">Random (50 tracks)</option>
                                </select>
                            </div>

                            {ruleType === 'by_artist' && (
                                <div>
                                    <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Artist Name</label>
                                    <input
                                        type="text"
                                        value={artistValue}
                                        onChange={e => setArtistValue(e.target.value)}
                                        placeholder="e.g. The Beatles"
                                        className="w-full bg-zinc-800 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:border-[#f4d35e]/50 transition-colors"
                                    />
                                </div>
                            )}
                        </div>
                    )}

                    {error && <p className="text-sm text-red-400">{error}</p>}

                    <div className="flex gap-3 pt-2">
                        <button
                            type="button"
                            onClick={() => router.back()}
                            className="flex-1 py-3 rounded-xl bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-colors font-medium"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="flex-1 py-3 rounded-xl bg-[#f4d35e] text-zinc-900 font-bold hover:bg-[#f4d35e]/90 transition-colors disabled:opacity-50"
                        >
                            {isSubmitting ? "Creating…" : "Create Playlist"}
                        </button>
                    </div>
                </form>
            </div>
        </DashboardLayout>
    );
}
