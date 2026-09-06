import React from 'react';
import type { ScheduledEmail, SentEmail } from '../../types';
import { Mail, CheckCircle2, Clock, AlertCircle, RefreshCw } from 'lucide-react';

interface RecentEmailsProps {
  scheduledEmails: ScheduledEmail[];
  sentEmails: SentEmail[];
  isLoading?: boolean;
  onRefresh?: () => void;
  onComposeClick?: () => void;
}

interface TableEmailRow {
  id: string;
  recipient: string;
  subject: string;
  status: string;
  time: string;
}

export const RecentEmails: React.FC<RecentEmailsProps> = ({
  scheduledEmails = [],
  sentEmails = [],
  isLoading = false,
  onRefresh,
  onComposeClick,
}) => {
  if (isLoading) {
    return (
      <div className="p-6 rounded-2xl bg-[#11141e] border border-[#212738] animate-pulse">
        <div className="h-4 w-40 bg-[#1f2638] rounded mb-5" />
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-10 w-full bg-[#181d2c] rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  // Combine rows: prioritize scheduled then recent sent
  const rows: TableEmailRow[] = [];

  for (const s of scheduledEmails) {
    rows.push({
      id: s.id,
      recipient: s.recipient,
      subject: s.subject,
      status: s.status,
      time: s.scheduledTime || s.createdAt,
    });
  }

  for (const s of sentEmails) {
    rows.push({
      id: s.id,
      recipient: s.recipient,
      subject: s.subject,
      status: s.status,
      time: s.sentTime,
    });
  }

  // Sort descending by time
  rows.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
  const displayRows = rows.slice(0, 10);

  return (
    <div className="p-6 rounded-2xl bg-[#11141e] border border-[#212738]">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-white tracking-tight">Recent Emails</h3>
          <p className="text-xs text-[#71788e] mt-0.5">
            Latest queued and dispatched messages across your campaigns
          </p>
        </div>

        {onRefresh && (
          <button
            onClick={onRefresh}
            className="flex items-center gap-1.5 text-xs text-[#8c93a8] hover:text-white transition-colors cursor-pointer p-1.5 rounded-lg hover:bg-[#1c2234]"
            title="Refresh list"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        )}
      </div>

      {displayRows.length === 0 ? (
        <div className="py-10 text-center flex flex-col items-center justify-center">
          <div className="w-12 h-12 rounded-xl bg-[#161a27] border border-[#262c3e] flex items-center justify-center text-[#71788e] mb-3">
            <Mail className="w-6 h-6" />
          </div>
          <p className="text-xs text-[#8c93a8] font-medium">No emails sent or scheduled yet</p>
          {onComposeClick && (
            <button
              onClick={onComposeClick}
              className="mt-3 text-xs text-indigo-400 hover:text-indigo-300 font-semibold cursor-pointer"
            >
              + Compose your first campaign
            </button>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-[#c5c9d6]">
            <thead>
              <tr className="border-b border-[#212738] text-[11px] font-semibold text-[#71788e] uppercase tracking-wider">
                <th className="py-2.5 px-3">Recipient</th>
                <th className="py-2.5 px-3">Subject</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3 text-right">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1a2030]">
              {displayRows.map((row) => {
                const badge = {
                  sent: {
                    style: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
                    icon: <CheckCircle2 className="w-3 h-3" />,
                  },
                  failed: {
                    style: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
                    icon: <AlertCircle className="w-3 h-3" />,
                  },
                  scheduled: {
                    style: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
                    icon: <Clock className="w-3 h-3" />,
                  },
                  queued: {
                    style: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
                    icon: <Clock className="w-3 h-3" />,
                  },
                  processing: {
                    style: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
                    icon: <RefreshCw className="w-3 h-3 animate-spin" />,
                  },
                }[row.status] || {
                  style: 'bg-[#1e2436] text-[#9ca3af] border-[#2f3952]',
                  icon: <Clock className="w-3 h-3" />,
                };

                const formattedTime = new Date(row.time).toLocaleString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                });

                return (
                  <tr key={row.id} className="hover:bg-[#141824] transition-colors">
                    <td className="py-3 px-3 font-medium text-white max-w-[180px] sm:max-w-xs truncate">
                      {row.recipient}
                    </td>
                    <td className="py-3 px-3 text-[#9ca3af] max-w-[200px] sm:max-w-sm truncate">
                      {row.subject}
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full border ${badge.style}`}
                      >
                        {badge.icon}
                        <span className="capitalize">{row.status}</span>
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-[11px] text-[#71788e] whitespace-nowrap">
                      {formattedTime}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
