// Use relative path for Next.js internal API
export interface Track {
    id: number;
    title: string;
    track_number: number;
    audio_file: string;
    duration?: string;
}

export interface Album {
    id: number;
    title: string;
    artist: string;
    created_at: string;
    cover_art?: string;
    tracks: Track[];
}

export interface PlaylistItem {
    albumId: string;
    trackNumber: number;
    title: string;
    artist: string;
    albumTitle: string;
    audioFile: string;
    duration?: string;
    coverArt?: string;
}

export interface SmartRule {
    type: 'by_artist' | 'recently_added' | 'random';
    value?: string;
}

export interface Playlist {
    id: string;
    name: string;
    description?: string;
    is_smart: boolean;
    smart_rule?: SmartRule | null;
    items?: PlaylistItem[];
    item_count?: number;
    cover_arts?: string[];
    created_at: string;
    updated_at?: string;
}

// Helper to check if we are in Electron environment with API available
const isElectron = () => {
    return typeof window !== 'undefined' && (window as any).electronAPI !== undefined;
};

// Base configuration
const NEXT_API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

// Helper for fetch with timeout
async function fetchWithTimeout(resource: RequestInfo, options: RequestInit = {}) {
    const { timeout = 8000 } = options as any;

    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);

    try {
        const response = await fetch(resource, {
            ...options,
            signal: controller.signal
        });
        clearTimeout(id);
        return response;
    } catch (error: any) {
        clearTimeout(id);
        if (error.name === 'AbortError') {
            throw new Error("Connection timed out. Check your internet or server status.");
        }
        throw error;
    }
}

// Type definitions for Auth responses
interface AuthResponse {
    access?: string;
    refresh?: string;
    user?: any;
    error?: string;
    success?: boolean;
    id?: number;
    username?: string;
}

export const api = {
    auth: {
        login: async (credentials: any): Promise<AuthResponse> => {
            if (!credentials.username || !credentials.password) {
                return { error: "Please enter both username and password." };
            }

            if (isElectron()) {
                return await (window as any).electronAPI.invoke('auth-login', credentials);
            }
            // Fallback to Cloud API (MongoDB-backed auth)
            try {
                const res = await fetchWithTimeout(`${NEXT_API_URL}/api/mongo/auth/login/`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(credentials)
                });
                if (!res.ok) {
                    // Specific User-Friendly Error Mapping
                    if (res.status === 401) return { error: "Invalid username or password." };
                    if (res.status === 404) return { error: "Login service not found (404)." };
                    if (res.status >= 500) return { error: "Server is experiencing issues. Please try again later." };

                    // Try to parse error from JSON, fallback to status text
                    try {
                        const errData = await res.json();
                        return { error: errData.error || `Error (${res.status}): ${res.statusText}` };
                    } catch {
                        return { error: `Server Error (${res.status}): ${res.statusText}` };
                    }
                }
                return await res.json();
            } catch (e: any) {
                return { error: e.message || "Network error. Please check your connection." };
            }
        },
        register: async (data: any): Promise<AuthResponse> => {
            if (isElectron()) {
                return await (window as any).electronAPI.invoke('auth-register', data);
            }
            // Fallback to Cloud API (MongoDB-backed auth)
            try {
                const res = await fetchWithTimeout(`${NEXT_API_URL}/api/mongo/auth/register/`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                });
                if (!res.ok) {
                    if (res.status === 400) return { error: "Invalid data. User may already exist." };
                    if (res.status >= 500) return { error: "Server error. Please try again later." };

                    try {
                        const errData = await res.json();
                        return { error: errData.error || `Error (${res.status}): ${res.statusText}` };
                    } catch {
                        return { error: `Server Error (${res.status}): ${res.statusText}` };
                    }
                }
                return await res.json();
            } catch (e: any) {
                return { error: e.message || "Network error. Please check your connection." };
            }
        },
        me: async (token: string): Promise<any> => {
            if (isElectron()) {
                return await (window as any).electronAPI.invoke('auth-me', token);
            }
            // Fallback to Cloud API (MongoDB-backed auth)
            const res = await fetch(`${NEXT_API_URL}/api/mongo/auth/me/`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!res.ok) throw new Error("Failed to fetch user");
            return await res.json();
        }
    },
    library: {
        getAlbums: async (token: string, mongoUserId?: string): Promise<Album[]> => {
            if (isElectron()) {
                return await (window as any).electronAPI.invoke('library-get', {
                    token,
                    mongo_user_id: mongoUserId
                });
            }
            // Always use Cloud API for Library
            const res = await fetch(`${NEXT_API_URL}/api/mongo/library/?user_id=${mongoUserId}`);
            if (!res.ok) throw new Error("Failed to fetch library");
            return await res.json();
        },
        getDashboardStats: async (token: string, mongoUserId?: string): Promise<any> => {
            if (isElectron()) {
                return await (window as any).electronAPI.invoke('dashboard-stats', {
                    token,
                    mongo_user_id: mongoUserId
                });
            }
            const res = await fetch(`${NEXT_API_URL}/api/dashboard/stats/?user_id=${mongoUserId}`);
            if (!res.ok) throw new Error("Failed to fetch dashboard stats");
            return await res.json();
        },
        deleteAlbum: async (albumId: string, mongoUserId?: string): Promise<any> => {
            if (isElectron()) {
                return await (window as any).electronAPI.invoke('library-delete', {
                    album_id: albumId,
                    mongo_user_id: mongoUserId
                });
            }
            throw new Error("Delete only available in Desktop App");
        },
        importLocalFiles: async (mongoUserId?: string): Promise<any> => {
            if (isElectron()) {
                return await (window as any).electronAPI.invoke('import-local-files', {
                    mongo_user_id: mongoUserId
                });
            }
            throw new Error("Import only available in Desktop App");
        }
    },
    system: {
        getDrives: async () => {
            if (isElectron()) {
                return await (window as any).electronAPI.invoke('get-drives');
            }
            throw new Error("CD Import is only available in the Desktop App.");
        },
        getSystemStatus: async () => {
            if (isElectron()) {
                return await (window as any).electronAPI.invoke('system-status');
            }
            // Mock for web
            return { ffmpeg_found: false, platform: 'web' };
        },
        ripCd: async (data: any) => {
            if (isElectron()) {
                return await (window as any).electronAPI.invoke('rip-cd', data);
            }
            throw new Error("CD Import is only available in the Desktop App.");
        },
        cancelRip: async (sessionId: string) => {
            if (isElectron()) {
                return await (window as any).electronAPI.invoke('cancel-rip', { session_id: sessionId });
            }
            throw new Error("CD Import is only available in the Desktop App.");
        },
        getCdMetadata: async (drivePath: string) => {
            if (isElectron()) {
                return await (window as any).electronAPI.invoke('get-cd-metadata', { drive_path: drivePath });
            }
            // Mock or error for web
            return { error: "Metadata lookup only available in Destkop App" };
        }
    },
    playlists: {
        getAll: async (mongoUserId: string): Promise<Playlist[]> => {
            if (isElectron()) {
                return await (window as any).electronAPI.invoke('playlist-get-all', { mongo_user_id: mongoUserId });
            }
            const res = await fetch(`${NEXT_API_URL}/api/mongo/playlists/?user_id=${mongoUserId}`);
            if (!res.ok) throw new Error('Failed to fetch playlists');
            return await res.json();
        },
        getById: async (playlistId: string, mongoUserId: string): Promise<Playlist> => {
            if (isElectron()) {
                return await (window as any).electronAPI.invoke('playlist-get-one', { playlist_id: playlistId, mongo_user_id: mongoUserId });
            }
            const res = await fetch(`${NEXT_API_URL}/api/mongo/playlists/${playlistId}/?user_id=${mongoUserId}`);
            if (!res.ok) throw new Error('Failed to fetch playlist');
            return await res.json();
        },
        create: async (data: { user_id: string; name: string; description?: string; is_smart?: boolean; smart_rule?: SmartRule | null }): Promise<Playlist> => {
            if (isElectron()) {
                return await (window as any).electronAPI.invoke('playlist-create', data);
            }
            const res = await fetch(`${NEXT_API_URL}/api/mongo/playlists/`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });
            if (!res.ok) throw new Error('Failed to create playlist');
            return await res.json();
        },
        update: async (playlistId: string, data: { user_id: string; name?: string; description?: string; items?: PlaylistItem[] }): Promise<Playlist> => {
            if (isElectron()) {
                return await (window as any).electronAPI.invoke('playlist-update', { playlist_id: playlistId, ...data });
            }
            const res = await fetch(`${NEXT_API_URL}/api/mongo/playlists/${playlistId}/`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });
            if (!res.ok) throw new Error('Failed to update playlist');
            return await res.json();
        },
        delete: async (playlistId: string, mongoUserId: string): Promise<any> => {
            if (isElectron()) {
                return await (window as any).electronAPI.invoke('playlist-delete', { playlist_id: playlistId, mongo_user_id: mongoUserId });
            }
            const res = await fetch(`${NEXT_API_URL}/api/mongo/playlists/${playlistId}/?user_id=${mongoUserId}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('Failed to delete playlist');
            return await res.json();
        },
        addItems: async (playlistId: string, mongoUserId: string, items: PlaylistItem[]): Promise<Playlist> => {
            if (isElectron()) {
                return await (window as any).electronAPI.invoke('playlist-add-items', { playlist_id: playlistId, user_id: mongoUserId, items });
            }
            const res = await fetch(`${NEXT_API_URL}/api/mongo/playlists/${playlistId}/items/`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: mongoUserId, items }),
            });
            if (!res.ok) throw new Error('Failed to add items');
            return await res.json();
        },
        removeItem: async (playlistId: string, itemIndex: number, mongoUserId: string): Promise<Playlist> => {
            if (isElectron()) {
                return await (window as any).electronAPI.invoke('playlist-remove-item', { playlist_id: playlistId, item_index: itemIndex, mongo_user_id: mongoUserId });
            }
            const res = await fetch(`${NEXT_API_URL}/api/mongo/playlists/${playlistId}/items/${itemIndex}/?user_id=${mongoUserId}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('Failed to remove item');
            return await res.json();
        },
        refresh: async (playlistId: string, mongoUserId: string): Promise<Playlist> => {
            if (isElectron()) {
                return await (window as any).electronAPI.invoke('playlist-refresh', { playlist_id: playlistId, user_id: mongoUserId });
            }
            const res = await fetch(`${NEXT_API_URL}/api/mongo/playlists/${playlistId}/refresh/`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: mongoUserId }),
            });
            if (!res.ok) throw new Error('Failed to refresh playlist');
            return await res.json();
        },
    },
    isElectron
};
