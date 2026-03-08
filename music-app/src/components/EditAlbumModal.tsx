"use client";

import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/services/api";

interface Props {
    album: any;
    onClose: () => void;
    onSaved: (updated: { title: string; artist: string; coverArt: string }) => void;
}

export default function EditAlbumModal({ album, onClose, onSaved }: Props) {
    const { user } = useAuth();
    const albumId = album._id || album.id;
    const [title, setTitle] = useState<string>(album.title || '');
    const [artist, setArtist] = useState<string>(album.artist || '');
    const [coverFile, setCoverFile] = useState<File | null>(null);
    const [coverPreview, setCoverPreview] = useState<string | null>(album.coverArt || album.cover_art || null);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const coverInputRef = useRef<HTMLInputElement>(null);

    const onCoverPick = (f: File | null) => {
        setCoverFile(f);
        if (f) setCoverPreview(URL.createObjectURL(f));
    };

    const handleSave = async () => {
        if (!user?.id) return;
        setSaving(true);
        setError('');
        try {
            const fields: { title?: string; artist?: string; cover_art?: string } = {};
            if (title !== album.title) fields.title = title;
            if (artist !== album.artist) fields.artist = artist;

            if (coverFile) {
                const url = await api.library.uploadCoverArt(coverFile, title, artist, user.id);
                fields.cover_art = url;
            }

            await api.library.updateAlbum(albumId, user.id, fields);
            onSaved({
                title,
                artist,
                coverArt: fields.cover_art ?? (album.coverArt || album.cover_art || ''),
            });
            onClose();
        } catch (err: any) {
            setError(err.message || 'Save failed');
        } finally {
            setSaving(false);
        }
    };

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
                onClick={e => { if (e.target === e.currentTarget) onClose(); }}
            >
                <motion.div
                    initial={{ scale: 0.95, opacity: 0, y: 16 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    exit={{ scale: 0.95, opacity: 0, y: 16 }}
                    transition={{ type: 'spring', stiffness: 320, damping: 28 }}
                    className="w-full max-w-md bg-[#0d1117] border border-white/10 rounded-3xl shadow-2xl overflow-hidden"
                >
                    {/* Header */}
                    <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
                        <h2 className="text-base font-semibold text-white">Edit Album</h2>
                        <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>

                    {/* Body */}
                    <div className="px-6 py-5 space-y-5">
                        {/* Cover + fields */}
                        <div className="flex gap-4">
                            {/* Cover picker */}
                            <div className="shrink-0">
                                <label className="text-xs text-zinc-500 mb-1 block">Cover Art</label>
                                <input ref={coverInputRef} type="file" accept="image/*" className="hidden" onChange={e => onCoverPick(e.target.files?.[0] ?? null)} />
                                <button
                                    type="button"
                                    onClick={() => coverInputRef.current?.click()}
                                    className="relative w-20 h-20 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 overflow-hidden flex items-center justify-center transition-colors group"
                                >
                                    {coverPreview ? (
                                        <>
                                            <img src={coverPreview} alt="Cover" className="w-full h-full object-cover" />
                                            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536M9 13l6.586-6.586a2 2 0 112.828 2.828L11.828 15.828a4 4 0 01-2.828 1.172H7v-2a4 4 0 011.172-2.828z" />
                                                </svg>
                                            </div>
                                        </>
                                    ) : (
                                        <svg className="w-6 h-6 text-zinc-600 group-hover:text-zinc-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                        </svg>
                                    )}
                                </button>
                            </div>

                            {/* Title + artist */}
                            <div className="flex-1 grid grid-rows-2 gap-3">
                                <div>
                                    <label className="text-xs text-zinc-500 mb-1 block">Album Name</label>
                                    <input
                                        type="text"
                                        value={title}
                                        onChange={e => setTitle(e.target.value)}
                                        className="w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-white/25"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs text-zinc-500 mb-1 block">Artist</label>
                                    <input
                                        type="text"
                                        value={artist}
                                        onChange={e => setArtist(e.target.value)}
                                        className="w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-white/25"
                                    />
                                </div>
                            </div>
                        </div>

                        {error && (
                            <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">{error}</p>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="flex gap-3 px-6 pb-5">
                        <button
                            onClick={onClose}
                            className="flex-1 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-400 text-sm font-medium transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={saving}
                            className="flex-1 py-2.5 rounded-xl bg-white text-black text-sm font-semibold hover:bg-zinc-200 transition-colors disabled:opacity-50"
                        >
                            {saving ? 'Saving...' : 'Save Changes'}
                        </button>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}
