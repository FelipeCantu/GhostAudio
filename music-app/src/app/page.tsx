"use client";

import Link from "next/link";
import { Disc, Download, Globe, Music, Shield, Zap } from "lucide-react";
import Image from "next/image";
import { motion } from "framer-motion";
import { HeroVisual } from "@/components/landing/HeroVisual";
import { ProductShowcase } from "@/components/landing/ProductShowcase";
import { BentoGrid } from "@/components/landing/BentoGrid";
import { Github, Twitter } from "lucide-react";

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

      <section className="relative min-h-screen w-full flex flex-col items-center justify-center overflow-hidden pt-20">
        {/* Background 3D Scene - Fixed & Ambient */}
        <div className="fixed inset-0 z-0 pointer-events-none opacity-60">
          <HeroVisual />
        </div>

        {/* Hero Content */}
        <div className="relative z-10 max-w-5xl mx-auto px-6 w-full flex flex-col items-center text-center pointer-events-none mt-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="pointer-events-auto"
          >
            <div className="inline-block px-4 py-2 rounded-full bg-white/5 border border-white/10 mb-8 backdrop-blur-sm shadow-xl">
              <span className="text-[#f4d35e] text-sm font-bold tracking-wide uppercase">The Future of Local Audio</span>
            </div>
            <h1 className="text-5xl md:text-8xl font-bold leading-tight mb-8 drop-shadow-2xl tracking-tight">
              Your Music.<br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#f4d35e] via-[#ee964b] to-[#f4d35e] animate-gradient bg-300%">
                Uncompromised.
              </span>
            </h1>
            <p className="text-xl text-zinc-300 mb-10 max-w-2xl mx-auto leading-relaxed drop-shadow-lg font-light">
              DiZC is the ultimate high-fidelity music player for your local collection.
              Experience bit-perfect playback, seamless CD ripping, and a stunning interface designed for audiophiles.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-20">
              <a href="/downloads/DiZC-Setup.exe" download className="px-8 py-4 bg-white text-[#0d3b66] font-bold rounded-xl flex items-center justify-center gap-2 hover:bg-gray-100 transition-transform hover:scale-105 shadow-xl shadow-white/10">
                <Download size={20} />
                Download for Windows
              </a>
              <Link href="/app" className="px-8 py-4 bg-white/10 backdrop-blur-md border border-white/10 text-white font-bold rounded-xl flex items-center justify-center gap-2 hover:bg-white/20 transition-transform hover:scale-105 shadow-xl">
                <Globe size={20} />
                Open Web Player
              </Link>
            </div>
          </motion.div>
        </div>

        {/* Product Showcase */}
        <div className="relative z-10 w-full mb-10">
          <ProductShowcase />
        </div>
      </section>

      {/* Social Proof Banner */}
      <section className="py-10 border-y border-white/5 bg-black/10 relative z-10 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-6 text-center">
          <p className="text-zinc-500 text-sm font-medium mb-6 uppercase tracking-widest">Built for the Community</p>
          <div className="flex flex-wrap justify-center gap-12 opacity-50 grayscale hover:grayscale-0 transition-all duration-500">
            {/* Placeholder Logos - You can replace these with real SVG logos later */}
            <div className="flex items-center gap-2 text-xl font-bold font-mono text-zinc-300">
              <Github size={24} /> GitHub
            </div>
            <div className="flex items-center gap-2 text-xl font-bold font-mono text-zinc-300">
              <Zap size={24} /> Electron
            </div>
            <div className="flex items-center gap-2 text-xl font-bold font-mono text-zinc-300">
              <Globe size={24} /> Next.js
            </div>
          </div>
        </div>
      </section>

      {/* Bento Grid Features */}
      <BentoGrid />

      {/* Modern Footer */}
      <footer className="py-12 border-t border-white/5 bg-[#0b1622] relative z-20">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2">
            <Disc className="text-[#f4d35e]" size={24} />
            <span className="font-bold text-white">DiZC</span>
          </div>
          <div className="flex items-center gap-6">
            <a href="#" className="text-zinc-400 hover:text-white transition-colors"><Github size={20} /></a>
            <a href="#" className="text-zinc-400 hover:text-white transition-colors"><Twitter size={20} /></a>
            <a href="#" className="text-zinc-400 hover:text-white transition-colors"><Disc size={20} /></a>
          </div>
          <p className="text-zinc-500 text-sm">© {new Date().getFullYear()} GhostRepo. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
