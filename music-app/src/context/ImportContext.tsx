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

const ImportContext = createContext<ImportContextType | undefined>(undefined);

export function ImportProvider({ children }: { children: React.ReactNode }) {
    const [state, setState] = useState<ImportState>(initialState);
    // Use a ref for session ID so cancelImport always sees the latest value
    // without needing it in its dependency array
    const sessionIdRef = useRef<string | null>(null);

    // Register the rip-progress listener once for the app's entire lifetime.
    // This survives page navigation so imports continue uninterrupted.
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
                        return {
                            ...initialState,
                            message: 'Import cancelled.',
                        };
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

            if (data.status === 'started' || data.status === 'completed') {
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
                    sessionIdRef.current = null;
                }, 1500);
            } else {
                throw new Error('Import failed');
            }
        } catch (err: any) {
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
            sessionIdRef.current = null;
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
        setState({ ...initialState, message: 'Import cancelled.' });
        sessionIdRef.current = null;
    }, []);

    const resetImport = useCallback(() => {
        setState(initialState);
        sessionIdRef.current = null;
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
