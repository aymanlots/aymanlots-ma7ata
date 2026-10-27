import React from 'react';

interface UnionStationLogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showTagline?: boolean;
  stacked?: boolean;
  title?: string;
}

export const UnionStationLogo: React.FC<UnionStationLogoProps> = ({
  className = '',
  size = 'md',
  showTagline = true,
  stacked = false,
  title,
}) => {
  const dimensions = {
    sm: { w: 38, h: 38, titleSize: 'text-sm', tagSize: 'text-[9px]' },
    md: { w: 50, h: 50, titleSize: 'text-base', tagSize: 'text-[11px]' },
    lg: { w: 64, h: 64, titleSize: 'text-xl', tagSize: 'text-xs' },
    xl: { w: 84, h: 84, titleSize: 'text-2xl', tagSize: 'text-sm' },
  }[size];

  return (
    <div className={`flex ${stacked ? 'flex-col items-center text-center' : 'items-center gap-3 text-right'} ${className}`} dir="rtl">
      <div 
        className="shrink-0 overflow-hidden rounded-2xl p-1 flex items-center justify-center bg-[#0b1220] border border-amber-400/30 shadow-md"
      >
        <img
          src="/express-logo.svg"
          alt="شعار إكسبريس لوجستيك"
          width={dimensions.w}
          height={dimensions.h}
          style={{
            width: `${dimensions.w}px`,
            height: `${dimensions.h}px`,
            objectFit: 'contain',
            display: 'block'
          }}
          className="shrink-0"
        />
      </div>

      {/* Typography */}
      <div className={stacked ? 'mt-2' : ''}>
        <div className={`font-black text-white leading-tight flex items-center ${stacked ? 'justify-center' : ''} gap-1.5 ${dimensions.titleSize}`}>
          <span>{title || 'إكسبريس لوجستيك'}</span>
        </div>
        {showTagline && (
          <p className={`font-bold text-amber-400 tracking-wide mt-0.5 leading-snug ${dimensions.tagSize}`}>
            نظام إدارة الإرساليات والكوليات والشحنات
          </p>
        )}
      </div>
    </div>
  );
};
