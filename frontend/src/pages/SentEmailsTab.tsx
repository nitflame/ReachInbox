import React from 'react';
import { Send, Calendar, RefreshCw, AlertCircle } from 'lucide-react';
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

interface SentEmailsTabProps {
  onOpenCompose: () => void;
}

export const SentEmailsTab: React.FC<SentEmailsTabProps> = ({ onOpenCompose }) => {
  const { sentEmails, isLoadingSent, refreshSent, searchQuery } = useEmail();

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

  const sentCount = sentEmails.filter((e) => e.status === 'sent').length;
  const failedCount = sentEmails.filter((e) => e.status === 'failed').length;

  return (
    <div className="space-y-4">
      {/* Subheader with Metrics and Refresh */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#121520] p-4 rounded-xl border border-[#212738]">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
            <Send className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-white">Dispatched Emails History</h2>
            <div className="flex items-center gap-2 mt-0.5 text-xs text-[#71788e]">
              <span>{sentCount} successfully delivered</span>
              {failedCount > 0 && (
                <>
                  <span>•</span>
                  <span className="text-rose-400 font-medium">{failedCount} bounced/failed</span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={refreshSent}
            leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
          >
            Refresh
          </Button>
        </div>
      </div>

      {/* Table / Loading / Empty States */}
      {isLoadingSent ? (
        <div className="rounded-xl border border-[#212738] bg-[#12151f] p-4">
          <TableSkeleton rows={5} columns={4} />
        </div>
      ) : sentEmails.length === 0 ? (
        <EmptyState
          icon={<Send className="w-8 h-8 text-emerald-400" />}
          title={searchQuery ? 'No matching sent emails' : 'No sent emails yet'}
          description={
            searchQuery
              ? `No sent emails matched "${searchQuery}". Try a different search term.`
              : 'Emails will appear here once the scheduler dispatches them to recipients.'
          }
          actionLabel={searchQuery ? undefined : 'Compose & Schedule'}
          onAction={onOpenCompose}
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Recipient</TableHead>
              <TableHead>Subject</TableHead>
              <TableHead>Sent Time</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sentEmails.map((email) => {
              const { date, time } = formatDateTime(email.sentTime);

              return (
                <TableRow key={email.id}>
                  <TableCell>
                    <div className="font-medium text-white truncate max-w-[220px]">
                      {email.recipient}
                    </div>
                  </TableCell>

                  <TableCell>
                    <div className="text-xs text-[#c3c7db] font-medium truncate max-w-[300px]">
                      {email.subject}
                    </div>
                    {email.body && (
                      <div className="text-[11px] text-[#71788e] truncate max-w-[300px] mt-0.5">
                        {email.body}
                      </div>
                    )}
                    {email.errorMessage && (
                      <div className="flex items-center gap-1 text-[11px] text-rose-400 mt-1">
                        <AlertCircle className="w-3 h-3 shrink-0" />
                        <span className="truncate max-w-[280px]">{email.errorMessage}</span>
                      </div>
                    )}
                  </TableCell>

                  <TableCell>
                    <div className="flex items-center gap-1.5 text-xs text-[#d4d8e5]">
                      <Calendar className="w-3.5 h-3.5 text-[#71788e]" />
                      <span>{date}</span>
                      <span className="text-[#71788e]">at</span>
                      <span>{time}</span>
                    </div>
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
