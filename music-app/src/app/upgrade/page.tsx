"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Loader2,
  CheckCircle2,
  ArrowRight,
  Zap,
  Crown,
  Star,
} from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/context/AuthContext";

const BACKEND = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type Plan = "free" | "personal" | "lifetime";

interface PaymentStatus {
  plan: Plan;
  upgraded_at: string | null;
}

const PLAN_CONFIG: Record<
  Plan,
  {
    label: string;
    badgeClass: string;
    accentColor: string;
    icon: React.ComponentType<{ size?: number; className?: string; style?: React.CSSProperties }>;
    includedFeatures: string[];
  }
> = {
  free: {
    label: "Free",
    badgeClass: "bg-zinc-500/15 border-zinc-500/25 text-zinc-400",
    accentColor: "#71717a",
    icon: Star,
    includedFeatures: [
      "Web player",
      "5 GB storage",
      "Up to 200 tracks",
      "Smart playlists",
    ],
  },
  personal: {
    label: "Personal",
    badgeClass: "bg-[#f4d35e]/15 border-[#f4d35e]/25 text-[#f4d35e]",
    accentColor: "#f4d35e",
    icon: Zap,
    includedFeatures: [
      "Desktop app",
      "100 GB storage",
      "Unlimited tracks",
      "CD ripping",
      "Cloud sync",
      "Smart playlists",
    ],
  },
  lifetime: {
    label: "Lifetime",
    badgeClass: "bg-[#ee964b]/15 border-[#ee964b]/30 text-[#ee964b]",
    accentColor: "#ee964b",
    icon: Crown,
    includedFeatures: [
      "Everything in Personal",
      "200 GB storage",
      "All future updates",
      "Priority support",
    ],
  },
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function UpgradePageContent() {
  const { token, isAuthenticated, isLoading: authLoading } = useAuth();

  const [status, setStatus] = useState<PaymentStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);

  useEffect(() => {
    if (!isAuthenticated || !token) {
      setStatusLoading(false);
      return;
    }
    let aborted = false;
    const fetchStatus = async () => {
      try {
        const res = await fetch(`${BACKEND}/api/mongo/payments/status/`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json: PaymentStatus = await res.json();
        if (!aborted) setStatus(json);
      } catch {
        // default to free
      } finally {
        if (!aborted) setStatusLoading(false);
      }
    };
    fetchStatus();
    return () => {
      aborted = true;
    };
  }, [token, isAuthenticated]);

  if (authLoading || statusLoading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 size={22} className="animate-spin text-zinc-600" />
      </div>
    );
  }

  const plan: Plan = status?.plan ?? "free";
  const config = PLAN_CONFIG[plan];
  const PlanIcon = config.icon;
  const isFree = plan === "free";

  return (
    <div className="max-w-2xl mx-auto space-y-6 py-2">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">Your Plan</h1>
        <p className="text-zinc-500 text-sm mt-1">Manage your DiZC subscription.</p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.05 }}
        className="rounded-3xl border bg-white/3 p-6 md:p-8 space-y-6"
        style={{ borderColor: `${config.accentColor}30` }}
      >
        <div className="flex items-center gap-4">
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
            style={{
              backgroundColor: `${config.accentColor}18`,
              border: `1px solid ${config.accentColor}30`,
            }}
          >
            <PlanIcon size={22} style={{ color: config.accentColor }} />
          </div>
          <div>
            <span
              className={`inline-flex items-center px-2.5 py-1 rounded-full border text-[10px] font-bold uppercase tracking-wider ${config.badgeClass}`}
            >
              {config.label}
            </span>
            <p className="text-white font-semibold mt-1 text-lg">
              {isFree ? "Free Plan" : `${config.label} Plan`}
            </p>
            {!isFree && status?.upgraded_at && (
              <p className="text-zinc-500 text-xs mt-0.5">
                Purchased {formatDate(status.upgraded_at)}
              </p>
            )}
          </div>
        </div>

        <div>
          <p className="text-zinc-500 text-xs font-semibold uppercase tracking-wider mb-3">
            What&apos;s included
          </p>
          <ul className="space-y-2">
            {config.includedFeatures.map((feature) => (
              <li key={feature} className="flex items-center gap-2.5 text-sm text-zinc-300">
                <CheckCircle2
                  size={14}
                  className="flex-shrink-0"
                  style={{ color: config.accentColor }}
                />
                <span>{feature}</span>
              </li>
            ))}
          </ul>
        </div>

        {isFree ? (
          <div className="pt-2 border-t border-white/6 flex flex-col sm:flex-row items-start sm:items-center gap-3 justify-between">
            <p className="text-zinc-500 text-sm">
              Unlock the full DiZC experience with a one-time upgrade.
            </p>
            <Link
              href="/pricing"
              className="flex-shrink-0 flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-[#f4d35e] hover:bg-[#f0cc44] text-[#1a1400] text-sm font-bold transition-all shadow-[0_2px_16px_rgba(244,211,94,0.25)] hover:shadow-[0_2px_24px_rgba(244,211,94,0.4)] active:scale-[0.98] min-h-[44px] whitespace-nowrap"
            >
              View Pricing &amp; Upgrade
              <ArrowRight size={15} />
            </Link>
          </div>
        ) : (
          <div className="pt-2 border-t border-white/6">
            <p className="text-zinc-400 text-sm">
              You have lifetime access to all {config.label} features.{" "}
              {plan === "personal" && (
                <Link href="/pricing" className="text-[#f4d35e] hover:underline">
                  Upgrade to Lifetime
                </Link>
              )}
            </p>
          </div>
        )}
      </motion.div>
    </div>
  );
}

export default function UpgradePage() {
  return (
    <DashboardLayout>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
        className="px-0 py-4 md:py-6"
      >
        <Suspense
          fallback={
            <div className="flex items-center justify-center py-32">
              <Loader2 size={22} className="animate-spin text-zinc-600" />
            </div>
          }
        >
          <UpgradePageContent />
        </Suspense>
      </motion.div>
    </DashboardLayout>
  );
}
