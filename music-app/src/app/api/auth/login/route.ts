import { NextResponse } from "next/server";
import { verifyUser, generateToken } from "@/lib/auth";

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { username, password } = body;

        if (!username || !password) {
            return NextResponse.json(
                { detail: "Username and password are required" },
                { status: 400 }
            );
        }

        const user = await verifyUser(username, password);

        if (user) {
            const token = generateToken(user);
            const response = NextResponse.json({
                access: token,
                refresh: token,
                user: {
                    username: user.username,
                    email: user.email,
                    id: user._id
                }
            });

            response.cookies.set('token', token, {
                httpOnly: false, // Accessible to JS for now so AuthContext can read it if needed, or we just sync
                path: '/',
                maxAge: 60 * 60 * 24 * 7 // 7 days
            });

            return response;
        }

        return NextResponse.json(
            { detail: "Invalid credentials" },
            { status: 401 }
        );
    } catch (error) {
        console.error("Login error:", error);
        return NextResponse.json(
            { detail: "Something went wrong" },
            { status: 500 }
        );
    }
}
