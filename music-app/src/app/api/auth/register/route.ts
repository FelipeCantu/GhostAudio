import { NextResponse } from "next/server";

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { username, email, password } = body;

        // Mock Registration Logic
        if (username && password) {
            return NextResponse.json({
                access: "mock-access-token-new-user",
                refresh: "mock-refresh-token-new-user",
                user: {
                    username: username,
                    email: email || `${username}@example.com`,
                    id: 2
                }
            }, { status: 201 });
        }

        return NextResponse.json(
            { detail: "Invalid data" },
            { status: 400 }
        );
    } catch (error) {
        return NextResponse.json(
            { detail: "Something went wrong" },
            { status: 500 }
        );
    }
}
