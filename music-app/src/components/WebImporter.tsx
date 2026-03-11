"use client";

import { useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/services/api";

type Status = 'idle' | 'uploading' | 'done' | 'error';

export default function WebImporter() {
    const { user } = useAuth();
    const [files, setFiles] = useState<File[]>([]);
    const [albumTitle, setAlbumTitle] = useState('');
    const [artist, setArtist] = useState('');
    const [coverFile, setCoverFile] = useState<File | null>(null);
    const [coverPreview, setCoverPreview] = useState<string | null>(null);
    const [status, setStatus] = useState<Status>('idle');
    const [uploaded, setUploaded] = useState(0);
    const [error, setError] = useState('');
    const [dragging, setDragging] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const coverInputRef = useRef<HTMLInputElement>(null);

    const AUDIO_EXTS = /\.(mp3|wav|flac|aac|m4a|ogg)$/i;

    const addFiles = (incoming: FileList | null) => {
        if (!incoming) return;
        const valid = Array.from(incoming).filter(f => AUDIO_EXTS.test(f.name));
        if (!valid.length) return;
        setFiles(prev => {
            const merged = [...prev];
            for (const f of valid) {
                if (!merged.find(e => e.name === f.name && e.size === f.size)) merged.push(f);
            }
            // Auto-fill album name from common folder hint (file path not available on web — use first filename stem)
            if (!albumTitle && merged.length) {
                const stem = merged[0].name.replace(/\.[^/.]+$/, '').replace(/^\d+[\s\-_.]*/, '').trim();
                setAlbumTitle(stem || 'Imported Album');
            }
            return merged;
        });
    };

    const onDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setDragging(false);
        addFiles(e.dataTransfer.files);
    }, [albumTitle]);

    const removeFile = (idx: number) => setFiles(prev => prev.filter((_, i) => i !== idx));

    const onCoverPick = (f: File | null) => {
        setCoverFile(f);
        if (f) {
            const url = URL.createObjectURL(f);
            setCoverPreview(url);
        } else {
            setCoverPreview(null);
        }
    };

    const handleImport = async () => {
        if (!files.length || !user?.id) return;
        const title = albumTitle.trim() || 'Imported Album';
        const art = artist.trim() || 'Unknown Artist';

        setStatus('uploading');
        setUploaded(0);
        setError('');

        try {
            let coverArtUrl = '';
            if (coverFile) {
                coverArtUrl = await api.library.uploadCoverArt(coverFile, title, art, user.id);
            }
            await api.library.webImportFiles(files, title, art, user.id, coverArtUrl, (done, total) => {
                setUploaded(done);
            });
            setStatus('done');
        } catch (err: any) {
            setError(err.message || 'Import failed');
            setStatus('error');
        }
    };

    const reset = () => {
        setFiles([]);
        setAlbumTitle('');
        setArtist('');
        setCoverFile(null);
        setCoverPreview(null);
        setStatus('idle');
        setUploaded(0);
        setError('');
    };

    const progressPct = files.length > 0 ? Math.round((uploaded / files.length) * 100) : 0;

    if (status === 'done') {
        return (
            <motion.div
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex flex-col items-center gap-4 py-12 text-center"
            >
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-green-500/10 border border-green-500/20">
                    <svg className="w-8 h-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                </div>
                <div>
                    <p className="text-lg font-semibold text-white">Import complete!</p>
                    <p className="text-sm text-zinc-400 mt-1">{files.length} track{files.length !== 1 ? 's' : ''} added to your library.</p>
                </div>
                <div className="flex gap-3 mt-2">
                    <a href="/library" className="px-5 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white text-sm font-medium transition-colors">
                        Go to Library
                    </a>
                    <button onClick={reset} className="px-5 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-400 text-sm font-medium transition-colors">
                        Import More
                    </button>
                </div>
            </motion.div>
        );
    }

    if (status === 'uploading') {
        return (
            <div className="flex flex-col items-center gap-6 py-10">
                <div className="relative w-20 h-20">
                    <svg className="w-20 h-20 -rotate-90" viewBox="0 0 80 80">
                        <circle cx="40" cy="40" r="34" fill="none" stroke="currentColor" strokeWidth="6" className="text-zinc-800" />
                        <circle
                            cx="40" cy="40" r="34"
                            fill="none" stroke="currentColor" strokeWidth="6"
                            className="text-blue-400 transition-all duration-500"
                            strokeDasharray={`${2 * Math.PI * 34}`}
                            strokeDashoffset={`${2 * Math.PI * 34 * (1 - progressPct / 100)}`}
                            strokeLinecap="round"
                        />
                    </svg>
                    <span className="absolute inset-0 flex items-center justify-center text-lg font-bold text-white">{progressPct}%</span>
                </div>
                <div className="text-center">
                    <p className="text-white font-semibold">Uploading to cloud...</p>
                    <p className="text-zinc-400 text-sm mt-1">{uploaded} / {files.length} tracks</p>
                </div>
                <div className="w-full max-w-xs bg-zinc-800 rounded-full h-1 overflow-hidden">
                    <div
                        className="h-full bg-gradient-to-r from-blue-500 to-blue-400 rounded-full transition-all duration-500"
                        style={{ width: `${progressPct}%` }}
                    />
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Drag and drop zone */}
            <div
                onDragOver={e => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
                onClick={() => inputRef.current?.click()}
                className={`relative flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-10 cursor-pointer transition-colors ${
                    dragging ? 'border-blue-400 bg-blue-500/5' : 'border-white/10 hover:border-white/25 bg-white/2'
                }`}
            >
                <input
                    ref={inputRef}
                    type="file"
                    multiple
                    accept=".mp3,.wav,.flac,.aac,.m4a,.ogg"
                    className="hidden"
                    onChange={e => addFiles(e.target.files)}
                />
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-800/60">
                    <svg className="w-7 h-7 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                    </svg>
                </div>
                <div className="text-center">
                    <p className="text-white font-medium">
                        <span className="hidden sm:inline">Drop audio files here</span>
                        <span className="sm:hidden">Tap to browse files</span>
                    </p>
                    <p className="text-zinc-500 text-sm mt-1">
                        <span className="hidden sm:inline">or click to browse — </span>
                        MP3, FLAC, WAV, M4A, OGG
                    </p>
                </div>
            </div>

            {/* File list */}
            <AnimatePresence>
                {files.length > 0 && (
                    <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 8 }}
                        className="space-y-4"
                    >
                        {/* Album metadata */}
                        <div className="flex gap-4">
                            {/* Cover art picker */}
                            <div className="shrink-0">
                                <label className="text-xs text-zinc-500 mb-1 block">Cover Art</label>
                                <input
                                    ref={coverInputRef}
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={e => onCoverPick(e.target.files?.[0] ?? null)}
                                />
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

                            {/* Album / Artist fields */}
                            <div className="flex-1 grid grid-rows-2 gap-3">
                                <div>
                                    <label className="text-xs text-zinc-500 mb-1 block">Album Name</label>
                                    <input
                                        type="text"
                                        value={albumTitle}
                                        onChange={e => setAlbumTitle(e.target.value)}
                                        placeholder="Album name"
                                        className="w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-white/25"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs text-zinc-500 mb-1 block">Artist</label>
                                    <input
                                        type="text"
                                        value={artist}
                                        onChange={e => setArtist(e.target.value)}
                                        placeholder="Artist name"
                                        className="w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-white/25"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Track list */}
                        <div className="rounded-xl border border-white/10 overflow-hidden">
                            <div className="px-4 py-2 bg-white/3 border-b border-white/5">
                                <span className="text-xs text-zinc-500">{files.length} track{files.length !== 1 ? 's' : ''} selected</span>
                            </div>
                            <div className="divide-y divide-white/5 max-h-48 overflow-y-auto">
                                {files.map((f, i) => (
                                    <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                                        <span className="text-xs text-zinc-600 w-5 shrink-0">{i + 1}</span>
                                        <span className="text-sm text-zinc-300 flex-1 truncate">{f.name}</span>
                                        <span className="text-xs text-zinc-600 shrink-0">{(f.size / 1024 / 1024).toFixed(1)} MB</span>
                                        <button
                                            onClick={() => removeFile(i)}
                                            className="text-zinc-700 hover:text-zinc-400 active:text-zinc-400 transition-colors shrink-0 min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg hover:bg-white/5"
                                            aria-label={`Remove ${f.name}`}
                                        >
                                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                            </svg>
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Error */}
                        {status === 'error' && (
                            <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">{error}</p>
                        )}

                        {/* Actions */}
                        <div className="flex gap-3">
                            <button
                                onClick={handleImport}
                                disabled={!files.length}
                                className="flex-1 py-3 rounded-xl bg-white text-black text-sm font-semibold hover:bg-zinc-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed min-h-[48px]"
                            >
                                Import {files.length} Track{files.length !== 1 ? 's' : ''}
                            </button>
                            <button
                                onClick={reset}
                                className="px-4 py-3 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-400 text-sm font-medium transition-colors min-h-[48px]"
                            >
                                Clear
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
