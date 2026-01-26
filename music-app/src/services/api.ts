/* eslint-disable @typescript-eslint/no-explicit-any */

// Use relative path for Next.js internal API or environment variable
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

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

export interface User {
    id: string;
    username: string;
    email: string;
}

export interface LoginResponse {
    access: string;
    refresh?: string;
    user?: User;
    error?: string;
}

export interface RegisterResponse {
    success?: boolean;
    username?: string;
    error?: string;
}

// Helper to check for Electron
export const isElectron = (): boolean => {
    if (typeof window === 'undefined') return false;
    return !!((window as any).electronAPI || ((window as any).require && typeof (window as any).require === 'function'));
};

// Generic IPC helper
async function ipcInvoke(channel: string, ...args: any[]) {
    if (isElectron()) {
        const { ipcRenderer } = (window as any).require('electron');
        return await ipcRenderer.invoke(channel, ...args);
    }
    throw new Error("Electron not available");
}

// Generic Fetch helper
async function fetchApi(endpoint: string, method: string = 'GET', body?: any, token?: string) {
    const headers: HeadersInit = {
        'Content-Type': 'application/json',
    };
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch(`${API_BASE_URL}${endpoint}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
    });

    const data = await res.json();
    if (!res.ok) {
        throw new Error(data.error || data.detail || res.statusText);
    }
    return data;
}

// --- Auth ---

export async function login(username: string, password: string): Promise<LoginResponse> {
    if (isElectron()) {
        return await ipcInvoke('auth-login', { username, password });
    } else {
        const data = await fetchApi('/auth/login/', 'POST', { username, password });
        // data contains { access, refresh }
        return { access: data.access, refresh: data.refresh };
    }
}

export async function register(username: string, email: string, password: string): Promise<RegisterResponse> {
    if (isElectron()) {
        return await ipcInvoke('auth-register', { username, email, password });
    } else {
        const data = await fetchApi('/auth/register/', 'POST', { username, email, password });
        return { success: true, username: data.username };
    }
}

export async function getMe(token: string): Promise<User | { error: string }> {
    if (isElectron()) {
        return await ipcInvoke('auth-me', token);
    } else {
        try {
            const user = await fetchApi('/auth/me/', 'GET', undefined, token);
            return user;
        } catch (e: any) {
            return { error: e.message };
        }
    }
}

// --- Library ---

export async function fetchAlbums(token: string): Promise<Album[]> {
    if (isElectron()) {
        const res = await ipcInvoke('library-get', token);
        if (res.error) throw new Error(res.error);
        return res;
    } else {
        // This expects the backend to return a list of albums
        return await fetchApi('/library/', 'GET', undefined, token);
    }
}

// --- Hardware (Electron only) ---

export async function getDrives() {
    if (isElectron()) {
        return await ipcInvoke('get-drives');
    } else {
        return { drives: [] };
    }
}

export async function ripCD(args: { drive_path: string, token: string | null, mongo_user_id: string | undefined }) {
    if (isElectron()) {
        return await ipcInvoke('rip-cd', args);
    } else {
        throw new Error("CD Import is only available in the Desktop App.");
    }
}
