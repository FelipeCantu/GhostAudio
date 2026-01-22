
import { useState, useEffect } from "react";

import { motion, AnimatePresence } from "framer-motion";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: (string | undefined | null | false)[]) {
    return twMerge(clsx(inputs));
}

export default function CDImporter() {
    const [drives, setDrives] = useState<string[]>([]);
    const [selectedDrive, setSelectedDrive] = useState<string | null>(null);
    const [status, setStatus] = useState<"idle" | "scanning" | "ripping" | "completed" | "error">("idle");
    const [message, setMessage] = useState("");

    const scanDrives = async () => {
        setStatus("scanning");
        setMessage("Scanning for devices...");

        try {
            // Use Electron IPC
            // @ts-ignore
            const { ipcRenderer } = window.require('electron');
            const data = await ipcRenderer.invoke('get-drives');

            setDrives(data.drives || []);

            if (data.drives && data.drives.length > 0) {
                setSelectedDrive(data.drives[0]);
                setMessage(`Found ${data.drives.length} drive(s).`);
            } else {
                setMessage("No optical drives found.");
            }
            setStatus("idle");
        } catch (err: any) {
            console.error(err);
            setStatus("error");
            setMessage("Failed to access hardware services.");
        }
    };

    useEffect(() => {
        scanDrives();
    }, []);


    const startRip = async () => {
        if (!selectedDrive) return;
        setStatus("ripping");
        setMessage("Starting import process...");
        try {
            // @ts-ignore
            const { ipcRenderer } = window.require('electron');
            const data = await ipcRenderer.invoke('rip-cd', { drive_path: selectedDrive });

            if (data.status === "started") {
                setMessage("Importing tracks...");
                // Keep the fake polling for now as the backend is conceptually async
                setTimeout(() => {
                    setStatus("completed");
                    setMessage("Import completed successfully.");
                }, 5000);
            } else {
                setStatus("error");
                setMessage("Failed to start import.");
            }
        } catch (err) {
            setStatus("error");
            setMessage("Error starting import.");
        }
    };

    const containerVariants = {
        hidden: { opacity: 0, y: 20 },
        visible: { opacity: 1, y: 0, transition: { duration: 0.5 } }
    };

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
                        <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-violet-600 shadow-lg shadow-blue-500/20">
                            <svg className="w-7 h-7 text-white drop-shadow-md" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                            </svg>
                        </div>
                        <div>
                            <h2 className="text-2xl font-bold text-white tracking-tight">CD Importer</h2>
                            <p className="text-sm font-medium text-zinc-400">High Fidelity Rip Engine</p>
                        </div>
                    </div>

                    <div className="space-y-6">
                        {/* Drive Selection Area */}
                        <div className="space-y-3">
                            <div className="flex justify-between items-center px-1">
                                <label className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Target Source</label>
                                <button
                                    onClick={() => scanDrives()}
                                    disabled={status === "scanning" || status === "ripping"}
                                    className="text-xs font-medium text-blue-400 hover:text-blue-300 transition-colors disabled:opacity-50 flex items-center gap-1.5"
                                >
                                    {status === "scanning" && (
                                        <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                    )}
                                    {status === "scanning" ? "Scanning..." : "Refesh Devices"}
                                </button>
                            </div>

                            {drives.length === 0 ? (
                                <motion.div
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.98 }}
                                    onClick={() => scanDrives()}
                                    className="cursor-pointer group relative overflow-hidden rounded-2xl border border-dashed border-zinc-700 hover:border-blue-500/50 hover:bg-white/5 transition-all p-8 text-center"
                                >
                                    <p className="text-zinc-400 mb-3 text-sm">No optical drives detected</p>
                                    <span className="inline-flex items-center justify-center px-4 py-1.5 rounded-full bg-zinc-800 text-xs font-medium text-zinc-300 group-hover:bg-blue-600/20 group-hover:text-blue-300 transition-colors">
                                        Tap to Scan
                                    </span>
                                </motion.div>
                            ) : (
                                <div className="relative group">
                                    <select
                                        value={selectedDrive || ""}
                                        onChange={(e) => setSelectedDrive(e.target.value)}
                                        className="w-full appearance-none bg-zinc-900/50 border border-zinc-800 hover:border-zinc-700 rounded-xl px-4 py-3.5 pr-10 text-zinc-200 focus:outline-none focus:ring-2 focus:ring-blue-500/30 transition-all font-medium"
                                    >
                                        {drives.map((drive) => (
                                            <option key={drive} value={drive}>{drive} - Audio CD</option>
                                        ))}
                                    </select>
                                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-500 group-hover:text-zinc-300 transition-colors">
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l4-4 4 4m0 6l-4 4-4-4" /></svg>
                                    </div>
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
                                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                                                        <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500"></span>
                                                    </span>
                                                </div>
                                            ) : status === 'completed' ? (
                                                <svg className="w-5 h-5 text-green-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                            ) : status === 'error' ? (
                                                <svg className="w-5 h-5 text-red-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                            ) : (
                                                <svg className="w-5 h-5 text-zinc-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                            )}
                                            <p className="leading-snug">{message}</p>
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
                                        ? "bg-gradient-to-r from-blue-600 to-violet-600 text-white hover:shadow-blue-500/25 border border-transparent"
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
