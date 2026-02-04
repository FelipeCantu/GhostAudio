"use client";

import Spline from '@splinetool/react-spline';

export function HeroVisual() {
    return (
        <div className="w-full h-full relative bg-[#0e1b2b]">
            <div className="w-full h-full animate-[spin_120s_linear_infinite]">
                <Spline
                    scene="/scene%20(2).splinecode"
                    className="w-full h-full"
                />
            </div>
            {/* Overlay to ensure text readability if needed, though usually better handled in parent or by scene lighting */}
            <div className="absolute inset-0 bg-gradient-to-t from-[#0d1b2a] via-transparent to-transparent opacity-20 pointer-events-none" />
        </div>
    );
}
