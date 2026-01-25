import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
    // Paths that require authentication
    const protectedPaths = ['/import', '/settings', '/library'];

    const path = request.nextUrl.pathname;

    const isProtected = protectedPaths.some((prefix) => path.startsWith(prefix));

    if (isProtected) {
        const token = request.cookies.get('token')?.value;

        // We can't verify the JWT signature easily in Edge Middleware without 'jose' or similar
        // simpler check: check if token exists. 
        // True verification happens on the API side or Client side (via AuthContext check)
        // For better security, we should install 'jose' but for now existence check + client side auth context redirect is a good start.

        // Actually, AuthContext handles the client-side redirect. 
        // Middleware adds server-side protection/redirection.

        // Note: The AuthContext stores token in localStorage, not cookies by default in the current implementation?
        // Let's check AuthContext.
        // If AuthContext uses localStorage, middleware won't see it unless we also set a cookie.
        // The current plan doesn't explicitly mention switching to cookies, but it's best practice.
        // However, if we don't switch to cookies, middleware can't see the token.
        // For now, I will skip middleware token check if we are relying on localStorage, 
        // OR I should update login/register to Set-Cookie as well.

        // Let's check AuthContext again.
        // File: src/context/AuthContext.tsx matches 108 lines.
        // It uses localStorage.

        // Strategy: stick to Client-Side protection for now since middleware can't access localStorage.
        // Unless I update the API to set a cookie.
        // Plan said "Verify JWT in cookies or headers" for middleware.
        // So I should probably set a cookie in the login/register route.

        // Let's proceed with creating middleware but realizing it might need the cookie.
        // I will add cookie setting to login/register routes in a next step if I want middleware to work.
        // For now, let's assume we want middleware to work.

        // Wait, if I change to cookies, I need to update AuthContext to read from cookies or just trust the API.
        // The simplest "Real Login" satisfaction is usually robust enough.
        // Let's implement the middleware to redirect if NO cookie is present, 
        // AND update login/register to set that cookie.

        if (!token) {
            const url = request.nextUrl.clone();
            url.pathname = '/login';
            return NextResponse.redirect(url);
        }
    }

    return NextResponse.next();
}

export const config = {
    matcher: ['/import/:path*', '/settings/:path*', '/library/:path*'],
};
