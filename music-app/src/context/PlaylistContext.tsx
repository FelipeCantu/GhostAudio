"use client";

import React, { createContext, useContext, useState, useCallback } from "react";
import { api, Playlist, PlaylistItem, SmartRule } from "@/services/api";
import { useAuth } from "@/context/AuthContext";
import { useEffect } from "react";

interface PlaylistContextType {
    playlists: Playlist[];
    isLoading: boolean;
    error: string | null;
    fetchPlaylists: () => Promise<void>;
    createPlaylist: (name: string, description?: string, isSmart?: boolean, smartRule?: SmartRule | null) => Promise<Playlist>;
    updatePlaylist: (id: string, data: { name?: string; description?: string; items?: PlaylistItem[] }) => Promise<Playlist>;
    deletePlaylist: (id: string) => Promise<void>;
    addItemsToPlaylist: (id: string, items: PlaylistItem[]) => Promise<Playlist>;
    removeItemFromPlaylist: (id: string, itemIndex: number) => Promise<Playlist>;
    reorderPlaylist: (id: string, items: PlaylistItem[]) => Promise<Playlist>;
    refreshSmartPlaylist: (id: string) => Promise<Playlist>;
}

const PlaylistContext = createContext<PlaylistContextType | undefined>(undefined);

export function PlaylistProvider({ children }: { children: React.ReactNode }) {
    const { user } = useAuth();
    const [playlists, setPlaylists] = useState<Playlist[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const getUserId = () => {
        const id = user?.id;
        if (!id) throw new Error("Not logged in");
        return id;
    };

    const fetchPlaylists = useCallback(async () => {
        if (!user?.id) return;
        try {
            setIsLoading(true);
            setError(null);
            const data = await api.playlists.getAll(user.id);
            setPlaylists(data);
        } catch (e: any) {
            setError(e.message);
        } finally {
            setIsLoading(false);
        }
    }, [user?.id]);

    useEffect(() => {
        fetchPlaylists();
    }, [fetchPlaylists]);

    const createPlaylist = async (name: string, description = '', isSmart = false, smartRule: SmartRule | null = null): Promise<Playlist> => {
        const userId = getUserId();
        const created = await api.playlists.create({ user_id: userId, name, description, is_smart: isSmart, smart_rule: smartRule });
        setPlaylists(prev => [created, ...prev]);
        return created;
    };

    const updatePlaylist = async (id: string, data: { name?: string; description?: string; items?: PlaylistItem[] }): Promise<Playlist> => {
        const userId = getUserId();
        const updated = await api.playlists.update(id, { user_id: userId, ...data });
        setPlaylists(prev => prev.map(p => p.id === id ? updated : p));
        return updated;
    };

    const deletePlaylist = async (id: string): Promise<void> => {
        const userId = getUserId();
        await api.playlists.delete(id, userId);
        setPlaylists(prev => prev.filter(p => p.id !== id));
    };

    const addItemsToPlaylist = async (id: string, items: PlaylistItem[]): Promise<Playlist> => {
        const userId = getUserId();
        const updated = await api.playlists.addItems(id, userId, items);
        setPlaylists(prev => prev.map(p => p.id === id ? updated : p));
        return updated;
    };

    const removeItemFromPlaylist = async (id: string, itemIndex: number): Promise<Playlist> => {
        const userId = getUserId();
        const updated = await api.playlists.removeItem(id, itemIndex, userId);
        setPlaylists(prev => prev.map(p => p.id === id ? updated : p));
        return updated;
    };

    const reorderPlaylist = async (id: string, items: PlaylistItem[]): Promise<Playlist> => {
        return updatePlaylist(id, { items });
    };

    const refreshSmartPlaylist = async (id: string): Promise<Playlist> => {
        const userId = getUserId();
        const updated = await api.playlists.refresh(id, userId);
        setPlaylists(prev => prev.map(p => p.id === id ? updated : p));
        return updated;
    };

    return (
        <PlaylistContext.Provider value={{
            playlists,
            isLoading,
            error,
            fetchPlaylists,
            createPlaylist,
            updatePlaylist,
            deletePlaylist,
            addItemsToPlaylist,
            removeItemFromPlaylist,
            reorderPlaylist,
            refreshSmartPlaylist,
        }}>
            {children}
        </PlaylistContext.Provider>
    );
}

export const usePlaylist = () => {
    const context = useContext(PlaylistContext);
    if (!context) throw new Error("usePlaylist must be used within a PlaylistProvider");
    return context;
};
