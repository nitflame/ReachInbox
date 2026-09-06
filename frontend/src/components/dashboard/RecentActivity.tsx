import React from 'react';
import type { ScheduledEmail, SentEmail } from '../../types';
import { CheckCircle2, Clock, AlertCircle, Activity } from 'lucide-react';

interface RecentActivityProps {
  scheduledEmails: ScheduledEmail[];
  sentEmails: SentEmail[];
  isLoading?: boolean;
}

interface ActivityEvent {
  id: string;
  type: 'sent' | 'scheduled' | 'failed';
  recipient: string;
  subject: string;
  timestamp: string;
}

function formatRelativeTime(dateStr: string): string {
  try {
    const time = new Date(dateStr).getTime();
    if (isNaN(time)) return 'recently';
    const diffSeconds = Math.max(0, Math.floor((Date.now() - time) / 1000));

    if (diffSeconds < 60) return 'just now';
    const diffMinutes = Math.floor(diffSeconds / 60);
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  } catch {
    return 'recently';
  }
}

export const RecentActivity: React.FC<RecentActivityProps> = ({
  scheduledEmails = [],
  sentEmails = [],
  isLoading = false,
}) => {
  if (isLoading) {
    return (
      <div className="p-6 rounded-2xl bg-[#11141e] border border-[#212738] animate-pulse">
        <div className="h-4 w-32 bg-[#1f2638] rounded mb-5" />
        <div className="space-y-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-[#181d2c]" />
              <div className="space-y-1.5 flex-1">
                <div className="h-3 w-40 bg-[#1f2638] rounded" />
                <div className="h-2.5 w-24 bg-[#181d2c] rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Combine and sort events from real email collections
  const events: ActivityEvent[] = [];

  for (const email of sentEmails) {
    events.push({
      id: `sent-${email.id}`,
      type: email.status === 'failed' ? 'failed' : 'sent',
      recipient: email.recipient,
      subject: email.subject,
      timestamp: email.sentTime,
    });
  }

  for (const email of scheduledEmails) {
    events.push({
      id: `sched-${email.id}`,
      type: 'scheduled',
      recipient: email.recipient,
      subject: email.subject,
      timestamp: email.createdAt || email.scheduledTime,
    });
  }

  events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  const recentEvents = events.slice(0, 7);

  return (
    <div className="p-6 rounded-2xl bg-[#11141e] border border-[#212738] flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-400">
              <Activity className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-semibold text-white tracking-tight">Recent Activity</h3>
          </div>
          <span className="text-[11px] text-[#71788e]">Live Feed</span>
        </div>

        {recentEvents.length === 0 ? (
          <div className="py-8 text-center text-xs text-[#71788e]">
            No activity logged yet. Compose and schedule an email to see events.
          </div>
        ) : (
          <div className="space-y-3.5">
            {recentEvents.map((evt) => {
              const icon = {
                sent: <CheckCircle2 className="w-4 h-4 text-emerald-400" />,
                failed: <AlertCircle className="w-4 h-4 text-rose-400" />,
                scheduled: <Clock className="w-4 h-4 text-indigo-400" />,
              }[evt.type];

              const label = {
                sent: 'Email sent',
                failed: 'Email failed',
                scheduled: 'Email scheduled',
              }[evt.type];

              const badgeColor = {
                sent: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
                failed: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
                scheduled: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
              }[evt.type];

              return (
                <div
                  key={evt.id}
                  className="flex items-start justify-between gap-3 p-2.5 rounded-xl hover:bg-[#161a27] transition-colors border border-transparent hover:border-[#242c40]"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="p-1 rounded-lg bg-[#141824] border border-[#232a3d] shrink-0 mt-0.5">
                      {icon}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-semibold px-1.5 py-0.2 rounded border ${badgeColor}`}>
                          {label}
                        </span>
                      </div>
                      <p className="text-xs font-medium text-[#e1e4ee] truncate mt-0.5">
                        {evt.recipient}
                      </p>
                      <p className="text-[11px] text-[#6b7280] truncate max-w-[200px] sm:max-w-xs">
                        {evt.subject}
                      </p>
                    </div>
                  </div>

                  <span className="text-[10px] font-mono text-[#71788e] shrink-0 mt-1">
                    {formatRelativeTime(evt.timestamp)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
