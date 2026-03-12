"use client";

import { useState, useRef, useEffect } from "react";
import Image from "next/image";
import { ArrowLeft, Disc, Play, Pause, Clock, ListPlus, Check, Shuffle, Heart, MoreHorizontal, Pencil, Trash2, ImagePlus } from "lucide-react";
import { usePlayer } from "@/context/PlayerContext";
import { usePlaylist } from "@/context/PlaylistContext";
import { Album, Track, PlaylistItem, api } from "@/services/api";
import { useAuth } from "@/context/AuthContext";
import EditAlbumModal from "@/components/EditAlbumModal";

interface AlbumDetailViewProps {
    album: Album;
    onBack: () => void;
    onAlbumUpdated?: (updated: { title: string; artist: string; coverArt: string }) => void;
}

export default function AlbumDetailView({ album, onBack, onAlbumUpdated }: AlbumDetailViewProps) {
    const { user } = useAuth();
    const { currentTrack, isPlaying, playTrack } = usePlayer();
    const { playlists, addItemsToPlaylist } = usePlaylist();
    const [imgError, setImgError] = useState(false);
    const [showPlaylistMenu, setShowPlaylistMenu] = useState(false);
    const [showMoreMenu, setShowMoreMenu] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [localAlbum, setLocalAlbum] = useState<any>(album);
    const [localTracks, setLocalTracks] = useState<Track[]>([]);
    const [addedToast, setAddedToast] = useState<string | null>(null);
    const [isFetchingCover, setIsFetchingCover] = useState(false);
    const [coverFetchMessage, setCoverFetchMessage] = useState<string | null>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    const moreMenuRef = useRef<HTMLDivElement>(null);
    const isLocalImport = (album as any).source === 'local_import';

    useEffect(() => {
        setLocalTracks((album.tracks || []).map(mapTrack));
    }, [album]);

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) setShowPlaylistMenu(false);
            if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) setShowMoreMenu(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    if (!album) return null;

    // Handle MongoDB (coverArt) and Django (cover_art) formats
    const coverArt = (localAlbum as any).coverArt || localAlbum.cover_art;

    // Map MongoDB tracks to player-compatible format
    const mapTrack = (track: any, index: number): Track => {
        return {
            id: index + 1,
            title: track.title || `Track ${index + 1}`,
            track_number: track.trackNumber || track.track_number || index + 1,
            audio_file: track.audioFile || track.audio_file || '',
            duration: track.duration || ''
        };
    };

    const tracks = localTracks;

    // Album info for the player
    const albumInfo = {
        title: album.title,
        artist: album.artist,
        coverArt: coverArt
    };

    const handlePlayTrack = (track: Track) => {
        playTrack(track, tracks, albumInfo);
    };

    const buildPlaylistItems = (): PlaylistItem[] => {
        const albumId = (album as any)._id || String(album.id);
        return tracks.map(t => ({
            albumId,
            trackNumber: t.track_number,
            title: t.title,
            artist: album.artist,
            albumTitle: album.title,
            audioFile: (t as any).audioFile || t.audio_file || '',
            duration: t.duration || '',
            coverArt: coverArt || '',
        }));
    };

    const handleAddToPlaylist = async (playlistId: string, playlistName: string) => {
        setShowPlaylistMenu(false);
        const items = buildPlaylistItems();
        await addItemsToPlaylist(playlistId, items);
        setAddedToast(`Added ${items.length} tracks to "${playlistName}"`);
        setTimeout(() => setAddedToast(null), 3000);
    };

    const handlePlayAll = () => {
        if (tracks.length > 0) {
            playTrack(tracks[0], tracks, albumInfo);
        }
    };

    const handleShuffle = () => {
        if (tracks.length === 0) return;
        const shuffled = [...tracks].sort(() => Math.random() - 0.5);
        playTrack(shuffled[0], shuffled, albumInfo);
    };

    const isCurrentTrack = (track: Track) => {
        return currentTrack?.audio_file === track.audio_file;
    };

    const handleDeleteTrack = async (e: React.MouseEvent, track: Track) => {
        e.stopPropagation();
        if (!user?.id) return;
        const albumId = (localAlbum as any)._id || String(localAlbum.id);
        try {
            await api.library.deleteTrack(albumId, track.track_number, user.id);
            setLocalTracks(prev => prev.filter(t => t.track_number !== track.track_number));
        } catch (err) {
            console.error('Failed to delete track:', err);
        }
    };

    const handleFetchCoverArt = async () => {
        if (!user?.id) return;
        setIsFetchingCover(true);
        setCoverFetchMessage(null);

        try {
            const albumId = (localAlbum as any)._id || String(localAlbum.id);
            const mbUrl = `https://musicbrainz.org/ws/2/release/?query=release:${encodeURIComponent(localAlbum.title)}+AND+artist:${encodeURIComponent(localAlbum.artist)}&fmt=json&limit=1`;
            const mbRes = await fetch(mbUrl, {
                headers: { 'User-Agent': 'DiZC/1.0 (dizc.audio)' }
            });
            if (!mbRes.ok) throw new Error('MusicBrainz request failed');
            const mbData = await mbRes.json();

            const release = mbData.releases?.[0];
            if (!release?.id) {
                setCoverFetchMessage('No cover art found');
                setTimeout(() => setCoverFetchMessage(null), 2500);
                return;
            }

            const coverUrl = `https://coverartarchive.org/release/${release.id}/front`;
            // Verify the image is accessible before saving
            const imgCheck = await fetch(coverUrl, { method: 'HEAD' });
            if (!imgCheck.ok) {
                setCoverFetchMessage('No cover art found');
                setTimeout(() => setCoverFetchMessage(null), 2500);
                return;
            }

            await api.library.updateAlbum(albumId, user.id, { cover_art: coverUrl });
            setLocalAlbum((prev: any) => ({ ...prev, cover_art: coverUrl, coverArt: coverUrl }));
            setImgError(false);
            onAlbumUpdated?.({ title: localAlbum.title, artist: localAlbum.artist, coverArt: coverUrl });
        } catch {
            setCoverFetchMessage('Could not fetch cover art');
            setTimeout(() => setCoverFetchMessage(null), 2500);
        } finally {
            setIsFetchingCover(false);
        }
    };

    return (
        <>
        {showEditModal && (
            <EditAlbumModal
                album={localAlbum}
                onClose={() => setShowEditModal(false)}
                onSaved={(updated) => {
                    setLocalAlbum((prev: any) => ({ ...prev, ...updated }));
                    onAlbumUpdated?.(updated);
                }}
            />
        )}
        <div className="relative flex flex-col h-full animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Background Blur Effect */}
            {coverArt && (
                <div className="absolute inset-x-0 top-0 h-[70vh] z-0 pointer-events-none">
                    <div
                        className="absolute inset-0 opacity-35"
                        style={{
                            backgroundImage: `url(${coverArt})`,
                            backgroundSize: "cover",
                            backgroundPosition: "center",
                            filter: "blur(60px)",
                            transform: "scale(1.3)",
                        }}
                    />
                    <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-background/60 to-background" />
                </div>
            )}

            {/* Back Button */}
            <div className="mb-6">
                <button
                    onClick={onBack}
                    className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white transition-all group backdrop-blur-md border border-white/5"
                >
                    <ArrowLeft size={20} className="group-hover:-translate-x-1 transition-transform" />
                    Back to Library
                </button>
            </div>

            {/* Header Section */}
            <div className="flex flex-col md:flex-row gap-8 mb-10">
                {/* Cover Art */}
                <div className="relative z-10 w-40 h-40 sm:w-56 sm:h-56 md:w-72 md:h-72 lg:w-80 lg:h-80 flex-shrink-0 rounded-2xl overflow-hidden bg-black/40 shadow-2xl mx-auto md:mx-0 border border-white/10 group">
                    {coverArt && !imgError ? (
                        <Image
                            src={coverArt}
                            alt={album.title}
                            fill
                            className="object-cover transition-transform duration-700 group-hover:scale-105"
                            priority
                            onError={() => setImgError(true)}
                        />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center text-zinc-800 bg-zinc-900">
                            <Disc size={80} />
                        </div>
                    )}
                </div>

                {/* Album Info */}
                <div className="flex flex-col justify-end text-center md:text-left flex-1 min-w-0">
                    <p className="text-sm font-bold uppercase tracking-widest text-primary mb-2">Album</p>
                    <h1 className="text-2xl sm:text-3xl md:text-5xl lg:text-6xl font-black text-white mb-2 tracking-tight leading-tight break-words">{localAlbum.title}</h1>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 justify-center md:justify-start text-base text-zinc-300 mb-6">
                        <span className="font-medium text-white">{localAlbum.artist}</span>
                        <span className="w-1.5 h-1.5 rounded-full bg-zinc-600 hidden sm:block" />
                        <span className="text-zinc-400">{new Date((album as any).createdAt || album.created_at).getFullYear() || new Date().getFullYear()}</span>
                        <span className="w-1.5 h-1.5 rounded-full bg-zinc-600 hidden sm:block" />
                        <span className="text-zinc-400">{tracks.length} tracks</span>
                    </div>

                    <div className="flex items-center gap-2 sm:gap-3 justify-center md:justify-start flex-wrap">
                        {/* Play Album - Primary CTA */}
                        <button
                            onClick={handlePlayAll}
                            className="flex items-center gap-2 px-5 sm:px-7 py-2.5 sm:py-3.5 bg-[#f4d35e] text-[#0d1b2a] font-bold rounded-full hover:bg-[#f4d35e]/90 hover:scale-105 active:scale-95 transition-all shadow-lg shadow-[#f4d35e]/20 text-sm tracking-wide min-h-[44px]"
                        >
                            <Play size={18} fill="currentColor" />
                            Play Album
                        </button>

                        {/* Fetch Cover Art — only shown when album has no cover */}
                        {!coverArt && (
                            <button
                                onClick={handleFetchCoverArt}
                                disabled={isFetchingCover}
                                className="flex items-center gap-2 px-4 sm:px-5 py-2.5 sm:py-3.5 bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white rounded-full border border-white/10 hover:border-white/20 transition-all text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
                                title="Fetch cover art from MusicBrainz"
                            >
                                {isFetchingCover ? (
                                    <>
                                        <div className="w-4 h-4 border-2 border-zinc-400 border-t-transparent rounded-full animate-spin" />
                                        <span className="hidden sm:inline">Fetching...</span>
                                    </>
                                ) : (
                                    <>
                                        <ImagePlus size={16} />
                                        <span className="hidden sm:inline">Fetch Cover Art</span>
                                    </>
                                )}
                            </button>
                        )}

                        {/* Shuffle */}
                        <button onClick={handleShuffle} className="flex items-center gap-2 px-4 sm:px-5 py-2.5 sm:py-3.5 bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white rounded-full border border-white/10 hover:border-white/20 transition-all text-sm font-medium min-h-[44px]">
                            <Shuffle size={16} />
                            <span className="hidden sm:inline">Shuffle</span>
                        </button>

                        {/* Add to Playlist */}
                        <div className="relative" ref={menuRef}>
                            <button
                                onClick={() => setShowPlaylistMenu(v => !v)}
                                className="flex items-center gap-2 px-4 sm:px-5 py-2.5 sm:py-3.5 bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white rounded-full border border-white/10 hover:border-white/20 transition-all text-sm font-medium min-h-[44px]"
                                title="Add album to playlist"
                            >
                                <ListPlus size={16} />
                                <span className="hidden sm:inline">Add to Playlist</span>
                            </button>
                            {showPlaylistMenu && (
                                <div className="absolute top-full right-0 mt-2 w-56 max-h-60 overflow-y-auto bg-zinc-900/95 backdrop-blur-md border border-white/10 rounded-2xl shadow-2xl z-50">
                                    <div className="sticky top-0 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-zinc-500 border-b border-white/5 bg-zinc-900/95 backdrop-blur-sm">Add to playlist</div>
                                    {playlists.filter(p => !p.is_smart).length === 0 ? (
                                        <p className="px-4 py-3 text-sm text-zinc-500">No manual playlists.</p>
                                    ) : (
                                        playlists.filter(p => !p.is_smart).map(pl => (
                                            <button
                                                key={pl.id}
                                                onClick={() => handleAddToPlaylist(pl.id, pl.name)}
                                                className="w-full text-left px-4 py-3 text-sm text-zinc-300 hover:bg-white/10 hover:text-white transition-colors flex items-center gap-2.5 min-h-[44px]"
                                            >
                                                <ListPlus size={14} className="text-zinc-500 flex-shrink-0" />
                                                <span className="truncate">{pl.name}</span>
                                            </button>
                                        ))
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Like */}
                        <button className="p-2.5 sm:p-3.5 rounded-full bg-white/5 hover:bg-red-500/10 text-zinc-400 hover:text-red-400 border border-white/10 hover:border-red-500/20 transition-all min-w-[44px] min-h-[44px] flex items-center justify-center" title="Like" aria-label="Like album">
                            <Heart size={18} />
                        </button>

                        {/* More options dropdown */}
                        <div className="relative" ref={moreMenuRef}>
                            <button
                                onClick={() => setShowMoreMenu(v => !v)}
                                className="p-2.5 sm:p-3.5 rounded-full bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white border border-white/10 hover:border-white/20 transition-all min-w-[44px] min-h-[44px] flex items-center justify-center"
                                title="More options"
                                aria-label="More options"
                            >
                                <MoreHorizontal size={18} />
                            </button>
                            {showMoreMenu && (
                                <div className="absolute top-full right-0 mt-2 w-44 bg-zinc-900/95 backdrop-blur-md border border-white/10 rounded-2xl shadow-2xl z-50 overflow-hidden">
                                    {isLocalImport ? (
                                        <button
                                            onClick={() => { setShowMoreMenu(false); setShowEditModal(true); }}
                                            className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-zinc-300 hover:bg-white/10 hover:text-white transition-colors"
                                        >
                                            <Pencil size={14} className="text-zinc-500" />
                                            Edit Album
                                        </button>
                                    ) : (
                                        <p className="px-4 py-3 text-xs text-zinc-600">No options available</p>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Toast — playlist added */}
                    {addedToast && (
                        <div className="flex items-center gap-2 mt-3 text-sm text-[#f4d35e] animate-in fade-in slide-in-from-bottom-2 duration-300">
                            <Check size={14} />
                            {addedToast}
                        </div>
                    )}

                    {/* Toast — cover art fetch result */}
                    {coverFetchMessage && (
                        <div className="flex items-center gap-2 mt-3 text-sm text-zinc-400 animate-in fade-in slide-in-from-bottom-2 duration-300">
                            <ImagePlus size={14} />
                            {coverFetchMessage}
                        </div>
                    )}
                </div>
            </div>

            {/* Tracks List */}
            <div className="flex-1">
                {/* Table Header */}
                <div className="grid grid-cols-[auto_1fr_auto] gap-3 px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider border-b border-white/5 mb-2">
                    <div className="w-8 text-center">#</div>
                    <div>Title</div>
                    <div className="flex items-center justify-end gap-2">
                        <Clock size={14} />
                    </div>
                </div>

                <div className="space-y-1">
                    {tracks.map((track, index) => {
                        const isCurrent = isCurrentTrack(track);
                        const isPlayingCurrent = isCurrent && isPlaying;

                        return (
                            <div
                                key={track.id}
                                onClick={() => handlePlayTrack(track)}
                                className={`group grid grid-cols-[auto_1fr_auto] gap-4 items-center px-4 py-3.5 rounded-xl cursor-pointer transition-all border relative overflow-hidden min-h-[56px] ${isCurrent
                                    ? 'bg-[#f4d35e]/[0.08] border-[#f4d35e]/15 shadow-sm'
                                    : 'border-transparent hover:bg-white/5 hover:border-white/8 active:bg-white/5'
                                    }`}
                            >
                                {isCurrent && <div className="absolute left-0 top-1/4 bottom-1/4 w-0.5 bg-[#f4d35e] rounded-full" />}
                                {/* Track Number / Play Icon */}
                                <div className="w-8 flex items-center justify-center text-sm font-medium">
                                    {isPlayingCurrent ? (
                                        <div className="flex items-end gap-1 h-3">
                                            <span className="w-0.5 h-full bg-primary animate-[music-bar_0.5s_ease-in-out_infinite]" />
                                            <span className="w-0.5 h-2/3 bg-primary animate-[music-bar_0.5s_ease-in-out_infinite_0.1s]" />
                                            <span className="w-0.5 h-full bg-primary animate-[music-bar_0.5s_ease-in-out_infinite_0.2s]" />
                                        </div>
                                    ) : isCurrent ? (
                                        <span className="text-primary">
                                            <Pause size={16} fill="currentColor" />
                                        </span>
                                    ) : (
                                        <>
                                            <span className="text-zinc-500 group-hover:hidden">{track.track_number}</span>
                                            <span className="hidden group-hover:block text-white">
                                                <Play size={16} fill="currentColor" />
                                            </span>
                                        </>
                                    )}
                                </div>

                                {/* Track Info */}
                                <div className="min-w-0 flex flex-col justify-center">
                                    <p className={`text-base font-medium truncate transition-colors ${isCurrent ? 'text-primary' : 'text-zinc-200 group-hover:text-white'}`}>
                                        {track.title}
                                    </p>
                                    <p className="text-sm text-zinc-500 truncate group-hover:text-zinc-400">
                                        {localAlbum.artist}
                                    </p>
                                </div>

                                {/* Duration + delete */}
                                <div className="flex items-center gap-2">
                                    <span className={`text-sm font-medium font-mono ${isCurrent ? 'text-white' : 'text-zinc-500 group-hover:text-zinc-300'}`}>
                                        {track.duration || '--:--'}
                                    </span>
                                    {isLocalImport && (
                                        <button
                                            onClick={e => handleDeleteTrack(e, track)}
                                            className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 p-2 rounded-lg text-zinc-600 hover:text-red-400 active:text-red-400 transition-all min-w-[36px] min-h-[36px] flex items-center justify-center"
                                            title="Remove track"
                                            aria-label={`Remove ${track.title}`}
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
        </>
    );
}
