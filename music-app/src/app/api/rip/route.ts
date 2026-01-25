import { NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import Album from "@/models/Album";
import dbConnect from "@/lib/db";

export async function POST(request: Request) {
    // 1. Verify Auth
    const authHeader = request.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
    }
    const token = authHeader.split(" ")[1];
    const user: any = verifyToken(token);
    if (!user) {
        return NextResponse.json({ detail: "Invalid token" }, { status: 401 });
    }

    try {
        const body = await request.json();
        const { drive_path, metadata } = body;

        // 2. Call Python Backend to RIP (No Save)
        // We will modify Django to accept a ?nosave=true param or similar, 
        // OR just assume we updated Django to not save by default.
        // Let's assume we update Django to return the paths.

        const DJANGO_API = "http://localhost:8000/importer";
        const res = await fetch(`${DJANGO_API}/rip/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                drive_path,
                metadata,
                nosave: true // Custom flag we will implement in Django
            })
        });

        if (!res.ok) {
            const error = await res.json();
            throw new Error(error.detail || "Rip failed");
        }

        const ripResult = await res.json();
        // Expected ripResult: { status: 'completed', tracks: [...paths], metadata: ... }

        // 3. Save to MongoDB
        await dbConnect();

        const tracks = ripResult.tracks.map((filePath: string, idx: number) => ({
            title: metadata?.tracks?.[idx]?.title || `Track ${idx + 1}`,
            trackNumber: idx + 1,
            audioFile: filePath,
            duration: 0 // Python could return this if we want
        }));

        const album = await Album.create({
            user: user.id,
            title: metadata?.album || "Unknown Album",
            artist: metadata?.artist || "Unknown Artist",
            coverArt: null,
            tracks: tracks
        });

        return NextResponse.json({
            status: "completed",
            album: album
        });

    } catch (err: any) {
        console.error("Rip proxy error:", err);
        return NextResponse.json({ detail: err.message || "Import failed" }, { status: 500 });
    }
}
