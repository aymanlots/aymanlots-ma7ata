import React from 'react';

interface IllustrationProps {
  className?: string;
  opacity?: number;
}

export const DesertDunes: React.FC<IllustrationProps> = ({
  className = '',
  opacity = 0.2,
}) => {
  return (
    <div className={`pointer-events-none select-none overflow-hidden ${className}`}>
      <svg
        viewBox="0 0 1000 350"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="xMidYMid slice"
        className="w-full h-full"
        style={{ opacity }}
      >
        <defs>
          <linearGradient id="saharaSky" x1="500" y1="0" x2="500" y2="350" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#0B1220" />
            <stop offset="60%" stopColor="#1E293B" />
            <stop offset="100%" stopColor="#451A03" />
          </linearGradient>
          <linearGradient id="duneGrad1" x1="0" y1="0" x2="1000" y2="0" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#78350F" />
            <stop offset="50%" stopColor="#B45309" />
            <stop offset="100%" stopColor="#78350F" />
          </linearGradient>
          <linearGradient id="duneGrad2" x1="0" y1="0" x2="1000" y2="0" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#451A03" />
            <stop offset="70%" stopColor="#92400E" />
            <stop offset="100%" stopColor="#451A03" />
          </linearGradient>
        </defs>

        {/* Sky */}
        <rect width="1000" height="350" fill="url(#saharaSky)" />

        {/* Desert Stars in Sky */}
        <g fill="#FDE68A" opacity="0.6">
          <circle cx="120" cy="40" r="1.5" />
          <circle cx="280" cy="65" r="1" />
          <circle cx="450" cy="30" r="1.5" />
          <circle cx="680" cy="55" r="1" />
          <circle cx="850" cy="45" r="1.5" />
          <circle cx="920" cy="80" r="1" />
          <circle cx="190" cy="90" r="1" />
          <circle cx="580" cy="85" r="1.5" />
        </g>

        {/* Far Wind-swept Dunes */}
        <path
          d="M 0 200 Q 180 140 400 180 T 800 170 Q 920 180 1000 220 L 1000 350 L 0 350 Z"
          fill="url(#duneGrad1)"
          opacity="0.5"
        />

        {/* Middle Dunes with sharp crest ridges */}
        <path
          d="M 0 240 Q 250 170 520 220 Q 750 250 1000 210 L 1000 350 L 0 350 Z"
          fill="url(#duneGrad2)"
          opacity="0.8"
        />
        {/* Dune crest line */}
        <path
          d="M 0 240 Q 250 170 520 220 Q 750 250 1000 210"
          stroke="#F59E0B"
          strokeWidth="1.5"
          opacity="0.4"
          fill="none"
        />

        {/* Foreground Sand Dune Ridge */}
        <path
          d="M 0 280 Q 300 220 620 270 Q 820 290 1000 260 L 1000 350 L 0 350 Z"
          fill="#131C2E"
        />
        {/* Foreground crest highlight */}
        <path
          d="M 0 280 Q 300 220 620 270 Q 820 290 1000 260"
          stroke="#F59E0B"
          strokeWidth="1"
          opacity="0.3"
          fill="none"
        />
      </svg>
    </div>
  );
};
