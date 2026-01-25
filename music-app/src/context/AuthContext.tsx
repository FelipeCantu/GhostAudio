"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { useRouter } from "next/navigation";

interface User {
    id: string;
    username: string;
    email: string;
}

interface AuthContextType {
    user: User | null;
    token: string | null;
    login: (token: string, refresh: string) => void;
    logout: () => void;
    isAuthenticated: boolean;
    isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [token, setToken] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const router = useRouter();

    useEffect(() => {
        // Load from localStorage on mount
        const initAuth = async () => {
            const storedToken = localStorage.getItem("accessToken");
            if (storedToken) {
                setToken(storedToken);
                await fetchUser(storedToken);
            } else {
                setIsLoading(false);
            }
        };

        initAuth();
    }, []);

    const fetchUser = async (authToken: string) => {
        try {
            // Use internal API
            const API_URL = "/api";

            const res = await fetch(`${API_URL}/auth/me`, {
                headers: {
                    Authorization: `Bearer ${authToken}`
                }
            });

            if (res.ok) {
                const userData = await res.json();
                setUser(userData);
            } else {
                // Token invalid or expired
                logout(false); // Don't redirect immediately if just checking on load, or do? 
                // Actually if token is invalid, we should clear it.
            }
        } catch (err) {
            console.error("Failed to fetch user", err);
            // On error considering them not logged in is safer
            logout(false);
        } finally {
            setIsLoading(false);
        }
    };

    const login = (accessToken: string, refreshToken: string) => {
        localStorage.setItem("accessToken", accessToken);
        localStorage.setItem("refreshToken", refreshToken);
        setToken(accessToken);
        // We can optimistically set loading to true while we fetch user details, 
        // or just fetch user details and then route.
        // For simplicity, let's just push to home. 
        // But better to fetch user first.
        fetchUser(accessToken).then(() => {
            router.push("/");
        });
    };

    const logout = (redirect = true) => {
        localStorage.removeItem("accessToken");
        localStorage.removeItem("refreshToken");
        setToken(null);
        setUser(null);
        if (redirect) {
            router.push("/login");
        }
    };

    return (
        <AuthContext.Provider value={{ user, token, login, logout, isAuthenticated: !!user, isLoading }}>
            {children}
        </AuthContext.Provider>
    );
}

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error("useAuth must be used within an AuthProvider");
    }
    return context;
};
