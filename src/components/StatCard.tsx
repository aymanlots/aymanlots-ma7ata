import React from 'react';
import { LucideIcon } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  badge?: string;
  alert?: boolean;
  onClick?: () => void;
}

export const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  subtitle,
  icon: Icon,
  badge,
  alert = false,
  onClick,
}) => {
  return (
    <div
      onClick={onClick}
      className={`p-5 rounded-xl border transition-all ${
        onClick ? 'cursor-pointer hover:border-amber-500/50' : ''
      } ${
        alert
          ? 'bg-rose-950/20 border-rose-500/30'
          : 'bg-neutral-900/70 border-neutral-800'
      }`}
    >
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-xs font-medium text-neutral-400">{title}</p>
          <div className="text-2xl font-bold font-mono tracking-tight text-neutral-100 tabular-nums">
            {value}
          </div>
        </div>
        <div
          className={`p-2.5 rounded-lg shrink-0 ${
            alert ? 'bg-rose-500/10 text-rose-400' : 'bg-amber-500/10 text-amber-400'
          }`}
        >
          <Icon className="w-5 h-5" />
        </div>
      </div>

      {(subtitle || badge) && (
        <div className="mt-3 pt-3 border-t border-neutral-800/80 flex items-center justify-between text-xs text-neutral-400">
          {subtitle && <span>{subtitle}</span>}
          {badge && (
            <span
              className={`font-semibold ${
                alert ? 'text-rose-400' : 'text-amber-400'
              }`}
            >
              {badge}
            </span>
          )}
        </div>
      )}
    </div>
  );
};
