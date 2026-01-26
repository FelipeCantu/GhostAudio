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
            // Always use Cloud API for Auth
            const res = await fetch(`${NEXT_API_URL}/api/auth/login/`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(credentials)
            });
            return await res.json();
        },
        register: async (data: any): Promise<AuthResponse> => {
            // Always use Cloud API for Auth
            const res = await fetch(`${NEXT_API_URL}/api/auth/register/`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            return await res.json();
        },
        me: async (token: string): Promise<any> => {
            // Always use Cloud API for Auth
            const res = await fetch(`${NEXT_API_URL}/api/auth/me/`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!res.ok) throw new Error("Failed to fetch user");
            return await res.json();
        }
    },
    library: {
        getAlbums: async (token: string): Promise<Album[]> => {
            // Always use Cloud API for Library
            const res = await fetch(`${NEXT_API_URL}/api/library/`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!res.ok) throw new Error("Failed to fetch library");
            return await res.json();
        }
    },
    system: {
        getDrives: async () => {
            if (isElectron()) {
                return await (window as any).electronAPI.invoke('get-drives');
            }
            throw new Error("CD Import is only available in the Desktop App.");
        },
        ripCd: async (data: any) => {
            if (isElectron()) {
                return await (window as any).electronAPI.invoke('rip-cd', data);
            }
            throw new Error("CD Import is only available in the Desktop App.");
        }
    },
    isElectron
};
