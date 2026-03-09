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
  X,
  Plus,
  Music2,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import PlaylistCoverArt from "@/components/PlaylistCoverArt";

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

export default function Sidebar({ isOpen, onClose }: SidebarProps) {
  const { user, logout } = useAuth();
  const { playlists } = usePlaylist();
  const pathname = usePathname();

  const isActive = (path: string) => pathname === path;

  return (
    <>
      {/* Mobile Overlay Backdrop */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            key="overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/70 z-40 lg:hidden backdrop-blur-[2px]"
            aria-hidden="true"
          />
        )}
      </AnimatePresence>

      {/* Sidebar Panel */}
      <motion.aside
        initial={false}
        animate={{
          x: isOpen ? 0 : undefined,
        }}
        className={[
          "h-screen w-64 flex flex-col fixed left-0 top-0 z-50",
          "bg-black/90 lg:bg-black/60 backdrop-blur-2xl",
          "border-r border-white/8 shadow-2xl",
          /* mobile: controlled by translate-x, desktop: always visible */
          "transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]",
          "lg:translate-x-0",
          isOpen ? "translate-x-0" : "-translate-x-full",
          /* account for player bar + mobile bottom nav */
          "pb-20",
        ].join(" ")}
        aria-label="Sidebar navigation"
      >
        {/* Mobile Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-zinc-400 hover:text-white lg:hidden rounded-lg hover:bg-white/10 transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center"
          aria-label="Close navigation menu"
        >
          <X size={20} />
        </button>

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
    </>
  );
}
