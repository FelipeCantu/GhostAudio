// Use relative path for Next.js internal API
export const API_URL = "/api";

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

export async function fetchAlbums(token: string): Promise<Album[]> {
    const { ipcRenderer } = (window as any).require('electron');
    const res = await ipcRenderer.invoke('library-get', token);

    if (res.error) {
        throw new Error(res.error);
    }

    return res;
}
