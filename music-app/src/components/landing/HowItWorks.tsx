"use client";

import { motion } from "framer-motion";
import { Disc, Download, Globe, Music } from "lucide-react";

const steps = [
    {
        title: "Download DiZC",
        desc: "Get the lightweight Electron app for Windows. Safe, signed, and ready to rip.",
        icon: Download,
    },
    {
        title: "Rip Your Collection",
        desc: "Insert a CD. DiZC automatically fetches metadata and rips to FLAC/MP3.",
        icon: Disc,
    },
    {
        title: "Enjoy Anywhere",
        desc: "Listen locally on your desktop or stream to any device via the web player.",
        icon: Globe,
    },
];

export function HowItWorks() {
    return (
        <section id="how-it-works" className="py-24 relative z-10 bg-[#0b1420]/50">
            <div className="max-w-7xl mx-auto px-6">
                <div className="text-center mb-16">
                    <motion.h2
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="text-3xl md:text-5xl font-bold mb-4"
                    >
                        How it Works
                    </motion.h2>
                    <p className="text-zinc-400 max-w-2xl mx-auto">
                        From physical media to digital freedom in three simple steps.
                    </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
                    {/* Connector Line (Desktop) */}
                    <div className="hidden md:block absolute top-12 left-[16%] right-[16%] h-0.5 bg-gradient-to-r from-transparent via-[#f4d35e]/30 to-transparent z-0" />

                    {steps.map((step, i) => (
                        <motion.div
                            key={i}
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: i * 0.2 }}
                            className="relative z-10 flex flex-col items-center text-center"
                        >
                            <div className="w-24 h-24 rounded-2xl bg-[#0d1b2a] border border-white/10 flex items-center justify-center mb-6 shadow-xl shadow-black/20 group hover:border-[#f4d35e] transition-colors">
                                <step.icon size={32} className="text-white group-hover:text-[#f4d35e] transition-colors" />
                            </div>
                            <h3 className="text-xl font-bold mb-3 text-white">
                                {step.title}
                            </h3>
                            <p className="text-zinc-400 leading-relaxed max-w-xs">
                                {step.desc}
                            </p>
                        </motion.div>
                    ))}
                </div>
            </div>
        </section>
    );
}
