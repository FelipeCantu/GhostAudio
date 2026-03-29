"use client";

import { useState, useEffect, useCallback } from "react";
import { usePlayer } from "@/context/PlayerContext";

// Toggle by tapping this corner 5 times within 2 seconds,
// or by running: localStorage.setItem('ghostDebug','1') in console
export default function AudioDebugOverlay() {
    const { getDebugSnapshot } = usePlayer();
    const [visible, setVisible] = useState(() =>
        typeof window !== "undefined" && localStorage.getItem("ghostDebug") === "1"
    );
    const [snapshot, setSnapshot] = useState(() => getDebugSnapshot());
    const [tapCount, setTapCount] = useState(0);

    // Refresh snapshot every 500ms while visible
    useEffect(() => {
        if (!visible) return;
        const id = setInterval(() => setSnapshot(getDebugSnapshot()), 500);
        return () => clearInterval(id);
    }, [visible, getDebugSnapshot]);

    // 5-tap activation: tap the top-right corner
    const handleCornerTap = useCallback(() => {
        setTapCount(n => {
            const next = n + 1;
            if (next >= 5) {
                setVisible(v => {
                    const newVal = !v;
                    localStorage.setItem("ghostDebug", newVal ? "1" : "0");
                    return newVal;
                });
                return 0;
            }
            setTimeout(() => setTapCount(0), 2000);
            return next;
        });
    }, []);

    return (
        <>
            {/* Invisible tap target — top-right corner */}
            <div
                onPointerDown={handleCornerTap}
                style={{
                    position: "fixed", top: 0, right: 0,
                    width: 60, height: 60, zIndex: 9999,
                }}
            />

            {visible && (
                <div style={{
                    position: "fixed", bottom: 80, left: 0, right: 0,
                    background: "rgba(0,0,0,0.92)", color: "#0f0", fontFamily: "monospace",
                    fontSize: 11, padding: "8px 10px", zIndex: 9998,
                    maxHeight: "40vh", overflowY: "auto",
                    borderTop: "1px solid #0f0",
                }}>
                    <div style={{ marginBottom: 4, color: "#ff0", fontWeight: "bold" }}>
                        ── Audio Debug ── (tap corner ×5 to hide)
                    </div>
                    <div>ctx: <b style={{ color: snapshot.ctxState === "running" ? "#0f0" : "#f80" }}>{snapshot.ctxState}</b></div>
                    <div>element: <b>{snapshot.elementPaused ? "PAUSED" : "playing"}</b> | {snapshot.elementTime.toFixed(1)}s | {snapshot.elementSrc || "—"}</div>
                    <div>wasPlayingBeforeHidden: <b>{String(snapshot.wasPlayingBeforeHidden)}</b></div>
                    <div>isUserPause: <b>{String(snapshot.isUserPause)}</b> | isTransitioning: <b>{String(snapshot.isTransitioning)}</b></div>
                    <div style={{ marginTop: 6, color: "#aaa" }}>── Events (newest last) ──</div>
                    {snapshot.logs.slice(-20).map((l, i) => (
                        <div key={i} style={{ color: l.includes("FAILED") ? "#f44" : l.includes("SYSTEM") ? "#f80" : "#0f0" }}>
                            {l}
                        </div>
                    ))}
                </div>
            )}
        </>
    );
}
