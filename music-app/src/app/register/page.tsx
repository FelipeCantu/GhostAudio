"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { usePlayer } from "@/context/PlayerContext";
import Link from "next/link";
import Image from "next/image";
import LoadingSpinner from "@/components/LoadingSpinner";
import { api } from "@/services/api";
import { Disc, Eye, EyeOff } from "lucide-react";
import { motion } from "framer-motion";

export default function RegisterPage() {
  const router = useRouter();
  const { currentTrack } = usePlayer();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setIsLoading(true);

    try {
      const data = await api.auth.register({ username, email, password });
      if (data.id || data.username) {
        setSuccess("Account created! Redirecting to login...");
        router.push("/login");
      } else {
        setError(data.error || "Registration failed");
        setIsLoading(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred.");
      setIsLoading(false);
    }
  };

  return (
    <div className={`relative min-h-screen w-full flex flex-col items-center justify-end overflow-hidden bg-[#0d1b2a] text-[#faf0ca] px-4 transition-[padding-bottom] duration-300 ease-out ${currentTrack ? 'pb-36 lg:pb-24' : 'pb-8'}`}>
      {/* Ambient glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-[-15%] left-[-10%] w-[50vw] h-[50vw] rounded-full bg-[#f4d35e]/6 blur-[120px]" />
        <div className="absolute bottom-[-15%] right-[-10%] w-[50vw] h-[50vw] rounded-full bg-[#ee964b]/6 blur-[120px]" />
      </div>

      {/* Back to landing */}
      <div className="absolute left-6" style={{ top: 'calc(env(safe-area-inset-top, 0px) + 1.5rem)' }}>
        <Link
          href="/"
          className="flex items-center gap-2 text-zinc-500 hover:text-white transition-colors text-sm"
        >
          <img src="/dizclogo.png" alt="DiZC" className="h-5 w-auto" />
        </Link>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-sm relative z-10"
      >
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="relative w-20 h-20 mb-5">
            <Image
              src="/dizclogo.png"
              alt="DiZC Logo"
              fill
              className="object-contain drop-shadow-[0_0_20px_rgba(244,211,94,0.25)]"
              priority
            />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Create your library</h1>
          <p className="text-zinc-500 text-sm mt-1">Free forever · No credit card needed</p>
        </div>

        {/* Form Card */}
        <div className="bg-white/5 backdrop-blur-xl rounded-3xl border border-white/8 shadow-2xl p-7 space-y-5">
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-4 bg-red-500/10 border border-red-500/20 text-red-300 text-sm rounded-xl break-words"
            >
              {error}
            </motion.div>
          )}
          {success && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-4 bg-green-500/10 border border-green-500/20 text-green-300 text-sm rounded-xl"
            >
              {success}
            </motion.div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                Username
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={isLoading}
                autoComplete="username"
                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-[#f4d35e]/40 focus:border-[#f4d35e]/50 transition-all disabled:opacity-50 min-h-[48px]"
                placeholder="audiophile_42"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                Email{" "}
                <span className="text-zinc-600 normal-case font-normal">(optional)</span>
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isLoading}
                autoComplete="email"
                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-[#f4d35e]/40 focus:border-[#f4d35e]/50 transition-all disabled:opacity-50 min-h-[48px]"
                placeholder="you@example.com"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isLoading}
                  autoComplete="new-password"
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 pr-12 text-white text-sm placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-[#f4d35e]/40 focus:border-[#f4d35e]/50 transition-all disabled:opacity-50 min-h-[48px]"
                  placeholder="Create a strong password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors p-1 min-w-[32px] min-h-[32px] flex items-center justify-center"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3.5 px-4 bg-gradient-to-r from-[#f4d35e] to-[#ee964b] text-[#0d3b66] font-bold rounded-xl hover:shadow-lg hover:shadow-[#f4d35e]/20 transition-all transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed flex justify-center items-center gap-2 min-h-[52px] text-sm"
            >
              {isLoading ? (
                <>
                  <LoadingSpinner className="mr-1" />
                  Creating Account...
                </>
              ) : (
                "Create Free Account"
              )}
            </button>
          </form>

          <div className="text-center text-sm text-zinc-500 pt-1">
            Already have an account?{" "}
            <Link
              href="/login"
              className="text-[#f4d35e] hover:text-[#ee964b] font-semibold transition-colors"
            >
              Sign in
            </Link>
          </div>
        </div>

        <p className="text-center text-zinc-600 text-xs mt-6">
          By creating an account you agree to our{" "}
          <a href="#" className="hover:text-zinc-400 transition-colors underline">Terms</a>
          {" "}and{" "}
          <a href="#" className="hover:text-zinc-400 transition-colors underline">Privacy Policy</a>.
        </p>
      </motion.div>
    </div>
  );
}
