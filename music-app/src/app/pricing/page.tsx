"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  Check,
  Loader2,
  Shield,
  CreditCard,
  Zap,
  Sparkles,
  AlertCircle,
  CheckCircle2,
  XCircle,
  ArrowRight,
  Lock,
  Disc,
  Menu,
  X,
  Github,
  Twitter,
  Radio,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";

const BACKEND = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type Plan = "free" | "personal" | "lifetime";

interface PaymentStatus {
  plan: Plan;
  upgraded_at: string | null;
}

interface CheckoutState {
  loading: boolean;
  error: string | null;
}

const defaultCheckoutState: CheckoutState = { loading: false, error: null };

const FREE_FEATURES: string[] = [
  "Web player",
  "5 GB storage",
  "200 track limit",
  "Smart playlists",
];

const PERSONAL_FEATURES: string[] = [
  "Desktop app",
  "100 GB storage",
  "Unlimited tracks",
  "CD ripping",
  "Cloud sync",
  "Smart playlists",
];

const LIFETIME_FEATURES: string[] = [
  "Everything in Personal",
  "200 GB storage",
  "All future updates",
  "Priority support",
];

function FeatureRow({ text, accentColor }: { text: string; accentColor: string }) {
  return (
    <li className="flex items-start gap-2.5 text-sm text-zinc-300">
      <Check size={14} className="mt-0.5 flex-shrink-0" style={{ color: accentColor }} />
      <span>{text}</span>
    </li>
  );
}

const NAV_LINKS: { label: string; href: string }[] = [
  { label: "Why DiZC", href: "/#why" },
  { label: "Features", href: "/#features" },
  { label: "FAQ", href: "/#faq" },
  { label: "Pricing", href: "/pricing" },
];

function PricingNav({ isAuthenticated }: { isAuthenticated: boolean }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="fixed top-0 w-full z-50 bg-[#0d1b2a]/90 backdrop-blur-md border-b border-white/5 h-16">
      <div className="max-w-7xl mx-auto px-5 h-full flex items-center justify-between gap-4">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 group" aria-label="DiZC home">
          <Disc className="text-[#f4d35e] w-7 h-7 animate-[spin_10s_linear_infinite]" />
          <span className="text-xl font-bold tracking-tighter text-white">DiZC</span>
        </Link>

        {/* Desktop nav links */}
        <nav className="hidden md:flex items-center gap-6" aria-label="Main navigation">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.label}
              href={link.href}
              className={`text-sm font-medium transition-colors ${
                link.href === "/pricing"
                  ? "text-[#f4d35e]"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {/* Desktop CTA */}
        <div className="hidden md:flex items-center gap-3">
          {isAuthenticated ? (
            <Link
              href="/app"
              className="flex items-center gap-1.5 px-5 py-2 bg-[#f4d35e] text-[#0d3b66] font-bold rounded-lg hover:bg-[#ffd700] transition-all text-sm"
            >
              Go to App <ArrowRight size={14} />
            </Link>
          ) : (
            <Link
              href="/app"
              className="px-5 py-2 bg-[#f4d35e] text-[#0d3b66] font-bold rounded-lg hover:bg-[#ffd700] transition-all text-sm"
            >
              Launch App
            </Link>
          )}
        </div>

        {/* Mobile hamburger */}
        <button
          className="md:hidden p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-white/5 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
          onClick={() => setMobileOpen((v) => !v)}
          aria-expanded={mobileOpen}
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
        >
          {mobileOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {/* Mobile dropdown */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="md:hidden overflow-hidden bg-[#0d1b2a]/95 backdrop-blur-md border-b border-white/5"
          >
            <nav className="max-w-7xl mx-auto px-5 py-4 flex flex-col gap-1" aria-label="Mobile navigation">
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.label}
                  href={link.href}
                  onClick={() => setMobileOpen(false)}
                  className={`py-2.5 text-sm font-medium transition-colors ${
                    link.href === "/pricing"
                      ? "text-[#f4d35e]"
                      : "text-zinc-400 hover:text-white"
                  }`}
                >
                  {link.label}
                </Link>
              ))}
              <div className="pt-3 mt-2 border-t border-white/5">
                {isAuthenticated ? (
                  <Link
                    href="/app"
                    onClick={() => setMobileOpen(false)}
                    className="flex items-center justify-center gap-1.5 py-2.5 px-5 bg-[#f4d35e] text-[#0d3b66] font-bold rounded-lg hover:bg-[#ffd700] transition-all text-sm min-h-[44px]"
                  >
                    Go to App <ArrowRight size={14} />
                  </Link>
                ) : (
                  <Link
                    href="/app"
                    onClick={() => setMobileOpen(false)}
                    className="flex items-center justify-center py-2.5 px-5 bg-[#f4d35e] text-[#0d3b66] font-bold rounded-lg hover:bg-[#ffd700] transition-all text-sm min-h-[44px]"
                  >
                    Launch App
                  </Link>
                )}
              </div>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}

function FreeCard({
  isAuthenticated,
  currentPlan,
}: {
  isAuthenticated: boolean;
  currentPlan: Plan;
}) {
  const isCurrent = isAuthenticated && currentPlan === "free";
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.05 }}
      className="relative flex flex-col bg-white/4 border border-white/8 rounded-3xl p-6 md:p-8"
    >
      {isCurrent && (
        <div className="absolute -top-3 left-6">
          <span className="inline-flex items-center px-3 py-1 rounded-full bg-zinc-700/80 border border-white/10 text-zinc-300 text-[10px] font-bold uppercase tracking-wider">
            Current Plan
          </span>
        </div>
      )}
      <div className="mb-6">
        <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-zinc-500/15 border border-zinc-500/25 text-zinc-400 text-[10px] font-bold uppercase tracking-wider mb-3">
          Free
        </span>
        <div className="flex items-baseline gap-1.5">
          <span className="text-4xl font-bold text-white">$0</span>
        </div>
        <p className="text-zinc-500 text-xs mt-1.5">Always free</p>
      </div>
      <ul className="space-y-2.5 flex-1 mb-8">
        {FREE_FEATURES.map((f) => (
          <FeatureRow key={f} text={f} accentColor="#71717a" />
        ))}
      </ul>
      {isCurrent ? (
        <button
          disabled
          aria-disabled="true"
          className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-white/4 border border-white/8 text-zinc-500 text-sm font-semibold cursor-not-allowed select-none min-h-[48px]"
        >
          Current Plan
        </button>
      ) : (
        <Link
          href="/register"
          className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-white/6 border border-white/8 text-zinc-300 hover:text-white hover:bg-white/10 text-sm font-semibold transition-all min-h-[48px]"
        >
          Get Started Free
        </Link>
      )}
    </motion.div>
  );
}

interface PaidCardProps {
  isAuthenticated: boolean;
  currentPlan: Plan;
  onCheckout: (plan: "personal" | "lifetime") => Promise<void>;
  checkoutState: CheckoutState;
}

function PersonalCard({
  isAuthenticated,
  currentPlan,
  onCheckout,
  checkoutState,
}: PaidCardProps) {
  const isCurrent = currentPlan === "personal";
  const isLifetime = currentPlan === "lifetime";
  const isDisabled = isCurrent || isLifetime || checkoutState.loading;

  let buttonLabel = "Get Personal — $29";
  if (!isAuthenticated) buttonLabel = "Sign In to Buy";
  if (isCurrent || isLifetime) buttonLabel = "Current Plan";
  if (checkoutState.loading) buttonLabel = "Redirecting...";

  const handleClick = () => {
    if (isDisabled && isAuthenticated) return;
    if (!isAuthenticated) {
      window.location.href = "/login?redirect=/pricing";
      return;
    }
    onCheckout("personal");
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.1 }}
      className="relative flex flex-col bg-[#f4d35e]/5 border border-[#f4d35e]/20 rounded-3xl p-6 md:p-8 shadow-[0_0_50px_rgba(244,211,94,0.07)]"
    >
      <div className="absolute -top-3 left-6">
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#f4d35e] text-[#1a1400] text-[10px] font-bold uppercase tracking-wider shadow-[0_2px_12px_rgba(244,211,94,0.35)]">
          <Sparkles size={9} /> Recommended
        </span>
      </div>
      <div className="mb-6">
        <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-[#f4d35e]/15 border border-[#f4d35e]/25 text-[#f4d35e] text-[10px] font-bold uppercase tracking-wider mb-3">
          Personal
        </span>
        <div className="flex items-baseline gap-1.5">
          <span className="text-4xl font-bold text-white">$29</span>
        </div>
        <p className="text-zinc-400 text-xs mt-1.5">One-time payment</p>
      </div>
      <ul className="space-y-2.5 flex-1 mb-8">
        {PERSONAL_FEATURES.map((f) => (
          <FeatureRow key={f} text={f} accentColor="#f4d35e" />
        ))}
      </ul>
      <button
        onClick={handleClick}
        disabled={isDisabled && isAuthenticated}
        aria-disabled={isDisabled && isAuthenticated}
        className={`w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-bold transition-all duration-200 min-h-[48px] ${
          isDisabled && isAuthenticated
            ? "bg-white/6 border border-white/10 text-zinc-500 cursor-not-allowed"
            : "bg-[#f4d35e] hover:bg-[#f0cc44] text-[#1a1400] shadow-[0_2px_16px_rgba(244,211,94,0.25)] hover:shadow-[0_2px_24px_rgba(244,211,94,0.4)] active:scale-[0.98]"
        }`}
      >
        {checkoutState.loading ? <Loader2 size={15} className="animate-spin" /> : null}
        {buttonLabel}
      </button>
      <AnimatePresence>
        {checkoutState.error && (
          <motion.p
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-3 flex items-start gap-1.5 text-xs text-red-400 overflow-hidden"
          >
            <AlertCircle size={12} className="mt-0.5 flex-shrink-0" />
            {checkoutState.error}
          </motion.p>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function LifetimeCard({
  isAuthenticated,
  currentPlan,
  onCheckout,
  checkoutState,
}: PaidCardProps) {
  const isCurrent = currentPlan === "lifetime";
  const isDisabled = isCurrent || checkoutState.loading;

  let buttonLabel = "Get Lifetime — $49";
  if (!isAuthenticated) buttonLabel = "Sign In to Buy";
  if (isCurrent) buttonLabel = "Current Plan";
  if (checkoutState.loading) buttonLabel = "Redirecting...";

  const handleClick = () => {
    if (isDisabled && isAuthenticated) return;
    if (!isAuthenticated) {
      window.location.href = "/login?redirect=/pricing";
      return;
    }
    onCheckout("lifetime");
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.15 }}
      className="relative flex flex-col bg-[#ee964b]/5 border border-[#ee964b]/20 rounded-3xl p-6 md:p-8 shadow-[0_0_50px_rgba(238,150,75,0.05)]"
    >
      {isCurrent && (
        <div className="absolute -top-3 left-6">
          <span className="inline-flex items-center px-3 py-1 rounded-full bg-zinc-700/80 border border-white/10 text-zinc-300 text-[10px] font-bold uppercase tracking-wider">
            Current Plan
          </span>
        </div>
      )}
      <div className="mb-6">
        <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-[#ee964b]/15 border border-[#ee964b]/30 text-[#ee964b] text-[10px] font-bold uppercase tracking-wider mb-3">
          Lifetime
        </span>
        <div className="flex items-baseline gap-1.5">
          <span className="text-4xl font-bold text-white">$49</span>
        </div>
        <p className="text-zinc-400 text-xs mt-1.5">One-time · All future updates</p>
      </div>
      <ul className="space-y-2.5 flex-1 mb-8">
        {LIFETIME_FEATURES.map((f) => (
          <FeatureRow key={f} text={f} accentColor="#ee964b" />
        ))}
      </ul>
      <button
        onClick={handleClick}
        disabled={isDisabled && isAuthenticated}
        aria-disabled={isDisabled && isAuthenticated}
        className={`w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-bold transition-all duration-200 min-h-[48px] ${
          isDisabled && isAuthenticated
            ? "bg-white/6 border border-white/10 text-zinc-500 cursor-not-allowed"
            : "bg-[#ee964b] hover:bg-[#e8863a] text-white shadow-[0_2px_16px_rgba(238,150,75,0.2)] hover:shadow-[0_2px_24px_rgba(238,150,75,0.35)] active:scale-[0.98]"
        }`}
      >
        {checkoutState.loading ? <Loader2 size={15} className="animate-spin" /> : null}
        {buttonLabel}
      </button>
      <AnimatePresence>
        {checkoutState.error && (
          <motion.p
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-3 flex items-start gap-1.5 text-xs text-red-400 overflow-hidden"
          >
            <AlertCircle size={12} className="mt-0.5 flex-shrink-0" />
            {checkoutState.error}
          </motion.p>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function TrustStrip() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.35 }}
      className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3 pt-2"
    >
      {[
        { icon: Shield, label: "Secure payment via Stripe" },
        { icon: CreditCard, label: "One-time charge, no subscription" },
        { icon: Zap, label: "Instant activation after payment" },
      ].map(({ icon: Icon, label }) => (
        <div key={label} className="flex items-center gap-2 text-zinc-500 text-xs">
          <Icon size={13} className="text-zinc-600 flex-shrink-0" />
          <span>{label}</span>
        </div>
      ))}
    </motion.div>
  );
}

const FOOTER_PRODUCT_LINKS: { label: string; href: string }[] = [
  { label: "Features", href: "/#features" },
  { label: "How It Works", href: "/#how-it-works" },
  { label: "Download", href: "/#download" },
  { label: "Web Player", href: "/app" },
];

const FOOTER_COMMUNITY_LINKS: string[] = ["GitHub", "Discord", "Twitter", "Changelog"];
const FOOTER_LEGAL_LINKS: string[] = ["Privacy Policy", "Terms of Service", "Open Source"];

function SiteFooter() {
  return (
    <footer className="border-t border-white/5 bg-[#0b1622] relative z-20">
      <div className="max-w-7xl mx-auto px-5 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-10 mb-10">
          {/* Brand */}
          <div className="md:col-span-1">
            <div className="flex items-center gap-2 mb-4">
              <Disc className="text-[#f4d35e]" size={22} />
              <span className="font-bold text-white text-lg">DiZC</span>
            </div>
            <p className="text-zinc-500 text-sm leading-relaxed">
              The Future of Local Audio. Built for audiophiles who demand control.
            </p>
            <div className="flex items-center gap-3 mt-5">
              <a
                href="#"
                aria-label="GitHub"
                className="p-2 rounded-lg bg-white/5 text-zinc-400 hover:text-white hover:bg-white/10 transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center"
              >
                <Github size={17} />
              </a>
              <a
                href="#"
                aria-label="Twitter"
                className="p-2 rounded-lg bg-white/5 text-zinc-400 hover:text-white hover:bg-white/10 transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center"
              >
                <Twitter size={17} />
              </a>
              <a
                href="#"
                aria-label="Discord"
                className="p-2 rounded-lg bg-white/5 text-zinc-400 hover:text-white hover:bg-white/10 transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center"
              >
                <Radio size={17} />
              </a>
            </div>
          </div>

          {/* Product */}
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-zinc-500 mb-4">
              Product
            </p>
            <ul className="space-y-3">
              {FOOTER_PRODUCT_LINKS.map((l) => (
                <li key={l.label}>
                  <Link
                    href={l.href}
                    className="text-sm text-zinc-400 hover:text-white transition-colors"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Community */}
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-zinc-500 mb-4">
              Community
            </p>
            <ul className="space-y-3">
              {FOOTER_COMMUNITY_LINKS.map((l) => (
                <li key={l}>
                  <a href="#" className="text-sm text-zinc-400 hover:text-white transition-colors">
                    {l}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Legal */}
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-zinc-500 mb-4">
              Legal
            </p>
            <ul className="space-y-3">
              {FOOTER_LEGAL_LINKS.map((l) => (
                <li key={l}>
                  <a href="#" className="text-sm text-zinc-400 hover:text-white transition-colors">
                    {l}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="border-t border-white/5 pt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-zinc-600 text-xs">
          <p>© {new Date().getFullYear()} GhostRepo / DiZC. All rights reserved.</p>
          <p>Made with care for music lovers everywhere.</p>
        </div>
      </div>
    </footer>
  );
}

function PricingPageContent() {
  const { token, isAuthenticated, isLoading: authLoading } = useAuth();
  const searchParams = useSearchParams();

  const successParam = searchParams.get("success") === "true";
  const planParam = searchParams.get("plan") as Plan | null;
  const cancelledParam = searchParams.get("cancelled") === "true";

  const [currentPlan, setCurrentPlan] = useState<Plan>("free");
  const [statusLoading, setStatusLoading] = useState(true);
  const [personalState, setPersonalState] = useState<CheckoutState>(defaultCheckoutState);
  const [lifetimeState, setLifetimeState] = useState<CheckoutState>(defaultCheckoutState);

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
        if (!aborted) setCurrentPlan(json.plan);
      } catch {
        // default to "free"
      } finally {
        if (!aborted) setStatusLoading(false);
      }
    };
    fetchStatus();
    return () => {
      aborted = true;
    };
  }, [token, isAuthenticated]);

  const handleCheckout = async (plan: "personal" | "lifetime") => {
    if (!token) return;
    const setState = plan === "personal" ? setPersonalState : setLifetimeState;
    setState({ loading: true, error: null });
    try {
      const res = await fetch(`${BACKEND}/api/mongo/payments/create-checkout/`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ plan }),
      });
      const json = await res.json();
      if (res.status === 409) {
        setState({ loading: false, error: "You're already on this plan." });
        return;
      }
      if (!res.ok) {
        setState({ loading: false, error: json.error ?? "Something went wrong. Please try again." });
        return;
      }
      if (json.checkout_url) {
        window.location.href = json.checkout_url;
        return;
      }
      setState({ loading: false, error: "No checkout URL returned." });
    } catch {
      setState({ loading: false, error: "Network error. Please check your connection." });
    }
  };

  const planDisplayName =
    planParam === "personal" ? "Personal" : planParam === "lifetime" ? "Lifetime" : null;

  return (
    <>
      <PricingNav isAuthenticated={isAuthenticated} />

      {/* Ambient background glow */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[50vw] h-[50vw] rounded-full bg-[#f4d35e]/3 blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50vw] h-[50vw] rounded-full bg-[#ee964b]/3 blur-[120px]" />
      </div>

      <main className="relative z-10 pt-16">
        <div className="relative max-w-5xl mx-auto px-5 py-16 md:py-24 space-y-10">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="text-center space-y-3"
          >
            <h1 className="text-4xl md:text-5xl font-bold text-white tracking-tight">
              Own your music. Forever.
            </h1>
            <p className="text-zinc-400 text-base md:text-lg max-w-md mx-auto leading-relaxed">
              No subscriptions. No recurring charges. Pay once, yours forever.
            </p>
          </motion.div>

          <AnimatePresence mode="wait">
            {successParam && (
              <motion.div
                key="success-banner"
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.3 }}
                className="flex items-start gap-3 px-5 py-4 rounded-2xl bg-green-500/10 border border-green-500/20 text-green-300"
                role="alert"
              >
                <CheckCircle2 size={17} className="mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-semibold text-sm text-green-200">Payment successful!</p>
                  <p className="text-xs text-green-400 mt-0.5">
                    Your plan has been upgraded{planDisplayName ? ` to ${planDisplayName}` : ""}. Enjoy your expanded storage and features.
                  </p>
                </div>
              </motion.div>
            )}
            {cancelledParam && !successParam && (
              <motion.div
                key="cancelled-banner"
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.3 }}
                className="flex items-start gap-3 px-5 py-4 rounded-2xl bg-zinc-800/60 border border-white/8 text-zinc-400"
                role="status"
              >
                <XCircle size={17} className="mt-0.5 flex-shrink-0 text-zinc-500" />
                <p className="text-sm">Payment cancelled. You can upgrade any time — no pressure.</p>
              </motion.div>
            )}
          </AnimatePresence>

          {authLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 size={22} className="animate-spin text-zinc-600" />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5 md:gap-6 items-start">
                <FreeCard
                  isAuthenticated={isAuthenticated}
                  currentPlan={statusLoading ? "free" : currentPlan}
                />
                <PersonalCard
                  isAuthenticated={isAuthenticated}
                  currentPlan={statusLoading ? "free" : currentPlan}
                  onCheckout={handleCheckout}
                  checkoutState={personalState}
                />
                <LifetimeCard
                  isAuthenticated={isAuthenticated}
                  currentPlan={statusLoading ? "free" : currentPlan}
                  onCheckout={handleCheckout}
                  checkoutState={lifetimeState}
                />
              </div>
              {!isAuthenticated && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.4, delay: 0.3 }}
                  className="flex items-center justify-center gap-2 text-zinc-500 text-xs"
                >
                  <Lock size={11} />
                  <span>
                    Already have an account?{" "}
                    <Link
                      href="/login?redirect=/pricing"
                      className="text-zinc-300 hover:text-white underline underline-offset-2 transition-colors"
                    >
                      Sign in to purchase
                    </Link>
                  </span>
                </motion.div>
              )}
            </>
          )}
          <TrustStrip />
        </div>
      </main>

      <SiteFooter />
    </>
  );
}

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-[#0d1b2a] text-[#e0e1dd]">
      <Suspense
        fallback={
          <div className="flex items-center justify-center min-h-screen bg-[#0d1b2a]">
            <Loader2 size={22} className="animate-spin text-zinc-600" />
          </div>
        }
      >
        <PricingPageContent />
      </Suspense>
    </div>
  );
}
