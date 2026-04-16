"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/context/AuthContext";

const BACKEND = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export interface BreakdownData {
  audio_bytes: number;
  audio_gb: number;
  cover_art_bytes: number;
  cover_art_gb: number;
  track_count: number;
  album_count: number;
}

export interface QuotaData {
  plan: "free" | "personal" | "lifetime";
  storage_used_bytes: number;
  storage_limit_bytes: number;
  storage_used_gb: number;
  storage_limit_gb: number;
  percent_used: number;
  breakdown: BreakdownData;
}

interface QuotaContextType {
  quota: QuotaData | null;
  loading: boolean;
  error: boolean;
  refetch: () => void;
}

const QuotaContext = createContext<QuotaContextType | undefined>(undefined);

export function QuotaProvider({ children }: { children: React.ReactNode }) {
  const { token, isAuthenticated } = useAuth();
  const [quota, setQuota] = useState<QuotaData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const fetchedAt = useRef<number | null>(null);
  const fetchingRef = useRef(false);

  const fetchBreakdown = useCallback(async (force = false) => {
    if (!token) return;
    // Skip if cache is fresh and not forced
    if (!force && fetchedAt.current && Date.now() - fetchedAt.current < CACHE_TTL_MS) return;
    if (fetchingRef.current) return;

    fetchingRef.current = true;
    setLoading(true);
    try {
      const res = await fetch(`${BACKEND}/api/mongo/storage-breakdown/`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: QuotaData = await res.json();
      setQuota(json);
      setError(false);
      fetchedAt.current = Date.now();
    } catch {
      setError(true);
    } finally {
      setLoading(false);
      fetchingRef.current = false;
    }
  }, [token]);

  useEffect(() => {
    if (isAuthenticated && token) {
      fetchBreakdown();
    } else {
      setQuota(null);
      setLoading(false);
      fetchedAt.current = null;
    }
  }, [isAuthenticated, token, fetchBreakdown]);

  const refetch = useCallback(() => fetchBreakdown(true), [fetchBreakdown]);

  return (
    <QuotaContext.Provider value={{ quota, loading, error, refetch }}>
      {children}
    </QuotaContext.Provider>
  );
}

export function useQuota() {
  const ctx = useContext(QuotaContext);
  if (!ctx) throw new Error("useQuota must be used within QuotaProvider");
  return ctx;
}
