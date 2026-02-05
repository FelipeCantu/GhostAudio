
import { useState, useEffect } from "react";

import { motion, AnimatePresence } from "framer-motion";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: (string | undefined | null | false)[]) {
    return twMerge(clsx(inputs));
}

import { useAuth } from "@/context/AuthContext";
import { api } from "@/services/api";

export default function CDImporter() {
    const { user, token, isAuthenticated } = useAuth();
    const [drives, setDrives] = useState<string[]>([]);
    const [selectedDrive, setSelectedDrive] = useState<string | null>(null);
    const [status, setStatus] = useState<"idle" | "scanning" | "ripping" | "completed" | "error">("idle");
    const [message, setMessage] = useState("");
    const [ffmpegMissing, setFfmpegMissing] = useState(false);

    // Check if we are in Electron environment
    const [isDesktop, setIsDesktop] = useState(false);

    useEffect(() => {
        setIsDesktop(api.isElectron());
    }, []);

    const [metadata, setMetadata] = useState<any>(null);
    const [isEditingMetadata, setIsEditingMetadata] = useState(false);
    const [editedMetadata, setEditedMetadata] = useState<any>(null);

    // Progress tracking
    const [currentTrack, setCurrentTrack] = useState(0);
    const [totalTracks, setTotalTracks] = useState(0);
    const [ripStartTime, setRipStartTime] = useState<number | null>(null);
    // Per-track status: { status: 'pending'|'active'|'done', percent: 0-100 }
    const [trackStatuses, setTrackStatuses] = useState<Record<string, { status: string; percent: number }>>({});

    const checkSystem = async () => {
        try {
            const sys = await api.system.getSystemStatus();
            console.log("System Status Object:", sys); // Log full object to see Connection Errors
            if (!sys.ffmpeg_found) {
                setFfmpegMissing(true);
                if (sys.error) setMessage(`Error: ${sys.error}`);
            } else {
                setFfmpegMissing(false);
            }
        } catch (e) {
            console.warn("Failed to check system status", e);
        }
    };

    const scanDrives = async () => {
        console.log("Starting Drive Scan...");
        setStatus("scanning");
        setMessage("Scanning for devices...");
        setMetadata(null);

        try {
            const data = await api.system.getDrives();
            console.log("Drive Scan Result:", data);
            setDrives(data.drives || []);
            if (data.drives && data.drives.length > 0) {
                console.log("Selecting First Drive:", data.drives[0]);
                setSelectedDrive(data.drives[0]);
                setMessage(`Found ${data.drives.length} drive(s).`);
            } else {
                console.log("No Drives Found");
                setMessage("No optical drives found.");
            }
            setStatus("idle");
        } catch (err: any) {
            console.error("Scan Error:", err);
            setStatus("error");
            setMessage(err.message || "Failed to access hardware.");
        }
    };

    useEffect(() => {
        scanDrives();
        checkSystem();
    }, []);

    useEffect(() => {
        if (selectedDrive) {
            fetchMetadata(selectedDrive);
        } else {
            console.log("No drive selected, skipping metadata fetch");
            setMetadata(null);
        }
    }, [selectedDrive]);

    const fetchMetadata = async (drive: string) => {
        console.log(`Fetching Metadata for drive: ${drive}`);
        setMessage("Reading Disc...");
        setIsEditingMetadata(false);
        try {
            const meta = await api.system.getCdMetadata(drive);
            console.log("Metadata Result:", meta);

            // Check if we have track data even if there's an error (fallback metadata)
            if (meta && meta.tracks && meta.tracks.length > 0) {
                setMetadata(meta);
                setEditedMetadata(null); // Reset edited metadata
                if (meta.error) {
                    // Has tracks but metadata lookup failed
                    setMessage(`Audio CD detected (${meta.tracks.length} tracks). Metadata lookup failed - you can still import with basic track names.`);
                } else {
                    // Full metadata available
                    setMessage(`Ready to import: ${meta.album} by ${meta.artist}`);
                }
            } else if (meta && meta.error) {
                // Error and no track data
                setMetadata(null);
                setMessage(`Audio CD detected. Error: ${meta.error}`);
            } else {
                setMetadata(null);
                setMessage(`Audio CD detected. Metadata lookup failed (Unknown).`);
            }
        } catch (e: any) {
            console.warn("Metadata fetch failed", e);
            setMetadata(null);
            setMessage(`Audio CD detected. Lookup failed: ${e.message || e}`);
        }
    };

    const startEditingMetadata = () => {
        // Initialize edited metadata with current values
        setEditedMetadata(JSON.parse(JSON.stringify(metadata)));
        setIsEditingMetadata(true);
    };

    const saveMetadataEdits = () => {
        setMetadata(editedMetadata);
        setIsEditingMetadata(false);
        setMessage(`Ready to import: ${editedMetadata.album} by ${editedMetadata.artist}`);
    };

    const cancelMetadataEdits = () => {
        setEditedMetadata(null);
        setIsEditingMetadata(false);
    };

    const updateEditedField = (field: string, value: any) => {
        setEditedMetadata({ ...editedMetadata, [field]: value });
    };

    const updateEditedTrack = (index: number, field: string, value: any) => {
        const updatedTracks = [...editedMetadata.tracks];
        updatedTracks[index] = { ...updatedTracks[index], [field]: value };
        setEditedMetadata({ ...editedMetadata, tracks: updatedTracks });
    };


    const startRip = async () => {
        if (!selectedDrive) return;

        // Exit editing mode if active
        if (isEditingMetadata) {
            setIsEditingMetadata(false);
        }

        // Set up progress tracking
        const trackCount = metadata?.tracks?.length || 12;
        setTotalTracks(trackCount);
        setCurrentTrack(0);
        setRipStartTime(Date.now());

        // Initialize all tracks as pending
        const initialStatuses: Record<string, { status: string; percent: number }> = {};
        if (metadata?.tracks) {
            for (const t of metadata.tracks) {
                initialStatuses[String(t.track_number)] = { status: 'pending', percent: 0 };
            }
        }
        setTrackStatuses(initialStatuses);

        setStatus("ripping");
        setMessage(`Preparing to import ${trackCount} tracks...`);

        // Listen for real-time progress updates from Electron
        if (api.isElectron() && (window as any).electronAPI?.on) {
            (window as any).electronAPI.on('rip-progress', (data: any) => {
                console.log('[CDImporter] Progress update:', data);

                if (data.type === 'progress') {
                    setCurrentTrack(data.current);
                    setTotalTracks(data.total);
                    setMessage(data.message);

                    // Update per-track status
                    if (data.track_number != null) {
                        const key = String(data.track_number);
                        if (data.stage === 'track_done') {
                            setTrackStatuses(prev => ({ ...prev, [key]: { status: 'done', percent: 100 } }));
                        } else if (data.stage === 'track_progress') {
                            // track_progress = CD read progress, not extraction.
                            // Keep as 'active' even at 100% — 'done' only after track_done (extraction complete).
                            const pct = data.track_percent ?? 0;
                            setTrackStatuses(prev => ({
                                ...prev,
                                [key]: { status: 'active', percent: Math.min(pct, 100) }
                            }));
                        } else {
                            setTrackStatuses(prev => ({ ...prev, [key]: { status: 'active', percent: prev[key]?.percent ?? 0 } }));
                        }
                    }
                } else if (data.type === 'saved') {
                    setMessage('Saved to library!');
                }
            });
        }

        try {
            const data = await api.system.ripCd({
                drive_path: selectedDrive,
                token,
                mongo_user_id: user?.id,
                metadata: metadata
            });

            // Cleanup listener
            if (api.isElectron() && (window as any).electronAPI?.removeAllListeners) {
                (window as any).electronAPI.removeAllListeners('rip-progress');
            }

            if (data.status === "started" || data.status === "completed") {
                setCurrentTrack(trackCount);
                setMessage("Import completed. Finalizing library...");
                // Mark all tracks as done
                setTrackStatuses(prev => {
                    const all: Record<string, { status: string; percent: number }> = {};
                    for (const k of Object.keys(prev)) all[k] = { status: 'done', percent: 100 };
                    return all;
                });
                setTimeout(() => {
                    setStatus("completed");
                    const albumName = metadata?.album || "Album";
                    const artistName = metadata?.artist || "Unknown Artist";
                    setMessage(`"${albumName}" by ${artistName} has been added to your library!`);
                    setCurrentTrack(0);
                    setTotalTracks(0);
                    setTrackStatuses({});
                }, 1500);
            } else {
                throw new Error("Import failed");
            }
        } catch (err: any) {
            // Cleanup listener
            if (api.isElectron() && (window as any).electronAPI?.removeAllListeners) {
                (window as any).electronAPI.removeAllListeners('rip-progress');
            }
            console.error("Import Error Details:", err);
            setStatus("error");
            setMessage(`Import failed: ${err.message || JSON.stringify(err)}`);
            setCurrentTrack(0);
            setTotalTracks(0);
            setTrackStatuses({});
        }
    };

    const containerVariants = {
        hidden: { opacity: 0, y: 20 },
        visible: { opacity: 1, y: 0, transition: { duration: 0.5 } }
    };

    if (!isDesktop) {
        return (
            <motion.div
                variants={containerVariants}
                initial="hidden"
                animate="visible"
                className="w-full max-w-md mx-auto"
            >
                <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-black/40 backdrop-blur-xl shadow-2xl ring-1 ring-white/5 p-8 text-center space-y-4">
                    <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-zinc-800/50 text-zinc-400">
                        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </svg>
                    </div>
                    <div>
                        <h3 className="text-xl font-bold text-white">Desktop Application Feature</h3>
                        <p className="text-zinc-400 text-sm mt-2">
                            CD Importing is only available in the GhostAudio Desktop application.
                            Please download the desktop app to access high-fidelity CD ripping and library management.
                        </p>
                    </div>
                </div>
            </motion.div>
        );
    }

    return (
        <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="w-full max-w-md mx-auto"
        >
            <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-black/40 backdrop-blur-xl shadow-2xl ring-1 ring-white/5">
                <div className="absolute inset-0 bg-gradient-to-b from-white/5 to-transparent pointer-events-none" />

                <div className="relative p-8 space-y-8">
                    {/* Header */}
                    <div className="flex items-center gap-5">
                        <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-border shadow-lg shadow-primary/20 overflow-hidden">
                            {metadata?.cover_art ? (
                                <img src={metadata.cover_art} alt="Cover" className="h-full w-full object-cover" />
                            ) : (
                                <svg className="w-7 h-7 text-primary-foreground drop-shadow-sm" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                                </svg>
                            )}
                        </div>
                        <div>
                            <h2 className="text-2xl font-bold text-white tracking-tight">CD Importer</h2>
                            <p className="text-sm font-medium text-zinc-400">High Fidelity Rip Engine</p>
                        </div>
                    </div>

                    {ffmpegMissing && (
                        <div className="rounded-lg bg-yellow-500/10 border border-yellow-500/20 p-3 flex items-start gap-3">
                            <svg className="w-5 h-5 text-yellow-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                            <div>
                                <h4 className="text-sm font-semibold text-yellow-200">Driver Missing</h4>
                                <p className="text-xs text-yellow-200/80 mt-1">High-fidelity ripping driver (ffmpeg) not found. Imports will be simulated (no audio).</p>
                                {message && message.includes("Error") && (
                                    <p className="text-xs text-red-300 mt-1 font-mono">{message}</p>
                                )}
                            </div>
                        </div>
                    )}

                    <div className="space-y-6">
                        {/* Drive Selection Area */}
                        <div className="space-y-3">
                            <div className="flex justify-between items-center px-1">
                                <label className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Target Source</label>
                                <button
                                    onClick={() => scanDrives()}
                                    disabled={status === "scanning" || status === "ripping"}
                                    className="text-xs font-medium text-border hover:text-primary transition-colors disabled:opacity-50 flex items-center gap-1.5"
                                >
                                    {status === "scanning" && (
                                        <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                    )}
                                    {status === "scanning" ? "Scanning..." : "Refresh Devices"}
                                </button>
                            </div>

                            {drives.length === 0 ? (
                                <motion.div
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.98 }}
                                    onClick={() => scanDrives()}
                                    className="cursor-pointer group relative overflow-hidden rounded-2xl border border-dashed border-zinc-700 hover:border-[#ee964b]/50 hover:bg-white/5 transition-all p-8 text-center"
                                >
                                    <p className="text-zinc-400 mb-3 text-sm">No optical drives detected</p>
                                    <span className="inline-flex items-center justify-center px-4 py-1.5 rounded-full bg-zinc-800 text-xs font-medium text-zinc-300 group-hover:bg-border/20 group-hover:text-primary transition-colors">
                                        Tap to Scan
                                    </span>
                                </motion.div>
                            ) : (
                                <div className="space-y-4">
                                    <div className="relative group">
                                        <select
                                            value={selectedDrive || ""}
                                            onChange={(e) => setSelectedDrive(e.target.value)}
                                            className="w-full appearance-none bg-zinc-900/50 border border-zinc-800 hover:border-zinc-700 rounded-xl px-4 py-3.5 pr-10 text-zinc-200 focus:outline-none focus:ring-2 focus:ring-border/30 transition-all font-medium"
                                        >
                                            {drives.map((drive) => (
                                                <option key={drive} value={drive}>{drive} - Audio CD</option>
                                            ))}
                                        </select>
                                        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-500 group-hover:text-zinc-300 transition-colors">
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l4-4 4 4m0 6l-4 4-4-4" /></svg>
                                        </div>
                                    </div>

                                    {/* Album Preview Card */}
                                    {metadata && !isEditingMetadata && (
                                        <motion.div
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            className="rounded-xl bg-zinc-900/40 border border-zinc-800 p-4"
                                        >
                                            <div className="flex justify-between items-start mb-2">
                                                <div className="flex-1">
                                                    <h3 className="font-bold text-white text-lg leading-tight">{metadata.album}</h3>
                                                    <p className="text-zinc-400 text-sm">{metadata.artist}</p>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xs bg-zinc-800 text-zinc-400 px-2 py-1 rounded-md">
                                                        {metadata.tracks?.length || '?'} Tracks
                                                    </span>
                                                    {status !== 'ripping' && (
                                                        <button
                                                            onClick={startEditingMetadata}
                                                            className="text-xs text-border hover:text-primary transition-colors p-1"
                                                            title="Edit metadata"
                                                        >
                                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                                            </svg>
                                                        </button>
                                                    )}
                                                </div>
                                            </div>

                                            <div className={cn(
                                                "overflow-y-auto pr-1 space-y-1 custom-scrollbar transition-all duration-300",
                                                status === 'ripping' ? 'max-h-52' : 'max-h-32'
                                            )}>
                                                {metadata.tracks?.map((track: any) => {
                                                    const tInfo = trackStatuses[String(track.track_number)];
                                                    const tStatus = tInfo?.status;
                                                    const tPercent = tInfo?.percent ?? 0;
                                                    return (
                                                        <div
                                                            key={track.track_number}
                                                            className={cn(
                                                                "relative flex items-center text-xs py-1.5 border-b border-zinc-800/50 last:border-0 transition-colors duration-300 overflow-hidden",
                                                                tStatus === 'done' ? 'text-green-400/90' :
                                                                tStatus === 'active' ? 'text-primary' :
                                                                'text-zinc-500'
                                                            )}
                                                        >
                                                            {/* Per-track progress fill */}
                                                            {tStatus && tStatus !== 'pending' && (
                                                                <div
                                                                    className={cn(
                                                                        "absolute inset-y-0 left-0 transition-all duration-700 ease-out",
                                                                        tStatus === 'done'
                                                                            ? 'bg-green-500/10'
                                                                            : 'bg-primary/10'
                                                                    )}
                                                                    style={{ width: `${tPercent}%` }}
                                                                />
                                                            )}
                                                            {/* Status indicator */}
                                                            <span className="relative w-6 flex items-center justify-center shrink-0">
                                                                {tStatus === 'done' ? (
                                                                    <svg className="w-3.5 h-3.5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                                                    </svg>
                                                                ) : tStatus === 'active' ? (
                                                                    <svg className="w-3.5 h-3.5 animate-spin text-primary" viewBox="0 0 24 24" fill="none">
                                                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                                                    </svg>
                                                                ) : (
                                                                    <span className="font-mono text-zinc-600">{track.track_number}.</span>
                                                                )}
                                                            </span>
                                                            <span className="relative truncate flex-1">{track.title}</span>
                                                            <span className="relative w-12 text-right font-mono text-zinc-600 shrink-0">
                                                                {tStatus === 'active' && tPercent > 0 && tPercent < 100
                                                                    ? `${tPercent}%`
                                                                    : track.duration_ms
                                                                        ? `${Math.floor(track.duration_ms / 60000)}:${String(Math.floor((track.duration_ms % 60000) / 1000)).padStart(2, '0')}`
                                                                        : ''
                                                                }
                                                            </span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </motion.div>
                                    )}

                                    {/* Metadata Editing Form */}
                                    {isEditingMetadata && editedMetadata && (
                                        <motion.div
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            className="rounded-xl bg-zinc-900/40 border border-zinc-800 p-4 space-y-4"
                                        >
                                            <div className="flex justify-between items-center mb-2">
                                                <h3 className="font-bold text-white text-sm">Edit Metadata</h3>
                                                <div className="flex gap-2">
                                                    <button
                                                        onClick={cancelMetadataEdits}
                                                        className="text-xs text-zinc-400 hover:text-zinc-200 px-2 py-1 rounded transition-colors"
                                                    >
                                                        Cancel
                                                    </button>
                                                    <button
                                                        onClick={saveMetadataEdits}
                                                        className="text-xs text-white bg-border hover:bg-primary px-3 py-1 rounded transition-colors font-medium"
                                                    >
                                                        Save
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Album & Artist Inputs */}
                                            <div className="space-y-3">
                                                <div>
                                                    <label className="text-xs text-zinc-500 mb-1 block">Album Title</label>
                                                    <input
                                                        type="text"
                                                        value={editedMetadata.album}
                                                        onChange={(e) => updateEditedField('album', e.target.value)}
                                                        className="w-full bg-zinc-800/50 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-border/30"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="text-xs text-zinc-500 mb-1 block">Artist</label>
                                                    <input
                                                        type="text"
                                                        value={editedMetadata.artist}
                                                        onChange={(e) => updateEditedField('artist', e.target.value)}
                                                        className="w-full bg-zinc-800/50 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-border/30"
                                                    />
                                                </div>
                                            </div>

                                            {/* Track List Editing */}
                                            <div>
                                                <label className="text-xs text-zinc-500 mb-2 block">Tracks</label>
                                                <div className="max-h-48 overflow-y-auto pr-1 space-y-2 custom-scrollbar">
                                                    {editedMetadata.tracks?.map((track: any, idx: number) => (
                                                        <div key={idx} className="flex items-center gap-2">
                                                            <span className="text-xs text-zinc-600 font-mono w-6">{track.track_number}.</span>
                                                            <input
                                                                type="text"
                                                                value={track.title}
                                                                onChange={(e) => updateEditedTrack(idx, 'title', e.target.value)}
                                                                className="flex-1 bg-zinc-800/50 border border-zinc-700 rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-border/30"
                                                            />
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        </motion.div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Status Messages */}
                        <AnimatePresence mode="wait">
                            {message && (
                                <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: "auto" }}
                                    exit={{ opacity: 0, height: 0 }}
                                    className="overflow-hidden"
                                >
                                    <div className={cn(
                                        "p-4 rounded-xl text-sm font-medium border backdrop-blur-sm",
                                        status === 'error' ? 'bg-red-500/10 border-red-500/20 text-red-200' :
                                            status === 'completed' ? 'bg-green-500/10 border-green-500/20 text-green-200' :
                                                'bg-zinc-800/50 border-zinc-700/50 text-zinc-300'
                                    )}>
                                        <div className="flex items-start gap-3">
                                            {status === 'ripping' ? (
                                                <div className="mt-0.5">
                                                    <span className="relative flex h-3 w-3">
                                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                                                        <span className="relative inline-flex rounded-full h-3 w-3 bg-border"></span>
                                                    </span>
                                                </div>
                                            ) : status === 'completed' ? (
                                                <svg className="w-5 h-5 text-green-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                            ) : status === 'error' ? (
                                                <svg className="w-5 h-5 text-red-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                            ) : (
                                                <svg className="w-5 h-5 text-zinc-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                            )}
                                            <div className="flex-1">
                                                <p className="leading-snug">{message}</p>
                                                {status === 'ripping' && (
                                                    <div className="mt-3">
                                                        <div className="flex justify-between text-xs text-zinc-400 mb-1">
                                                            <span>Progress</span>
                                                            <span>
                                                                {totalTracks === 100
                                                                    ? `${currentTrack}%`
                                                                    : `${currentTrack} / ${totalTracks} tracks`
                                                                }
                                                            </span>
                                                        </div>
                                                        <div className="w-full bg-zinc-700 rounded-full h-2 overflow-hidden">
                                                            <div
                                                                className="bg-gradient-to-r from-primary to-border h-full rounded-full transition-all duration-300 ease-out"
                                                                style={{ width: `${(currentTrack / totalTracks) * 100}%` }}
                                                            />
                                                        </div>
                                                    </div>
                                                )}
                                                {status === 'completed' && (
                                                    <a
                                                        href="/library"
                                                        className="inline-flex items-center gap-1.5 mt-2 text-xs font-semibold text-green-300 hover:text-green-100 transition-colors"
                                                    >
                                                        Go to Library
                                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                                                        </svg>
                                                    </a>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {/* Main Action Button */}
                        <motion.button
                            whileHover={!(!selectedDrive || status === "ripping" || status === "scanning") ? { scale: 1.02 } : {}}
                            whileTap={!(!selectedDrive || status === "ripping" || status === "scanning") ? { scale: 0.98 } : {}}
                            onClick={startRip}
                            disabled={!selectedDrive || status === "ripping" || status === "scanning"}
                            className={cn(
                                "w-full py-4 px-6 rounded-xl font-bold shadow-lg shadow-black/20 transition-all flex items-center justify-center gap-2.5",
                                status === "ripping"
                                    ? "bg-zinc-800 text-zinc-400 cursor-not-allowed border border-zinc-700"
                                    : selectedDrive
                                        ? "bg-gradient-to-r from-primary to-border text-primary-foreground hover:shadow-primary/25 border border-transparent"
                                        : "bg-zinc-800 text-zinc-500 cursor-not-allowed border border-zinc-700"
                            )}
                        >
                            <span>{status === "ripping" ? "Importing Tracks..." : "Start Import"}</span>
                            {status !== "ripping" && (
                                <svg className={cn("w-5 h-5", selectedDrive ? "text-white/80" : "text-zinc-600")} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                                </svg>
                            )}
                        </motion.button>
                    </div>
                </div>
            </div>
        </motion.div>
    );
}
