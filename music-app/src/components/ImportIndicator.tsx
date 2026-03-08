"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useImport } from "@/context/ImportContext";

export default function ImportIndicator() {
    const {
        importStatus,
        message,
        overallPercent,
        currentTrack,
        totalTracks,
        importMetadata,
        cancelImport,
        resetImport,
    } = useImport();

    const [visible, setVisible] = useState(false);
    const [expanded, setExpanded] = useState(false);

    useEffect(() => {
        if (importStatus === 'ripping' || importStatus === 'uploading') {
            setVisible(true);
            setExpanded(false);
        } else if (importStatus === 'completed') {
            setVisible(true);
            const t = setTimeout(() => {
                setVisible(false);
                resetImport();
            }, 6000);
            return () => clearTimeout(t);
        } else if (importStatus === 'error') {
            setVisible(true);
            setExpanded(true); // Auto-expand so the full message is visible
        } else {
            setVisible(false);
        }
    }, [importStatus, resetImport]);

    // Progress percentage shown in the pill
    const progressPct =
        overallPercent < 100
            ? overallPercent
            : totalTracks > 0
            ? Math.round((currentTrack / totalTracks) * 100)
            : 100;

    const albumName = importMetadata?.album || 'CD';

    return (
        <AnimatePresence>
            {visible && (
                <motion.div
                    key="import-indicator"
                    initial={{ opacity: 0, y: -16, scale: 0.92 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -16, scale: 0.92 }}
                    transition={{ type: 'spring', stiffness: 320, damping: 28 }}
                    className="fixed top-4 right-4 z-[60] w-64"
                >
                    <div
                        className={`rounded-2xl border backdrop-blur-xl shadow-2xl overflow-hidden transition-colors ${
                            importStatus === 'ripping'
                                ? 'bg-[#0d1b2a]/90 border-[#f4d35e]/25'
                                : importStatus === 'uploading'
                                ? 'bg-[#0d1b2a]/90 border-blue-500/25'
                                : importStatus === 'completed'
                                ? 'bg-[#0d1b2a]/90 border-green-500/25'
                                : 'bg-[#0d1b2a]/90 border-red-500/25'
                        }`}
                    >
                        {/* Header row — always visible */}
                        <button
                            onClick={() => setExpanded(e => !e)}
                            className="flex items-center gap-2.5 px-3.5 py-2.5 w-full text-left"
                        >
                            {/* Status icon */}
                            {importStatus === 'ripping' ? (
                                <span className="relative flex h-2.5 w-2.5 shrink-0">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#f4d35e] opacity-75" />
                                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#f4d35e]" />
                                </span>
                            ) : importStatus === 'uploading' ? (
                                <span className="relative flex h-2.5 w-2.5 shrink-0">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-blue-400" />
                                </span>
                            ) : importStatus === 'completed' ? (
                                <svg className="w-4 h-4 text-green-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                </svg>
                            ) : (
                                <svg className="w-4 h-4 text-red-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                            )}

                            {/* Text */}
                            <div className="flex-1 min-w-0">
                                <p className={`text-xs font-semibold truncate leading-none ${
                                    importStatus === 'ripping'
                                        ? 'text-white'
                                        : importStatus === 'uploading'
                                        ? 'text-blue-300'
                                        : importStatus === 'completed'
                                        ? 'text-green-300'
                                        : 'text-red-300'
                                }`}>
                                    {importStatus === 'ripping'
                                        ? `Importing ${albumName}`
                                        : importStatus === 'uploading'
                                        ? `Uploading ${albumName}`
                                        : importStatus === 'completed'
                                        ? 'Import complete'
                                        : 'Import failed'}
                                </p>
                                {(importStatus === 'ripping' || importStatus === 'uploading') && (
                                    <p className="text-[10px] text-zinc-500 mt-0.5 leading-none">
                                        {progressPct}%
                                        {totalTracks > 0 ? ` · Track ${currentTrack}/${totalTracks}` : ''}
                                    </p>
                                )}
                                {importStatus === 'completed' && (
                                    <a
                                        href="/library"
                                        onClick={e => e.stopPropagation()}
                                        className="text-[10px] text-green-400 hover:text-green-300 mt-0.5 leading-none transition-colors"
                                    >
                                        Go to Library →
                                    </a>
                                )}
                            </div>

                            {/* Circular progress ring */}
                            {(importStatus === 'ripping' || importStatus === 'uploading') && (
                                <div className="relative w-7 h-7 shrink-0">
                                    <svg className="w-7 h-7 -rotate-90" viewBox="0 0 28 28">
                                        <circle cx="14" cy="14" r="11" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-zinc-700" />
                                        <circle
                                            cx="14" cy="14" r="11"
                                            fill="none" stroke="currentColor" strokeWidth="2.5"
                                            className={`transition-all duration-300 ${importStatus === 'uploading' ? 'text-blue-400' : 'text-[#f4d35e]'}`}
                                            strokeDasharray={`${2 * Math.PI * 11}`}
                                            strokeDashoffset={`${2 * Math.PI * 11 * (1 - progressPct / 100)}`}
                                            strokeLinecap="round"
                                        />
                                    </svg>
                                    <span className="absolute inset-0 flex items-center justify-center text-[8px] font-bold text-zinc-400">
                                        {progressPct}
                                    </span>
                                </div>
                            )}

                            {/* Chevron */}
                            <svg
                                className={`w-3 h-3 text-zinc-600 shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`}
                                fill="none" stroke="currentColor" viewBox="0 0 24 24"
                            >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                        </button>

                        {/* Inline progress bar (always visible when ripping or uploading) */}
                        {(importStatus === 'ripping' || importStatus === 'uploading') && (
                            <div className="px-3.5 pb-2.5">
                                <div className="w-full bg-zinc-800 rounded-full h-0.5 overflow-hidden">
                                    <div
                                        className={`h-full rounded-full transition-all duration-300 ${importStatus === 'uploading' ? 'bg-gradient-to-r from-blue-500 to-blue-400' : 'bg-gradient-to-r from-[#f4d35e] to-amber-400'}`}
                                        style={{ width: `${progressPct}%` }}
                                    />
                                </div>
                            </div>
                        )}

                        {/* Expanded detail panel */}
                        <AnimatePresence>
                            {expanded && (
                                <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    transition={{ duration: 0.18 }}
                                    className="overflow-hidden"
                                >
                                    <div className="px-3.5 pb-3 pt-1 border-t border-white/5 space-y-2.5">
                                        {/* Status message */}
                                        {message && (
                                            <p className="text-[10px] text-zinc-500 leading-snug">{message}</p>
                                        )}

                                        {/* Action buttons */}
                                        <div className="flex gap-2">
                                            {(importStatus === 'ripping' || importStatus === 'uploading') && (
                                                <button
                                                    onClick={cancelImport}
                                                    className="flex-1 text-xs font-semibold py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 transition-colors"
                                                >
                                                    Cancel Import
                                                </button>
                                            )}
                                            {importStatus === 'completed' && (
                                                <a
                                                    href="/library"
                                                    className="flex-1 text-xs font-semibold py-1.5 rounded-lg bg-green-500/10 hover:bg-green-500/20 text-green-400 border border-green-500/20 transition-colors text-center"
                                                >
                                                    Go to Library
                                                </a>
                                            )}
                                            {importStatus === 'error' && (
                                                <button
                                                    onClick={() => { setVisible(false); resetImport(); }}
                                                    className="flex-1 text-xs font-semibold py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 transition-colors"
                                                >
                                                    Dismiss
                                                </button>
                                            )}
                                            {importStatus !== 'error' && (
                                                <button
                                                    onClick={() => setExpanded(false)}
                                                    className="text-[11px] text-zinc-600 hover:text-zinc-400 transition-colors px-2"
                                                >
                                                    Hide
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
