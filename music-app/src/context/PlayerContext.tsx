"use client";

import React, { createContext, useContext, useState, useRef, useEffect, useCallback } from "react";
import { Track, Playlist } from "@/services/api";

interface AlbumInfo {
    title: string;
    artist: string;
    coverArt?: string;
}

interface RecentlyPlayedEntry {
    track: Track;
    albumInfo: AlbumInfo | null;
    playedAt: number;
}

type RepeatMode = "off" | "one" | "all";

interface PlayerContextType {
    currentTrack: Track | null;
    currentAlbum: AlbumInfo | null;
    isPlaying: boolean;
    queue: Track[];
    playTrack: (track: Track, newQueue?: Track[], albumInfo?: AlbumInfo) => void;
    playPlaylist: (playlist: Playlist, startIndex?: number) => void;
    togglePlay: () => void;
    nextTrack: () => void;
    prevTrack: () => void;
    progress: number;
    duration: number;
    seek: (time: number) => void;
    volume: number;
    setVolume: (v: number) => void;
    isLoading: boolean;
    error: string | null;
    // Shuffle + Repeat
    shuffleMode: boolean;
    toggleShuffle: () => void;
    repeatMode: RepeatMode;
    cycleRepeat: () => void;
    // Shuffle queue (pre-generated order, empty when shuffle is off)
    shuffleQueue: Track[];
    // Recently played + play counts
    recentlyPlayed: RecentlyPlayedEntry[];
    playCounts: Record<string, number>;
    // Sleep timer
    sleepMinutes: number | null;
    setSleepTimer: (minutes: number | null) => void;
    // EQ
    eqGains: { low: number; mid: number; high: number };
    setEqGain: (band: "low" | "mid" | "high", value: number) => void;
    // Visualizer — returns the live AnalyserNode for canvas rendering
    getAnalyser: () => AnalyserNode | null;
    // Volume normalisation
    normalise: boolean;
    toggleNormalise: () => void;
    // Debug
    getDebugSnapshot: () => AudioDebugSnapshot;
}

export interface AudioDebugSnapshot {
    ctxState: string;
    elementPaused: boolean;
    elementSrc: string;
    elementTime: number;
    wasPlayingBeforeHidden: boolean;
    isUserPause: boolean;
    isTransitioning: boolean;
    logs: string[];
}

const PlayerContext = createContext<PlayerContextType | undefined>(undefined);

const RECENTLY_PLAYED_KEY = "dizc_recently_played";
const PLAY_COUNTS_KEY = "dizc_play_counts";
const VOLUME_KEY = "dizc_volume";
const MAX_RECENTLY_PLAYED = 20;

// ─── Audio graph constants ────────────────────────────────────────────────────
// Logarithmic volume curve: gain = v^2 gives perceptually linear loudness
// (doubles perceived loudness every ~6 dB, matching how ears work).
// At v=1.0 → gain=1.0; v=0.5 → gain=0.25 (~−12 dBFS); v=0.0 → gain=0.0.
function linearToGain(linearVolume: number): number {
    return linearVolume * linearVolume;
}

// Preload window: start buffering next track this many seconds before end.
// Reduced from 30 to 5 seconds to prevent premature loading and hiccups
const PRELOAD_AHEAD_SECONDS = 5;


function getTrackKey(track: Track, albumInfo?: AlbumInfo | null): string {
    return `${track.title}::${albumInfo?.artist ?? ""}`;
}

function loadFromStorage<T>(key: string, fallback: T): T {
    if (typeof window === "undefined") return fallback;
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return fallback;
        return JSON.parse(raw) as T;
    } catch {
        return fallback;
    }
}

function saveToStorage(key: string, value: unknown): void {
    if (typeof window === "undefined") return;
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch {
        // quota exceeded or private browsing — fail silently
    }
}

export function PlayerProvider({ children }: { children: React.ReactNode }) {
    const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
    const [currentAlbum, setCurrentAlbum] = useState<AlbumInfo | null>(null);
    const [queue, setQueue] = useState<Track[]>([]);
    const [isPlaying, setIsPlaying] = useState(false);
    const [progress, setProgress] = useState(0);
    const [duration, setDuration] = useState(0);
    const [volume, setVolumeState] = useState(() => {
        if (typeof window === "undefined") return 1;
        const stored = parseFloat(localStorage.getItem(VOLUME_KEY) ?? "1");
        return isNaN(stored) ? 1 : Math.max(0, Math.min(1, stored));
    });
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // New state
    const [shuffleMode, setShuffleMode] = useState(false);
    const [repeatMode, setRepeatMode] = useState<RepeatMode>("off");
    const [recentlyPlayed, setRecentlyPlayed] = useState<RecentlyPlayedEntry[]>([]);
    const [playCounts, setPlayCounts] = useState<Record<string, number>>({});
    const [sleepMinutes, setSleepMinutesState] = useState<number | null>(null);
    const [shuffleQueue, setShuffleQueue] = useState<Track[]>([]);
    // EQ gains (dB) — match the defaults wired into ensureAudioContext
    const [eqGains, setEqGainsState] = useState({ low: 2, mid: 1, high: 1.5 });
    // Volume normalisation — applies a gentle -3 dB pre-gain so peaks have headroom
    const [normalise, setNormalise] = useState(false);
    const normaliseRef = useRef(false);

    // ─── Audio element refs ───────────────────────────────────────────────────
    // We use a HTMLAudioElement (not AudioBufferSourceNode) because:
    //   1. Supports streaming HTTP range requests — no need to buffer the entire
    //      file before playback starts.
    //   2. Reuses existing URL/src event model without changes.
    //   3. Works with Electron's localfile:// protocol handler out of the box.
    // The element is routed through an AudioContext graph via MediaElementSourceNode
    // for proper gain staging and dynamics processing.
    const audioRef = useRef<HTMLAudioElement | null>(null);

    // ─── Web Audio API graph refs ─────────────────────────────────────────────
    // Graph: audioElement → MediaElementSourceNode → GainNode → DynamicsCompressorNode → destination
    //
    // GainNode: logarithmic volume control. Raw HTMLAudioElement.volume is linear
    //   which sounds wrong on a slider. Gain = v^2 gives perceptually even steps.
    //
    // DynamicsCompressorNode (soft limiter): prevents inter-track loudness jumps
    //   from causing digital clipping (output > 0 dBFS). Settings:
    //     threshold: -1 dBFS — only engages when signal is nearly full scale
    //     knee:       0 dB  — hard knee, no soft saturation (limiter, not compressor)
    //     ratio:      20:1  — heavy gain reduction above threshold (limiter behaviour)
    //     attack:     0.003 s — 3 ms attack: fast enough to catch transients
    //     release:    0.25 s — 250 ms release: short enough not to pump
    //
    // One MediaElementSourceNode is created per Audio element. A single element
    // can only be connected to one context at a time, so we track the node ref.
    const audioCtxRef = useRef<AudioContext | null>(null);
    const gainNodeRef = useRef<GainNode | null>(null);
    // 3-band EQ nodes (low shelf → mid peak → high shelf)
    const eqLowRef  = useRef<BiquadFilterNode | null>(null);
    const eqMidRef  = useRef<BiquadFilterNode | null>(null);
    const eqHighRef = useRef<BiquadFilterNode | null>(null);
    // AnalyserNode — tapped after EQ for the frequency visualiser
    const analyserRef = useRef<AnalyserNode | null>(null);
    const limiterRef = useRef<DynamicsCompressorNode | null>(null);
    const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
    // Whether the AudioContext has been started via a user gesture
    const audioCtxStartedRef = useRef(false);

    const currentTrackRef = useRef<Track | null>(null);
    const currentAlbumRef = useRef<AlbumInfo | null>(null);
    const queueRef = useRef<Track[]>([]);
    const shuffleModeRef = useRef(false);
    const repeatModeRef = useRef<RepeatMode>("off");
    const sleepTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    // Tracks the pending stall-recovery setTimeout so it can be cancelled on
    // unmount or track change, preventing a fire into a dead closure.
    const stallRecoveryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    // Stable ref to nextTrackFromRefs so the audio `ended` handler (registered
    // once at mount) always calls the latest version without being stale.
    const nextTrackFromRefsRef = useRef<() => void>(() => {});
    // True while a track-switch is in progress — suppresses spurious abort/pause
    // events that the browser fires when the src is changed mid-playback.
    const isTransitioningRef = useRef(false);
    // iOS PWA: iOS pauses the audio element when the app is backgrounded or the
    // screen locks. We remember whether we were playing so we can auto-resume.
    const wasPlayingBeforeHiddenRef = useRef(false);
    // Set to true immediately before calling audio.pause() from a deliberate
    // user action (togglePlay, mediaSession pause, sleep timer). Lets handlePause
    // distinguish system-initiated pauses (where it must set wasPlayingBeforeHiddenRef)
    // from user-initiated pauses (where it must not, so we don't auto-resume).
    const isUserPauseRef = useRef(false);

    // ── Debug logger ──────────────────────────────────────────────────────────
    const debugLogsRef = useRef<string[]>([]);
    const dbg = useCallback((msg: string) => {
        const ts = new Date().toISOString().slice(11, 23); // HH:MM:SS.mmm
        const entry = `${ts} ${msg}`;
        console.log("[GhostAudio]", entry);
        debugLogsRef.current = [...debugLogsRef.current.slice(-49), entry];
    }, []);

    // Volume ref (always tracks latest user volume, avoids stale closures)
    const fadeTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const volumeRef = useRef(volume);
    // Second audio element used to pre-buffer the next track for gapless playback.
    // When the primary element ends, if this secondary element has the correct
    // src and readyState >= HAVE_FUTURE_DATA (3), we swap them rather than doing
    // a fresh network load, eliminating the gap.
    const preloadRef = useRef<HTMLAudioElement | null>(null);
    const preloadedSrcRef = useRef<string | null>(null);
    // Pre-generated shuffled track order — lets us know exactly what comes next
    const shuffleQueueRef = useRef<Track[]>([]);
    const shuffleIndexRef = useRef(0);
    // Track if preload is currently in progress to avoid multiple triggers
    const isPreloadingRef = useRef(false);
    // Gapless bridge: second GainNode + MediaElementSourceNode for the preload element.
    // gainB sits in parallel with gainNodeRef, both feeding into eqLow (additive mix).
    // Normally gainB.gain = 0 (silent). At track end, gainB is raised immediately so
    // the preload element covers the ~30 ms gap while the primary element reloads from
    // cache. Once the primary fires `playing`, we sync its position and cut gainB to 0.
    const gainBRef = useRef<GainNode | null>(null);
    const sourceBRef = useRef<MediaElementAudioSourceNode | null>(null);
    const usingPreloadBridgeRef = useRef(false);
    // True while the gapless bridge seek is in-flight (between setting
    // audio.currentTime and the resulting 'seeked' event). During this window,
    // 'ended' and 'pause' events are suppressed — seeking a freshly loaded element
    // near the beginning occasionally triggers a spurious ended event in Chromium
    // if the new track's metadata hasn't been parsed yet.
    const bridgeSeekingRef = useRef(false);

    // Extract albumInfo embedded on a track (e.g. from handleShuffleAll),
    // falling back to the provided default.
    function resolveAlbum(track: Track, fallback: AlbumInfo | null): AlbumInfo | null {
        const embedded = (track as unknown as Record<string, unknown>).albumInfo;
        return (embedded as AlbumInfo | undefined) ?? fallback;
    }

    // Fisher-Yates shuffle — returns a new shuffled array.
    function shuffleArray<T>(arr: T[]): T[] {
        const a = [...arr];
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
    }

    // Build a new shuffled play order from `tracks`, placing `currentTrack`
    // at position 0 so the currently-playing song isn't immediately repeated.
    function generateShuffleQueue(tracks: Track[], currentTrack: Track | null): void {
        if (tracks.length === 0) return;
        const others = currentTrack
            ? tracks.filter(t => t.audio_file !== currentTrack.audio_file)
            : tracks;
        const shuffled = shuffleArray(others);
        const newQueue = currentTrack ? [currentTrack, ...shuffled] : shuffled;
        shuffleQueueRef.current = newQueue;
        shuffleIndexRef.current = 0;
        setShuffleQueue(newQueue);
    }

    // Returns the fully-resolved src URL for the upcoming next track.
    // Reads only from refs so it's safe to call from mount-time event handlers.
    function resolveNextSrc(): string | null {
        let next: Track | undefined;

        if (shuffleModeRef.current) {
            const sq = shuffleQueueRef.current;
            const nextIdx = shuffleIndexRef.current + 1;
            if (nextIdx >= sq.length) return null;
            next = sq[nextIdx];
        } else {
            const track = currentTrackRef.current;
            const q = queueRef.current;
            if (!track || q.length === 0) return null;
            if (repeatModeRef.current === "one") {
                next = track;
            } else {
                const idx = q.findIndex(t => t.audio_file === track.audio_file);
                if (idx === -1) return null;
                if (idx < q.length - 1) next = q[idx + 1];
                else if (repeatModeRef.current === "all") next = q[0];
            }
        }

        if (!next) return null;

        const af = (next as unknown as Record<string, unknown>).audioFile as string | undefined ?? next.audio_file;
        if (!af) return null;

        const isLocal = !af.startsWith("http") && !af.startsWith("localfile://") && !af.startsWith("file://");
        if (isLocal) {
            const isElectron = typeof window !== "undefined" &&
                (window as unknown as Record<string, unknown>).electronAPI !== undefined;
            return isElectron ? `localfile://${af.replace(/\\/g, "/")}` : null;
        }
        return af;
    }

    // ─── AudioContext bootstrap ───────────────────────────────────────────────
    // AudioContext must be created (or resumed) inside a user gesture handler.
    // We create it lazily on the first play action and keep it alive for the
    // entire session. A single suspended context is fine — we call resume()
    // inside every user-initiated play path.
    function ensureAudioContext(): AudioContext {
        if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
            return audioCtxRef.current;
        }

        const ctx = new AudioContext({
            // "interactive" requests the smallest OS buffer the hardware allows
            // (~128–512 samples / 3–12 ms). "playback" requests the *largest*
            // buffer (optimised for battery, not responsiveness), which causes
            // audible lag on seeks and coarser crossfade transitions.
            latencyHint: "interactive",
            // Do not hardcode a sample rate — let the browser match the hardware.
            // Forcing 44100 on a 48000 Hz output device causes the OS to add a
            // software resampler, which degrades quality unnecessarily.
        });

        // GainNode for logarithmic volume control
        const gainNode = ctx.createGain();
        gainNode.gain.value = linearToGain(volumeRef.current);

        // DynamicsCompressorNode as a true brickwall limiter.
        // Only engages above -0.5 dBFS so it is completely inaudible on all
        // normal-level material. Previous settings (-1 dBFS / 20:1) caused
        // constant gain reduction on modern music (already mastered near 0 dBFS),
        // producing audible pumping, crushing, and distortion.
        //
        //   threshold: -0.5 dBFS  — only fire if output is near-clipping
        //   knee:       0 dB      — hard knee = brickwall limiter behaviour
        //   ratio:      100:1     — effectively infinite ratio (true limiter)
        //   attack:     1 ms      — catches transients before they clip
        //   release:    100 ms    — fast enough to avoid pumping artefacts
        const limiter = ctx.createDynamicsCompressor();
        limiter.threshold.value = -0.5;  // dBFS: only limit at near-clipping
        limiter.knee.value = 0;           // hard knee = brickwall limiter
        limiter.ratio.value = 100;        // ~∞:1 = true brickwall limiter
        limiter.attack.value = 0.001;     // 1 ms: fast transient catching
        limiter.release.value = 0.1;      // 100 ms: no pumping

        // ── 3-band EQ ────────────────────────────────────────────────────────
        // Placed after the volume GainNode and before the limiter.
        // All gains are gentle — the goal is flattering enhancement, not heavy EQ.
        //
        //   Low shelf  80 Hz  +2 dB — warmth and body (bass fundamentals)
        //   Mid peak  3 kHz   +1 dB — presence and vocal clarity
        //   High shelf 12 kHz +1.5 dB — air and sparkle (cymbals, reverb tails)
        const eqLow = ctx.createBiquadFilter();
        eqLow.type = "lowshelf";
        eqLow.frequency.value = 80;
        eqLow.gain.value = 2;

        const eqMid = ctx.createBiquadFilter();
        eqMid.type = "peaking";
        eqMid.frequency.value = 3000;
        eqMid.Q.value = 0.8;
        eqMid.gain.value = 1;

        const eqHigh = ctx.createBiquadFilter();
        eqHigh.type = "highshelf";
        eqHigh.frequency.value = 12000;
        eqHigh.gain.value = 1.5;

        // AnalyserNode — sits after EQ so the visualiser reflects EQ'd audio.
        // fftSize 2048 gives 1024 frequency bins; smoothing 0.75 is the standard
        // sweet spot — 0.8 made bass bins unresponsive to transients.
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 2048;
        analyser.smoothingTimeConstant = 0.75; // was 0.8: too sluggish on bass bins

        // Wire: GainNode → EQ Low → EQ Mid → EQ High → Analyser → Limiter → Speakers
        gainNode.connect(eqLow);
        eqLow.connect(eqMid);
        eqMid.connect(eqHigh);
        eqHigh.connect(analyser);
        analyser.connect(limiter);
        limiter.connect(ctx.destination);

        // GainB: parallel silent path for the preload element. Also feeds eqLow so
        // the preload audio goes through EQ + limiter when the bridge is active.
        const gainB = ctx.createGain();
        gainB.gain.value = 0;
        gainB.connect(eqLow);
        gainBRef.current = gainB;

        audioCtxRef.current  = ctx;
        gainNodeRef.current  = gainNode;
        eqLowRef.current     = eqLow;
        eqMidRef.current     = eqMid;
        eqHighRef.current    = eqHigh;
        analyserRef.current  = analyser;
        limiterRef.current   = limiter;

        // iOS fires statechange when the audio session is interrupted (screen
        // lock, phone call, switching apps) and again when the interruption
        // ends. This is more reliable than visibilitychange for resuming because:
        //   1. It fires at the exact moment iOS is ready to resume audio.
        //   2. Calling play() here is treated as an "interruption ended" resume
        //      by iOS — not a fresh play — so gesture trust is preserved.
        // When interrupted: try resume() immediately. On some iOS versions this
        // prevents the full suspension and keeps background audio uninterrupted.
        ctx.addEventListener('statechange', () => {
            dbg(`ctx statechange → ${ctx.state}`);
            if (ctx.state === 'interrupted') {
                // Attempt immediate resume on interruption start.
                // Succeeds on iOS 16+ in some scenarios (e.g. app switch without
                // a phone call). Fails silently if iOS rejects it.
                ctx.resume().catch(() => {});
                return;
            }
            if (ctx.state === 'running' && wasPlayingBeforeHiddenRef.current) {
                const audioEl = audioRef.current;
                if (audioEl && audioEl.paused) {
                    audioEl.play()
                        .then(() => {
                            dbg('statechange resume play() OK');
                            wasPlayingBeforeHiddenRef.current = false;
                        })
                        .catch(e => dbg(`statechange resume play() FAILED: ${e?.name}`));
                } else {
                    // Element still playing (audio uninterrupted on some devices)
                    wasPlayingBeforeHiddenRef.current = false;
                }
            }
        });

        return ctx;
    }

    // Connect an HTMLAudioElement into the AudioContext graph.
    // Each element gets exactly one MediaElementSourceNode — creating a second
    // one on the same element throws an InvalidStateError, so we guard against
    // reconnecting the same element.
    function connectElementToGraph(el: HTMLAudioElement): void {
        const ctx = audioCtxRef.current;
        const gainNode = gainNodeRef.current;
        if (!ctx || !gainNode) return;

        // If this element is already the connected source, nothing to do.
        if (sourceNodeRef.current) {
            // Check if the source is for this element (no direct API for this,
            // so we track it via a WeakMap-style expando property).
            const tracked = (el as unknown as Record<string, unknown>).__audioCtxConnected;
            if (tracked === ctx) return;
        }

        // Disconnect any previous source node from the graph before creating a new one.
        if (sourceNodeRef.current) {
            try { sourceNodeRef.current.disconnect(); } catch { /* already disconnected */ }
            sourceNodeRef.current = null;
        }

        const sourceNode = ctx.createMediaElementSource(el);
        sourceNode.connect(gainNode);
        sourceNodeRef.current = sourceNode;
        // Tag the element so we know it's been connected to this context
        (el as unknown as Record<string, unknown>).__audioCtxConnected = ctx;
    }

    // Connect the preload element into the secondary (gainB) audio graph path.
    // Mirrors connectElementToGraph but targets gainBRef. Called when the preload
    // element finishes buffering so it's ready for instant gapless activation.
    function connectPreloadToGraph(preload: HTMLAudioElement): void {
        const ctx = audioCtxRef.current;
        const gainB = gainBRef.current;
        if (!ctx || !gainB) return;
        // Guard: each element can only have one MediaElementSourceNode per context.
        const tracked = (preload as unknown as Record<string, unknown>).__audioCtxConnectedB;
        if (tracked === ctx) return;
        if (sourceBRef.current) {
            try { sourceBRef.current.disconnect(); } catch { /* already disconnected */ }
            sourceBRef.current = null;
        }
        const sourceB = ctx.createMediaElementSource(preload);
        sourceB.connect(gainB);
        sourceBRef.current = sourceB;
        (preload as unknown as Record<string, unknown>).__audioCtxConnectedB = ctx;
    }

    // Keep refs in sync with state
    useEffect(() => { currentTrackRef.current = currentTrack; }, [currentTrack]);
    useEffect(() => { currentAlbumRef.current = currentAlbum; }, [currentAlbum]);
    useEffect(() => { queueRef.current = queue; }, [queue]);
    useEffect(() => { shuffleModeRef.current = shuffleMode; }, [shuffleMode]);
    useEffect(() => { repeatModeRef.current = repeatMode; }, [repeatMode]);
    useEffect(() => { volumeRef.current = volume; }, [volume]);

    // Load persisted data on mount (SSR-safe)
    useEffect(() => {
        setRecentlyPlayed(loadFromStorage<RecentlyPlayedEntry[]>(RECENTLY_PLAYED_KEY, []));
        setPlayCounts(loadFromStorage<Record<string, number>>(PLAY_COUNTS_KEY, {}));
    }, []);

    // ─── Helpers ────────────────────────────────────────────────────────────────

    const addToRecentlyPlayed = useCallback((track: Track, albumInfo: AlbumInfo | null) => {
        setRecentlyPlayed(prev => {
            const filtered = prev.filter(e => e.track.title !== track.title);
            const next = [{ track, albumInfo, playedAt: Date.now() }, ...filtered].slice(0, MAX_RECENTLY_PLAYED);
            saveToStorage(RECENTLY_PLAYED_KEY, next);
            return next;
        });
    }, []);

    const incrementPlayCount = useCallback((track: Track, albumInfo: AlbumInfo | null) => {
        const key = getTrackKey(track, albumInfo);
        setPlayCounts(prev => {
            const next = { ...prev, [key]: (prev[key] ?? 0) + 1 };
            saveToStorage(PLAY_COUNTS_KEY, next);
            return next;
        });
    }, []);

    // ─── Internal play function that accepts resolved src ────────────────────────

    const playTrackInternal = useCallback((
        track: Track,
        albumInfo: AlbumInfo | null,
        resolvedQueue: Track[],
        skipAddToRecent = false,
    ) => {
        const audioFile = (track as unknown as Record<string, unknown>).audioFile as string | undefined ?? track.audio_file;

        if (!audioFile) {
            console.error("[Player] ERROR: No audio file on track!", track);
            setError("This track has no audio file.");
            setIsLoading(false);
            setIsPlaying(false);
            return;
        }

        const audio = audioRef.current;
        if (!audio) return;

        // Resolve src before any async operation
        let src = audioFile;
        const isLocalPath = src && !src.startsWith("http") && !src.startsWith("localfile://") && !src.startsWith("file://");
        const isElectron = typeof window !== "undefined" && (window as unknown as Record<string, unknown>).electronAPI !== undefined;
        if (isLocalPath) {
            if (!isElectron) {
                setError("This track is stored locally and can only be played in the Desktop App.");
                setIsPlaying(false);
                setIsLoading(false);
                return;
            }
            src = `localfile://${src.replace(/\\/g, "/")}`;
        }

        // Update UI state immediately so the new track info appears right away
        if (!skipAddToRecent) addToRecentlyPlayed(track, albumInfo);
        setCurrentTrack(track);
        currentTrackRef.current = track;
        setCurrentAlbum(albumInfo);
        currentAlbumRef.current = albumInfo;

        // Keep shuffle queue in sync
        if (shuffleModeRef.current) {
            if (resolvedQueue !== queueRef.current) {
                generateShuffleQueue(resolvedQueue, track);
            } else {
                const idx = shuffleQueueRef.current.findIndex(t => t.audio_file === audioFile);
                if (idx !== -1) shuffleIndexRef.current = idx;
            }
        }

        setQueue(resolvedQueue);
        queueRef.current = resolvedQueue;
        setIsPlaying(true);
        setIsLoading(true);
        setError(null);
        // setProgress(0) is intentionally omitted: the old track's position is kept
        // visible while the new track loads (~30 ms). duration=0 makes displayPercent
        // evaluate to 0 % via the NaN guard in PlayerBar, so the bar still reads empty.
        setDuration(0);

        // Cancel any in-progress fade
        if (fadeTimerRef.current !== null) {
            clearInterval(fadeTimerRef.current);
            fadeTimerRef.current = null;
        }

        // Reset preload and bridge flags when starting new track
        isPreloadingRef.current = false;
        // Clear bridge seek guard — if a prior bridge seek was in-flight when the
        // user manually skipped to a new track, that seek is now irrelevant and we
        // must not suppress events for the incoming track.
        bridgeSeekingRef.current = false;
        usingPreloadBridgeRef.current = false;

        // ── Bootstrap AudioContext on first play (must be inside a user gesture) ─
        // ensureAudioContext() is idempotent — safe to call every time.
        const ctx = ensureAudioContext();

        // Resume if the context was suspended by the browser's autoplay policy.
        // This is a no-op if it's already running.
        if (ctx.state !== "running" && ctx.state !== "closed") {
            ctx.resume().catch(e => console.warn("[Player] AudioContext resume failed:", e));
        }
        audioCtxStartedRef.current = true;

        // ── Gapless swap: if the preload element already has this src buffered,
        //    and the audio graph is connected to the primary element, we need to
        //    keep using the primary element (MediaElementSourceNode is 1:1 with
        //    the element). The preload buffer is HTTP-level only — the browser's
        //    cache means when we set audio.src to the same URL the preloaded
        //    element was fetching, the data comes from cache instantly.
        //    This avoids any network stall at track boundaries. ────────────────
        if (preloadedSrcRef.current !== src) {
            preloadedSrcRef.current = null;
        }

        console.log("[Player] Playing src:", src);

        isTransitioningRef.current = true;

        // Restore gain to the user's current volume level before src assignment.
        // Cancels any in-flight ramp (e.g. from a prior crossfade) so the new
        // track starts at full volume immediately with no fade-in.
        if (gainNodeRef.current) {
            const target = linearToGain(volumeRef.current);
            if (ctx.state === "running") {
                const now = ctx.currentTime;
                gainNodeRef.current.gain.cancelScheduledValues(now);
                gainNodeRef.current.gain.setValueAtTime(target, now);
            } else {
                gainNodeRef.current.gain.value = target;
            }
        }

        // ── Gapless bridge ─────────────────────────────────────────────────────
        // If the preload element has this src buffered AND is wired into gainB,
        // raise gainB immediately so audio plays without interruption. The primary
        // element still reloads from cache in the background; handlePlaying will
        // sync its position to the preload's and cut the bridge (~30 ms later).
        const preload = preloadRef.current;
        const gainB = gainBRef.current;
        const bridgeReady = preload && gainB &&
            preloadedSrcRef.current === src &&
            preload.readyState >= 3 &&
            (preload as unknown as Record<string, unknown>).__audioCtxConnectedB === audioCtxRef.current;

        if (bridgeReady) {
            dbg(`gapless bridge: activating preload for "${track.title}"`);
            const now = ctx.currentTime;
            const target = linearToGain(volumeRef.current);
            gainB.gain.cancelScheduledValues(now);
            gainB.gain.setValueAtTime(target, now);
            preload!.muted = false;
            preload!.volume = 1;
            preload!.play().catch(e => { if (e.name !== "AbortError") console.error("[Player] Bridge play failed:", e); });
            usingPreloadBridgeRef.current = true;
        }

        // Always load the primary element from cache — in the bridge case this
        // runs concurrently and handlePlaying completes the handoff; in the normal
        // case this is the only playback path.
        audio.src = src;
        audio.play().catch(e => {
            if (e.name === "AbortError") return;
            isTransitioningRef.current = false;
            console.error("[Player] Playback failed:", e);
        });
    }, [addToRecentlyPlayed]);

    // ─── nextTrack (ref-safe, used inside ended handler) ─────────────────────────

    const nextTrackFromRefs = useCallback(() => {
        const track = currentTrackRef.current;
        const q = queueRef.current;
        const album = currentAlbumRef.current;
        const audio = audioRef.current;

        if (!track) return;

        if (repeatModeRef.current === "one") {
            if (audioRef.current) {
                audioRef.current.currentTime = 0;
                audioRef.current.play().catch(e => {
                    if (e.name !== "AbortError") console.error("[Player] Repeat-one play failed:", e);
                });
            }
            return;
        }

        if (q.length === 0) return;

        if (shuffleModeRef.current) {
            const sq = shuffleQueueRef.current;
            const nextIdx = shuffleIndexRef.current + 1;
            if (nextIdx < sq.length) {
                shuffleIndexRef.current = nextIdx;
                playTrackInternal(sq[nextIdx], resolveAlbum(sq[nextIdx], album), q);
            } else if (repeatModeRef.current === "all") {
                generateShuffleQueue(q, null);
                const first = shuffleQueueRef.current[0];
                if (first) playTrackInternal(first, resolveAlbum(first, album), q);
            } else {
                setIsPlaying(false);
                setProgress(0);
            }
            return;
        }

        const currentIndex = q.findIndex(t => t.audio_file === track.audio_file);

        if (currentIndex === -1) {
            dbg(`nextTrack: track not found in queue (audio_file mismatch?) → stopping`);
            setIsPlaying(false);
            setProgress(0);
            return;
        }

        if (currentIndex < q.length - 1) {
            const next = q[currentIndex + 1];
            dbg(`nextTrack: ${currentIndex} → ${currentIndex + 1} "${next.title}"`);
            playTrackInternal(next, resolveAlbum(next, album), q);
        } else if (repeatModeRef.current === "all") {
            dbg(`nextTrack: end of queue → repeat all → q[0] "${q[0].title}"`);
            playTrackInternal(q[0], resolveAlbum(q[0], album), q);
        } else {
            dbg(`nextTrack: end of queue → stopping`);
            setIsPlaying(false);
            setProgress(0);
        }
    }, [playTrackInternal]);

    // Keep the ref always pointing to the latest version of nextTrackFromRefs
    useEffect(() => {
        nextTrackFromRefsRef.current = nextTrackFromRefs;
    }, [nextTrackFromRefs]);

    // ─── Media Session API (lock screen / notification controls) ─────────────────

    useEffect(() => {
        if (!("mediaSession" in navigator)) return;
        if (!currentTrack) return;

        const artwork: MediaImage[] = [];
        if (currentAlbum?.coverArt) {
            artwork.push({ src: currentAlbum.coverArt, sizes: "512x512", type: "image/jpeg" });
        }

        navigator.mediaSession.metadata = new MediaMetadata({
            title: currentTrack.title,
            artist: currentAlbum?.artist ?? "",
            album: currentAlbum?.title ?? "",
            artwork,
        });
    }, [currentTrack, currentAlbum]);

    useEffect(() => {
        if (!("mediaSession" in navigator)) return;
        navigator.mediaSession.playbackState = isPlaying ? "playing" : "paused";
    }, [isPlaying]);

    useEffect(() => {
        if (!("mediaSession" in navigator)) return;
        if (!duration || !isFinite(duration) || duration <= 0) return;
        try {
            navigator.mediaSession.setPositionState({
                duration,
                playbackRate: 1,
                position: Math.min(progress, duration),
            });
        } catch {
            // setPositionState may throw if duration/position are invalid
        }
    }, [progress, duration]);

    useEffect(() => {
        if (!("mediaSession" in navigator)) return;

        navigator.mediaSession.setActionHandler("play", () => {
            // iOS lock-screen play button fires this handler as a user gesture.
            // Call ctx.resume() and audio.play() synchronously — chaining play()
            // inside .then() loses iOS gesture trust and produces NotAllowedError.
            const ctx = audioCtxRef.current;
            if (ctx && ctx.state !== "running" && ctx.state !== "closed") {
                ctx.resume().catch(() => {});
            }
            audioRef.current?.play()
                .then(() => {
                    wasPlayingBeforeHiddenRef.current = false;
                    setIsPlaying(true);
                })
                .catch(() => {});
        });
        navigator.mediaSession.setActionHandler("pause", () => {
            // Explicit user action from the lock screen — flag it so handlePause
            // does not set the iOS auto-resume intent.
            isUserPauseRef.current = true;
            wasPlayingBeforeHiddenRef.current = false;
            audioRef.current?.pause();
            setIsPlaying(false);
        });
        navigator.mediaSession.setActionHandler("nexttrack", () => {
            nextTrackFromRefsRef.current();
        });
        navigator.mediaSession.setActionHandler("previoustrack", () => {
            if (audioRef.current && audioRef.current.currentTime > 3) {
                audioRef.current.currentTime = 0;
            } else {
                const track = currentTrackRef.current;
                const q = queueRef.current;
                const album = currentAlbumRef.current;
                if (!track || q.length === 0) return;
                const idx = q.findIndex(t => t.audio_file === track.audio_file);
                if (idx > 0) {
                    const prev = q[idx - 1];
                    playTrackInternal(prev, resolveAlbum(prev, album), q);
                }
            }
        });
        navigator.mediaSession.setActionHandler("seekto", (details) => {
            if (details.seekTime !== undefined && audioRef.current) {
                audioRef.current.currentTime = details.seekTime;
                setProgress(details.seekTime);
            }
        });

        return () => {
            (["play", "pause", "nexttrack", "previoustrack", "seekto"] as MediaSessionAction[]).forEach(
                (action) => {
                    try { navigator.mediaSession.setActionHandler(action, null); } catch { /* ignore */ }
                }
            );
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [playTrackInternal]);

    // ─── Audio element setup ──────────────────────────────────────────────────────

    useEffect(() => {
        const audio = new Audio();
        audio.preload = "auto";
        // crossOrigin = "anonymous" is required so that the browser allows
        // AudioContext to process the audio stream when the source is a
        // cross-origin URL (e.g. R2 public URLs). Without this attribute the
        // browser taints the media element and createMediaElementSource() throws
        // a SecurityError. For localfile:// URLs this has no effect.
        // NOTE: R2 bucket must serve Access-Control-Allow-Origin: * headers.
        audio.crossOrigin = "anonymous";
        audioRef.current = audio;

        // Preload element: same CORS settings required so the browser shares the
        // cache entry with the primary element (same-origin + CORS credentials
        // must match for the HTTP cache key to match).
        const preload = new Audio();
        preload.preload = "auto";
        preload.crossOrigin = "anonymous";
        preload.volume = 0;   // Never actually played — only used for prefetching
        preload.muted = true; // Hard mute: volume=0 alone is not guaranteed across all
                              // Chromium/Electron audio routing paths for custom protocols
        preloadRef.current = preload;

        // Track last reported duration to avoid redundant React state updates.
        // setDuration fires a re-render; calling it on every timeupdate (4–8 Hz)
        // when duration hasn't changed adds unnecessary GC and render pressure.
        let lastReportedDuration = 0;

        const handleTimeUpdate = () => {
            setProgress(audio.currentTime);
            if (audio.duration && isFinite(audio.duration) && audio.duration > 0) {
                if (audio.duration !== lastReportedDuration) {
                    lastReportedDuration = audio.duration;
                    setDuration(audio.duration);
                }

                // Don't preload if we're already at the end
                if (audio.currentTime >= audio.duration - 0.5) return;
                
                // Kick off preloading when within PRELOAD_AHEAD_SECONDS of the end.
                // Using a second Audio element means the browser starts fetching
                // the next file's first chunks into its HTTP cache while the
                // current track is still playing. When playTrackInternal later sets
                // audio.src to the same URL, the browser serves it from cache —
                // eliminating the network round-trip that causes gaps.
                const remaining = audio.duration - audio.currentTime;
                if (remaining > 0 && remaining < PRELOAD_AHEAD_SECONDS && preloadRef.current && !isPreloadingRef.current) {
                    const nextSrc = resolveNextSrc();
                    if (nextSrc && preloadedSrcRef.current !== nextSrc) {
                        isPreloadingRef.current = true;
                        preloadedSrcRef.current = nextSrc;
                        // Add a small delay to prevent interfering with current playback
                        setTimeout(() => {
                            if (preloadRef.current && preloadedSrcRef.current === nextSrc) {
                                preloadRef.current.src = nextSrc;
                                preloadRef.current.load();
                                preloadRef.current.pause();
                                isPreloadingRef.current = false;
                                // Connect preload element to gainB so it's wired
                                // into the graph and ready for gapless activation.
                                if (audioCtxStartedRef.current) {
                                    connectPreloadToGraph(preloadRef.current);
                                }
                            }
                        }, 100);
                        console.log("[Player] Preloading next track:", nextSrc);
                    }
                }
            }
        };

        const handleLoadedMetadata = () => {
            if (audio.duration && isFinite(audio.duration)) {
                setDuration(audio.duration);
            }
        };

        const handleDurationChange = () => {
            if (audio.duration && isFinite(audio.duration)) {
                setDuration(audio.duration);
            }
        };

        const handleCanPlay = () => {
            if (audio.duration && isFinite(audio.duration)) {
                setDuration(audio.duration);
            }

            // Connect the audio element to the AudioContext graph first so that
            // the gain ramp below is applied to an already-live source node.
            // (createMediaElementSource throws before the context is initialised,
            // so we guard with audioCtxStartedRef.)
            if (audioCtxStartedRef.current) {
                connectElementToGraph(audio);
            }

        };

        const handleEnded = () => {
            if (isTransitioningRef.current) return;
            // Suppress spurious 'ended' during the gapless bridge seek. Chromium can
            // fire 'ended' before 'seeked' when seeking a freshly-loaded element whose
            // duration hasn't been parsed yet. The seek is intentional; ignore it.
            if (bridgeSeekingRef.current) {
                dbg(`ended IGNORED (bridge seek in flight)`);
                return;
            }
            dbg(`ended | track="${currentTrackRef.current?.title}"`);
            const track = currentTrackRef.current;
            const album = currentAlbumRef.current;
            if (track) {
                incrementPlayCount(track, album);
                addToRecentlyPlayed(track, album);
            }
            nextTrackFromRefsRef.current();
        };

        const handleError = (e: Event) => {
            const audioEl = e.target as HTMLAudioElement;
            const msg = audioEl.error?.message || `Audio error (code ${audioEl.error?.code})`;
            console.error("[Player] Audio error:", msg);
            console.error("[Player] Failed src:", audioEl.src);
            setError(msg);
            setIsLoading(false);
            setIsPlaying(false);
        };

        const handleWaiting = () => setIsLoading(true);

        const handlePlaying = () => {
            const ctxState = audioCtxRef.current?.state ?? "none";
            dbg(`playing | ctx=${ctxState} wasHidden=${wasPlayingBeforeHiddenRef.current}`);
            setTimeout(() => { isTransitioningRef.current = false; }, 300);
            setIsLoading(false);
            setError(null);
            setIsPlaying(true);
            wasPlayingBeforeHiddenRef.current = false;
            if (audioCtxStartedRef.current) {
                connectElementToGraph(audio);
            }

            // Complete the gapless bridge: primary element is now decoded and playing
            // from the HTTP cache. Sync its position to the preload element's current
            // playhead, then — AFTER the seek lands ('seeked' event) — cut gainB to 0
            // and let the primary take over.
            //
            // We must NOT do the gainB cutover synchronously here. Setting
            // audio.currentTime on a freshly-loaded element emits 'seeking', then
            // 'seeked'. In Chromium, if the element's duration hasn't been parsed yet
            // when the seek fires, the browser can emit a spurious 'ended' event
            // before 'seeked'. Deferring the cutover to 'seeked' ensures the element
            // is in a stable state before we mute the bridge and expose the primary.
            if (usingPreloadBridgeRef.current) {
                const preload = preloadRef.current;
                const ctx = audioCtxRef.current;
                const gainB = gainBRef.current;
                const gainNode = gainNodeRef.current;
                if (preload && ctx && gainB && gainNode) {
                    // Snapshot the preload position before any async gap
                    const syncTime = preload.currentTime;
                    dbg(`gapless bridge: seeking primary to ${syncTime.toFixed(3)} s`);
                    // Flag so 'ended' and 'pause' events fired during the seek are
                    // suppressed — we are in a deliberate in-flight seek.
                    bridgeSeekingRef.current = true;
                    audio.currentTime = syncTime;
                    // The 'seeked' handler below will complete the cutover.
                }
            }
        };

        // Fired when audio.currentTime assignment completes (decode pipeline stable).
        // This is where we safely complete the gapless bridge handoff.
        const handleSeeked = () => {
            if (!bridgeSeekingRef.current) return;
            bridgeSeekingRef.current = false;
            const preload = preloadRef.current;
            const ctx = audioCtxRef.current;
            const gainB = gainBRef.current;
            const gainNode = gainNodeRef.current;
            if (preload && ctx && gainB && gainNode) {
                const now = ctx.currentTime;
                const target = linearToGain(volumeRef.current);
                gainNode.gain.cancelScheduledValues(now);
                gainNode.gain.setValueAtTime(target, now);
                gainB.gain.cancelScheduledValues(now);
                gainB.gain.setValueAtTime(0, now);
                preload.pause();
                preload.muted = true;
                dbg(`gapless bridge: handed off (seeked) at ${audio.currentTime.toFixed(3)} s`);
            }
            usingPreloadBridgeRef.current = false;
            preloadedSrcRef.current = null;
            isPreloadingRef.current = false;
        };

        const handlePause = () => {
            if (isTransitioningRef.current) {
                dbg(`pause IGNORED (transitioning)`);
                return;
            }
            // Suppress pause events fired during the gapless bridge seek. The browser
            // may emit a transient 'pause' between 'seeking' and 'seeked'.
            if (bridgeSeekingRef.current) {
                dbg(`pause IGNORED (bridge seek in flight)`);
                return;
            }
            // Browser fires pause then ended when a track finishes naturally.
            // At this point audio.ended is true — ignore it, handleEnded takes over.
            if (audio.ended || (audio.duration > 0 && audio.currentTime >= audio.duration - 0.1)) {
                dbg(`pause at track end — ignored`);
                return;
            }
            if (isUserPauseRef.current) {
                dbg(`pause user-initiated`);
                isUserPauseRef.current = false;
                setIsPlaying(false);
                return;
            }
            dbg(`pause SYSTEM | vis=${document.visibilityState} ctx=${audioCtxRef.current?.state ?? "none"} → wasHidden=true`);
            wasPlayingBeforeHiddenRef.current = true;
            setIsPlaying(false);
        };

        // Browser suspended the download — not an error, keep UI state as-is.
        const handleSuspend = () => {};

        // Network stall recovery. The reliable fix is to save the position,
        // reload the element, and seek back. Simply setting currentTime on a
        // stalled element does nothing in some Chromium versions.
        const handleStalled = () => {
            if (audioRef.current !== audio) return;
            // A stall during a track transition (src reassignment) is expected and
            // benign — the browser aborts the previous request and starts the new
            // one, which briefly looks like a stall. Scheduling a reload here would
            // call audio.load() on the new src 3 seconds later, resetting the decode
            // pipeline mid-playback and causing the pitch-shift / slowdown artefact.
            if (isTransitioningRef.current) return;
            const savedSrc = audio.src;
            const savedTime = audio.currentTime;
            const wasPaused = audio.paused;

            // Cancel any prior pending recovery before scheduling a new one.
            if (stallRecoveryTimerRef.current !== null) {
                clearTimeout(stallRecoveryTimerRef.current);
            }

            // Wait 3 s before intervening — transient stalls recover on their own.
            // Stored in stallRecoveryTimerRef so unmount/track-change can cancel it.
            stallRecoveryTimerRef.current = setTimeout(() => {
                stallRecoveryTimerRef.current = null;
                if (audioRef.current !== audio || audio.src !== savedSrc) return;
                // Only intervene if still stalled (readyState < HAVE_FUTURE_DATA)
                if (audio.readyState >= 3) return;

                console.warn("[Player] Stall detected, reloading from:", savedTime.toFixed(2));
                try {
                    // audio.load() fires an "abort" event synchronously; guard with
                    // isTransitioningRef so handleAbort does not set isPlaying(false)
                    // and kill playback while we are intentionally reloading.
                    // Do NOT clear isTransitioningRef synchronously here — audio.play()
                    // is async and the browser fires another pause during decode-pipeline
                    // re-init after the reload. handlePlaying's setTimeout(300) will
                    // clear the flag once the pipeline has stabilised.
                    isTransitioningRef.current = true;
                    // Reset preload state — after a real stall recovery the preload
                    // element's buffer is stale. Clearing these flags lets
                    // handleTimeUpdate trigger a fresh preload once playback resumes.
                    isPreloadingRef.current = false;
                    preloadedSrcRef.current = null;
                    audio.load();
                    audio.currentTime = savedTime;
                    if (!wasPaused) {
                        // Resume AudioContext before play — if the stall occurred
                        // while the page was hidden (iOS backgrounded), the context
                        // will be suspended. Playing into a suspended context produces
                        // silence and fires handlePlaying (which clears
                        // wasPlayingBeforeHiddenRef), leaving unlock with no resume intent.
                        if (audioCtxRef.current && audioCtxRef.current.state !== "running" && audioCtxRef.current.state !== "closed") {
                            audioCtxRef.current.resume().catch(() => {});
                        }
                        audio.play().catch(() => {});
                    }
                    // isTransitioningRef cleared by handlePlaying's setTimeout(300)
                } catch {
                    isTransitioningRef.current = false;
                }
            }, 3000);
        };

        const handleAbort = () => {
            if (isTransitioningRef.current) return;
            setIsLoading(false);
            setIsPlaying(false);
        };

        // iOS PWA / Android Chrome / Electron: save playing intent when hidden,
        // restore on visible.
        //
        // iOS timing (documented): screen lock → pause event (visibilityState
        // still "visible") → visibilitychange (state → "hidden"). So handlePause
        // above sets wasPlayingBeforeHiddenRef unconditionally on any non-
        // transitioning pause. Here we handle two edge cases:
        //   1. The page goes hidden while audio is still playing (handlePause
        //      hasn't fired yet) — snap the flag here too.
        //   2. The pause was a genuine user pause (phone stayed visible) — clear
        //      the flag when the page becomes visible and audio is still paused,
        //      meaning the user actually meant to pause.
        const handleVisibilityChange = () => {
            const ctxState = audioCtxRef.current?.state ?? "none";
            if (document.visibilityState === "hidden") {
                const playing = audioRef.current != null && !audioRef.current.paused;
                dbg(`visibility→hidden | elPlaying=${playing} ctx=${ctxState}`);
                if (playing) wasPlayingBeforeHiddenRef.current = true;
                return;
            }

            if (document.visibilityState === "visible" && audioRef.current) {
                const elPaused = audioRef.current.paused;
                dbg(`visibility→visible | elPaused=${elPaused} ctx=${ctxState} wasHidden=${wasPlayingBeforeHiddenRef.current}`);

                // Always resume AudioContext — iOS suspends it on every background.
                // Do NOT gate on wasPlayingBeforeHiddenRef: handlePlaying clears that
                // flag when iOS auto-resumes the element before visibilitychange fires,
                // leaving the AudioContext suspended and producing silence.
                if (audioCtxRef.current && audioCtxRef.current.state !== "running" && audioCtxRef.current.state !== "closed") {
                    audioCtxRef.current.resume()
                        .then(() => dbg(`ctx.resume() OK`))
                        .catch(e => dbg(`ctx.resume() FAILED: ${e?.name}`));
                }

                if (wasPlayingBeforeHiddenRef.current && elPaused) {
                    // play() called synchronously — required for iOS gesture trust.
                    // Flag cleared only on success so handleTouchResume can retry.
                    audioRef.current.play()
                        .then(() => {
                            dbg(`play() after unlock OK`);
                            wasPlayingBeforeHiddenRef.current = false;
                        })
                        .catch(e => dbg(`play() after unlock FAILED: ${e?.name} → touchstart will retry`));
                } else if (audioCtxRef.current?.state === "running") {
                    // Element is already playing AND context is running — truly fine.
                    // Only clear the flag here: if the context is still interrupted,
                    // the statechange → running handler must keep the flag to resume.
                    wasPlayingBeforeHiddenRef.current = false;
                }
                // else: context still interrupted with element playing — leave flag set
                // so statechange → running can call audio.play() once ctx recovers.
            }
        };

        const handleTouchResume = () => {
            if (!wasPlayingBeforeHiddenRef.current) return;
            const audioEl = audioRef.current;
            if (!audioEl || !audioEl.paused) return;
            dbg(`touchstart resume | ctx=${audioCtxRef.current?.state ?? "none"}`);
            const ctx = audioCtxRef.current;
            if (ctx && ctx.state !== "running" && ctx.state !== "closed") ctx.resume().catch(() => {});
            audioEl.play()
                .then(() => {
                    dbg(`touchstart play() OK`);
                    wasPlayingBeforeHiddenRef.current = false;
                })
                .catch(e => dbg(`touchstart play() FAILED: ${e?.name}`));
        };

        audio.addEventListener("timeupdate", handleTimeUpdate);
        audio.addEventListener("loadedmetadata", handleLoadedMetadata);
        audio.addEventListener("durationchange", handleDurationChange);
        audio.addEventListener("canplay", handleCanPlay);
        audio.addEventListener("ended", handleEnded);
        audio.addEventListener("error", handleError);
        audio.addEventListener("waiting", handleWaiting);
        audio.addEventListener("playing", handlePlaying);
        audio.addEventListener("seeked", handleSeeked);
        audio.addEventListener("pause", handlePause);
        audio.addEventListener("suspend", handleSuspend);
        audio.addEventListener("stalled", handleStalled);
        audio.addEventListener("abort", handleAbort);
        document.addEventListener("visibilitychange", handleVisibilityChange);
        document.addEventListener("touchstart", handleTouchResume, { passive: true });

        return () => {
            isUserPauseRef.current = true; // cleanup pause is not a system pause
            // Clear bridge seek flag so any in-flight seek doesn't leave stale state
            bridgeSeekingRef.current = false;
            usingPreloadBridgeRef.current = false;
            audio.pause();
            audio.src = "";
            if (preloadRef.current) {
                preloadRef.current.src = "";
                preloadRef.current = null;
            }
            // Cancel any pending stall-recovery timeout so it doesn't fire into
            // a destroyed element after unmount.
            if (stallRecoveryTimerRef.current !== null) {
                clearTimeout(stallRecoveryTimerRef.current);
                stallRecoveryTimerRef.current = null;
            }
            // Tear down the AudioContext graph
            if (sourceNodeRef.current) {
                try { sourceNodeRef.current.disconnect(); } catch { /* ignore */ }
                sourceNodeRef.current = null;
            }
            if (gainNodeRef.current) {
                try { gainNodeRef.current.disconnect(); } catch { /* ignore */ }
                gainNodeRef.current = null;
            }
            if (sourceBRef.current) {
                try { sourceBRef.current.disconnect(); } catch { /* ignore */ }
                sourceBRef.current = null;
            }
            if (gainBRef.current) {
                try { gainBRef.current.disconnect(); } catch { /* ignore */ }
                gainBRef.current = null;
            }
            for (const ref of [eqLowRef, eqMidRef, eqHighRef]) {
                if (ref.current) {
                    try { ref.current.disconnect(); } catch { /* ignore */ }
                    ref.current = null;
                }
            }
            if (analyserRef.current) {
                try { analyserRef.current.disconnect(); } catch { /* ignore */ }
                analyserRef.current = null;
            }
            if (limiterRef.current) {
                try { limiterRef.current.disconnect(); } catch { /* ignore */ }
                limiterRef.current = null;
            }
            if (audioCtxRef.current) {
                audioCtxRef.current.close().catch(() => {});
                audioCtxRef.current = null;
            }
            audioCtxStartedRef.current = false;

            audio.removeEventListener("timeupdate", handleTimeUpdate);
            audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
            audio.removeEventListener("durationchange", handleDurationChange);
            audio.removeEventListener("canplay", handleCanPlay);
            audio.removeEventListener("ended", handleEnded);
            audio.removeEventListener("error", handleError);
            audio.removeEventListener("waiting", handleWaiting);
            audio.removeEventListener("playing", handlePlaying);
            audio.removeEventListener("seeked", handleSeeked);
            audio.removeEventListener("pause", handlePause);
            audio.removeEventListener("suspend", handleSuspend);
            audio.removeEventListener("stalled", handleStalled);
            audio.removeEventListener("abort", handleAbort);
            document.removeEventListener("visibilitychange", handleVisibilityChange);
            document.removeEventListener("touchstart", handleTouchResume);
        };
        // Stable references — intentionally empty dependency array.
        // All mutable state is accessed via refs inside the handlers.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ─── Public API ───────────────────────────────────────────────────────────────

    const setVolume = (v: number) => {
        const clamped = Math.max(0, Math.min(1, v));
        setVolumeState(clamped);
        volumeRef.current = clamped;
        saveToStorage(VOLUME_KEY, clamped);

        // Apply volume through the AudioContext GainNode using a logarithmic curve.
        // gain = v^2 maps the linear slider value to a perceptually even loudness
        // progression (each 10% slider step sounds like the same perceptual jump).
        // If normalise is active, preserve the -3 dB (×0.708) ceiling here so
        // the offset isn't silently dropped when the user adjusts the slider.
        if (gainNodeRef.current && audioCtxRef.current) {
            const baseGain = linearToGain(clamped);
            const targetGain = normaliseRef.current ? baseGain * 0.708 : baseGain; // 0.708 ≈ -3 dB
            const now = audioCtxRef.current.currentTime;
            // 20 ms exponential ramp: exponential sounds natural on a log-scale
            // parameter (gain already represents dB) and prevents zipper noise.
            // Exponential ramp cannot target exactly 0, so for mute we use a
            // near-silent value and let the element-level volume handle true mute.
            const safeTarget = Math.max(targetGain, 0.0001);
            gainNodeRef.current.gain.cancelScheduledValues(now);
            gainNodeRef.current.gain.setValueAtTime(
                Math.max(gainNodeRef.current.gain.value, 0.0001), now
            );
            gainNodeRef.current.gain.exponentialRampToValueAtTime(safeTarget, now + 0.02);
            // For true mute, schedule a hard zero after the ramp completes
            if (targetGain === 0) {
                gainNodeRef.current.gain.setValueAtTime(0, now + 0.02);
            }
        } else {
            // AudioContext not yet initialised (before first play) — fall back to
            // element volume so the mute/volume slider still works immediately.
            if (audioRef.current) {
                audioRef.current.volume = clamped;
            }
        }
    };

    const playTrack = (track: Track, newQueue?: Track[], albumInfo?: AlbumInfo) => {
        console.log("[Player] playTrack called with:", track);
        const resolvedQueue = newQueue ?? queueRef.current;
        const resolvedAlbum = albumInfo ?? resolveAlbum(track, currentAlbumRef.current);
        playTrackInternal(track, resolvedAlbum, resolvedQueue);
    };

    const playPlaylist = (playlist: Playlist, startIndex = 0) => {
        const items = playlist.items || [];
        if (items.length === 0) return;
        const tracks: Track[] = items.map((item, idx) => ({
            id: idx + 1,
            title: item.title,
            track_number: item.trackNumber,
            audio_file: item.audioFile,
            duration: item.duration,
        }));
        const albumInfo: AlbumInfo = {
            title: playlist.name,
            artist: "",
            coverArt: playlist.cover_arts?.[0],
        };
        playTrackInternal(tracks[startIndex], albumInfo, tracks);
    };

    const togglePlay = () => {
        if (!currentTrackRef.current) return;
        const audio = audioRef.current;
        if (!audio) return;

        if (isPlaying) {
            // Explicit user pause — flag it so handlePause does not set the
            // iOS auto-resume intent (wasPlayingBeforeHiddenRef).
            isUserPauseRef.current = true;
            audio.pause();
            // handlePause listener will set isPlaying(false)
        } else {
            // Resume AudioContext synchronously — calling play() inside .then()
            // loses iOS gesture trust and produces NotAllowedError.
            if (audioCtxRef.current && audioCtxRef.current.state !== "running" && audioCtxRef.current.state !== "closed") {
                audioCtxRef.current.resume().catch(() => {});
            }
            audio.play().catch(e => console.error("Playback failed:", e));
            // handlePlaying listener will set isPlaying(true)
        }
    };

    const nextTrack = () => {
        nextTrackFromRefs();
    };

    const prevTrack = () => {
        const track = currentTrackRef.current;
        const q = queueRef.current;
        const album = currentAlbumRef.current;

        if (!track) return;

        if (audioRef.current && audioRef.current.currentTime > 3) {
            audioRef.current.currentTime = 0;
            return;
        }

        if (q.length === 0) return;

        if (shuffleModeRef.current) {
            const prevIdx = shuffleIndexRef.current - 1;
            if (prevIdx >= 0) {
                shuffleIndexRef.current = prevIdx;
                const prev = shuffleQueueRef.current[prevIdx];
                playTrackInternal(prev, resolveAlbum(prev, album), q);
            }
            return;
        }

        const currentIndex = q.findIndex(t => t.audio_file === track.audio_file);
        if (currentIndex > 0) {
            const prev = q[currentIndex - 1];
            playTrackInternal(prev, resolveAlbum(prev, album), q);
        } else if (repeatModeRef.current === "all") {
            const last = q[q.length - 1];
            playTrackInternal(last, resolveAlbum(last, album), q);
        }
    };

    const seek = (time: number) => {
        if (audioRef.current) {
            audioRef.current.currentTime = time;
            setProgress(time);
        }
    };

    const toggleShuffle = () => {
        const next = !shuffleModeRef.current;
        shuffleModeRef.current = next;
        setShuffleMode(next);
        if (next) {
            generateShuffleQueue(queueRef.current, currentTrackRef.current);
        } else {
            shuffleQueueRef.current = [];
            shuffleIndexRef.current = 0;
            setShuffleQueue([]);
        }
    };

    const cycleRepeat = () => {
        setRepeatMode(prev => {
            const order: RepeatMode[] = ["off", "all", "one"];
            const next = order[(order.indexOf(prev) + 1) % order.length];
            repeatModeRef.current = next;
            return next;
        });
    };

    // ─── EQ ──────────────────────────────────────────────────────────────────────

    const setEqGain = (band: "low" | "mid" | "high", value: number) => {
        const clamped = Math.max(-12, Math.min(12, value));
        setEqGainsState(prev => ({ ...prev, [band]: clamped }));
        const nodeRef = band === "low" ? eqLowRef : band === "mid" ? eqMidRef : eqHighRef;
        if (nodeRef.current) {
            nodeRef.current.gain.value = clamped;
        }
    };

    // ─── Visualiser ───────────────────────────────────────────────────────────────

    const getAnalyser = () => analyserRef.current;

    // ─── Volume normalisation ─────────────────────────────────────────────────────
    // Applies a -3 dB ceiling on the GainNode when enabled, giving all tracks
    // consistent perceived loudness without full LUFS analysis.

    const toggleNormalise = () => {
        const next = !normaliseRef.current;
        normaliseRef.current = next;
        setNormalise(next);
        if (gainNodeRef.current && audioCtxRef.current) {
            const baseGain = linearToGain(volumeRef.current);
            const targetGain = next ? baseGain * 0.708 : baseGain; // 0.708 ≈ -3 dB
            const now = audioCtxRef.current.currentTime;
            const safeTarget = Math.max(targetGain, 0.0001);
            gainNodeRef.current.gain.cancelScheduledValues(now);
            gainNodeRef.current.gain.setValueAtTime(
                Math.max(gainNodeRef.current.gain.value, 0.0001), now
            );
            gainNodeRef.current.gain.exponentialRampToValueAtTime(safeTarget, now + 0.05);
        }
    };

    const setSleepTimer = (minutes: number | null) => {
        if (sleepTimeoutRef.current !== null) {
            clearTimeout(sleepTimeoutRef.current);
            sleepTimeoutRef.current = null;
        }

        setSleepMinutesState(minutes);

        if (minutes !== null && minutes > 0) {
            sleepTimeoutRef.current = setTimeout(() => {
                if (audioRef.current) {
                    // Flag as a deliberate (timer-initiated) pause so handlePause
                    // does not set the iOS auto-resume intent.
                    isUserPauseRef.current = true;
                    audioRef.current.pause();
                }
                setIsPlaying(false);
                setSleepMinutesState(null);
                sleepTimeoutRef.current = null;
            }, minutes * 60 * 1000);
        }
    };

    return (
        <PlayerContext.Provider value={{
            currentTrack,
            currentAlbum,
            isPlaying,
            queue,
            playTrack,
            playPlaylist,
            togglePlay,
            nextTrack,
            prevTrack,
            progress,
            duration,
            seek,
            volume,
            setVolume,
            isLoading,
            error,
            shuffleMode,
            toggleShuffle,
            repeatMode,
            cycleRepeat,
            shuffleQueue,
            recentlyPlayed,
            playCounts,
            sleepMinutes,
            setSleepTimer,
            eqGains,
            setEqGain,
            getAnalyser,
            normalise,
            toggleNormalise,
            getDebugSnapshot: () => ({
                ctxState: audioCtxRef.current?.state ?? "none",
                elementPaused: audioRef.current?.paused ?? true,
                elementSrc: (audioRef.current?.src ?? "").split("/").pop() ?? "",
                elementTime: audioRef.current?.currentTime ?? 0,
                wasPlayingBeforeHidden: wasPlayingBeforeHiddenRef.current,
                isUserPause: isUserPauseRef.current,
                isTransitioning: isTransitioningRef.current,
                logs: [...debugLogsRef.current],
            }),
        }}>
            {children}
        </PlayerContext.Provider>
    );
}

export const usePlayer = () => {
    const context = useContext(PlayerContext);
    if (!context) {
        throw new Error("usePlayer must be used within a PlayerProvider");
    }
    return context;
};