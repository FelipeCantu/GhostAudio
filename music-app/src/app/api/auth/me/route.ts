import { NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";

export async function GET(request: Request) {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
    }

    const token = authHeader.split(" ")[1];
    const decoded: any = verifyToken(token);

    if (!decoded) {
        return NextResponse.json({ detail: "Invalid token" }, { status: 401 });
    }

    return NextResponse.json({
        username: decoded.username,
        id: decoded.id
        // Add more fields if needed
    });
}
