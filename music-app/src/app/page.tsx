"use client";

import Link from "next/link";
import {
  Disc,
  Download,
  Globe,
  Github,
  Twitter,
  HardDrive,
  Headphones,
  Lock,
  ChevronDown,
  Menu,
  X,
  Star,
  Radio,
  Banknote,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { HeroVisual } from "@/components/landing/HeroVisual";
import { ProductShowcase } from "@/components/landing/ProductShowcase";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { BentoGrid } from "@/components/landing/BentoGrid";
import { useState } from "react";

const faqs = [
  {
    q: "Is DiZC really free?",
    a: "Yes. DiZC is free to use with no subscription, no ads, and no tracking. Your music is yours — we never upsell you on streaming tiers.",
  },
  {
    q: "What audio formats are supported?",
    a: "DiZC supports FLAC, WAV, MP3, AAC, OGG, ALAC, and AIFF. The CD ripper outputs FLAC or MP3 at your choice, preserving every bit of quality.",
  },
  {
    q: "Do I need to be online to use DiZC?",
    a: "No. The desktop app works fully offline. Cloud sync is optional — your library lives on your hardware first.",
  },
  {
    q: "How does CD ripping work?",
    a: "Insert a CD, click Rip. DiZC reads the disc sector-by-sector, looks up metadata automatically from MusicBrainz, and encodes to your chosen format. The whole process takes 3–8 minutes per disc.",
  },
  {
    q: "Can I access my library from my phone or another computer?",
    a: "Yes. When cloud sync is enabled, your library streams securely to the web player on any device — no app install needed.",
  },
  {
    q: "Is my music data private?",
    a: "Completely. Your library metadata is stored in your own MongoDB account. Audio files are stored in your own cloud storage bucket. We never have access to your listening habits or music files.",
  },
];

const testimonials = [
  {
    quote:
      "I've been ripping CDs since the Winamp days. DiZC is the first app that actually gets it right — lossless quality, great metadata, and it just works.",
    name: "Marcus T.",
    handle: "@audiophi1e",
    stars: 5,
  },
  {
    quote:
      "Cancelled my Spotify subscription after 6 years. I own 800+ CDs and DiZC made them all instantly accessible. The web player is stunning.",
    name: "Priya N.",
    handle: "@vinylandcode",
    stars: 5,
  },
  {
    quote:
      "The interface is genuinely beautiful. Every other local music player looks like it's from 2008. DiZC feels like something Apple would design if they cared about audiophiles.",
    name: "Jordan K.",
    handle: "@jk_sounds",
    stars: 5,
  },
];

const whyReasons = [
  {
    icon: HardDrive,
    title: "Own Your Collection",
    desc: "No streams. No licenses. No takedowns. Your music lives on your hardware and your cloud — completely under your control.",
  },
  {
    icon: Disc,
    title: "CD Ripping Built-In",
    desc: "Preserve your physical media in perfect digital fidelity. Automatic metadata fetch, cover art, and lossless encoding in minutes.",
  },
  {
    icon: Headphones,
    title: "Uncompromised Audio",
    desc: "Bit-perfect FLAC and WAV playback. No lossy re-encoding, no loudness normalization you didn't ask for, no dynamic range crushing.",
  },
  {
    icon: Banknote,
    title: "No Subscription",
    desc: "Pay nothing, forever. There's no premium tier, no monthly fee, and no ads. Open source and built for the community.",
  },
  {
    icon: Lock,
    title: "Private by Design",
    desc: "Zero telemetry. No listening history sold to data brokers. No algorithm deciding what you should hear next.",
  },
  {
    icon: Radio,
    title: "Listen Everywhere",
    desc: "Desktop app for ripping and offline playback. Web player for streaming to any device. One library, everywhere you are.",
  },
];

function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-white/5 rounded-2xl overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-6 py-5 text-left hover:bg-white/5 transition-colors gap-4"
        aria-expanded={open}
      >
        <span className="font-semibold text-white text-sm md:text-base">{q}</span>
        <ChevronDown
          size={18}
          className={`text-[#f4d35e] flex-shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="answer"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <p className="px-6 pb-5 text-zinc-400 text-sm leading-relaxed">{a}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function LandingPage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#0d1b2a] text-[#e0e1dd] overflow-x-hidden font-sans selection:bg-[#f4d35e] selection:text-[#0d1b2a]">
      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 bg-[#0d1b2a]/90 backdrop-blur-md border-b border-white/5">
        <div className="max-w-7xl mx-auto px-5 h-16 flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-2.5">
            <Disc className="text-[#f4d35e] w-7 h-7 animate-[spin_10s_linear_infinite]" />
            <span className="text-xl font-bold tracking-tighter text-white">DiZC</span>
          </div>

          {/* Desktop Links */}
          <div className="hidden md:flex items-center gap-8">
            <Link href="#why" className="text-sm text-zinc-400 hover:text-white transition-colors">
              Why DiZC
            </Link>
            <Link href="#features" className="text-sm text-zinc-400 hover:text-white transition-colors">
              Features
            </Link>
            <Link href="#faq" className="text-sm text-zinc-400 hover:text-white transition-colors">
              FAQ
            </Link>
            <Link
              href="/app"
              className="px-5 py-2 bg-[#f4d35e] text-[#0d3b66] font-bold rounded-lg hover:bg-[#ffd700] transition-all text-sm"
            >
              Launch App
            </Link>
          </div>

          {/* Mobile Hamburger */}
          <button
            onClick={() => setMobileMenuOpen((v) => !v)}
            className="md:hidden p-2 text-zinc-300 hover:text-white rounded-lg hover:bg-white/5 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
            aria-label="Toggle menu"
            aria-expanded={mobileMenuOpen}
          >
            {mobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>

        {/* Mobile Menu Dropdown */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="md:hidden overflow-hidden border-t border-white/5 bg-[#0d1b2a]/98 backdrop-blur-xl"
            >
              <div className="flex flex-col px-5 py-4 gap-1">
                {[
                  { label: "Why DiZC", href: "#why" },
                  { label: "Features", href: "#features" },
                  { label: "FAQ", href: "#faq" },
                ].map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className="py-3 px-2 text-zinc-300 hover:text-white font-medium border-b border-white/5 last:border-0 transition-colors"
                  >
                    {link.label}
                  </Link>
                ))}
                <div className="pt-3 flex flex-col gap-3">
                  <a
                    href="https://github.com/FelipeCantu/GhostAudio/releases/download/v0.2.0-beta/DiZC.Setup.0.2.0-beta.exe"
                    download
                    className="py-3 px-4 bg-white text-[#0d3b66] font-bold rounded-xl flex items-center justify-center gap-2 text-sm"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    <Download size={18} />
                    Download for Windows
                  </a>
                  <Link
                    href="/app"
                    className="py-3 px-4 bg-[#f4d35e] text-[#0d3b66] font-bold rounded-xl flex items-center justify-center gap-2 text-sm"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    <Globe size={18} />
                    Launch Web App
                  </Link>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </nav>

      {/* ── Hero ── */}
      <section className="relative min-h-screen w-full flex flex-col items-center justify-center overflow-hidden pt-16">
        {/* 3D Background */}
        <div className="fixed inset-0 z-0 pointer-events-none opacity-60">
          <HeroVisual />
        </div>

        {/* Hero Content */}
        <div className="relative z-10 max-w-5xl mx-auto px-5 w-full flex flex-col items-center text-center pointer-events-none mt-6 md:mt-10">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="pointer-events-auto"
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 mb-8 backdrop-blur-sm">
              <div className="w-2 h-2 rounded-full bg-[#f4d35e] animate-pulse" />
              <span className="text-[#f4d35e] text-xs font-bold tracking-widest uppercase">
                The Future of Local Audio
              </span>
            </div>

            <h1 className="text-5xl sm:text-6xl md:text-8xl font-bold leading-[1.05] mb-6 tracking-tight">
              Your Music.
              <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#f4d35e] via-[#ee964b] to-[#f4d35e] animate-gradient bg-[length:200%_auto]">
                Uncompromised.
              </span>
            </h1>

            <p className="text-base sm:text-lg md:text-xl text-zinc-300 mb-10 max-w-2xl mx-auto leading-relaxed font-light px-2">
              DiZC is the ultimate high-fidelity music player for your local collection.
              Bit-perfect playback, one-click CD ripping, and a stunning interface built for audiophiles
              who refuse to settle.
            </p>

            <div
              id="download"
              className="flex flex-col sm:flex-row gap-3 justify-center items-center mb-16 scroll-mt-24"
            >
              <a
                href="https://github.com/FelipeCantu/GhostAudio/releases/download/v0.2.0-beta/DiZC.Setup.0.2.0-beta.exe"
                download
                className="w-full sm:w-auto px-7 py-4 bg-white text-[#0d3b66] font-bold rounded-xl flex items-center justify-center gap-2 hover:bg-zinc-100 transition-transform hover:scale-105 shadow-xl shadow-white/10 min-h-[52px]"
              >
                <Download size={20} />
                Download for Windows
              </a>
              <Link
                href="/app"
                className="w-full sm:w-auto px-7 py-4 bg-white/10 backdrop-blur-md border border-white/10 text-white font-bold rounded-xl flex items-center justify-center gap-2 hover:bg-white/20 transition-transform hover:scale-105 min-h-[52px]"
              >
                <Globe size={20} />
                Open Web Player
              </Link>
            </div>

            {/* Social proof pill */}
            <div className="flex items-center justify-center gap-1 text-zinc-500 text-xs">
              {[...Array(5)].map((_, i) => (
                <Star key={i} size={12} className="text-[#f4d35e] fill-[#f4d35e]" />
              ))}
              <span className="ml-2">Loved by audiophiles worldwide</span>
            </div>
          </motion.div>
        </div>

        {/* Product Showcase */}
        <div className="relative z-10 w-full mt-6">
          <ProductShowcase />
        </div>
      </section>

      {/* ── How It Works ── */}
      <HowItWorks />

      {/* ── Why DiZC / Value Prop ── */}
      <section id="why" className="py-24 relative z-10 scroll-mt-16">
        <div className="max-w-7xl mx-auto px-5">
          <div className="text-center mb-16">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
            >
              <p className="text-[#f4d35e] text-xs font-bold uppercase tracking-widest mb-3">
                Built Different
              </p>
              <h2 className="text-3xl md:text-5xl font-bold mb-4">
                Why DiZC over Spotify?
              </h2>
              <p className="text-zinc-400 max-w-2xl mx-auto text-sm md:text-base">
                Streaming services are convenient, but they own your music. DiZC gives it back to you —
                every bit, every beat, forever.
              </p>
            </motion.div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {whyReasons.map((reason, i) => {
              const Icon = reason.icon;
              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.08 }}
                  className="group p-6 rounded-2xl bg-white/5 border border-white/5 hover:border-[#f4d35e]/30 hover:bg-white/8 transition-all duration-300"
                >
                  <div className="w-11 h-11 rounded-xl bg-[#f4d35e]/10 flex items-center justify-center mb-4 group-hover:bg-[#f4d35e] transition-colors duration-300">
                    <Icon
                      size={22}
                      className="text-[#f4d35e] group-hover:text-[#0d3b66] transition-colors duration-300"
                    />
                  </div>
                  <h3 className="font-bold text-white mb-2 text-base">{reason.title}</h3>
                  <p className="text-zinc-400 text-sm leading-relaxed">{reason.desc}</p>
                </motion.div>
              );
            })}
          </div>

          {/* Comparison callout */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mt-12 p-6 md:p-8 rounded-3xl bg-gradient-to-r from-[#f4d35e]/5 to-[#ee964b]/5 border border-[#f4d35e]/15"
          >
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-center">
              {[
                { label: "Monthly cost", dizc: "Free", spotify: "$11.99/mo" },
                { label: "Audio quality", dizc: "Lossless (FLAC)", spotify: "Up to 320kbps" },
                { label: "You own the music", dizc: "Always", spotify: "Never" },
              ].map((row, i) => (
                <div key={i} className="space-y-3">
                  <p className="text-xs font-bold uppercase tracking-widest text-zinc-500">
                    {row.label}
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 rounded-xl bg-[#f4d35e]/10 border border-[#f4d35e]/20">
                      <p className="text-xs text-zinc-500 mb-1">DiZC</p>
                      <p className="font-bold text-[#f4d35e] text-sm">{row.dizc}</p>
                    </div>
                    <div className="p-3 rounded-xl bg-black/20 border border-white/5">
                      <p className="text-xs text-zinc-500 mb-1">Spotify</p>
                      <p className="font-medium text-zinc-400 text-sm">{row.spotify}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── Bento Grid Features ── */}
      <BentoGrid />

      {/* ── Testimonials ── */}
      <section className="py-24 relative z-10 bg-black/10">
        <div className="max-w-7xl mx-auto px-5">
          <div className="text-center mb-16">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
            >
              <p className="text-[#f4d35e] text-xs font-bold uppercase tracking-widest mb-3">
                Community
              </p>
              <h2 className="text-3xl md:text-5xl font-bold">
                Audiophiles love DiZC
              </h2>
            </motion.div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {testimonials.map((t, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="p-6 rounded-2xl bg-white/5 border border-white/5 flex flex-col gap-4"
              >
                <div className="flex gap-0.5">
                  {[...Array(t.stars)].map((_, si) => (
                    <Star key={si} size={14} className="text-[#f4d35e] fill-[#f4d35e]" />
                  ))}
                </div>
                <p className="text-zinc-300 text-sm leading-relaxed flex-1">
                  &ldquo;{t.quote}&rdquo;
                </p>
                <div>
                  <p className="font-semibold text-white text-sm">{t.name}</p>
                  <p className="text-zinc-500 text-xs">{t.handle}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA Banner ── */}
      <section className="py-20 relative z-10">
        <div className="max-w-4xl mx-auto px-5 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="p-8 md:p-14 rounded-3xl bg-gradient-to-br from-[#f4d35e]/10 via-transparent to-[#ee964b]/10 border border-[#f4d35e]/15 relative overflow-hidden"
          >
            {/* Decorative disc */}
            <div className="absolute -top-20 -right-20 opacity-5 animate-[spin_20s_linear_infinite] pointer-events-none">
              <Disc size={320} />
            </div>
            <Disc size={48} className="text-[#f4d35e] mx-auto mb-6 animate-[spin_10s_linear_infinite]" />
            <h2 className="text-3xl md:text-5xl font-bold mb-4 text-white">
              Ready to take back
              <br />
              your music?
            </h2>
            <p className="text-zinc-400 mb-8 max-w-lg mx-auto text-sm md:text-base">
              Download DiZC for free and start building a library that lasts forever.
              No subscription. No ads. No compromise.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <a
                href="https://github.com/FelipeCantu/GhostAudio/releases/download/v0.2.0-beta/DiZC.Setup.0.2.0-beta.exe"
                download
                className="px-8 py-4 bg-[#f4d35e] text-[#0d3b66] font-bold rounded-xl flex items-center justify-center gap-2 hover:bg-[#ffd700] transition-all hover:scale-105 shadow-lg shadow-[#f4d35e]/20 min-h-[52px]"
              >
                <Download size={20} />
                Download Free — Windows
              </a>
              <Link
                href="/app"
                className="px-8 py-4 bg-white/10 border border-white/10 text-white font-bold rounded-xl flex items-center justify-center gap-2 hover:bg-white/20 transition-all hover:scale-105 min-h-[52px]"
              >
                Try Web Player
              </Link>
            </div>
            <p className="text-zinc-600 text-xs mt-6">
              Free forever &middot; No account required for desktop &middot; Open source
            </p>
          </motion.div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section id="faq" className="py-24 relative z-10 scroll-mt-16">
        <div className="max-w-3xl mx-auto px-5">
          <div className="text-center mb-12">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
            >
              <p className="text-[#f4d35e] text-xs font-bold uppercase tracking-widest mb-3">FAQ</p>
              <h2 className="text-3xl md:text-4xl font-bold">Common Questions</h2>
            </motion.div>
          </div>
          <div className="space-y-3">
            {faqs.map((faq, i) => (
              <FAQItem key={i} q={faq.q} a={faq.a} />
            ))}
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-white/5 bg-[#0b1622] relative z-20">
        <div className="max-w-7xl mx-auto px-5 py-12">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-10 mb-10">
            {/* Brand */}
            <div className="md:col-span-1">
              <div className="flex items-center gap-2 mb-4">
                <Disc className="text-[#f4d35e]" size={22} />
                <span className="font-bold text-white text-lg">DiZC</span>
              </div>
              <p className="text-zinc-500 text-sm leading-relaxed">
                The Future of Local Audio. Built for audiophiles who demand control.
              </p>
              <div className="flex items-center gap-3 mt-5">
                <a
                  href="#"
                  aria-label="GitHub"
                  className="p-2 rounded-lg bg-white/5 text-zinc-400 hover:text-white hover:bg-white/10 transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center"
                >
                  <Github size={17} />
                </a>
                <a
                  href="#"
                  aria-label="Twitter"
                  className="p-2 rounded-lg bg-white/5 text-zinc-400 hover:text-white hover:bg-white/10 transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center"
                >
                  <Twitter size={17} />
                </a>
                <a
                  href="#"
                  aria-label="Discord"
                  className="p-2 rounded-lg bg-white/5 text-zinc-400 hover:text-white hover:bg-white/10 transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center"
                >
                  <Radio size={17} />
                </a>
              </div>
            </div>

            {/* Product */}
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-zinc-500 mb-4">Product</p>
              <ul className="space-y-3">
                {[
                  { label: "Features", href: "#features" },
                  { label: "How It Works", href: "#how-it-works" },
                  { label: "Download", href: "#download" },
                  { label: "Web Player", href: "/app" },
                ].map((l) => (
                  <li key={l.label}>
                    <Link
                      href={l.href}
                      className="text-sm text-zinc-400 hover:text-white transition-colors"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* Community */}
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-zinc-500 mb-4">Community</p>
              <ul className="space-y-3">
                {[
                  { label: "GitHub", href: "#" },
                  { label: "Discord", href: "#" },
                  { label: "Twitter", href: "#" },
                  { label: "Changelog", href: "#" },
                ].map((l) => (
                  <li key={l.label}>
                    <a
                      href={l.href}
                      className="text-sm text-zinc-400 hover:text-white transition-colors"
                    >
                      {l.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            {/* Legal */}
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-zinc-500 mb-4">Legal</p>
              <ul className="space-y-3">
                {[
                  { label: "Privacy Policy", href: "#" },
                  { label: "Terms of Service", href: "#" },
                  { label: "Open Source", href: "#" },
                ].map((l) => (
                  <li key={l.label}>
                    <a
                      href={l.href}
                      className="text-sm text-zinc-400 hover:text-white transition-colors"
                    >
                      {l.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="border-t border-white/5 pt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-zinc-600 text-xs">
            <p>© {new Date().getFullYear()} GhostRepo / DiZC. All rights reserved.</p>
            <p>Made with care for music lovers everywhere.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
