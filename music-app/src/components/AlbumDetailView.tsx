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

        {/* Toast notifications — fixed, above player bar */}
        {(addedToast || coverFetchMessage) && (
            <div className="fixed bottom-24 lg:bottom-20 left-1/2 -translate-x-1/2 z-[60] pointer-events-none">
                {addedToast && (
                    <div className="flex items-center gap-2.5 px-4 py-3 rounded-2xl bg-zinc-900/95 border border-white/10 backdrop-blur-xl shadow-2xl text-sm text-white animate-in fade-in slide-in-from-bottom-3 duration-300">
                        <span className="flex items-center justify-center w-5 h-5 rounded-full bg-[#f4d35e]/15">
                            <Check size={11} className="text-[#f4d35e]" />
                        </span>
                        {addedToast}
                    </div>
                )}
                {coverFetchMessage && (
                    <div className="flex items-center gap-2.5 px-4 py-3 rounded-2xl bg-zinc-900/95 border border-white/10 backdrop-blur-xl shadow-2xl text-sm text-zinc-300 animate-in fade-in slide-in-from-bottom-3 duration-300">
                        <ImagePlus size={14} className="text-zinc-500 flex-shrink-0" />
                        {coverFetchMessage}
                    </div>
                )}
            </div>
        )}

        <div className="relative flex flex-col h-full animate-in fade-in duration-300">

            {/* Backdrop — full bleed color wash from cover art */}
            <div className="absolute top-0 h-[55vh] min-h-[340px] z-0 pointer-events-none overflow-hidden" style={{ left: '50%', transform: 'translateX(-50vw)', width: '100vw' }}>
                {coverArt ? (
                    <>
                        <div
                            className="absolute inset-0 opacity-40"
                            style={{
                                backgroundImage: `url(${coverArt})`,
                                backgroundSize: "cover",
                                backgroundPosition: "center top",
                                filter: "blur(80px) saturate(1.4)",
                                transform: "scale(1.5)",
                            }}
                        />
                        {/* Vignette: top fade to near-transparent, bottom fade to background */}
                        <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-[var(--background,#0d3b66)]" />
                        <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-[var(--background,#0d3b66)] to-transparent" />
                    </>
                ) : (
                    <div className="absolute inset-0 bg-gradient-to-b from-white/[0.02] to-transparent" />
                )}
            </div>

            {/* Back button — minimal ghost link */}
            <div className="relative z-10 mb-8">
                <button
                    onClick={onBack}
                    className="group inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white transition-colors duration-150"
                >
                    <ArrowLeft
                        size={16}
                        className="transition-transform duration-200 group-hover:-translate-x-0.5"
                    />
                    <span>Library</span>
                </button>
            </div>

            {/* Header — cover art + album info */}
            <div className="relative z-10 flex flex-col md:flex-row gap-6 md:gap-10 mb-10 md:items-end">

                {/* Cover art */}
                <div className="relative flex-shrink-0 mx-auto md:mx-0">
                    <div className="relative w-44 h-44 sm:w-56 sm:h-56 md:w-64 md:h-64 lg:w-72 lg:h-72 rounded-2xl overflow-hidden bg-zinc-900 group">
                        {/* Colored shadow beneath the art */}
                        {coverArt && !imgError && (
                            <div
                                className="absolute -inset-2 -z-10 rounded-3xl opacity-50 blur-2xl"
                                style={{
                                    backgroundImage: `url(${coverArt})`,
                                    backgroundSize: "cover",
                                    backgroundPosition: "center",
                                }}
                            />
                        )}
                        {coverArt && !imgError ? (
                            <Image
                                src={coverArt}
                                alt={album.title}
                                fill
                                className="object-cover transition-transform duration-700 group-hover:scale-[1.03]"
                                priority
                                onError={() => setImgError(true)}
                            />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center text-zinc-700 bg-zinc-900/80">
                                <Disc size={72} strokeWidth={1} />
                            </div>
                        )}
                        {/* Subtle inner shadow / gloss overlay */}
                        <div className="absolute inset-0 ring-1 ring-inset ring-white/10 rounded-2xl pointer-events-none" />
                    </div>
                </div>

                {/* Album metadata + actions */}
                <div className="flex flex-col justify-end text-center md:text-left flex-1 min-w-0">
                    {/* Type label */}
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#f4d35e]/70 mb-3">
                        Album
                    </p>

                    {/* Title */}
                    <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-black text-white tracking-tight leading-[1.05] break-words mb-4">
                        {localAlbum.title}
                    </h1>

                    {/* Artist / Year / Track count */}
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 justify-center md:justify-start mb-8">
                        <span className="text-base font-semibold text-white/90">{localAlbum.artist}</span>
                        <span className="text-zinc-600 select-none">·</span>
                        <span className="text-sm text-zinc-400">
                            {new Date((album as any).createdAt || album.created_at).getFullYear() || new Date().getFullYear()}
                        </span>
                        <span className="text-zinc-600 select-none">·</span>
                        <span className="text-sm text-zinc-400">{tracks.length} {tracks.length === 1 ? 'song' : 'songs'}</span>
                    </div>

                    {/* Action bar */}
                    <div className="flex items-center gap-3 justify-center md:justify-start flex-wrap">

                        {/* Play — primary CTA */}
                        <button
                            onClick={handlePlayAll}
                            className="flex items-center gap-2.5 pl-5 pr-6 py-3 bg-[#f4d35e] text-[#0d1b2a] font-bold rounded-full hover:bg-[#f4d35e]/90 active:scale-95 transition-all shadow-lg shadow-[#f4d35e]/25 text-sm tracking-wide min-h-[44px]"
                        >
                            <Play size={16} fill="currentColor" strokeWidth={0} />
                            Play
                        </button>

                        {/* Shuffle — secondary pill */}
                        <button
                            onClick={handleShuffle}
                            className="flex items-center gap-2 px-4 py-3 rounded-full bg-white/[0.07] hover:bg-white/[0.12] text-zinc-300 hover:text-white border border-white/[0.08] hover:border-white/[0.15] transition-all text-sm font-medium min-h-[44px]"
                            title="Shuffle"
                        >
                            <Shuffle size={15} />
                            <span className="hidden sm:inline">Shuffle</span>
                        </button>

                        {/* Add to playlist */}
                        <div className="relative" ref={menuRef}>
                            <button
                                onClick={() => setShowPlaylistMenu(v => !v)}
                                className="flex items-center gap-2 px-4 py-3 rounded-full bg-white/[0.07] hover:bg-white/[0.12] text-zinc-300 hover:text-white border border-white/[0.08] hover:border-white/[0.15] transition-all text-sm font-medium min-h-[44px]"
                                title="Add album to playlist"
                            >
                                <ListPlus size={15} />
                                <span className="hidden sm:inline">Add to Playlist</span>
                            </button>
                            {showPlaylistMenu && (
                                <div className="absolute top-full left-0 mt-2 w-60 max-h-64 overflow-y-auto bg-zinc-950/95 backdrop-blur-xl border border-white/[0.08] rounded-2xl shadow-2xl z-50 py-1.5">
                                    <p className="px-4 pt-1.5 pb-2.5 text-[11px] font-semibold uppercase tracking-widest text-zinc-500">
                                        Add to playlist
                                    </p>
                                    {playlists.filter(p => !p.is_smart).length === 0 ? (
                                        <p className="px-4 py-3 text-sm text-zinc-500">No manual playlists.</p>
                                    ) : (
                                        playlists.filter(p => !p.is_smart).map(pl => (
                                            <button
                                                key={pl.id}
                                                onClick={() => handleAddToPlaylist(pl.id, pl.name)}
                                                className="w-full text-left px-4 py-2.5 text-sm text-zinc-300 hover:bg-white/[0.08] hover:text-white transition-colors flex items-center gap-3 min-h-[40px] group/item"
                                            >
                                                <div className="w-5 h-5 rounded-md bg-white/5 border border-white/10 flex-shrink-0 flex items-center justify-center">
                                                    <Check size={10} className="text-[#f4d35e] opacity-0 group-hover/item:opacity-100 transition-opacity" />
                                                </div>
                                                <span className="truncate">{pl.name}</span>
                                            </button>
                                        ))
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Divider */}
                        <div className="w-px h-5 bg-white/10 hidden sm:block" />

                        {/* Fetch cover art — only when no cover */}
                        {!coverArt && (
                            <button
                                onClick={handleFetchCoverArt}
                                disabled={isFetchingCover}
                                className="flex items-center justify-center w-10 h-10 rounded-full text-zinc-400 hover:text-white hover:bg-white/[0.08] transition-all disabled:opacity-40 disabled:cursor-not-allowed min-w-[44px] min-h-[44px]"
                                title="Fetch cover art from MusicBrainz"
                                aria-label="Fetch cover art"
                            >
                                {isFetchingCover ? (
                                    <div className="w-4 h-4 border-[1.5px] border-zinc-400 border-t-transparent rounded-full animate-spin" />
                                ) : (
                                    <ImagePlus size={18} />
                                )}
                            </button>
                        )}

                        {/* Like */}
                        <button
                            className="flex items-center justify-center w-10 h-10 rounded-full text-zinc-400 hover:text-red-400 hover:bg-red-500/10 transition-all min-w-[44px] min-h-[44px]"
                            title="Like"
                            aria-label="Like album"
                        >
                            <Heart size={18} />
                        </button>

                        {/* More options */}
                        <div className="relative" ref={moreMenuRef}>
                            <button
                                onClick={() => setShowMoreMenu(v => !v)}
                                className="flex items-center justify-center w-10 h-10 rounded-full text-zinc-400 hover:text-white hover:bg-white/[0.08] transition-all min-w-[44px] min-h-[44px]"
                                title="More options"
                                aria-label="More options"
                            >
                                <MoreHorizontal size={18} />
                            </button>
                            {showMoreMenu && (
                                <div className="absolute top-full right-0 mt-2 w-48 bg-zinc-950/95 backdrop-blur-xl border border-white/[0.08] rounded-2xl shadow-2xl z-50 py-1.5 overflow-hidden">
                                    {isLocalImport ? (
                                        <button
                                            onClick={() => { setShowMoreMenu(false); setShowEditModal(true); }}
                                            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-zinc-300 hover:bg-white/[0.08] hover:text-white transition-colors min-h-[40px]"
                                        >
                                            <Pencil size={14} className="text-zinc-500 flex-shrink-0" />
                                            Edit Album
                                        </button>
                                    ) : (
                                        <p className="px-4 py-3 text-xs text-zinc-600">No options available</p>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Track list */}
            <div className="relative z-10 flex-1">
                {/* Column header */}
                <div className="grid grid-cols-[2.5rem_1fr_auto] gap-4 px-3 pb-2 mb-1 text-[11px] font-semibold uppercase tracking-widest text-zinc-500 border-b border-white/[0.05]">
                    <div className="text-center">#</div>
                    <div>Title</div>
                    <div className="flex items-center justify-end pr-1">
                        <Clock size={13} />
                    </div>
                </div>

                <div className="mt-1">
                    {tracks.map((track) => {
                        const isCurrent = isCurrentTrack(track);
                        const isPlayingCurrent = isCurrent && isPlaying;

                        return (
                            <div
                                key={track.id}
                                onClick={() => handlePlayTrack(track)}
                                role="row"
                                tabIndex={0}
                                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handlePlayTrack(track); } }}
                                className={`group grid grid-cols-[2.5rem_1fr_auto] gap-4 items-center px-3 py-3 rounded-xl cursor-pointer transition-colors duration-100 min-h-[60px] relative ${
                                    isCurrent
                                        ? 'bg-[#f4d35e]/[0.07]'
                                        : 'hover:bg-white/[0.05] active:bg-white/[0.04]'
                                }`}
                            >
                                {/* Active track left accent bar */}
                                {isCurrent && (
                                    <div className="absolute left-0 inset-y-3 w-[3px] bg-[#f4d35e] rounded-full" />
                                )}

                                {/* Track number / playback indicator */}
                                <div className="w-10 flex items-center justify-center">
                                    {isPlayingCurrent ? (
                                        <div className="flex items-end gap-[3px] h-3.5">
                                            <span className="w-[3px] h-full bg-[#f4d35e] rounded-full animate-[music-bar_0.5s_ease-in-out_infinite]" />
                                            <span className="w-[3px] h-2/3 bg-[#f4d35e] rounded-full animate-[music-bar_0.5s_ease-in-out_infinite_0.1s]" />
                                            <span className="w-[3px] h-full bg-[#f4d35e] rounded-full animate-[music-bar_0.5s_ease-in-out_infinite_0.2s]" />
                                        </div>
                                    ) : isCurrent ? (
                                        <Pause size={15} fill="currentColor" strokeWidth={0} className="text-[#f4d35e]" />
                                    ) : (
                                        <>
                                            <span className="text-sm text-zinc-500 tabular-nums group-hover:hidden">
                                                {track.track_number}
                                            </span>
                                            <Play
                                                size={15}
                                                fill="currentColor"
                                                strokeWidth={0}
                                                className="hidden group-hover:block text-white"
                                            />
                                        </>
                                    )}
                                </div>

                                {/* Track title + artist */}
                                <div className="min-w-0">
                                    <p className={`text-sm font-medium truncate leading-snug transition-colors ${
                                        isCurrent ? 'text-[#f4d35e]' : 'text-zinc-100 group-hover:text-white'
                                    }`}>
                                        {track.title}
                                    </p>
                                    <p className="text-xs text-zinc-500 truncate mt-0.5 group-hover:text-zinc-400 transition-colors">
                                        {localAlbum.artist}
                                    </p>
                                </div>

                                {/* Duration + delete */}
                                <div className="flex items-center gap-1.5 pr-1">
                                    <span className={`text-xs tabular-nums font-medium transition-colors ${
                                        isCurrent ? 'text-[#f4d35e]/80' : 'text-zinc-500 group-hover:text-zinc-400'
                                    }`}>
                                        {track.duration || '--:--'}
                                    </span>
                                    {isLocalImport && (
                                        <button
                                            onClick={e => handleDeleteTrack(e, track)}
                                            className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 flex items-center justify-center w-7 h-7 rounded-lg text-zinc-600 hover:text-red-400 active:text-red-400 hover:bg-red-500/10 transition-all min-w-[36px] min-h-[36px]"
                                            title="Remove track"
                                            aria-label={`Remove ${track.title}`}
                                        >
                                            <Trash2 size={13} />
                                        </button>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Bottom spacer so last track isn't flush against player bar */}
                <div className="h-6" />
            </div>
        </div>
        </>
    );
}
