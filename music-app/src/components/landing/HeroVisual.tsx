"use client";

import Spline from '@splinetool/react-spline';

export function HeroVisual() {
    return (
        <div className="w-full h-full relative">
            <div className="w-full h-full animate-[spin_120s_linear_infinite]">
                <Spline
                    scene="/scene%20(2).splinecode"
                    className="w-full h-full"
                />
            </div>
            {/* Overlay to ensure text readability */}
            <div className="absolute inset-0 bg-[#0d1b2a]/40 backdrop-blur-[2px] pointer-events-none" />
        </div>
    );
}
