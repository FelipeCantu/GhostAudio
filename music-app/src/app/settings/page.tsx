"use client";

import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/services/api";
import { motion } from "framer-motion";
import { useState } from "react";
import Link from "next/link";
import {
  User,
  Shield,
  HardDrive,
  LogOut,
  CloudUpload,
  CheckCircle2,
  Loader2,
  Database,
  RefreshCw,
} from "lucide-react";
import StorageBar from "@/components/StorageBar";
import { useQuota } from "@/context/QuotaContext";

interface SettingRowProps {
  label: string;
  description: string;
  children: React.ReactNode;
}

function SettingRow({ label, description, children }: SettingRowProps) {
  return (
    <div className="flex items-center justify-between gap-4 p-4 md:p-5 rounded-2xl bg-black/20 min-h-[64px]">
      <div className="flex-1 min-w-0">
        <p className="text-white font-semibold text-sm">{label}</p>
        <p className="text-xs text-zinc-500 mt-0.5 leading-relaxed">{description}</p>
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  );
}

function SectionCard({
  icon: Icon,
  title,
  iconColor = "text-[#f4d35e]",
  action,
  children,
  className = "",
}: {
  icon: React.ElementType;
  title: string;
  iconColor?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`bg-white/4 border border-white/6 rounded-3xl p-5 md:p-7 ${className}`}>
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-base font-bold text-white flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-white/8 flex items-center justify-center">
            <Icon size={16} className={iconColor} />
          </div>
          {title}
        </h2>
        {action}
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

export default function SettingsPage() {
  const { user, logout, token } = useAuth();
  const { refetch: refetchQuota } = useQuota();
  const [migrateStatus, setMigrateStatus] = useState<string | null>(null);
  const [migrating, setMigrating] = useState(false);
  const [migrateSuccess, setMigrateSuccess] = useState(false);
  const [recalculating, setRecalculating] = useState(false);

  const handleMigrateToR2 = async () => {
    if (!api.isElectron()) return;
    setMigrating(true);
    setMigrateSuccess(false);
    setMigrateStatus("Uploading local tracks to cloud...");
    try {
      const result = await (window as any).electronAPI.invoke("migrate-local-to-r2", {
        mongoUserId: user?.id,
      });
      if (result.error) {
        setMigrateStatus(`Error: ${result.error}`);
      } else {
        setMigrateStatus(`Done! ${result.patched} track(s) uploaded to cloud.`);
        setMigrateSuccess(true);
      }
    } catch (e: any) {
      setMigrateStatus(`Failed: ${e.message}`);
    } finally {
      setMigrating(false);
    }
  };

  const handleRecalculateStorage = async () => {
    if (!token) return;
    setRecalculating(true);
    const BACKEND = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    try {
      const res = await fetch(`${BACKEND}/api/mongo/storage-recalculate/`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      refetchQuota();
    } catch (e: any) {
      console.error("Storage recalculate failed:", e.message);
    } finally {
      setRecalculating(false);
    }
  };

  return (
    <DashboardLayout>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45 }}
        className="max-w-2xl mx-auto space-y-5"
      >
        {/* Page Header */}
        <div className="mb-2">
          <h1 className="text-2xl md:text-3xl font-bold text-white">Settings</h1>
          <p className="text-zinc-500 text-sm mt-1">Manage your account and preferences.</p>
        </div>

        {/* Profile Section */}
        <SectionCard icon={User} title="Profile">
          <div className="flex items-center gap-4 p-4 md:p-5 rounded-2xl bg-black/20">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#f4d35e] to-[#ee964b] flex items-center justify-center text-[#0d3b66] text-2xl font-bold shadow-lg flex-shrink-0">
              {user?.username?.charAt(0).toUpperCase() ?? "U"}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xl font-bold text-white truncate">
                {user?.username ?? "Ghost User"}
              </p>
              <div className="flex items-center gap-2 mt-1">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#f4d35e]/15 border border-[#f4d35e]/25 text-[#f4d35e] text-[10px] font-bold uppercase tracking-wider">
                  <CheckCircle2 size={10} />
                  Melophile · Gold
                </span>
              </div>
            </div>
          </div>
        </SectionCard>

        {/* System Preferences */}
        <SectionCard icon={HardDrive} title="System Preferences">
          <SettingRow
            label="Dark Mode"
            description="The only way to listen. Always enabled."
          >
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#f4d35e]/12 border border-[#f4d35e]/20 text-[#f4d35e] text-[10px] font-bold uppercase tracking-wider">
              Always On
            </span>
          </SettingRow>

          <SettingRow
            label="Default Audio Quality"
            description="Format used when ripping CDs."
          >
            <select
              className="bg-black/50 border border-white/10 text-zinc-300 text-sm rounded-xl px-3 py-2 outline-none focus:border-[#f4d35e]/50 focus:ring-1 focus:ring-[#f4d35e]/30 transition-all cursor-pointer min-h-[40px]"
              defaultValue="flac"
            >
              <option value="flac">FLAC (Lossless)</option>
              <option value="mp3">MP3 (320kbps)</option>
              <option value="wav">WAV (Uncompressed)</option>
            </select>
          </SettingRow>

          <SettingRow
            label="Crossfade"
            description="Smooth transitions between tracks."
          >
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/6 border border-white/8 text-zinc-500 text-[10px] font-bold uppercase tracking-wider">
              Coming Soon
            </span>
          </SettingRow>
        </SectionCard>

        {/* Storage */}
        <SectionCard
          icon={Database}
          title="Storage"
          action={
            <button
              onClick={handleRecalculateStorage}
              disabled={recalculating}
              title="Refresh storage usage"
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/8 border border-white/8 transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-xs"
            >
              <RefreshCw size={12} className={recalculating ? "animate-spin" : ""} />
              Refresh
            </button>
          }
        >
          <div className="p-4 md:p-5 rounded-2xl bg-black/20">
            <StorageBar variant="full" />
          </div>
          <div className="px-1 pt-1">
            <Link
              href="/upgrade"
              className="text-[#f4d35e] text-xs font-medium hover:text-[#f0cc44] transition-colors"
            >
              View upgrade options →
            </Link>
          </div>
        </SectionCard>

        {/* Cloud Sync — Desktop only */}
        {api.isElectron() && (
          <SectionCard icon={CloudUpload} title="Cloud Sync">
            <SettingRow
              label="Upload Local Tracks to Cloud"
              description="Sync tracks imported before cloud support so they play on the web player."
            >
              <button
                onClick={handleMigrateToR2}
                disabled={migrating}
                className="flex items-center gap-2 px-4 py-2.5 bg-[#f4d35e]/10 hover:bg-[#f4d35e]/20 text-[#f4d35e] rounded-xl border border-[#f4d35e]/20 transition-colors text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
              >
                {migrating ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : migrateSuccess ? (
                  <CheckCircle2 size={15} />
                ) : (
                  <CloudUpload size={15} />
                )}
                {migrating ? "Uploading..." : "Sync Now"}
              </button>
            </SettingRow>
            {migrateStatus && (
              <div
                className={`mt-2 px-4 py-3 rounded-xl text-xs font-medium ${
                  migrateSuccess
                    ? "bg-green-500/10 border border-green-500/20 text-green-300"
                    : migrating
                    ? "bg-[#f4d35e]/8 border border-[#f4d35e]/15 text-[#f4d35e]"
                    : "bg-red-500/10 border border-red-500/20 text-red-300"
                }`}
              >
                {migrateStatus}
              </div>
            )}
          </SectionCard>
        )}

        {/* Account Actions */}
        <div className="bg-red-500/5 border border-red-500/10 rounded-3xl p-5 md:p-7">
          <h2 className="text-base font-bold text-red-400 mb-5 flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-red-500/10 flex items-center justify-center">
              <Shield size={16} className="text-red-400" />
            </div>
            Account Actions
          </h2>
          <div className="space-y-3">
            <SettingRow
              label="Sign Out"
              description="End your current session on this device."
            >
              <button
                onClick={() => logout()}
                className="flex items-center gap-2 px-4 py-2.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-xl border border-red-500/20 transition-colors text-sm font-semibold min-h-[44px]"
              >
                <LogOut size={15} />
                Sign Out
              </button>
            </SettingRow>
          </div>
        </div>

        {/* App Info */}
        <div className="text-center py-4 text-zinc-700 text-xs space-y-1">
          <p>DiZC · The Future of Local Audio</p>
          <p>Built with love for audiophiles everywhere.</p>
        </div>
      </motion.div>
    </DashboardLayout>
  );
}
