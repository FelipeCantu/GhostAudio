"use client";

import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from "react";
import { api } from "@/services/api";

export interface TrackStatus {
    status: 'pending' | 'active' | 'done';
    percent: number;
}

export type ImportStatus = 'idle' | 'ripping' | 'completed' | 'error';

interface ImportState {
    importStatus: ImportStatus;
    message: string;
    warningMessage: string | null;
    overallPercent: number;
    currentTrack: number;
    totalTracks: number;
    ripSessionId: string | null;
    trackStatuses: Record<string, TrackStatus>;
    importMetadata: any;
}

interface ImportContextType extends ImportState {
    isImporting: boolean;
    startImport: (args: {
        drive_path: string;
        token: string | null;
        mongo_user_id: string | undefined;
        metadata: any;
    }) => void;
    cancelImport: () => Promise<void>;
    resetImport: () => void;
}

const initialState: ImportState = {
    importStatus: 'idle',
    message: '',
    warningMessage: null,
    overallPercent: 0,
    currentTrack: 0,
    totalTracks: 0,
    ripSessionId: null,
    trackStatuses: {},
    importMetadata: null,
};

const STORAGE_KEY = 'ghost_import_state';

function loadPersistedState(): ImportState | null {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (!saved) return null;
        const parsed = JSON.parse(saved);
        if (parsed.importStatus === 'ripping') return parsed as ImportState;
    } catch {}
    return null;
}

function savePersistedState(state: ImportState) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
}

function clearPersistedState() {
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
}

const ImportContext = createContext<ImportContextType | undefined>(undefined);

export function ImportProvider({ children }: { children: React.ReactNode }) {
    // Lazy initializer: restore in-progress state immediately on first render so
    // the indicator appears without a flash when the page is reloaded in packaged mode.
    const [state, setState] = useState<ImportState>(() => {
        if (typeof window !== 'undefined') {
            const persisted = loadPersistedState();
            if (persisted) return persisted;
        }
        return initialState;
    });
    const sessionIdRef = useRef<string | null>(
        typeof window !== 'undefined' ? (() => {
            try {
                const saved = localStorage.getItem(STORAGE_KEY);
                if (saved) return (JSON.parse(saved) as ImportState).ripSessionId ?? null;
            } catch {}
            return null;
        })() : null
    );
    const cancelledRef = useRef<boolean>(false);
    // Tracks whether startImport() is currently awaiting an IPC response.
    // Used to avoid double-completion when the user navigated away and handleProgress
    // handles type:'complete' instead of startImport.
    const startImportActiveRef = useRef<boolean>(false);

    // Register the rip-progress listener once. Also restores in-progress import state
    // from localStorage so the indicator survives page navigation in the packaged app
    // (static export reloads the full HTML on every route change, unlike the dev server).
    useEffect(() => {
        if (typeof window === 'undefined' || !api.isElectron()) return;
        if (!(window as any).electronAPI?.on) return;

        const handleProgress = (data: any) => {
            if (data.type === 'session') {
                sessionIdRef.current = data.session_id;
                setState(prev => ({ ...prev, ripSessionId: data.session_id }));

            } else if (data.type === 'progress') {
                setState(prev => {
                    const next: ImportState = { ...prev, message: data.message };

                    if (data.stage === 'cancelled') {
                        clearPersistedState();
                        return { ...initialState, message: 'Import cancelled.' };
                    }

                    if (data.stage === 'reading' || data.stage === 'track_progress') {
                        next.overallPercent = data.current;
                    } else if (
                        data.stage === 'extracting' ||
                        data.stage === 'track_done' ||
                        data.stage === 'processing'
                    ) {
                        next.overallPercent = 100;
                        next.currentTrack = data.current;
                        next.totalTracks = data.total;
                    }

                    if (data.track_number != null) {
                        const key = String(data.track_number);
                        const statuses = { ...prev.trackStatuses };
                        if (data.stage === 'track_done') {
                            statuses[key] = { status: 'done', percent: 100 };
                        } else if (data.stage === 'track_progress') {
                            statuses[key] = {
                                status: 'active',
                                percent: Math.min(data.track_percent ?? 0, 100),
                            };
                        } else {
                            statuses[key] = {
                                status: 'active',
                                percent: prev.trackStatuses[key]?.percent ?? 0,
                            };
                        }
                        next.trackStatuses = statuses;
                    }

                    return next;
                });

            } else if (data.type === 'complete') {
                // Only handle completion here when startImport is NOT actively running
                // (i.e. the user navigated away from the import page in packaged mode).
                // When startImport is active, it handles the completion itself.
                // Also guard against a spurious 'complete' that always follows a cancel.
                if (!startImportActiveRef.current) {
                    setState(prev => {
                        if (prev.importStatus !== 'ripping') return prev; // cancelled already reset state
                        const allDone: Record<string, TrackStatus> = {};
                        for (const k of Object.keys(prev.trackStatuses)) {
                            allDone[k] = { status: 'done', percent: 100 };
                        }
                        return {
                            ...prev,
                            importStatus: 'completed',
                            message: `"${prev.importMetadata?.album || 'Album'}" by ${prev.importMetadata?.artist || 'Unknown Artist'} has been added to your library!`,
                            currentTrack: prev.totalTracks,
                            trackStatuses: allDone,
                        };
                    });
                    clearPersistedState();
                    sessionIdRef.current = null;
                }

            } else if (data.type === 'error') {
                if (!startImportActiveRef.current) {
                    setState(prev => {
                        if (prev.importStatus !== 'ripping') return prev;
                        return {
                            ...prev,
                            importStatus: 'error',
                            message: `Import failed: ${data.message}`,
                            trackStatuses: {},
                            ripSessionId: null,
                        };
                    });
                    clearPersistedState();
                    sessionIdRef.current = null;
                }

            } else if (data.type === 'saved') {
                setState(prev => ({ ...prev, message: 'Saved to library!' }));

            } else if (data.type === 'warning') {
                setState(prev => ({ ...prev, warningMessage: data.message }));
            }
        };

        (window as any).electronAPI.on('rip-progress', handleProgress);

        return () => {
            (window as any).electronAPI?.removeAllListeners?.('rip-progress');
        };
    }, []);

    // Persist ripping state to localStorage so it survives page reloads
    useEffect(() => {
        if (state.importStatus === 'ripping') {
            savePersistedState(state);
        } else {
            clearPersistedState();
        }
    }, [state]);

    const startImport = useCallback(async (args: {
        drive_path: string;
        token: string | null;
        mongo_user_id: string | undefined;
        metadata: any;
    }) => {
        const trackCount = args.metadata?.tracks?.length || 12;

        const initialStatuses: Record<string, TrackStatus> = {};
        if (args.metadata?.tracks) {
            for (const t of args.metadata.tracks) {
                initialStatuses[String(t.track_number)] = { status: 'pending', percent: 0 };
            }
        }

        cancelledRef.current = false;
        startImportActiveRef.current = true;

        setState({
            importStatus: 'ripping',
            message: `Preparing to import ${trackCount} tracks...`,
            warningMessage: null,
            overallPercent: 0,
            currentTrack: 0,
            totalTracks: trackCount,
            ripSessionId: null,
            trackStatuses: initialStatuses,
            importMetadata: args.metadata,
        });

        try {
            const data = await api.system.ripCd(args);

            if (cancelledRef.current) return;

            if (data.status === 'error') {
                throw new Error(data.message || 'Import failed');
            } else if (data.status === 'started' || data.status === 'completed') {
                setState(prev => {
                    const allDone: Record<string, TrackStatus> = {};
                    for (const k of Object.keys(prev.trackStatuses)) {
                        allDone[k] = { status: 'done', percent: 100 };
                    }
                    return {
                        ...prev,
                        currentTrack: trackCount,
                        trackStatuses: allDone,
                        message: 'Import completed. Finalizing library...',
                    };
                });

                setTimeout(() => {
                    setState(prev => ({
                        ...prev,
                        importStatus: 'completed',
                        message: `"${args.metadata?.album || 'Album'}" by ${args.metadata?.artist || 'Unknown Artist'} has been added to your library!`,
                        currentTrack: 0,
                        totalTracks: 0,
                        overallPercent: 0,
                        trackStatuses: {},
                        ripSessionId: null,
                    }));
                    clearPersistedState();
                    sessionIdRef.current = null;
                }, 1500);
            } else {
                throw new Error(data.message || 'Import failed');
            }
        } catch (err: any) {
            if (!cancelledRef.current) {
                setState(prev => ({
                    ...prev,
                    importStatus: 'error',
                    message: `Import failed: ${err.message || JSON.stringify(err)}`,
                    currentTrack: 0,
                    totalTracks: 0,
                    overallPercent: 0,
                    trackStatuses: {},
                    ripSessionId: null,
                }));
                clearPersistedState();
                sessionIdRef.current = null;
            }
        } finally {
            startImportActiveRef.current = false;
        }
    }, []);

    const cancelImport = useCallback(async () => {
        const sessionId = sessionIdRef.current;
        if (sessionId) {
            try {
                await api.system.cancelRip(sessionId);
            } catch (err) {
                console.error('[ImportContext] Cancel error:', err);
            }
        }
        cancelledRef.current = true;
        setState({ ...initialState, message: 'Import cancelled.' });
        sessionIdRef.current = null;
        clearPersistedState();
    }, []);

    const resetImport = useCallback(() => {
        setState(initialState);
        sessionIdRef.current = null;
        clearPersistedState();
    }, []);

    return (
        <ImportContext.Provider value={{
            ...state,
            isImporting: state.importStatus === 'ripping',
            startImport,
            cancelImport,
            resetImport,
        }}>
            {children}
        </ImportContext.Provider>
    );
}

export const useImport = () => {
    const context = useContext(ImportContext);
    if (!context) {
        throw new Error('useImport must be used within an ImportProvider');
    }
    return context;
};
