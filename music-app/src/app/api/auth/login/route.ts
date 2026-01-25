import { NextResponse } from "next/server";

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { username, password } = body;

        // Mock Authentication Logic
        // In a real app, you would check the database here.
        if (username && password) {
            return NextResponse.json({
                access: "mock-access-token-12345",
                refresh: "mock-refresh-token-12345",
                user: {
                    username: username,
                    email: `${username}@example.com`,
                    id: 1
                }
            });
        }

        return NextResponse.json(
            { detail: "Invalid credentials" },
            { status: 401 }
        );
    } catch (error) {
        return NextResponse.json(
            { detail: "Something went wrong" },
            { status: 500 }
        );
    }
}
