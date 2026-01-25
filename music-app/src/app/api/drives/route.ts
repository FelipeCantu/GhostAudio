import { NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";

export async function GET(request: Request) {
    // 1. Verify Auth
    const authHeader = request.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
    }
    const token = authHeader.split(" ")[1];
    const user = verifyToken(token);
    if (!user) {
        return NextResponse.json({ detail: "Invalid token" }, { status: 401 });
    }

    // 2. Call Python Backend (No Auth required there)
    try {
        // Assuming Python is running on localhost:8000
        const DJANGO_API = "http://localhost:8000/importer";
        const res = await fetch(`${DJANGO_API}/drives/`);

        if (!res.ok) {
            throw new Error(`Django failed: ${res.status}`);
        }

        const data = await res.json();
        return NextResponse.json(data);
    } catch (err: any) {
        console.error("Proxy error:", err);
        return NextResponse.json({ detail: "Failed to connect to hardware service" }, { status: 502 });
    }
}
