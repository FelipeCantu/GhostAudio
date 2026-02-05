"use client";

import { motion } from "framer-motion";
import { Music, Shield, Zap, Layers, Cpu, Globe } from "lucide-react";

const features = [
    {
        title: "Bit-Perfect Audio",
        desc: "Experience your music exactly as the artist intended. No compression, no compromise.",
        icon: Music,
        className: "md:col-span-2",
        bg: "bg-gradient-to-br from-[#f4d35e]/10 to-[#ee964b]/10",
    },
    {
        title: "Local First Privacy",
        desc: "Your library belongs to you. Zero tracking, offline-ready, and 100% private.",
        icon: Shield,
        className: "md:col-span-1",
        bg: "bg-white/5",
    },
    {
        title: "Instant One-Click Ripping",
        desc: "Preserve your physical collection with our high-fidelity CD ripping engine.",
        icon: Layers,
        className: "md:col-span-1",
        bg: "bg-white/5",
    },
    {
        title: "Blazing Fast Performance",
        desc: "Built on Electron & Next.js to handle libraries of 100,000+ tracks without stuttering.",
        icon: Zap,
        className: "md:col-span-2",
        bg: "bg-gradient-to-br from-[#0d3b66]/20 to-[#f4d35e]/10",
    },
];

export function BentoGrid() {
    return (
        <section id="features" className="py-24 relative z-10">
            <div className="max-w-7xl mx-auto px-6">
                <div className="text-center mb-16">
                    <motion.h2
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="text-3xl md:text-5xl font-bold mb-4"
                    >
                        Why DiZC?
                    </motion.h2>
                    <p className="text-zinc-400 max-w-2xl mx-auto">
                        Engineered for audiophiles who demand control, quality, and speed.
                    </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {features.map((feature, i) => (
                        <motion.div
                            key={i}
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: i * 0.1 }}
                            whileHover={{ scale: 1.02 }}
                            className={`p-8 rounded-3xl border border-white/5 backdrop-blur-sm hover:border-[#f4d35e]/30 transition-all group ${feature.className} ${feature.bg}`}
                        >
                            <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center mb-6 group-hover:bg-[#f4d35e] group-hover:text-[#0d3b66] transition-colors">
                                <feature.icon size={24} />
                            </div>
                            <h3 className="text-xl font-bold mb-3 text-white group-hover:text-[#f4d35e] transition-colors">
                                {feature.title}
                            </h3>
                            <p className="text-zinc-400 leading-relaxed">
                                {feature.desc}
                            </p>
                        </motion.div>
                    ))}
                </div>
            </div>
        </section>
    );
}
