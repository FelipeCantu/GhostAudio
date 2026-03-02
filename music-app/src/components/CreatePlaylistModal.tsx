"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { usePlaylist } from "@/context/PlaylistContext";
import { SmartRule } from "@/services/api";

interface CreatePlaylistModalProps {
    isOpen: boolean;
    onClose: () => void;
    onCreated?: () => void;
}

export default function CreatePlaylistModal({ isOpen, onClose, onCreated }: CreatePlaylistModalProps) {
    const { createPlaylist } = usePlaylist();
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [isSmart, setIsSmart] = useState(false);
    const [ruleType, setRuleType] = useState<SmartRule['type']>("recently_added");
    const [artistValue, setArtistValue] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleClose = () => {
        setName("");
        setDescription("");
        setIsSmart(false);
        setRuleType("recently_added");
        setArtistValue("");
        setError(null);
        onClose();
    };

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
            await createPlaylist(name.trim(), description.trim(), isSmart, smartRule);
            onCreated?.();
            handleClose();
        } catch (e: any) {
            setError(e.message || "Failed to create playlist.");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={handleClose}
                        className="fixed inset-0 bg-black/70 z-50 backdrop-blur-sm"
                    />
                    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0, y: 40 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 40 }}
                            transition={{ type: "spring", damping: 25, stiffness: 300 }}
                            className="relative w-full max-w-md bg-zinc-900 border border-white/10 rounded-2xl p-6 shadow-2xl"
                        >
                            <button
                                onClick={handleClose}
                                className="absolute top-4 right-4 p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
                            >
                                <X size={18} />
                            </button>

                            <h2 className="text-xl font-bold text-white mb-1">New Playlist</h2>
                            <p className="text-sm text-zinc-400 mb-6">Create a manual or smart playlist.</p>

                            <form onSubmit={handleSubmit} className="space-y-4">
                                <div>
                                    <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Name *</label>
                                    <input
                                        type="text"
                                        value={name}
                                        onChange={e => setName(e.target.value)}
                                        placeholder="My Playlist"
                                        className="w-full bg-zinc-800 border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder-zinc-500 focus:outline-none focus:border-[#f4d35e]/50 transition-colors"
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
                                        className="w-full bg-zinc-800 border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder-zinc-500 focus:outline-none focus:border-[#f4d35e]/50 transition-colors"
                                    />
                                </div>

                                {/* Manual / Smart toggle */}
                                <div className="flex gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setIsSmart(false)}
                                        className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-colors ${!isSmart ? 'bg-[#f4d35e]/15 text-[#f4d35e] border border-[#f4d35e]/30' : 'bg-zinc-800 text-zinc-400 border border-white/5 hover:bg-zinc-700'}`}
                                    >
                                        Manual
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setIsSmart(true)}
                                        className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-colors ${isSmart ? 'bg-[#f4d35e]/15 text-[#f4d35e] border border-[#f4d35e]/30' : 'bg-zinc-800 text-zinc-400 border border-white/5 hover:bg-zinc-700'}`}
                                    >
                                        Smart
                                    </button>
                                </div>

                                {isSmart && (
                                    <motion.div
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: 'auto' }}
                                        exit={{ opacity: 0, height: 0 }}
                                        className="space-y-3 overflow-hidden"
                                    >
                                        <div>
                                            <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Rule</label>
                                            <select
                                                value={ruleType}
                                                onChange={e => setRuleType(e.target.value as SmartRule['type'])}
                                                className="w-full bg-zinc-800 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-[#f4d35e]/50 transition-colors"
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
                                                    className="w-full bg-zinc-800 border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder-zinc-500 focus:outline-none focus:border-[#f4d35e]/50 transition-colors"
                                                />
                                            </div>
                                        )}
                                    </motion.div>
                                )}

                                {error && <p className="text-sm text-red-400">{error}</p>}

                                <div className="flex gap-3 pt-2">
                                    <button
                                        type="button"
                                        onClick={handleClose}
                                        className="flex-1 py-2.5 rounded-xl bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-colors font-medium"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={isSubmitting}
                                        className="flex-1 py-2.5 rounded-xl bg-[#f4d35e] text-zinc-900 font-bold hover:bg-[#f4d35e]/90 transition-colors disabled:opacity-50"
                                    >
                                        {isSubmitting ? "Creating…" : "Create"}
                                    </button>
                                </div>
                            </form>
                        </motion.div>
                    </div>
                </>
            )}
        </AnimatePresence>
    );
}
