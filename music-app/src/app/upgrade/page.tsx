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
  Lock,
} from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/context/AuthContext";

const BACKEND = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type Plan = "free" | "personal" | "lifetime";

interface PaymentStatus {
  plan: Plan;
  upgraded_at: string | null;
}

// ─── Feature list definitions ─────────────────────────────────────────────────

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

// ─── Per-card loading / error state ───────────────────────────────────────────

interface CheckoutState {
  loading: boolean;
  error: string | null;
}

const defaultCheckoutState: CheckoutState = { loading: false, error: null };

// ─── Feature row ──────────────────────────────────────────────────────────────

function FeatureRow({
  text,
  accentColor,
}: {
  text: string;
  accentColor: string;
}) {
  return (
    <li className="flex items-start gap-2.5 text-sm text-zinc-300">
      <Check
        size={14}
        className="mt-0.5 flex-shrink-0"
        style={{ color: accentColor }}
      />
      <span>{text}</span>
    </li>
  );
}

// ─── Pricing card ─────────────────────────────────────────────────────────────

interface PricingCardProps {
  plan: Plan;
  currentPlan: Plan;
  onCheckout: (plan: "personal" | "lifetime") => Promise<void>;
  checkoutState: CheckoutState;
}

function FreeCard({ currentPlan }: { currentPlan: Plan }) {
  const isCurrent = currentPlan === "free";

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.05 }}
      className="relative flex flex-col bg-white/4 border border-white/8 rounded-3xl p-6 md:p-7"
    >
      {isCurrent && (
        <div className="absolute -top-3 left-6">
          <span className="inline-flex items-center px-3 py-1 rounded-full bg-zinc-700/80 border border-white/10 text-zinc-300 text-[10px] font-bold uppercase tracking-wider">
            Current Plan
          </span>
        </div>
      )}

      {/* Header */}
      <div className="mb-6">
        <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-zinc-500/15 border border-zinc-500/25 text-zinc-400 text-[10px] font-bold uppercase tracking-wider mb-3">
          Free
        </span>
        <div className="flex items-baseline gap-1.5">
          <span className="text-4xl font-bold text-white">$0</span>
        </div>
        <p className="text-zinc-500 text-xs mt-1.5">Always free</p>
      </div>

      {/* Features */}
      <ul className="space-y-2.5 flex-1 mb-7">
        {FREE_FEATURES.map((f) => (
          <FeatureRow key={f} text={f} accentColor="#71717a" />
        ))}
      </ul>

      {/* CTA */}
      <button
        disabled
        aria-disabled="true"
        className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-white/4 border border-white/8 text-zinc-500 text-sm font-semibold cursor-not-allowed select-none"
      >
        {isCurrent ? "Current Plan" : "Free"}
      </button>
    </motion.div>
  );
}

function PersonalCard({
  currentPlan,
  onCheckout,
  checkoutState,
}: Omit<PricingCardProps, "plan">) {
  const isCurrent = currentPlan === "personal";
  const isLifetime = currentPlan === "lifetime";
  const isDisabled = isCurrent || isLifetime || checkoutState.loading;

  let buttonLabel = "Get Personal";
  if (isCurrent || isLifetime) buttonLabel = "Current Plan";
  if (checkoutState.loading) buttonLabel = "Redirecting...";

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.1 }}
      className="relative flex flex-col bg-[#f4d35e]/5 border border-[#f4d35e]/20 rounded-3xl p-6 md:p-7 shadow-[0_0_40px_rgba(244,211,94,0.06)]"
    >
      {/* RECOMMENDED banner */}
      <div className="absolute -top-3 left-6">
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#f4d35e] text-[#1a1400] text-[10px] font-bold uppercase tracking-wider shadow-[0_2px_12px_rgba(244,211,94,0.35)]">
          <Sparkles size={9} />
          Recommended
        </span>
      </div>

      {/* Header */}
      <div className="mb-6">
        <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-[#f4d35e]/15 border border-[#f4d35e]/25 text-[#f4d35e] text-[10px] font-bold uppercase tracking-wider mb-3">
          Personal
        </span>
        <div className="flex items-baseline gap-1.5">
          <span className="text-4xl font-bold text-white">$29</span>
        </div>
        <p className="text-zinc-400 text-xs mt-1.5">One-time payment</p>
      </div>

      {/* Features */}
      <ul className="space-y-2.5 flex-1 mb-7">
        {PERSONAL_FEATURES.map((f) => (
          <FeatureRow key={f} text={f} accentColor="#f4d35e" />
        ))}
      </ul>

      {/* CTA */}
      <button
        onClick={() => !isDisabled && onCheckout("personal")}
        disabled={isDisabled}
        aria-disabled={isDisabled}
        className={`w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-bold transition-all duration-200 min-h-[48px]
          ${
            isDisabled
              ? "bg-white/6 border border-white/10 text-zinc-500 cursor-not-allowed"
              : "bg-[#f4d35e] hover:bg-[#f0cc44] text-[#1a1400] shadow-[0_2px_16px_rgba(244,211,94,0.25)] hover:shadow-[0_2px_24px_rgba(244,211,94,0.4)] active:scale-[0.98]"
          }`}
      >
        {checkoutState.loading ? (
          <Loader2 size={15} className="animate-spin" />
        ) : null}
        {buttonLabel}
      </button>

      {/* Inline error */}
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
  currentPlan,
  onCheckout,
  checkoutState,
}: Omit<PricingCardProps, "plan">) {
  const isCurrent = currentPlan === "lifetime";
  const isDisabled = isCurrent || checkoutState.loading;

  let buttonLabel = "Get Lifetime";
  if (isCurrent) buttonLabel = "Current Plan";
  if (checkoutState.loading) buttonLabel = "Redirecting...";

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.15 }}
      className="relative flex flex-col bg-[#ee964b]/5 border border-[#ee964b]/20 rounded-3xl p-6 md:p-7 shadow-[0_0_40px_rgba(238,150,75,0.05)]"
    >
      {isCurrent && (
        <div className="absolute -top-3 left-6">
          <span className="inline-flex items-center px-3 py-1 rounded-full bg-zinc-700/80 border border-white/10 text-zinc-300 text-[10px] font-bold uppercase tracking-wider">
            Current Plan
          </span>
        </div>
      )}

      {/* Header */}
      <div className="mb-6">
        <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-[#ee964b]/15 border border-[#ee964b]/30 text-[#ee964b] text-[10px] font-bold uppercase tracking-wider mb-3">
          Lifetime
        </span>
        <div className="flex items-baseline gap-1.5">
          <span className="text-4xl font-bold text-white">$49</span>
        </div>
        <p className="text-zinc-400 text-xs mt-1.5">One-time · All future updates</p>
      </div>

      {/* Features */}
      <ul className="space-y-2.5 flex-1 mb-7">
        {LIFETIME_FEATURES.map((f) => (
          <FeatureRow key={f} text={f} accentColor="#ee964b" />
        ))}
      </ul>

      {/* CTA */}
      <button
        onClick={() => !isDisabled && onCheckout("lifetime")}
        disabled={isDisabled}
        aria-disabled={isDisabled}
        className={`w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-bold transition-all duration-200 min-h-[48px]
          ${
            isDisabled
              ? "bg-white/6 border border-white/10 text-zinc-500 cursor-not-allowed"
              : "bg-[#ee964b] hover:bg-[#e8863a] text-white shadow-[0_2px_16px_rgba(238,150,75,0.2)] hover:shadow-[0_2px_24px_rgba(238,150,75,0.35)] active:scale-[0.98]"
          }`}
      >
        {checkoutState.loading ? (
          <Loader2 size={15} className="animate-spin" />
        ) : null}
        {buttonLabel}
      </button>

      {/* Inline error */}
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

// ─── Trust strip ──────────────────────────────────────────────────────────────

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
        <div
          key={label}
          className="flex items-center gap-2 text-zinc-500 text-xs"
        >
          <Icon size={13} className="text-zinc-600 flex-shrink-0" />
          <span>{label}</span>
        </div>
      ))}
    </motion.div>
  );
}

// ─── Unauthenticated gate ─────────────────────────────────────────────────────

function UnauthenticatedState() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="flex flex-col items-center justify-center text-center py-24 gap-5"
    >
      <div className="w-14 h-14 rounded-2xl bg-white/6 border border-white/8 flex items-center justify-center">
        <Lock size={22} className="text-zinc-400" />
      </div>
      <div className="space-y-1.5">
        <h2 className="text-xl font-bold text-white">Sign in to upgrade</h2>
        <p className="text-zinc-500 text-sm max-w-xs leading-relaxed">
          You need to be logged in to purchase a plan.
        </p>
      </div>
      <Link
        href="/login"
        className="flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-[#f4d35e] hover:bg-[#f0cc44] text-[#1a1400] text-sm font-bold transition-colors shadow-[0_2px_16px_rgba(244,211,94,0.25)] min-h-[44px]"
      >
        Sign In
      </Link>
    </motion.div>
  );
}

// ─── Main page content (uses useSearchParams so must be in Suspense) ──────────

function UpgradePageContent() {
  const { token, isAuthenticated, isLoading: authLoading } = useAuth();
  const searchParams = useSearchParams();

  const success = searchParams.get("success") === "true";
  const cancelled = searchParams.get("cancelled") === "true";

  const [currentPlan, setCurrentPlan] = useState<Plan>("free");
  const [statusLoading, setStatusLoading] = useState(true);
  const [personalState, setPersonalState] =
    useState<CheckoutState>(defaultCheckoutState);
  const [lifetimeState, setLifetimeState] =
    useState<CheckoutState>(defaultCheckoutState);

  // Fetch current payment status
  useEffect(() => {
    if (!isAuthenticated || !token) {
      setStatusLoading(false);
      return;
    }

    let cancelled = false;

    const fetchStatus = async () => {
      try {
        const res = await fetch(`${BACKEND}/api/mongo/payments/status/`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json: PaymentStatus = await res.json();
        if (!cancelled) setCurrentPlan(json.plan);
      } catch {
        // Non-critical — default to "free" display
      } finally {
        if (!cancelled) setStatusLoading(false);
      }
    };

    fetchStatus();
    return () => {
      cancelled = true;
    };
  }, [token, isAuthenticated]);

  // Redirect to Stripe checkout
  const handleCheckout = async (plan: "personal" | "lifetime") => {
    if (!token) return;

    const setState =
      plan === "personal" ? setPersonalState : setLifetimeState;

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
        setState({
          loading: false,
          error: json.error ?? "Something went wrong. Please try again.",
        });
        return;
      }

      if (json.checkout_url) {
        // Keep spinner visible while redirecting
        window.location.href = json.checkout_url;
        return;
      }

      setState({ loading: false, error: "No checkout URL returned." });
    } catch {
      setState({
        loading: false,
        error: "Network error. Please check your connection.",
      });
    }
  };

  // While auth is resolving, show nothing to avoid flash
  if (authLoading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 size={22} className="animate-spin text-zinc-600" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <UnauthenticatedState />;
  }

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      {/* Page header */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="text-center space-y-2 pt-2"
      >
        <h1 className="text-3xl md:text-4xl font-bold text-white tracking-tight">
          Upgrade DiZC
        </h1>
        <p className="text-zinc-400 text-sm md:text-base max-w-md mx-auto leading-relaxed">
          Own your music forever. No subscription, no recurring charges.
        </p>
      </motion.div>

      {/* Payment result banners */}
      <AnimatePresence mode="wait">
        {success && (
          <motion.div
            key="success-banner"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.3 }}
            className="flex items-start gap-3 px-5 py-4 rounded-2xl bg-green-500/10 border border-green-500/20 text-green-300"
          >
            <CheckCircle2 size={17} className="mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-semibold text-sm text-green-200">
                Payment successful!
              </p>
              <p className="text-xs text-green-400 mt-0.5">
                Your plan has been upgraded. Enjoy your expanded storage.
              </p>
            </div>
          </motion.div>
        )}

        {cancelled && !success && (
          <motion.div
            key="cancelled-banner"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.3 }}
            className="flex items-start gap-3 px-5 py-4 rounded-2xl bg-zinc-800/60 border border-white/8 text-zinc-400"
          >
            <XCircle size={17} className="mt-0.5 flex-shrink-0 text-zinc-500" />
            <p className="text-sm">
              Payment cancelled. You can upgrade any time.
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Pricing cards grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 md:gap-6 items-start">
        <FreeCard currentPlan={statusLoading ? "free" : currentPlan} />

        <PersonalCard
          currentPlan={statusLoading ? "free" : currentPlan}
          onCheckout={handleCheckout}
          checkoutState={personalState}
        />

        <LifetimeCard
          currentPlan={statusLoading ? "free" : currentPlan}
          onCheckout={handleCheckout}
          checkoutState={lifetimeState}
        />
      </div>

      {/* Trust strip */}
      <TrustStrip />
    </div>
  );
}

// ─── Page export (Suspense boundary for useSearchParams) ──────────────────────

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
