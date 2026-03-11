"use client";

import { useAuth } from "@/context/AuthContext";
import { usePlaylist } from "@/context/PlaylistContext";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Image from "next/image";
import {
  Home,
  Disc,
  Library,
  LogOut,
  User,
  Settings as SettingsIcon,
  Plus,
  Music2,
  Zap,
  ChevronRight,
} from "lucide-react";
import {
  motion,
  AnimatePresence,
  useMotionValue,
  useTransform,
  PanInfo,
} from "framer-motion";
import PlaylistCoverArt from "@/components/PlaylistCoverArt";
import StorageBar from "@/components/StorageBar";

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

const navLinks = [
  { name: "Home", href: "/app", icon: Home },
  { name: "My Library", href: "/library", icon: Library },
  { name: "Import", href: "/import", icon: Disc },
  { name: "Settings", href: "/settings", icon: SettingsIcon },
];

// ─── Desktop Sidebar (unchanged) ────────────────────────────────────────────

interface DesktopSidebarContentProps {
  isOpen: boolean;
  onClose: () => void;
  user: ReturnType<typeof useAuth>["user"];
  logout: ReturnType<typeof useAuth>["logout"];
  playlists: ReturnType<typeof usePlaylist>["playlists"];
  pathname: string;
}

function DesktopSidebarContent({
  isOpen,
  onClose,
  user,
  logout,
  playlists,
  pathname,
}: DesktopSidebarContentProps) {
  const isActive = (path: string) => pathname === path;

  return (
    <motion.aside
      initial={false}
      animate={{ x: isOpen ? 0 : undefined }}
      className={[
        "h-screen w-64 flex flex-col fixed left-0 top-0 z-50",
        "bg-black/90 lg:bg-black/60 backdrop-blur-2xl",
        "border-r border-white/8 shadow-2xl",
        "transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]",
        "lg:translate-x-0",
        isOpen ? "translate-x-0" : "-translate-x-full",
        "pb-20",
      ].join(" ")}
      aria-label="Sidebar navigation"
    >
      {/* Logo */}
      <div className="pt-8 pb-4 flex justify-center flex-shrink-0">
        <div className="relative w-20 h-20 filter drop-shadow-[0_0_20px_rgba(244,211,94,0.15)] hover:scale-105 transition-transform duration-500">
          <Image
            src="/logo.png"
            alt="DiZC"
            fill
            className="object-contain"
            priority
          />
        </div>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 px-4 py-4 flex flex-col min-h-0" aria-label="Main navigation">
        <div className="space-y-1">
          {navLinks.map((link) => {
            const Icon = link.icon;
            const active = isActive(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={onClose}
                aria-current={active ? "page" : undefined}
                className={[
                  "flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group min-h-[48px]",
                  active
                    ? "bg-[#f4d35e]/12 text-[#f4d35e] border border-[#f4d35e]/20 shadow-[0_0_20px_rgba(244,211,94,0.08)]"
                    : "text-zinc-400 hover:text-white hover:bg-white/6",
                ].join(" ")}
              >
                <Icon
                  size={19}
                  strokeWidth={active ? 2.5 : 1.75}
                  className={active ? "text-[#f4d35e]" : "group-hover:text-white transition-colors"}
                />
                <span className={`font-medium text-sm ${active ? "font-semibold" : ""}`}>
                  {link.name}
                </span>
                {active && (
                  <div className="ml-auto w-1.5 h-1.5 rounded-full bg-[#f4d35e]" />
                )}
              </Link>
            );
          })}
        </div>

        {/* Playlists Section */}
        <div className="mt-5 border-t border-white/5 pt-5 flex flex-col min-h-0 flex-1">
          <div className="flex items-center justify-between mb-3 px-1">
            <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-500 flex items-center gap-1.5">
              <Music2 size={11} />
              Playlists
            </span>
            <Link
              href="/playlists/new"
              onClick={onClose}
              className="p-1.5 rounded-lg text-zinc-500 hover:text-[#f4d35e] hover:bg-[#f4d35e]/10 transition-colors min-w-[28px] min-h-[28px] flex items-center justify-center"
              title="New playlist"
              aria-label="Create new playlist"
            >
              <Plus size={15} />
            </Link>
          </div>

          <div className="overflow-y-auto flex-1 space-y-0.5 pr-1">
            {playlists.length === 0 ? (
              <p className="text-xs text-zinc-600 px-3 py-2 italic">No playlists yet.</p>
            ) : (
              playlists.map((pl) => {
                const active = pathname === `/playlists/${pl.id}`;
                return (
                  <Link
                    key={pl.id}
                    href={`/playlists/${pl.id}`}
                    prefetch={false}
                    onClick={onClose}
                    aria-current={active ? "page" : undefined}
                    className={[
                      "flex items-center gap-2.5 px-3 py-2.5 rounded-xl transition-all group min-h-[44px]",
                      active
                        ? "bg-[#f4d35e]/10 text-[#f4d35e]"
                        : "text-zinc-400 hover:text-white hover:bg-white/5",
                    ].join(" ")}
                  >
                    <PlaylistCoverArt coverArts={pl.cover_arts || []} size={30} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{pl.name}</p>
                      <p className="text-xs text-zinc-600 truncate">{pl.item_count} tracks</p>
                    </div>
                  </Link>
                );
              })
            )}
          </div>
        </div>
      </nav>

      {/* Upgrade nudge */}
      <div className="flex-shrink-0 px-5 pb-1">
        <Link
          href="/pricing"
          onClick={onClose}
          className="flex items-center gap-2 px-3 py-2 rounded-xl text-zinc-600 hover:text-[#f4d35e]/80 hover:bg-[#f4d35e]/6 transition-all group min-h-[36px]"
        >
          <Zap size={13} className="text-[#f4d35e]/50 group-hover:text-[#f4d35e]/70 flex-shrink-0 transition-colors" />
          <span className="text-xs font-medium">Upgrade Plan</span>
        </Link>
      </div>

      {/* Compact Storage Bar */}
      {user && (
        <div className="flex-shrink-0 px-4 pb-3">
          <StorageBar variant="compact" />
        </div>
      )}

      {/* User Profile Footer */}
      <div className="flex-shrink-0 p-4 border-t border-white/5">
        <Link
          href="/settings"
          onClick={onClose}
          className="bg-white/5 rounded-2xl p-3.5 flex items-center gap-3 border border-white/5 hover:border-white/10 hover:bg-white/8 transition-all group cursor-pointer min-h-[64px]"
        >
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#f4d35e] to-[#ee964b] flex items-center justify-center text-[#0d3b66] font-bold text-sm shadow-md flex-shrink-0 group-hover:scale-105 transition-transform">
            {user?.username?.charAt(0).toUpperCase() ?? <User size={16} />}
          </div>
          <div className="flex-1 overflow-hidden">
            <p className="text-sm font-semibold text-white truncate group-hover:text-[#f4d35e] transition-colors">
              {user?.username || "Ghost User"}
            </p>
            <p className="text-xs text-zinc-500 truncate">Melophile</p>
          </div>
          <div
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              logout();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                e.stopPropagation();
                logout();
              }
            }}
            className="p-2 rounded-lg hover:bg-red-500/15 text-zinc-500 hover:text-red-400 transition-colors flex-shrink-0 cursor-pointer min-w-[32px] min-h-[32px] flex items-center justify-center"
            title="Logout"
            aria-label="Logout"
          >
            <LogOut size={16} />
          </div>
        </Link>
      </div>
    </motion.aside>
  );
}

// ─── Mobile Bottom Sheet ─────────────────────────────────────────────────────

interface MobileSheetProps {
  onClose: () => void;
  user: ReturnType<typeof useAuth>["user"];
  logout: ReturnType<typeof useAuth>["logout"];
  playlists: ReturnType<typeof usePlaylist>["playlists"];
  pathname: string;
}

function MobileBottomSheet({
  onClose,
  user,
  logout,
  playlists,
  pathname,
}: MobileSheetProps) {
  const isActive = (path: string) => pathname === path;
  const dragY = useMotionValue(0);

  // Fade out slightly as user drags down
  const sheetOpacity = useTransform(dragY, [0, 200], [1, 0.6]);

  function handleDragEnd(_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) {
    if (info.offset.y > 80 || info.velocity.y > 400) {
      onClose();
    }
  }

  return (
    <>
      {/* Backdrop */}
      <motion.div
        key="mobile-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        onClick={onClose}
        className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40 lg:hidden"
        aria-hidden="true"
      />

      {/* Sheet */}
      <motion.div
        key="mobile-sheet"
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 30, stiffness: 300 }}
        style={{ opacity: sheetOpacity, y: dragY }}
        drag="y"
        dragConstraints={{ top: 0 }}
        dragElastic={{ top: 0, bottom: 0.3 }}
        onDragEnd={handleDragEnd}
        className={[
          "fixed inset-x-0 bottom-0 z-50 lg:hidden",
          "rounded-t-3xl bg-[#0f0f0f]",
          "border-t border-white/[0.07]",
          "shadow-[0_-8px_40px_rgba(0,0,0,0.7)]",
          "max-h-[88vh] flex flex-col",
          /* Push up above mobile bottom nav (64px) */
          "mb-16",
        ].join(" ")}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation menu"
      >
        {/* Drag handle */}
        <div className="flex-shrink-0 flex justify-center pt-3 pb-1 cursor-grab active:cursor-grabbing">
          <div className="w-10 h-1 rounded-full bg-white/20" />
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto overscroll-contain pb-6">

          {/* ── User Profile Row ── */}
          <div className="px-5 pt-4 pb-5">
            <div className="flex items-center gap-4">
              {/* Avatar */}
              <div className="relative flex-shrink-0">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#f4d35e] to-[#ee964b] flex items-center justify-center text-[#0d3b66] font-bold text-xl shadow-lg shadow-[#f4d35e]/10">
                  {user?.username?.charAt(0).toUpperCase() ?? <User size={22} />}
                </div>
                {/* Online indicator */}
                <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-emerald-400 border-2 border-[#0f0f0f]" />
              </div>

              {/* Name + plan */}
              <div className="flex-1 min-w-0">
                <p className="text-base font-bold text-white truncate leading-tight">
                  {user?.username || "Ghost User"}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#f4d35e]/12 border border-[#f4d35e]/20 text-[#f4d35e] text-[11px] font-semibold tracking-wide">
                    <Music2 size={9} />
                    Melophile
                  </span>
                </div>
              </div>

              {/* Logout button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  logout();
                }}
                className="flex-shrink-0 w-11 h-11 rounded-xl bg-white/5 hover:bg-red-500/15 border border-white/8 hover:border-red-500/20 flex items-center justify-center text-zinc-500 hover:text-red-400 transition-all active:scale-95"
                aria-label="Logout"
              >
                <LogOut size={17} />
              </button>
            </div>
          </div>

          {/* ── Divider ── */}
          <div className="mx-5 h-px bg-white/[0.05] mb-3" />

          {/* ── Nav Links ── */}
          <nav aria-label="Main navigation" className="px-3 space-y-1">
            {navLinks.map((link) => {
              const Icon = link.icon;
              const active = isActive(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={onClose}
                  aria-current={active ? "page" : undefined}
                  className={[
                    "relative flex items-center gap-4 px-4 py-4 rounded-2xl transition-all duration-150 min-h-[56px] overflow-hidden",
                    active
                      ? "bg-[#f4d35e]/10 text-[#f4d35e]"
                      : "text-zinc-400 active:bg-white/5",
                  ].join(" ")}
                >
                  {/* Active left bar */}
                  {active && (
                    <motion.div
                      layoutId="mobile-active-bar"
                      className="absolute left-0 top-3 bottom-3 w-[3px] rounded-full bg-[#f4d35e]"
                    />
                  )}

                  {/* Icon container */}
                  <div
                    className={[
                      "w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors",
                      active
                        ? "bg-[#f4d35e]/15"
                        : "bg-white/5",
                    ].join(" ")}
                  >
                    <Icon
                      size={18}
                      strokeWidth={active ? 2.5 : 1.75}
                      className={active ? "text-[#f4d35e]" : "text-zinc-400"}
                    />
                  </div>

                  <span
                    className={[
                      "flex-1 text-[15px] font-medium",
                      active ? "text-[#f4d35e] font-semibold" : "text-zinc-300",
                    ].join(" ")}
                  >
                    {link.name}
                  </span>

                  {active ? (
                    <div className="w-2 h-2 rounded-full bg-[#f4d35e] flex-shrink-0" />
                  ) : (
                    <ChevronRight size={15} className="text-zinc-700 flex-shrink-0" />
                  )}
                </Link>
              );
            })}
          </nav>

          {/* ── Divider + Playlists ── */}
          <div className="mt-5 mx-5 mb-4">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-zinc-500 flex items-center gap-1.5">
                <Music2 size={11} />
                Playlists
              </span>
              <Link
                href="/playlists/new"
                onClick={onClose}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-[#f4d35e]/10 text-zinc-500 hover:text-[#f4d35e] border border-white/8 hover:border-[#f4d35e]/20 transition-all min-h-[32px]"
                aria-label="Create new playlist"
              >
                <Plus size={13} />
                <span className="text-[11px] font-semibold">New</span>
              </Link>
            </div>
          </div>

          <div className="px-3 space-y-0.5">
            {playlists.length === 0 ? (
              <div className="mx-2 px-4 py-5 rounded-2xl bg-white/3 border border-white/5 text-center">
                <Music2 size={20} className="text-zinc-700 mx-auto mb-2" />
                <p className="text-xs text-zinc-600">No playlists yet.</p>
                <Link
                  href="/playlists/new"
                  onClick={onClose}
                  className="inline-block mt-2 text-xs text-[#f4d35e]/70 hover:text-[#f4d35e] transition-colors"
                >
                  Create your first one
                </Link>
              </div>
            ) : (
              playlists.map((pl) => {
                const active = pathname === `/playlists/${pl.id}`;
                return (
                  <Link
                    key={pl.id}
                    href={`/playlists/${pl.id}`}
                    prefetch={false}
                    onClick={onClose}
                    aria-current={active ? "page" : undefined}
                    className={[
                      "flex items-center gap-3 px-3 py-3 rounded-xl transition-all min-h-[56px]",
                      active
                        ? "bg-[#f4d35e]/10 text-[#f4d35e]"
                        : "text-zinc-400 active:bg-white/5",
                    ].join(" ")}
                  >
                    <PlaylistCoverArt coverArts={pl.cover_arts || []} size={36} />
                    <div className="flex-1 min-w-0">
                      <p
                        className={[
                          "text-sm font-semibold truncate",
                          active ? "text-[#f4d35e]" : "text-zinc-200",
                        ].join(" ")}
                      >
                        {pl.name}
                      </p>
                      <p className="text-xs text-zinc-600 truncate mt-0.5">
                        {pl.item_count} {pl.item_count === 1 ? "track" : "tracks"}
                      </p>
                    </div>
                    {active && (
                      <div className="w-1.5 h-1.5 rounded-full bg-[#f4d35e] flex-shrink-0" />
                    )}
                  </Link>
                );
              })
            )}
          </div>

          {/* ── Upgrade Banner ── */}
          <div className="px-5 mt-6">
            <Link
              href="/pricing"
              onClick={onClose}
              className="group flex items-center gap-3 px-4 py-4 rounded-2xl bg-gradient-to-r from-[#f4d35e]/10 to-[#ee964b]/10 border border-[#f4d35e]/15 hover:border-[#f4d35e]/30 hover:from-[#f4d35e]/15 hover:to-[#ee964b]/15 transition-all active:scale-[0.98] min-h-[60px]"
            >
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#f4d35e] to-[#ee964b] flex items-center justify-center flex-shrink-0 shadow-md shadow-[#f4d35e]/20">
                <Zap size={16} className="text-[#0d3b66]" fill="currentColor" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-white">Upgrade your plan</p>
                <p className="text-xs text-zinc-500 mt-0.5">Unlock unlimited storage</p>
              </div>
              <ChevronRight
                size={16}
                className="text-[#f4d35e]/60 group-hover:text-[#f4d35e] group-hover:translate-x-0.5 transition-all flex-shrink-0"
              />
            </Link>
          </div>

          {/* ── Storage Bar ── */}
          {user && (
            <div className="px-5 mt-4">
              <StorageBar variant="compact" />
            </div>
          )}
        </div>
      </motion.div>
    </>
  );
}

// ─── Main Export ─────────────────────────────────────────────────────────────

export default function Sidebar({ isOpen, onClose }: SidebarProps) {
  const { user, logout } = useAuth();
  const { playlists } = usePlaylist();
  const pathname = usePathname();

  const sharedProps = {
    user,
    logout,
    playlists,
    pathname,
  };

  return (
    <>
      {/* Desktop sidebar — unchanged, always rendered, hidden on mobile */}
      <div className="hidden lg:block">
        <DesktopSidebarContent
          isOpen={isOpen}
          onClose={onClose}
          {...sharedProps}
        />
      </div>

      {/* Mobile bottom sheet — only rendered when open, hidden on desktop */}
      <div className="lg:hidden">
        <AnimatePresence>
          {isOpen && (
            <MobileBottomSheet
              key="mobile-bottom-sheet"
              onClose={onClose}
              {...sharedProps}
            />
          )}
        </AnimatePresence>
      </div>
    </>
  );
}
