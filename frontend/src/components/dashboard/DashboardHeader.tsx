import React from 'react';
import { Plus, Sparkles } from 'lucide-react';
import { Button } from '../ui/Button';

interface DashboardHeaderProps {
  userName?: string;
  onOpenCompose: () => void;
}

export const DashboardHeader: React.FC<DashboardHeaderProps> = ({
  userName = 'User',
  onOpenCompose,
}) => {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold text-white tracking-tight font-sans">
            Dashboard
          </h1>
          <span className="flex items-center gap-1 text-[10px] uppercase font-semibold tracking-wider bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-500/20">
            <Sparkles className="w-2.5 h-2.5" />
            Live
          </span>
        </div>
        <p className="text-xs sm:text-sm text-[#71788e] mt-0.5">
          Welcome back, <span className="font-semibold text-[#c5c9d6]">{userName}</span>
        </p>
      </div>

      <Button
        onClick={onOpenCompose}
        leftIcon={<Plus className="w-4 h-4" />}
        className="shadow-md shadow-indigo-600/25 font-semibold text-xs py-2 px-4 shrink-0"
      >
        Compose New Email
      </Button>
    </div>
  );
};
