"use client";

import { useState, useEffect } from "react";
import Sidebar from "./Sidebar";
import ImportIndicator from "./ImportIndicator";
import GlobalSearch from "./GlobalSearch";
import KeyboardShortcutsModal from "./KeyboardShortcutsModal";
import { useAuth } from "@/context/AuthContext";
import { useRouter, usePathname } from "next/navigation";
import { Menu, Home, Library, Disc, ListMusic } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { api, Album } from "@/services/api";
import { usePlayer } from "@/context/PlayerContext";

interface DashboardLayoutProps {
  children: React.ReactNode;
}

const mobileNavLinks = [
  { href: "/app", icon: Home, label: "Home" },
  { href: "/library", icon: Library, label: "Library" },
  { href: "/import", icon: Disc, label: "Import" },
  { href: "/playlists/new", icon: ListMusic, label: "Playlists" },
];

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const { isAuthenticated, isLoading, token, user } = useAuth();
  const { currentTrack } = usePlayer();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [searchAlbums, setSearchAlbums] = useState<Album[]>([]);
  const router = useRouter();
  const pathname = usePathname();

  // Fetch albums once for global search
  useEffect(() => {
    if (!token || !user?.id) return;
    api.library.getAlbums(token, user.id).then(setSearchAlbums).catch(() => {
      // Silently fail — search just won't have results
    });
  }, [token, user?.id]);

  // Close sidebar when route changes on mobile
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [pathname]);

  // Lock body scroll when mobile menu is open
  useEffect(() => {
    if (isMobileMenuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isMobileMenuOpen]);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push("/login");
    }
  }, [isLoading, isAuthenticated, router]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin h-10 w-10 border-4 border-primary border-t-transparent rounded-full" />
          <p className="text-sm text-muted-foreground animate-pulse">Loading DiZC...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  const isActiveNav = (href: string) => pathname === href;

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      {/* Ambient Background */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[50vw] h-[50vw] rounded-full bg-primary/5 blur-[120px] animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50vw] h-[50vw] rounded-full bg-border/5 blur-[120px] animate-pulse delay-700" />
      </div>

      {/* Desktop Sidebar */}
      <Sidebar
        isOpen={isMobileMenuOpen}
        onClose={() => setIsMobileMenuOpen(false)}
      />

      <ImportIndicator />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 lg:ml-64 transition-all duration-300">
        {/* Mobile Header */}
        <header className="lg:hidden sticky top-0 z-30 flex items-center justify-between px-4 py-3 bg-background/95 backdrop-blur-md border-b border-white/5 h-14">
          <button
            onClick={() => setIsMobileMenuOpen(true)}
            className="p-2 -ml-1 text-zinc-300 hover:text-white rounded-lg hover:bg-white/5 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
            aria-label="Open navigation menu"
          >
            <Menu size={22} />
          </button>

          <div className="relative w-20 h-7">
            <Image
              src="/logo.png"
              alt="DiZC"
              fill
              className="object-contain"
              priority
            />
          </div>

          {/* Placeholder to balance the header */}
          <div className="w-[44px]" />
        </header>

        {/* Page Content */}
        <main
          className="flex-1 p-4 md:p-8 relative z-10 overflow-y-auto"
          style={{
            paddingBottom: currentTrack
              ? "calc(9rem + env(safe-area-inset-bottom, 0px))"
              : "calc(5rem + env(safe-area-inset-bottom, 0px))",
          }}
        >
          <div className="max-w-7xl mx-auto">
            {children}
          </div>
        </main>
      </div>

      {/* Global Search Overlay */}
      <GlobalSearch
        albums={searchAlbums}
        onOpenShortcuts={() => setShowShortcuts(true)}
      />

      {/* Keyboard Shortcuts Modal */}
      <KeyboardShortcutsModal
        isOpen={showShortcuts}
        onClose={() => setShowShortcuts(false)}
      />

      {/* Mobile Bottom Navigation Bar */}
      <nav
        className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-background/95 backdrop-blur-xl border-t border-white/10 flex items-center justify-around"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)", height: "64px" }}
        aria-label="Mobile navigation"
      >
        {mobileNavLinks.map(({ href, icon: Icon, label }) => {
          const active = isActiveNav(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-col items-center justify-center gap-1 flex-1 h-full transition-colors min-w-[44px] ${
                active ? "text-[#f4d35e]" : "text-zinc-500 hover:text-zinc-300"
              }`}
              aria-label={label}
              aria-current={active ? "page" : undefined}
            >
              <Icon
                size={22}
                className={`transition-transform ${active ? "scale-110" : ""}`}
                strokeWidth={active ? 2.5 : 1.75}
              />
              <span className="text-[10px] font-medium">{label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
