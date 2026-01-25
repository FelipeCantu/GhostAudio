import { NextResponse } from "next/server";
import { createUser, generateToken } from "@/lib/auth";

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { username, email, password } = body;

        if (!username || !password) {
            return NextResponse.json(
                { detail: "Username and password are required" },
                { status: 400 }
            );
        }

        const user = await createUser(username, password, email);
        const token = generateToken(user);

        const response = NextResponse.json({
            access: token,
            refresh: token, // Simplified: using same token for refresh for now
            user: {
                username: user.username,
                email: user.email,
                id: user._id
            }
        }, { status: 201 });

        response.cookies.set('token', token, {
            httpOnly: false,
            path: '/',
            maxAge: 60 * 60 * 24 * 7 // 7 days
        });

        return response;

    } catch (error: any) {
        console.error("Registration error:", error);
        return NextResponse.json(
            { detail: error.message || "Something went wrong" },
            { status: 400 }
        );
    }
}
