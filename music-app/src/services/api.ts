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
            // Fallback to Cloud API
            try {
                const res = await fetchWithTimeout(`${NEXT_API_URL}/api/auth/login/`, {
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
            // Fallback to Cloud API
            // Fallback to Cloud API
            try {
                const res = await fetchWithTimeout(`${NEXT_API_URL}/api/auth/register/`, {
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
            // Fallback to Cloud API
            const res = await fetch(`${NEXT_API_URL}/api/auth/me/`, {
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
            const res = await fetch(`${NEXT_API_URL}/api/library/`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
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
            const res = await fetch(`${NEXT_API_URL}/api/dashboard/stats/`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
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
    isElectron
};
