"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";

export default function RegisterPage() {
    const router = useRouter();
    const [username, setUsername] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");

        try {
            // Use relative path to ensure we hit Next.js API, not Django directly
            const API_URL = "/api";
            const res = await fetch(`${API_URL}/auth/register/`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username, email, password }),
            });

            if (res.ok) {
                // Redirect to login after successful registration
                router.push("/login");
            } else {
                const data = await res.json();
                setError(JSON.stringify(data));
            }
        } catch (err) {
            setError("An error occurred. Is the backend running?");
        }
    };

    return (
        <div className="relative min-h-screen w-full flex flex-col items-center justify-center overflow-hidden bg-[#0d3b66] text-[#faf0ca]">
            {/* Dynamic Background */}
            <div className="absolute inset-0 pointer-events-none">
                <div className="absolute top-[-10%] left-[-10%] w-[40vw] h-[40vw] rounded-full bg-[#f4d35e]/10 blur-[100px] animate-pulse" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[40vw] h-[40vw] rounded-full bg-[#ee964b]/10 blur-[100px] animate-pulse delay-700" />
            </div>

            <div className="w-full max-w-md p-8 space-y-8 bg-black/40 backdrop-blur-xl rounded-3xl border border-white/10 shadow-2xl relative z-10">
                <div className="flex flex-col items-center space-y-2">
                    <div className="relative w-24 h-24 mb-2">
                        <Image
                            src="/logo.png"
                            alt="DiZC Logo"
                            fill
                            className="object-contain drop-shadow-lg"
                            priority
                        />
                    </div>
                    <p className="text-zinc-400 text-sm">Create your personal library</p>
                </div>

                {error && (
                    <div className="p-4 bg-red-900/30 border border-red-500/20 text-red-200 text-sm rounded-xl break-words">
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-5">
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-zinc-300">Username</label>
                        <input
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            className="w-full bg-black/50 border border-zinc-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-[#f4d35e]/50 focus:border-[#f4d35e] transition-all"
                            required
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-zinc-300">Email (Optional)</label>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full bg-black/50 border border-zinc-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-[#f4d35e]/50 focus:border-[#f4d35e] transition-all"
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-zinc-300">Password</label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full bg-black/50 border border-zinc-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-[#f4d35e]/50 focus:border-[#f4d35e] transition-all"
                            required
                        />
                    </div>

                    <button
                        type="submit"
                        className="w-full py-3.5 px-4 bg-gradient-to-r from-[#f4d35e] to-[#ee964b] text-[#0d3b66] font-bold rounded-xl hover:shadow-lg hover:shadow-[#f4d35e]/20 transition-all transform hover:scale-[1.02] active:scale-[0.98]"
                    >
                        Create Account
                    </button>
                </form>

                <div className="text-center text-sm text-zinc-500">
                    Already have an account?{" "}
                    <Link href="/login" className="text-[#f4d35e] hover:text-[#ee964b] font-medium hover:underline transition-colors">
                        Login
                    </Link>
                </div>
            </div>
        </div>
    );
}
