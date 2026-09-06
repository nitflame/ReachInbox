import React from 'react';

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ReactNode;
  badge?: {
    text: string;
    variant?: 'success' | 'danger' | 'warning' | 'neutral';
  };
  variant?: 'default' | 'indigo' | 'emerald' | 'rose' | 'amber';
  isLoading?: boolean;
  onClick?: () => void;
}

export const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  subtitle,
  icon,
  badge,
  variant = 'default',
  isLoading = false,
  onClick,
}) => {
  const variantStyles = {
    default: 'border-[#212738] hover:border-[#2f374e]',
    indigo: 'border-indigo-500/30 hover:border-indigo-500/60 bg-[#121624]',
    emerald: 'border-emerald-500/30 hover:border-emerald-500/60 bg-[#10191c]',
    rose: 'border-rose-500/30 hover:border-rose-500/60 bg-[#1c1319]',
    amber: 'border-amber-500/30 hover:border-amber-500/60 bg-[#1c1813]',
  }[variant];

  const iconBgStyles = {
    default: 'bg-[#181d2c] text-[#8c93a8]',
    indigo: 'bg-indigo-500/10 text-indigo-400',
    emerald: 'bg-emerald-500/10 text-emerald-400',
    rose: 'bg-rose-500/10 text-rose-400',
    amber: 'bg-amber-500/10 text-amber-400',
  }[variant];

  const badgeStyles = {
    success: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    danger: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
    warning: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    neutral: 'bg-[#1a2030] text-[#9ca3af] border-[#2d374d]',
  }[badge?.variant || 'neutral'];

  if (isLoading) {
    return (
      <div className="p-5 rounded-2xl bg-[#11141e] border border-[#212738] animate-pulse">
        <div className="flex items-center justify-between">
          <div className="h-3 w-24 bg-[#1f2638] rounded" />
          <div className="w-9 h-9 rounded-xl bg-[#1f2638]" />
        </div>
        <div className="mt-4 space-y-2">
          <div className="h-7 w-20 bg-[#1f2638] rounded-md" />
          <div className="h-3 w-32 bg-[#1a2030] rounded" />
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={onClick}
      className={`p-5 rounded-2xl bg-[#11141e] border transition-all duration-200 ${variantStyles} ${
        onClick ? 'cursor-pointer transform hover:-translate-y-0.5' : ''
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-[#8c93a8] tracking-wide uppercase">{title}</span>
        <div className={`p-2.5 rounded-xl ${iconBgStyles} flex items-center justify-center transition-transform`}>
          {icon}
        </div>
      </div>

      <div className="mt-3 flex items-baseline justify-between gap-2">
        <div className="text-2xl sm:text-3xl font-bold tracking-tight text-white font-sans">
          {value}
        </div>
        {badge && (
          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${badgeStyles}`}>
            {badge.text}
          </span>
        )}
      </div>

      {subtitle && (
        <p className="mt-1.5 text-xs text-[#71788e] leading-relaxed truncate">{subtitle}</p>
      )}
    </div>
  );
};
