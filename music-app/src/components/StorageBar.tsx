"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { motion } from "framer-motion";
import { Zap } from "lucide-react";
import Link from "next/link";

const BACKEND = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface QuotaData {
  plan: "free" | "personal" | "lifetime";
  storage_used_bytes: number;
  storage_limit_bytes: number;
  storage_used_gb: number;
  storage_limit_gb: number;
  percent_used: number;
}

type StorageBarVariant = "full" | "compact";

interface StorageBarProps {
  variant?: StorageBarVariant;
}

function barColor(pct: number): string {
  if (pct > 95) return "#ef4444";
  if (pct > 80) return "#ee964b";
  return "#f4d35e";
}

const PLAN_LABELS: Record<QuotaData["plan"], string> = {
  free: "FREE",
  personal: "PERSONAL",
  lifetime: "LIFETIME",
};

const PLAN_STYLES: Record<QuotaData["plan"], string> = {
  free: "bg-zinc-500/15 border-zinc-500/25 text-zinc-400",
  personal: "bg-[#f4d35e]/15 border-[#f4d35e]/25 text-[#f4d35e]",
  lifetime: "bg-[#ee964b]/15 border-[#ee964b]/30 text-[#ee964b]",
};

// ─── Full variant (settings page) ────────────────────────────────────────────

function StorageBarFull({ data }: { data: QuotaData }) {
  const color = barColor(data.percent_used);
  const pct = Math.min(data.percent_used, 100);
  const isFree = data.plan === "free";

  return (
    <div className="space-y-4">
      {/* Plan badge + upgrade row */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-bold uppercase tracking-wider ${PLAN_STYLES[data.plan]}`}
          >
            {PLAN_LABELS[data.plan]}
          </span>
          <span className="text-zinc-500 text-xs">plan</span>
        </div>

        {isFree && (
          <Link
            href="/upgrade"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#f4d35e]/10 hover:bg-[#f4d35e]/20 border border-[#f4d35e]/20 text-[#f4d35e] rounded-xl text-xs font-semibold transition-colors min-h-[32px]"
          >
            <Zap size={12} />
            Upgrade Plan
          </Link>
        )}
      </div>

      {/* Usage text */}
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-white font-semibold text-sm">
          {data.storage_used_gb.toFixed(2)}{" "}
          <span className="text-zinc-400 font-normal">GB used</span>
        </span>
        <span className="text-zinc-500 text-xs">
          of {data.storage_limit_gb.toFixed(0)} GB
        </span>
      </div>

      {/* Progress track */}
      <div className="relative h-2 w-full rounded-full bg-white/6 overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="absolute inset-y-0 left-0 rounded-full"
          style={{ backgroundColor: color }}
        />
        {/* Subtle shimmer on the filled portion */}
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="absolute inset-y-0 left-0 rounded-full"
          style={{
            background:
              "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.15) 50%, transparent 100%)",
          }}
        />
      </div>

      {/* Percentage */}
      <p
        className="text-[11px] font-medium"
        style={{ color }}
      >
        {pct.toFixed(1)}% used
        {pct > 80 && pct <= 95 && (
          <span className="text-zinc-500 font-normal"> · Storage filling up</span>
        )}
        {pct > 95 && (
          <span className="text-red-400 font-normal"> · Almost full</span>
        )}
      </p>
    </div>
  );
}

// ─── Compact variant (sidebar) ────────────────────────────────────────────────

function StorageBarCompact({ data }: { data: QuotaData }) {
  const color = barColor(data.percent_used);
  const pct = Math.min(data.percent_used, 100);

  return (
    <div className="space-y-1.5">
      {/* Track */}
      <div className="relative h-1 w-full rounded-full bg-white/8 overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="absolute inset-y-0 left-0 rounded-full"
          style={{ backgroundColor: color }}
        />
      </div>

      {/* Text row */}
      <div className="flex items-center justify-between gap-1">
        <span className="text-[10px] text-zinc-500 leading-none">
          {data.storage_used_gb.toFixed(1)} / {data.storage_limit_gb.toFixed(0)} GB
        </span>
        <span
          className="text-[10px] font-bold uppercase tracking-wider leading-none"
          style={{ color }}
        >
          {PLAN_LABELS[data.plan]}
        </span>
      </div>
    </div>
  );
}

// ─── Skeletons ────────────────────────────────────────────────────────────────

function SkeletonFull() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="h-5 w-20 rounded-full bg-white/6" />
        <div className="h-7 w-24 rounded-xl bg-white/6" />
      </div>
      <div className="flex items-baseline justify-between">
        <div className="h-4 w-28 rounded-md bg-white/6" />
        <div className="h-3 w-16 rounded-md bg-white/6" />
      </div>
      <div className="h-2 w-full rounded-full bg-white/6" />
      <div className="h-3 w-16 rounded-md bg-white/6" />
    </div>
  );
}

function SkeletonCompact() {
  return (
    <div className="space-y-1.5 animate-pulse">
      <div className="h-1 w-full rounded-full bg-white/8" />
      <div className="flex items-center justify-between">
        <div className="h-2.5 w-16 rounded-sm bg-white/6" />
        <div className="h-2.5 w-12 rounded-sm bg-white/6" />
      </div>
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export default function StorageBar({ variant = "full" }: StorageBarProps) {
  const { token, isAuthenticated } = useAuth();
  const [data, setData] = useState<QuotaData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!isAuthenticated || !token) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    const fetchQuota = async () => {
      try {
        const res = await fetch(`${BACKEND}/api/mongo/quota/`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json: QuotaData = await res.json();
        if (!cancelled) {
          setData(json);
          setError(false);
        }
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchQuota();
    return () => {
      cancelled = true;
    };
  }, [token, isAuthenticated]);

  // Not authenticated — render nothing
  if (!isAuthenticated) return null;

  // Error — silently hide (don't break the layout)
  if (error) return null;

  if (variant === "compact") {
    if (loading) return <SkeletonCompact />;
    if (!data) return null;
    return <StorageBarCompact data={data} />;
  }

  // variant === "full"
  if (loading) return <SkeletonFull />;
  if (!data) return null;
  return <StorageBarFull data={data} />;
}
