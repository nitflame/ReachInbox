import React from 'react';
import { Mail } from 'lucide-react';
import { Button } from './Button';

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  actionIcon?: React.ReactNode;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon = <Mail className="w-8 h-8 text-[#5a627a]" />,
  title,
  description,
  actionLabel,
  onAction,
  actionIcon,
}) => {
  return (
    <div className="flex flex-col items-center justify-center p-12 text-center border border-dashed border-[#262c3e] rounded-xl bg-[#12151f]/40">
      <div className="w-14 h-14 rounded-full bg-[#181d2a] border border-[#262c3e] flex items-center justify-center mb-4 text-indigo-400">
        {icon}
      </div>
      <h4 className="text-base font-medium text-[#f1f3f9] mb-1.5">{title}</h4>
      <p className="text-xs text-[#8c93a8] max-w-sm mb-6 leading-relaxed">
        {description}
      </p>
      {actionLabel && onAction && (
        <Button onClick={onAction} leftIcon={actionIcon} size="sm">
          {actionLabel}
        </Button>
      )}
    </div>
  );
};
