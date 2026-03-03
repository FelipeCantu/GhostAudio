"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { usePlaylist } from "@/context/PlaylistContext";
import { api, Playlist, PlaylistItem } from "@/services/api";
import DashboardLayout from "@/components/DashboardLayout";
import PlaylistCoverArt from "@/components/PlaylistCoverArt";
import PlaylistView from "@/components/PlaylistView";
import { usePlayer } from "@/context/PlayerContext";
import { Play, RefreshCw, Trash2, Zap } from "lucide-react";

export default function PlaylistDetailClient() {
    const { id } = useParams<{ id: string }>();
    const { user } = useAuth();
    const { deletePlaylist, reorderPlaylist, removeItemFromPlaylist, refreshSmartPlaylist } = usePlaylist();
    const { playPlaylist } = usePlayer();
    const router = useRouter();

    const [playlist, setPlaylist] = useState<Playlist | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

    useEffect(() => {
        if (!user?.id || !id) return;
        const load = async () => {
            try {
                setIsLoading(true);
                const data = await api.playlists.getById(id, user.id);
                setPlaylist(data);
            } catch (e: any) {
                setError(e.message);
            } finally {
                setIsLoading(false);
            }
        };
        load();
    }, [id, user?.id]);

    const handlePlayAll = () => {
        if (playlist) playPlaylist(playlist, 0);
    };

    const handleRefresh = async () => {
        if (!playlist) return;
        setIsRefreshing(true);
        try {
            const updated = await refreshSmartPlaylist(playlist.id);
            setPlaylist(updated);
        } finally {
            setIsRefreshing(false);
        }
    };

    const handleDelete = async () => {
        if (!playlist) return;
        await deletePlaylist(playlist.id);
        router.push('/library');
    };

    const handleReorder = async (items: PlaylistItem[]) => {
        if (!playlist) return;
        const updated = await reorderPlaylist(playlist.id, items);
        setPlaylist(updated);
    };

    const handleRemoveItem = async (index: number) => {
        if (!playlist) return;
        const updated = await removeItemFromPlaylist(playlist.id, index);
        setPlaylist(updated);
    };

    if (isLoading) {
        return (
            <DashboardLayout>
                <div className="flex items-center justify-center h-64 text-zinc-500">Loading playlist…</div>
            </DashboardLayout>
        );
    }

    if (error || !playlist) {
        return (
            <DashboardLayout>
                <div className="flex flex-col items-center justify-center h-64 text-zinc-500 gap-2">
                    <p className="text-red-400">{error || 'Playlist not found'}</p>
                    <button onClick={() => router.back()} className="text-sm text-zinc-400 hover:text-white underline">Go back</button>
                </div>
            </DashboardLayout>
        );
    }

    return (
        <DashboardLayout>
            <div className="flex flex-col gap-8">
                {/* Header */}
                <div className="flex flex-col md:flex-row gap-6 items-start md:items-end">
                    <PlaylistCoverArt coverArts={playlist.cover_arts || []} size={160} className="rounded-2xl shadow-2xl" />

                    <div className="flex flex-col gap-3 flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                            <p className="text-xs font-bold uppercase tracking-widest text-primary">Playlist</p>
                            {playlist.is_smart && (
                                <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#f4d35e]/10 text-[#f4d35e] text-xs font-semibold border border-[#f4d35e]/20">
                                    <Zap size={10} /> Smart
                                </span>
                            )}
                        </div>
                        <h1 className="text-4xl md:text-5xl font-black text-white leading-tight">{playlist.name}</h1>
                        {playlist.description && (
                            <p className="text-zinc-400 text-sm">{playlist.description}</p>
                        )}
                        <p className="text-zinc-500 text-sm">{playlist.item_count ?? (playlist.items?.length ?? 0)} tracks</p>

                        <div className="flex items-center gap-3 flex-wrap">
                            <button
                                onClick={handlePlayAll}
                                disabled={(playlist.items?.length ?? 0) === 0}
                                className="flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground font-bold rounded-full hover:bg-primary/90 hover:scale-105 transition-all shadow-lg shadow-primary/25 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <Play size={20} fill="currentColor" />
                                Play All
                            </button>

                            {playlist.is_smart && (
                                <button
                                    onClick={handleRefresh}
                                    disabled={isRefreshing}
                                    className="flex items-center gap-2 px-4 py-3 rounded-full bg-white/5 text-zinc-300 hover:bg-white/10 transition-colors border border-white/5 disabled:opacity-50"
                                >
                                    <RefreshCw size={16} className={isRefreshing ? 'animate-spin' : ''} />
                                    Refresh
                                </button>
                            )}

                            {!showDeleteConfirm ? (
                                <button
                                    onClick={() => setShowDeleteConfirm(true)}
                                    className="flex items-center gap-2 px-4 py-3 rounded-full bg-white/5 text-zinc-400 hover:text-red-400 hover:bg-red-400/10 transition-colors border border-white/5"
                                >
                                    <Trash2 size={16} />
                                    Delete
                                </button>
                            ) : (
                                <div className="flex items-center gap-2">
                                    <span className="text-sm text-zinc-400">Delete playlist?</span>
                                    <button onClick={handleDelete} className="px-3 py-1.5 text-xs font-medium bg-red-600 hover:bg-red-500 text-white rounded-lg transition-colors">Yes</button>
                                    <button onClick={() => setShowDeleteConfirm(false)} className="px-3 py-1.5 text-xs font-medium bg-zinc-700 hover:bg-zinc-600 text-white rounded-lg transition-colors">No</button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Track list */}
                <PlaylistView
                    playlist={playlist}
                    onItemsReorder={handleReorder}
                    onRemoveItem={handleRemoveItem}
                />
            </div>
        </DashboardLayout>
    );
}
