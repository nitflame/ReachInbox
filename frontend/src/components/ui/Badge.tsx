import React from 'react';
import { cn } from '../../utils/cn';
import type { EmailStatus } from '../../types';

export interface BadgeProps {
  status: EmailStatus | 'connected' | 'disconnected';
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({ status, className }) => {
  const styles: Record<string, { label: string; style: string; dot: string }> = {
    scheduled: {
      label: 'Scheduled',
      style: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
      dot: 'bg-indigo-400',
    },
    queued: {
      label: 'Queued',
      style: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
      dot: 'bg-amber-400 animate-pulse',
    },
    processing: {
      label: 'Processing',
      style: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
      dot: 'bg-cyan-400 animate-pulse',
    },
    sent: {
      label: 'Sent',
      style: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
      dot: 'bg-emerald-400',
    },
    failed: {
      label: 'Failed',
      style: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
      dot: 'bg-rose-400',
    },
    connected: {
      label: 'Connected',
      style: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
      dot: 'bg-emerald-400',
    },
    disconnected: {
      label: 'Not Connected',
      style: 'bg-[#262c3e]/40 text-[#8c93a8] border-[#2d344d]',
      dot: 'bg-[#5a627a]',
    },
  };

  const item = styles[status] || {
    label: status,
    style: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
    dot: 'bg-slate-400',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border',
        item.style,
        className
      )}
    >
      <span className={cn('w-1.5 h-1.5 rounded-full', item.dot)} />
      {item.label}
    </span>
  );
};
