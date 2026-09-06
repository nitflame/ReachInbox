import React from 'react';
import { Gauge, Clock, ShieldCheck, AlertCircle } from 'lucide-react';

interface HourlyLimitCardProps {
  hourlySent: number;
  hourlyLimit: number;
  resetsInMinutes?: number;
  isLoading?: boolean;
}

export const HourlyLimitCard: React.FC<HourlyLimitCardProps> = ({
  hourlySent,
  hourlyLimit,
  resetsInMinutes = 60 - new Date().getUTCMinutes(),
  isLoading = false,
}) => {
  if (isLoading) {
    return (
      <div className="p-5 rounded-2xl bg-[#11141e] border border-[#212738] animate-pulse">
        <div className="h-4 w-32 bg-[#1f2638] rounded mb-4" />
        <div className="h-8 w-40 bg-[#1f2638] rounded mb-3" />
        <div className="h-3 w-full bg-[#1f2638] rounded-full mb-3" />
        <div className="h-4 w-28 bg-[#1f2638] rounded" />
      </div>
    );
  }

  const effectiveLimit = hourlyLimit > 0 ? hourlyLimit : 100;
  const percentage = Math.min(100, Math.round((hourlySent / effectiveLimit) * 100));
  const remaining = Math.max(0, effectiveLimit - hourlySent);
  const isNearLimit = percentage >= 85;
  const isMaxedOut = percentage >= 100;

  return (
    <div className="p-5 rounded-2xl bg-[#11141e] border border-[#212738] hover:border-[#2b334a] transition-all flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-400">
              <Gauge className="w-4 h-4" />
            </div>
            <span className="text-xs font-semibold text-[#8c93a8] uppercase tracking-wider">
              Hourly Sending Quota
            </span>
          </div>

          <span
            className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border flex items-center gap-1 ${
              isMaxedOut
                ? 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                : isNearLimit
                ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
            }`}
          >
            {isMaxedOut ? (
              <>
                <AlertCircle className="w-3 h-3" />
                <span>Limit Reached</span>
              </>
            ) : (
              <>
                <ShieldCheck className="w-3 h-3" />
                <span>Rate Normal</span>
              </>
            )}
          </span>
        </div>

        {/* Big Usage Text */}
        <div className="mt-3 flex items-baseline gap-2">
          <span className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
            {hourlySent}
          </span>
          <span className="text-sm font-medium text-[#71788e]">
            / {effectiveLimit} emails
          </span>
          <span className="ml-auto text-xs font-semibold text-indigo-400">
            {percentage}%
          </span>
        </div>

        {/* Progress Bar */}
        <div className="mt-3.5 w-full bg-[#181d2c] h-2.5 rounded-full overflow-hidden border border-[#252c40]">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              isMaxedOut
                ? 'bg-gradient-to-r from-rose-500 to-rose-600'
                : isNearLimit
                ? 'bg-gradient-to-r from-amber-500 to-rose-500'
                : 'bg-gradient-to-r from-indigo-500 to-emerald-500'
            }`}
            style={{ width: `${percentage}%` }}
          />
        </div>
      </div>

      {/* Footer Info: Remaining & Reset Time */}
      <div className="mt-4 pt-3 border-t border-[#1a1f2e] flex items-center justify-between text-xs text-[#8c93a8]">
        <div className="flex items-center gap-1.5">
          <span className="font-semibold text-[#c5c9d6]">{remaining}</span>
          <span>remaining</span>
        </div>

        <div className="flex items-center gap-1 text-[#71788e]">
          <Clock className="w-3.5 h-3.5 text-indigo-400" />
          <span>Resets in {resetsInMinutes} min</span>
        </div>
      </div>
    </div>
  );
};
