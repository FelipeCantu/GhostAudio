"use client";

import { useEffect, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import CDImporter from "@/components/CDImporter";
import WebImporter from "@/components/WebImporter";
import { motion } from "framer-motion";
import { api } from "@/services/api";

export default function ImportPage() {
    const [isDesktop, setIsDesktop] = useState<boolean | null>(null);

    useEffect(() => {
        setIsDesktop(api.isElectron());
    }, []);

    // Avoid flash of wrong UI during SSR/hydration
    if (isDesktop === null) return null;

    return (
        <DashboardLayout>
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="max-w-4xl mx-auto"
            >
                <div className="mb-8">
                    <h1 className="text-3xl font-bold text-white mb-2">Import Music</h1>
                    <p className="text-zinc-400">
                        {isDesktop
                            ? "Rip CDs or import local audio files to your library."
                            : "Upload audio files directly to your library."}
                    </p>
                </div>

                {isDesktop ? (
                    // Desktop: CD ripper + local file import via Electron
                    <div className="bg-white/5 border border-white/10 rounded-3xl p-4 md:p-8 backdrop-blur-sm shadow-xl">
                        <CDImporter />
                    </div>
                ) : (
                    // Web: file upload direct to R2
                    <div className="space-y-6">
                        <div className="bg-white/5 border border-white/10 rounded-3xl p-4 md:p-8 backdrop-blur-sm shadow-xl">
                            <div className="mb-6">
                                <h2 className="text-lg font-semibold text-white">Upload Audio Files</h2>
                                <p className="text-sm text-zinc-500 mt-1">Files are uploaded to the cloud and playable on any device.</p>
                            </div>
                            <WebImporter />
                        </div>

                        {/* Desktop app callout for CD ripping */}
                        <div className="flex items-start gap-4 rounded-2xl border border-white/5 bg-white/2 px-5 py-4">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-zinc-800/60 mt-0.5">
                                <svg className="w-5 h-5 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
                                </svg>
                            </div>
                            <div>
                                <p className="text-sm font-medium text-zinc-300">Want to rip CDs?</p>
                                <p className="text-xs text-zinc-500 mt-0.5">CD ripping requires the GhostAudio desktop app, which gives you full hardware access and automatic cloud sync.</p>
                            </div>
                        </div>
                    </div>
                )}
            </motion.div>
        </DashboardLayout>
    );
}
