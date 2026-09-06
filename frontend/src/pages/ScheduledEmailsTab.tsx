import React from 'react';
import { Clock, Calendar, Plus, RefreshCw, Layers } from 'lucide-react';
import { useEmail } from '../context/EmailContext';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '../components/ui/Table';
import { Badge } from '../components/ui/Badge';
import { TableSkeleton } from '../components/ui/Loading';
import { EmptyState } from '../components/ui/EmptyState';
import { Button } from '../components/ui/Button';

interface ScheduledEmailsTabProps {
  onOpenCompose: () => void;
}

export const ScheduledEmailsTab: React.FC<ScheduledEmailsTabProps> = ({ onOpenCompose }) => {
  const { scheduledEmails, isLoadingScheduled, refreshScheduled, searchQuery } = useEmail();

  const formatDateTime = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return {
        date: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }),
        time: d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }),
      };
    } catch {
      return { date: isoString, time: '' };
    }
  };

  const getRelativeTime = (isoString: string) => {
    try {
      const diffMs = new Date(isoString).getTime() - Date.now();
      if (diffMs <= 0) return 'Ready to dispatch';
      const diffMins = Math.round(diffMs / (1000 * 60));
      if (diffMins < 60) return `in ${diffMins}m`;
      const diffHours = Math.round(diffMins / 60);
      if (diffHours < 24) return `in ${diffHours}h`;
      const diffDays = Math.round(diffHours / 24);
      return `in ${diffDays}d`;
    } catch {
      return '';
    }
  };

  return (
    <div className="space-y-4">
      {/* Subheader with Metrics and Refresh */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#121520] p-4 rounded-xl border border-[#212738]">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-white">Scheduled Emails Queue</h2>
            <p className="text-xs text-[#71788e]">
              {scheduledEmails.length}{' '}
              {scheduledEmails.length === 1 ? 'email queued' : 'emails queued'} for automated dispatch
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={refreshScheduled}
            leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
          >
            Refresh
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={onOpenCompose}
            leftIcon={<Plus className="w-3.5 h-3.5" />}
          >
            New Schedule
          </Button>
        </div>
      </div>

      {/* Table / Loading / Empty States */}
      {isLoadingScheduled ? (
        <div className="rounded-xl border border-[#212738] bg-[#12151f] p-4">
          <TableSkeleton rows={5} columns={4} />
        </div>
      ) : scheduledEmails.length === 0 ? (
        <EmptyState
          icon={<Clock className="w-8 h-8 text-indigo-400" />}
          title={searchQuery ? 'No matching scheduled emails' : 'No scheduled emails'}
          description={
            searchQuery
              ? `No queued emails matched "${searchQuery}". Try clearing your search query.`
              : 'You do not have any emails queued. Create your first campaign and schedule personalized emails in bulk.'
          }
          actionLabel={searchQuery ? undefined : 'Schedule Campaign'}
          onAction={onOpenCompose}
          actionIcon={<Plus className="w-4 h-4" />}
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Recipient</TableHead>
              <TableHead>Subject</TableHead>
              <TableHead>Scheduled Time</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {scheduledEmails.map((email) => {
              const { date, time } = formatDateTime(email.scheduledTime);
              const relative = getRelativeTime(email.scheduledTime);

              return (
                <TableRow key={email.id}>
                  <TableCell>
                    <div className="font-medium text-white truncate max-w-[220px]">
                      {email.recipient}
                    </div>
                    {email.delayBetweenSeconds && (
                      <div className="text-[11px] text-[#71788e] flex items-center gap-1 mt-0.5">
                        <Layers className="w-3 h-3 text-[#5a627a]" />
                        <span>{email.delayBetweenSeconds}s interval</span>
                      </div>
                    )}
                  </TableCell>

                  <TableCell>
                    <div className="text-xs text-[#c3c7db] font-medium truncate max-w-[300px]">
                      {email.subject}
                    </div>
                    <div className="text-[11px] text-[#71788e] truncate max-w-[300px] mt-0.5">
                      {email.body}
                    </div>
                  </TableCell>

                  <TableCell>
                    <div className="flex items-center gap-1.5 text-xs text-[#d4d8e5]">
                      <Calendar className="w-3.5 h-3.5 text-[#71788e]" />
                      <span>{date}</span>
                      <span className="text-[#71788e]">at</span>
                      <span>{time}</span>
                    </div>
                    {relative && (
                      <span className="inline-block mt-0.5 text-[11px] text-indigo-400 font-medium">
                        {relative}
                      </span>
                    )}
                  </TableCell>

                  <TableCell>
                    <Badge status={email.status} />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
};
