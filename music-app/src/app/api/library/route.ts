import { NextResponse } from "next/server";

// Simple in-memory store for demo purposes
// In a real serverless function, this resets occasionally, but good enough for a demo session.
const MOCK_LIBRARY = [
    {
        id: 1,
        title: "Simulation Theory",
        artist: "Muse",
        created_at: new Date().toISOString(),
        cover_art: "https://coverartarchive.org/release/8e0467fb-2374-4299-b9d2-32aa878c772e/front",
        tracks: [
            { id: 1, track_number: 1, title: "Algorithm", audio_file: "", duration: "4:05" },
            { id: 2, track_number: 2, title: "The Dark Side", audio_file: "", duration: "3:47" }
        ]
    }
];

export async function GET(request: Request) {
    return NextResponse.json(MOCK_LIBRARY);
}

export async function POST(request: Request) {
    // Mock adding an album
    const body = await request.json();
    const newAlbum = {
        id: MOCK_LIBRARY.length + 1,
        title: body.title || "Unknown Album",
        artist: body.artist || "Unknown Artist",
        created_at: new Date().toISOString(),
        cover_art: body.cover_art,
        tracks: body.tracks || []
    };
    MOCK_LIBRARY.push(newAlbum);
    return NextResponse.json(newAlbum, { status: 201 });
}
