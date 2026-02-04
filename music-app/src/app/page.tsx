"use client";

import Link from "next/link";
import { Disc, Download, Globe, Music, Shield, Zap } from "lucide-react";
import Image from "next/image";
import { motion } from "framer-motion";
import { HeroVisual } from "@/components/landing/HeroVisual";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#0d1b2a] text-[#e0e1dd] overflow-x-hidden font-sans selection:bg-[#f4d35e] selection:text-[#0d1b2a]">
      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 bg-[#0d1b2a]/80 backdrop-blur-md border-b border-white/5">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="relative w-10 h-10">
              <Disc className="text-[#f4d35e] w-full h-full animate-[spin_10s_linear_infinite]" />
            </div>
            <span className="text-2xl font-bold tracking-tighter text-white">DiZC</span>
          </div>
          <div className="hidden md:flex items-center gap-8">
            <Link href="#features" className="text-sm font-medium hover:text-[#f4d35e] transition-colors">Features</Link>
            <Link href="#download" className="text-sm font-medium hover:text-[#f4d35e] transition-colors">Download</Link>
            <Link href="/app" className="px-5 py-2.5 bg-[#f4d35e] text-[#0d3b66] font-bold rounded-lg hover:bg-[#ee964b] transition-all transform hover:scale-105">
              Launch Web App
            </Link>
          </div>
        </div>
      </nav>

      <section className="relative h-screen min-h-[800px] w-full flex items-center overflow-hidden">
        {/* Background 3D Scene - Massive & Right Aligned & Non-interactive */}
        <div className="absolute right-[-20%] top-1/2 -translate-y-1/2 z-0 h-[160%] w-[160%] md:w-[100%] pointer-events-none">
          <HeroVisual />
        </div>

        {/* Content */}
        <div className="relative z-10 max-w-7xl mx-auto px-6 w-full grid md:grid-cols-2 gap-12 items-center pointer-events-none">
          <motion.div
            initial={{ opacity: 0, x: -50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8 }}
            className="pointer-events-auto"
          >
            <div className="inline-block px-4 py-2 rounded-full bg-white/5 border border-white/10 mb-6 backdrop-blur-sm">
              <span className="text-[#f4d35e] text-sm font-bold tracking-wide uppercase">The Future of Local Audio</span>
            </div>
            <h1 className="text-5xl md:text-7xl font-bold leading-tight mb-6 drop-shadow-lg">
              Your Music.<br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#f4d35e] to-[#ee964b]">
                Uncompromised.
              </span>
            </h1>
            <p className="text-lg text-zinc-300 mb-8 max-w-lg leading-relaxed drop-shadow-md">
              DiZC is the ultimate high-fidelity music player for your local collection.
              Experience bit-perfect playback, seamless CD ripping, and a stunning interface designed for audiophiles.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <a href="/downloads/DiZC-Setup.exe" download className="px-8 py-4 bg-white text-[#0d3b66] font-bold rounded-xl flex items-center justify-center gap-2 hover:bg-gray-100 transition-transform hover:scale-105 shadow-lg shadow-white/10">
                <Download size={20} />
                Download for Windows
              </a>
              <Link href="/app" className="px-8 py-4 bg-white/10 backdrop-blur-md border border-white/10 text-white font-bold rounded-xl flex items-center justify-center gap-2 hover:bg-white/20 transition-transform hover:scale-105 shadow-lg">
                <Globe size={20} />
                Open Web Player
              </Link>
            </div>
          </motion.div>

          {/* Spacer to push content to left if needed, or we can center it if we want the 3D to be the main visual everywhere */}
          {/* <motion.div ... /> was here, now removed as the 3D is background */}
        </div>
      </section>

      {/* Features Grid */}
      <section id="features" className="py-24 bg-black/20">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-5xl font-bold mb-4">Why DiZC?</h2>
            <p className="text-zinc-400 max-w-2xl mx-auto">Built for those who care about their music library.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              { title: "Bit-Perfect Audio", desc: "No compression, no loss. Pure sound exactly as the artist intended.", icon: Music },
              { title: "Local First", desc: "Your data stays on your machine. Privacy focused and offline ready.", icon: Shield },
              { title: "Blazing Fast", desc: "Built with Electron and Next.js for instant startup and navigation.", icon: Zap },
            ].map((feature, i) => (
              <motion.div
                key={i}
                whileHover={{ y: -5 }}
                className="p-8 rounded-3xl bg-white/5 border border-white/5 hover:border-[#f4d35e]/30 transition-colors group"
              >
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#f4d35e] to-[#ee964b] flex items-center justify-center text-[#0d3b66] mb-6 shadow-lg shadow-orange-500/20">
                  <feature.icon size={28} />
                </div>
                <h3 className="text-xl font-bold mb-3 group-hover:text-[#f4d35e] transition-colors">{feature.title}</h3>
                <p className="text-zinc-400 leading-relaxed">{feature.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Modern Footer */}
      <footer className="py-12 border-t border-white/5 bg-[#0b1622]">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2">
            <Disc className="text-[#f4d35e]" size={24} />
            <span className="font-bold text-white">DiZC</span>
          </div>
          <p className="text-zinc-500 text-sm">© {new Date().getFullYear()} GhostRepo. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
