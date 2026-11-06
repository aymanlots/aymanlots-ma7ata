import React, { useState } from 'react';

interface HelpPopoverProps {
  text: string;
  title?: string;
  className?: string;
}

/**
 * زر علامة استفهام صغير (؟) يخفي الشرح الطويل ولا يظهره إلا عند الضغط عليه
 */
export const HelpPopover: React.FC<HelpPopoverProps> = ({ text, title, className = '' }) => {
  const [open, setOpen] = useState(false);

  return (
    <span className={`inline-flex flex-col ${className}`} onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((prev) => !prev);
        }}
        title={title || 'اضغط لعرض الشرح'}
        aria-label="شرح"
        className={`w-5 h-5 rounded-full font-mono font-black text-[11px] inline-flex items-center justify-center transition cursor-pointer shrink-0 select-none ${
          open
            ? 'bg-[#F5C84C] text-[#1a0f00] shadow-md scale-105'
            : 'bg-[#F5C84C]/20 text-[#F5C84C] border border-[#F5C84C]/50 hover:bg-[#F5C84C]/35'
        }`}
      >
        ؟
      </button>

      {open && (
        <div
          onClick={(e) => {
            e.stopPropagation();
            setOpen(false);
          }}
          className="mt-1.5 p-2.5 rounded-xl bg-[#120a00] border border-[#F5C84C]/60 text-[11px] text-[#F5D799] font-bold leading-relaxed shadow-xl animate-fadeIn max-w-xs sm:max-w-sm z-40 cursor-pointer"
        >
          {title && <div className="text-[#F5C84C] font-black mb-0.5">{title}</div>}
          <div className="text-white/90">{text}</div>
        </div>
      )}
    </span>
  );
};
