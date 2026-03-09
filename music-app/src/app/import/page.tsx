"use client";

import { useEffect, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import CDImporter from "@/components/CDImporter";
import WebImporter from "@/components/WebImporter";
import { motion } from "framer-motion";
import { api } from "@/services/api";
import { Disc, Upload, Monitor } from "lucide-react";

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
        transition={{ duration: 0.45 }}
        className="max-w-3xl mx-auto"
      >
        {/* Page Header */}
        <div className="mb-7">
          <h1 className="text-2xl md:text-3xl font-bold text-white mb-1.5">Import Music</h1>
          <p className="text-zinc-400 text-sm">
            {isDesktop
              ? "Rip CDs or import local audio files into your library."
              : "Upload audio files directly to your cloud library."}
          </p>
        </div>

        {isDesktop ? (
          /* Desktop: CD ripper + local file import via Electron */
          <div className="bg-white/4 border border-white/6 rounded-3xl p-5 md:p-8 backdrop-blur-sm shadow-xl">
            <div className="flex items-center gap-3 mb-6 pb-5 border-b border-white/5">
              <div className="w-10 h-10 rounded-xl bg-[#f4d35e]/10 flex items-center justify-center">
                <Disc size={20} className="text-[#f4d35e]" />
              </div>
              <div>
                <h2 className="text-base font-bold text-white">CD Ripper</h2>
                <p className="text-xs text-zinc-500">Insert a disc to begin</p>
              </div>
            </div>
            <CDImporter />
          </div>
        ) : (
          /* Web: file upload direct to R2 */
          <div className="space-y-5">
            <div className="bg-white/4 border border-white/6 rounded-3xl p-5 md:p-8 backdrop-blur-sm shadow-xl">
              <div className="flex items-center gap-3 mb-6 pb-5 border-b border-white/5">
                <div className="w-10 h-10 rounded-xl bg-[#f4d35e]/10 flex items-center justify-center">
                  <Upload size={20} className="text-[#f4d35e]" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-white">Upload Audio Files</h2>
                  <p className="text-xs text-zinc-500">
                    Files are uploaded to the cloud and playable on any device
                  </p>
                </div>
              </div>
              <WebImporter />
            </div>

            {/* Desktop CTA */}
            <div className="flex items-start gap-4 rounded-2xl border border-white/6 bg-white/2 px-5 py-5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zinc-800/60 mt-0.5">
                <Monitor size={19} className="text-zinc-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-zinc-300">Want to rip CDs?</p>
                <p className="text-xs text-zinc-500 mt-1 leading-relaxed">
                  CD ripping requires the GhostAudio desktop app, which gives you full hardware
                  access and automatic cloud sync.
                </p>
                <a
                  href="/downloads/DiZC-Setup.exe"
                  download
                  className="inline-flex items-center gap-1.5 mt-3 text-xs font-semibold text-[#f4d35e] hover:text-[#ee964b] transition-colors"
                >
                  <Disc size={13} />
                  Download Desktop App
                </a>
              </div>
            </div>
          </div>
        )}
      </motion.div>
    </DashboardLayout>
  );
}
