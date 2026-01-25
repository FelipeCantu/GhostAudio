"use client";

import DashboardLayout from "@/components/DashboardLayout";
import CDImporter from "@/components/CDImporter";
import { motion } from "framer-motion";

export default function ImportPage() {
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
                    <p className="text-zinc-400">Rip CDs/DVDs directly to your library.</p>
                </div>

                <div className="bg-white/5 border border-white/10 rounded-3xl p-4 md:p-8 backdrop-blur-sm shadow-xl">
                    <CDImporter />
                </div>
            </motion.div>
        </DashboardLayout>
    );
}
