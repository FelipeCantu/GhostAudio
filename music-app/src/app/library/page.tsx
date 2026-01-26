"use client";

import DashboardLayout from "@/components/DashboardLayout";
import { motion } from "framer-motion";
import { Disc } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { api, Album } from "@/services/api";
import AlbumCard from "@/components/AlbumCard";

export default function LibraryPage() {
    const { token } = useAuth();
    const [albums, setAlbums] = useState<Album[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    useEffect(() => {
        const loadAlbums = async () => {
            if (!token) return;
            try {
                const data = await api.library.getAlbums(token);
                setAlbums(data);
            } catch (err) {
                setError("Failed to load your library.");
            } finally {
                setLoading(false);
            }
        };

        loadAlbums();
    }, [token]);

    return (
        <DashboardLayout>
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="max-w-7xl mx-auto"
            >
                <div className="mb-8 flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold text-foreground mb-2">My Library</h1>
                        <p className="text-muted-foreground">Your collection in high fidelity.</p>
                    </div>
                </div>

                {loading ? (
                    <div className="flex justify-center py-20">
                        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                    </div>
                ) : error ? (
                    <div className="text-center py-20 bg-red-500/10 rounded-3xl border border-red-500/20">
                        <h3 className="text-xl font-bold text-red-400 mb-2">Error Loading Library</h3>
                        <p className="text-zinc-400">{error}</p>
                    </div>
                ) : albums.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-center border-2 border-dashed border-white/10 rounded-3xl bg-white/5">
                        <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center mb-6">
                            <Disc size={40} className="text-muted-foreground" />
                        </div>
                        <h3 className="text-xl font-medium text-foreground mb-2">Your library looks empty</h3>
                        <p className="text-muted-foreground max-w-sm mb-6">
                            Start by importing some CDs or adding music locally.
                        </p>
                        <a
                            href="/import"
                            className="px-6 py-3 bg-primary text-primary-foreground font-bold rounded-xl hover:bg-primary/90 transition-colors"
                        >
                            Go to Importer
                        </a>
                    </div>
                ) : (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                        {albums.map((album) => (
                            <AlbumCard key={album.id} album={album} />
                        ))}
                    </div>
                )}
            </motion.div>
        </DashboardLayout>
    );
}
