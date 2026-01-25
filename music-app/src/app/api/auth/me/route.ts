import { NextResponse } from "next/server";

export async function GET(request: Request) {
    // In a real app, we would verify the 'Authorization' header token here.
    return NextResponse.json({
        username: "DiZC User",
        email: "user@dizc.app",
        id: 1
    });
}
