"use client";

import { useState } from "react";
import { ListMusic } from "lucide-react";

interface PlaylistCoverArtProps {
    coverArts: string[];
    size?: number;
    className?: string;
}

function CoverImg({ src, className = "" }: { src: string; className?: string }) {
    const [error, setError] = useState(false);
    if (error || !src) {
        return <div className={`bg-zinc-800 ${className}`} />;
    }
    return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
            src={src}
            alt=""
            className={`object-cover w-full h-full ${className}`}
            onError={() => setError(true)}
        />
    );
}

export default function PlaylistCoverArt({ coverArts, size = 48, className = "" }: PlaylistCoverArtProps) {
    const arts = (coverArts || []).filter(Boolean).slice(0, 4);

    const style = { width: size, height: size };

    if (arts.length === 0) {
        return (
            <div
                style={style}
                className={`flex items-center justify-center bg-zinc-800 rounded-md flex-shrink-0 ${className}`}
            >
                <ListMusic size={size * 0.4} className="text-zinc-500" />
            </div>
        );
    }

    if (arts.length === 1) {
        return (
            <div style={style} className={`rounded-md overflow-hidden flex-shrink-0 ${className}`}>
                <CoverImg src={arts[0]} className="rounded-md" />
            </div>
        );
    }

    if (arts.length === 2) {
        return (
            <div style={style} className={`grid grid-cols-2 rounded-md overflow-hidden flex-shrink-0 ${className}`}>
                <CoverImg src={arts[0]} />
                <CoverImg src={arts[1]} />
            </div>
        );
    }

    if (arts.length === 3) {
        return (
            <div style={style} className={`grid grid-cols-2 rounded-md overflow-hidden flex-shrink-0 ${className}`}>
                <CoverImg src={arts[0]} className="row-span-2 h-full" />
                <CoverImg src={arts[1]} />
                <CoverImg src={arts[2]} />
            </div>
        );
    }

    // 4
    return (
        <div style={style} className={`grid grid-cols-2 grid-rows-2 rounded-md overflow-hidden flex-shrink-0 ${className}`}>
            <CoverImg src={arts[0]} />
            <CoverImg src={arts[1]} />
            <CoverImg src={arts[2]} />
            <CoverImg src={arts[3]} />
        </div>
    );
}
