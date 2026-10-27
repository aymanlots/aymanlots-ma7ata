import React from 'react';

interface IllustrationProps {
  className?: string;
  opacity?: number;
}

export const BorderCrossing: React.FC<IllustrationProps> = ({
  className = '',
  opacity = 0.22,
}) => {
  return (
    <div className={`pointer-events-none select-none overflow-hidden ${className}`}>
      <svg
        viewBox="0 0 1000 450"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="xMidYMid slice"
        className="w-full h-full"
        style={{ opacity }}
      >
        <defs>
          <linearGradient id="skyGrad" x1="500" y1="0" x2="500" y2="450" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#0B132B" />
            <stop offset="45%" stopColor="#1C2541" />
            <stop offset="85%" stopColor="#3A506B" />
            <stop offset="100%" stopColor="#D97706" />
          </linearGradient>
          <linearGradient id="roadGrad" x1="500" y1="260" x2="500" y2="450" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#1E293B" />
            <stop offset="100%" stopColor="#0F172A" />
          </linearGradient>
          <clipPath id="borderMoroccoFlag">
            <rect x="290" y="140" width="60" height="40" rx="3" />
          </clipPath>
          <clipPath id="borderMauritaniaFlag">
            <rect x="650" y="140" width="60" height="40" rx="3" />
          </clipPath>
        </defs>

        {/* Sky background */}
        <rect width="1000" height="450" fill="url(#skyGrad)" />

        {/* Distant Sahara Horizon Dunes */}
        <path d="M 0 260 Q 240 220 500 245 T 1000 250 L 1000 450 L 0 450 Z" fill="#2E1C0C" opacity="0.7" />
        <path d="M 0 280 Q 300 250 600 270 T 1000 270 L 1000 450 L 0 450 Z" fill="#1C130A" />

        {/* Central Desert Highway (Road leading to border gate) */}
        <polygon points="460,260 540,260 760,450 240,450" fill="url(#roadGrad)" />
        {/* Road center dashed line */}
        <path d="M 500 260 L 500 450" stroke="#F59E0B" strokeWidth="4" strokeDasharray="14 12" />
        {/* Road white borders */}
        <line x1="460" y1="260" x2="240" y2="450" stroke="#E2E8F0" strokeWidth="2" strokeOpacity="0.5" />
        <line x1="540" y1="260" x2="760" y2="450" stroke="#E2E8F0" strokeWidth="2" strokeOpacity="0.5" />

        {/* Border Gate Posts and Cross-Beam Canopy */}
        <g stroke="#334155" strokeWidth="6" strokeLinecap="round">
          {/* Left Main Gate Post */}
          <line x1="360" y1="200" x2="360" y2="330" />
          {/* Right Main Gate Post */}
          <line x1="640" y1="200" x2="640" y2="330" />
          {/* Overhead Canopy Arch */}
          <line x1="330" y1="200" x2="670" y2="200" stroke="#475569" strokeWidth="8" />
        </g>

        {/* Border Barrier (Gate arm with red & white stripes) */}
        <g>
          {/* Barrier Pivot Box */}
          <rect x="350" y="300" width="20" height="32" rx="4" fill="#F59E0B" />
          {/* Striped Barrier Arm (in slightly raised / open angle for transport flow) */}
          <line x1="365" y1="310" x2="635" y2="310" stroke="#EF4444" strokeWidth="7" strokeDasharray="24 16" />
          <line x1="365" y1="310" x2="635" y2="310" stroke="#FFFFFF" strokeWidth="7" strokeDasharray="16 24" />
        </g>

        {/* 1. Moroccan Flagpole and Flag on the Left Gate Post */}
        <line x1="290" y1="120" x2="290" y2="330" stroke="#94A3B8" strokeWidth="3" />
        <circle cx="290" cy="118" r="3" fill="#F59E0B" />
        <g clipPath="url(#borderMoroccoFlag)">
          <rect x="290" y="140" width="60" height="40" fill="#C1272D" />
          {/* Green Moroccan Star */}
          <polygon
            points="320,147 323,155 332,156 325,162 327,170 320,166 313,170 315,162 308,156 317,155"
            fill="none"
            stroke="#006233"
            strokeWidth="2.5"
            strokeLinejoin="round"
          />
        </g>

        {/* 2. Mauritanian Flagpole and Flag on the Right Gate Post */}
        <line x1="710" y1="120" x2="710" y2="330" stroke="#94A3B8" strokeWidth="3" />
        <circle cx="710" cy="118" r="3" fill="#F59E0B" />
        <g clipPath="url(#borderMauritaniaFlag)">
          {/* Green Field */}
          <rect x="650" y="140" width="60" height="40" fill="#00A95C" />
          {/* Top/Bottom Red Stripes */}
          <rect x="650" y="140" width="60" height="8" fill="#C1272D" />
          <rect x="650" y="172" width="60" height="8" fill="#C1272D" />
          {/* Crescent */}
          <path d="M 672 161 C 674 167 686 167 688 161 C 686 164 674 164 672 161 Z" fill="#FFD700" />
          {/* Star */}
          <polygon points="680,152 682,155 686,155.5 683,158 684,161 680,159.5 676,161 677,158 674,155.5 678,155" fill="#FFD700" />
        </g>

        {/* Transport Cargo Truck passing checkpoint */}
        <g fill="#1E293B" stroke="#0F172A" strokeWidth="2">
          {/* Truck Cargo Container */}
          <rect x="445" y="270" width="55" height="38" rx="3" fill="#047857" />
          {/* Truck Cabin */}
          <rect x="500" y="280" width="24" height="28" rx="2" fill="#D97706" />
          {/* Headlights */}
          <circle cx="522" cy="298" r="2.5" fill="#FEF08A" stroke="none" />
          {/* Wheels */}
          <circle cx="460" cy="312" r="5" fill="#020617" />
          <circle cx="490" cy="312" r="5" fill="#020617" />
          <circle cx="515" cy="312" r="5" fill="#020617" />
        </g>

        {/* Checkpoint Station Control Booth */}
        <rect x="575" y="280" width="45" height="42" rx="4" fill="#1E293B" stroke="#475569" strokeWidth="2" />
        <rect x="585" y="288" width="25" height="18" rx="2" fill="#38BDF8" opacity="0.6" />
      </svg>
    </div>
  );
};
