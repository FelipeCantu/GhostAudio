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
    login: (token: string, user: any) => void;
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
        const initAuth = () => {
            const storedToken = localStorage.getItem("accessToken");
            const storedUser = localStorage.getItem("userData");
            if (storedToken && storedUser) {
                try {
                    setToken(storedToken);
                    setUser(JSON.parse(storedUser));
                } catch {
                    localStorage.removeItem("accessToken");
                    localStorage.removeItem("userData");
                }
            }
            setIsLoading(false);
        };

        initAuth();
    }, []);

    const login = (accessToken: string, userData: any) => {
        localStorage.setItem("accessToken", accessToken);
        localStorage.setItem("userData", JSON.stringify(userData));
        setToken(accessToken);
        setUser(userData);
        router.push("/app");
    };

    const logout = (redirect = true) => {
        localStorage.removeItem("accessToken");
        localStorage.removeItem("userData");
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
