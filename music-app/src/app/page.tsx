"use client";

import CDImporter from "@/components/CDImporter";
import { motion } from "framer-motion";

import Image from "next/image";

export default function Home() {
  return (
    <div className="relative min-h-screen w-full flex flex-col items-center justify-center overflow-hidden bg-background text-foreground selection:bg-primary/20">
      {/* Dynamic Background */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40vw] h-[40vw] rounded-full bg-blue-600/10 blur-[100px] animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40vw] h-[40vw] rounded-full bg-purple-600/10 blur-[100px] animate-pulse delay-700" />
      </div>

      <main className="z-10 w-full max-w-4xl px-6 flex flex-col items-center gap-12">
        {/* Hero Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="text-center space-y-4 flex flex-col items-center"
        >
          <div className="relative w-full max-w-[500px]">
            <Image
              src="/logo.png"
              alt="DiZC Logo"
              width={600}
              height={200}
              priority
              className="w-full h-auto drop-shadow-2xl"
            />
          </div>
          <p className="text-lg md:text-xl text-muted-foreground max-w-lg mx-auto leading-relaxed">
            Your personal high-fidelity music manager.
            <br />
            <span className="text-sm opacity-70">Experience your collection like never before.</span>
          </p>
        </motion.div>

        {/* Importer Section */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, delay: 0.2, ease: "easeOut" }}
          className="w-full"
        >
          <CDImporter />
        </motion.div>
      </main>

      {/* Footer / Info */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1, duration: 1 }}
        className="absolute bottom-6 text-xs text-muted-foreground/50 tracking-widest uppercase"
      >
        System Ready • v0.1.0
      </motion.div>
    </div>
  );
}
