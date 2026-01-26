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
    // @ts-ignore
    if (window.electronAPI) {
        // @ts-ignore
        const res = await window.electronAPI.invoke('library-get', token);
        if (res.error) throw new Error(res.error);
        return res;
    } else {
        const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
        const res = await fetch(`${API_URL}/api/library/`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!res.ok) throw new Error("Failed to fetch library");
        return await res.json();
    }


}
