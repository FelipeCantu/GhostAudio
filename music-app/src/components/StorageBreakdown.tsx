"use client";

import { motion } from "framer-motion";
import { Music, Image } from "lucide-react";
import type { BreakdownData } from "@/context/QuotaContext";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 MB";
  if (bytes < 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  if (bytes < 1_073_741_824) return `${(bytes / 1_048_576).toFixed(0)} MB`;
  return `${(bytes / 1_073_741_824).toFixed(2)} GB`;
}

interface RowProps {
  icon: React.ReactNode;
  label: string;
  bytes: number;
  totalBytes: number;
  color: string;
}

function BreakdownRow({ icon, label, bytes, totalBytes, color }: RowProps) {
  const pct = totalBytes > 0 ? Math.min((bytes / totalBytes) * 100, 100) : 0;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-zinc-400">
          {icon}
          <span className="text-xs">{label}</span>
        </div>
        <span className="text-xs text-zinc-300 font-medium tabular-nums">
          {formatBytes(bytes)}
        </span>
      </div>
      <div className="relative h-1 w-full rounded-full bg-white/6 overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="absolute inset-y-0 left-0 rounded-full"
          style={{ backgroundColor: color }}
        />
      </div>
    </div>
  );
}

export default function StorageBreakdown({ breakdown }: { breakdown: BreakdownData }) {
  const totalBytes = breakdown.audio_bytes + breakdown.cover_art_bytes;

  return (
    <div className="space-y-3 pt-2 border-t border-white/6">
      <BreakdownRow
        icon={<Music size={11} />}
        label="Audio files"
        bytes={breakdown.audio_bytes}
        totalBytes={totalBytes}
        color="#f4d35e"
      />
      <BreakdownRow
        icon={<Image size={11} />}
        label="Cover art"
        bytes={breakdown.cover_art_bytes}
        totalBytes={totalBytes}
        color="#ee964b"
      />
      <p className="text-[10px] text-zinc-600 pt-0.5">
        {breakdown.track_count} track{breakdown.track_count !== 1 ? "s" : ""} across{" "}
        {breakdown.album_count} album{breakdown.album_count !== 1 ? "s" : ""}
      </p>
    </div>
  );
}
