"use client";

import { useState } from "react";

export default function CDImporter() {
    const [drives, setDrives] = useState<string[]>([]);
    const [selectedDrive, setSelectedDrive] = useState<string | null>(null);
    const [status, setStatus] = useState<"idle" | "scanning" | "ripping" | "completed" | "error">("idle");
    const [message, setMessage] = useState("");

    const scanDrives = async () => {
        setStatus("scanning");
        setMessage("Scanning for optical drives...");
        try {
            // Try connecting to localhost:8000 (Backend default)
            // Note: In production this would point to localhost if using the bridge
            const res = await fetch('http://localhost:8000/api/drives/');
            if (!res.ok) throw new Error("Failed to connect to backend");
            const data = await res.json();
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
            setMessage("Local backend unavailable. Please run the GhostAudio backend.");
        }
    };

    const startRip = async () => {
        if (!selectedDrive) return;
        setStatus("ripping");
        setMessage("Starting import process...");
        try {
            const res = await fetch('http://localhost:8000/api/rip/', {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ drive_path: selectedDrive }),
            });
            const data = await res.json();
            if (data.status === "started") {
                setMessage("Import started! (Check backend console for progress)");
                // In a real app, we'd poll for progress here
                setTimeout(() => {
                    setStatus("completed");
                    setMessage("Import simulated successfully.");
                }, 3000);
            } else {
                setStatus("error");
                setMessage("Failed to start import.");
            }
        } catch (err) {
            setStatus("error");
            setMessage("Network error starting import.");
        }
    };

    return (
        <div className="w-full max-w-md mx-auto p-6 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xl rounded-2xl shadow-2xl border border-zinc-200 dark:border-zinc-800 transition-all duration-300">
            <div className="flex items-center gap-4 mb-6">
                <div className="p-3 bg-blue-600 rounded-full shadow-lg shadow-blue-600/20">
                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                    </svg>
                </div>
                <div>
                    <h2 className="text-xl font-bold text-zinc-900 dark:text-white">CD Importer</h2>
                    <p className="text-xs text-zinc-500 font-medium tracking-wide uppercase">High Fidelity Rip</p>
                </div>
            </div>

            <div className="space-y-6">
                {/* Drive Selection Area */}
                <div className="space-y-2">
                    <div className="flex justify-between items-center">
                        <label className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Target Drive</label>
                        <button
                            onClick={scanDrives}
                            disabled={status === "scanning" || status === "ripping"}
                            className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 hover:underline disabled:opacity-50"
                        >
                            {status === "scanning" ? "Scanning..." : "Refresh Drives"}
                        </button>
                    </div>

                    {drives.length === 0 ? (
                        <div onClick={scanDrives} className="cursor-pointer group relative overflow-hidden rounded-xl border-2 border-dashed border-zinc-300 dark:border-zinc-700 hover:border-blue-500 dark:hover:border-blue-500 transition-colors p-8 text-center">
                            <p className="text-zinc-500 mb-2">No drives detected</p>
                            <span className="inline-block px-4 py-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-sm font-medium text-zinc-600 dark:text-zinc-400 group-hover:bg-blue-50 dark:group-hover:bg-blue-900/30 group-hover:text-blue-600 transition-colors">
                                Tap to Scan
                            </span>
                        </div>
                    ) : (
                        <div className="relative">
                            <select
                                value={selectedDrive || ""}
                                onChange={(e) => setSelectedDrive(e.target.value)}
                                className="w-full appearance-none bg-zinc-50 dark:bg-black border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 pr-8 text-zinc-700 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                            >
                                {drives.map((drive) => (
                                    <option key={drive} value={drive}>{drive} - Audio CD</option>
                                ))}
                            </select>
                            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                                <svg className="w-4 h-4 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                            </div>
                        </div>
                    )}
                </div>

                {/* Status / Message Display */}
                {message && (
                    <div className={`p-4 rounded-xl text-sm ${status === 'error' ? 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400' :
                        status === 'completed' ? 'bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400' :
                            'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400'
                        }`}>
                        <div className="flex items-center gap-2">
                            {status === 'ripping' && (
                                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                            )}
                            {message}
                        </div>
                    </div>
                )}

                {/* Action Button */}
                <button
                    onClick={startRip}
                    disabled={!selectedDrive || status === "ripping" || status === "scanning"}
                    className="w-full py-3.5 px-4 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-black font-semibold shadow-xl shadow-black/10 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2"
                >
                    {status === "ripping" ? "Importing..." : "Start Import"}
                    {status !== "ripping" && (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                    )}
                </button>
            </div>
        </div>
    );
}
