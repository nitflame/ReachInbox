import React, { useEffect, useState, useCallback } from 'react';
import {
  Calendar,
  Send,
  AlertTriangle,
  Clock,
  TrendingUp,
  BarChart3,
  RefreshCw,
  AlertCircle,
  Search,
  Filter,
  CheckCircle2,
  Users,
  Gauge,
} from 'lucide-react';
import { emailService } from '../api/emailService';
import type { AnalyticsData, DateRangeOption, ScheduledEmail, SentEmail } from '../types';
import { StatCard } from '../components/dashboard/StatCard';
import { ActivityChart } from '../components/dashboard/ActivityChart';

export const AnalyticsTab: React.FC = () => {
  const [dateRange, setDateRange] = useState<DateRangeOption>('7d');
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Recent Performance search & filtering
  const [searchFilter, setSearchFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [recentScheduled, setRecentScheduled] = useState<ScheduledEmail[]>([]);
  const [recentSent, setRecentSent] = useState<SentEmail[]>([]);
  const [isSearching, setIsSearching] = useState<boolean>(false);

  // Fetch Analytics from PostgreSQL
  const loadAnalytics = useCallback(async (range: DateRangeOption) => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await emailService.fetchAnalytics(range);
      setAnalytics(data);
    } catch (err) {
      console.warn('Analytics fetch error:', err);
      setError('Unable to load analytics');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fetch filtered recent emails from Elasticsearch
  const loadRecentEmails = useCallback(async (query: string, status: string) => {
    setIsSearching(true);
    try {
      const res = await emailService.searchEmails(query, status);
      setRecentScheduled(res.scheduled);
      setRecentSent(res.sent);
    } catch (err) {
      console.warn('Recent emails search error:', err);
    } finally {
      setIsSearching(false);
    }
  }, []);

  useEffect(() => {
    loadAnalytics(dateRange);
  }, [loadAnalytics, dateRange]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadRecentEmails(searchFilter, statusFilter);
    }, 250);
    return () => clearTimeout(timer);
  }, [loadRecentEmails, searchFilter, statusFilter]);

  const handleRefresh = () => {
    loadAnalytics(dateRange);
    loadRecentEmails(searchFilter, statusFilter);
  };

  // Derived Performance Metrics
  const total = analytics?.total ?? 0;
  const sent = analytics?.sent ?? 0;
  const failed = analytics?.failed ?? 0;
  const successRate = analytics?.successRate ?? 0;

  // Average Sending Rate calculations
  const daysInPeriod = {
    today: 1,
    '7d': 7,
    '30d': 30,
    all: Math.max(1, analytics?.daily?.length || 1),
  }[dateRange];

  const avgPerDay = Number((sent / daysInPeriod).toFixed(1));
  const avgPerHour = Number((sent / (daysInPeriod * 24)).toFixed(2));

  // Combine recent table rows
  const combinedRecent = [
    ...recentScheduled.map((s) => ({
      id: s.id,
      recipient: s.recipient,
      subject: s.subject,
      status: s.status,
      time: s.scheduledTime || s.createdAt,
    })),
    ...recentSent.map((s) => ({
      id: s.id,
      recipient: s.recipient,
      subject: s.subject,
      status: s.status,
      time: s.sentTime,
    })),
  ].sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());

  return (
    <div className="space-y-6">
      {/* 1. Header with Title and Date Range Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-[#1f2537]">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-white tracking-tight font-sans">
              Analytics
            </h1>
            <span className="p-1 rounded-lg bg-indigo-500/10 text-indigo-400">
              <BarChart3 className="w-4 h-4" />
            </span>
          </div>
          <p className="text-xs sm:text-sm text-[#71788e] mt-0.5">
            Track your email sending performance and campaign activity.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Date Range Selector */}
          <div className="relative inline-flex items-center">
            <Calendar className="w-3.5 h-3.5 text-[#8c93a8] absolute left-3 pointer-events-none" />
            <select
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value as DateRangeOption)}
              className="bg-[#141824] border border-[#262c3e] text-white text-xs font-medium rounded-xl pl-9 pr-8 py-2 appearance-none hover:border-indigo-500 focus:outline-none focus:border-indigo-500 transition-colors cursor-pointer shadow-sm"
            >
              <option value="today">Today</option>
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
              <option value="all">All time</option>
            </select>
            <span className="text-[#8c93a8] pointer-events-none absolute right-3 text-[10px]">▼</span>
          </div>

          <button
            onClick={handleRefresh}
            className="p-2 rounded-xl bg-[#141824] border border-[#262c3e] text-[#8c93a8] hover:text-white hover:border-[#38425d] transition-colors cursor-pointer"
            title="Refresh analytics data"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-between gap-3 text-xs text-rose-300">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            onClick={handleRefresh}
            className="flex items-center gap-1 font-semibold px-2.5 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 transition-colors cursor-pointer"
          >
            <RefreshCw className="w-3 h-3" />
            <span>Try again</span>
          </button>
        </div>
      )}

      {/* 2. KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Emails"
          value={total.toLocaleString()}
          subtitle="Processed in selected period"
          icon={<Calendar className="w-4 h-4" />}
          variant="default"
          isLoading={isLoading}
        />

        <StatCard
          title="Sent"
          value={sent.toLocaleString()}
          subtitle="Successfully delivered"
          icon={<Send className="w-4 h-4" />}
          variant="emerald"
          isLoading={isLoading}
          badge={{ text: 'Delivered', variant: 'success' }}
        />

        <StatCard
          title="Failed"
          value={failed.toLocaleString()}
          subtitle="Undeliverable or bounced"
          icon={<AlertTriangle className="w-4 h-4" />}
          variant="rose"
          isLoading={isLoading}
          badge={{ text: failed > 0 ? 'Failed' : '0 Errors', variant: failed > 0 ? 'danger' : 'neutral' }}
        />

        <StatCard
          title="Success Rate"
          value={`${successRate}%`}
          subtitle="sent / (sent + failed) * 100"
          icon={<TrendingUp className="w-4 h-4" />}
          variant={successRate >= 95 ? 'emerald' : successRate >= 80 ? 'amber' : 'default'}
          isLoading={isLoading}
          badge={{
            text: successRate >= 95 ? 'High' : 'Normal',
            variant: successRate >= 95 ? 'success' : 'neutral',
          }}
        />
      </div>

      {/* 3. Main Chart: Sending Activity */}
      <div className="w-full">
        <ActivityChart data={analytics?.daily || []} isLoading={isLoading} />
      </div>

      {/* 4. Status Breakdown & Sending Performance Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Status Breakdown Card */}
        <div className="p-6 rounded-2xl bg-[#11141e] border border-[#212738] flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-white tracking-tight">Email Status</h3>
              <span className="text-[11px] text-[#71788e]">Breakdown</span>
            </div>

            {/* Distribution Bar */}
            <div className="w-full bg-[#181d2c] h-3 rounded-full overflow-hidden flex mb-5 border border-[#232b3d]">
              {analytics?.statusBreakdown?.map((item) => {
                const bg = {
                  sent: 'bg-emerald-500',
                  scheduled: 'bg-indigo-500',
                  failed: 'bg-rose-500',
                }[item.status] || 'bg-gray-500';

                return (
                  <div
                    key={item.status}
                    className={`${bg} h-full transition-all duration-300`}
                    style={{ width: `${item.percentage}%` }}
                    title={`${item.status}: ${item.count} (${item.percentage}%)`}
                  />
                );
              })}
            </div>

            {/* Status Percentage Rows */}
            <div className="space-y-3">
              {analytics?.statusBreakdown?.map((item) => {
                const dotColor = {
                  sent: 'bg-emerald-400',
                  scheduled: 'bg-indigo-400',
                  failed: 'bg-rose-400',
                }[item.status] || 'bg-gray-400';

                return (
                  <div
                    key={item.status}
                    className="flex items-center justify-between p-2 rounded-xl bg-[#141824] border border-[#1f2537] text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${dotColor}`} />
                      <span className="capitalize font-medium text-[#c5c9d6]">{item.status}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-[#71788e] text-[11px]">({item.count})</span>
                      <span className="font-bold text-white font-mono">{item.percentage}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Sending Performance Card: Average Rate */}
        <div className="p-6 rounded-2xl bg-[#11141e] border border-[#212738] flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-white tracking-tight">Average Sending Rate</h3>
              <span className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-400">
                <Gauge className="w-4 h-4" />
              </span>
            </div>

            <p className="text-xs text-[#71788e] mb-4">
              Calculated delivery cadence across the current {daysInPeriod}-day evaluation window.
            </p>

            <div className="space-y-3">
              <div className="p-3.5 rounded-xl bg-[#141824] border border-[#1f2537] flex items-center justify-between">
                <span className="text-xs text-[#8c93a8]">Emails per Day</span>
                <span className="text-lg font-bold text-white font-mono">{avgPerDay}</span>
              </div>

              <div className="p-3.5 rounded-xl bg-[#141824] border border-[#1f2537] flex items-center justify-between">
                <span className="text-xs text-[#8c93a8]">Emails per Hour</span>
                <span className="text-lg font-bold text-indigo-300 font-mono">{avgPerHour}</span>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-[#1a1f2e] text-[11px] text-[#71788e]">
            Throughput dynamically regulated by sender delay pacing
          </div>
        </div>

        {/* Sending Performance Card: Hourly Limit Usage */}
        <div className="p-6 rounded-2xl bg-[#11141e] border border-[#212738] flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-white tracking-tight">Hourly Limit Usage</h3>
              <span className="text-[11px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                Protected
              </span>
            </div>

            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-bold text-white font-mono">
                {analytics?.hourlySent ?? 0}
              </span>
              <span className="text-xs text-[#71788e]">
                / {analytics?.hourlyLimit ?? 100} limit
              </span>
            </div>

            <div className="mt-3 w-full bg-[#181d2c] h-2.5 rounded-full overflow-hidden border border-[#232b3d]">
              <div
                className="h-full bg-gradient-to-r from-indigo-500 to-emerald-500 transition-all duration-500"
                style={{
                  width: `${Math.min(
                    100,
                    Math.round(((analytics?.hourlySent ?? 0) / (analytics?.hourlyLimit || 100)) * 100)
                  )}%`,
                }}
              />
            </div>

            <p className="text-xs text-[#8c93a8] mt-3">
              <span className="font-semibold text-white">
                {Math.max(0, (analytics?.hourlyLimit ?? 100) - (analytics?.hourlySent ?? 0))}
              </span>{' '}
              emails remaining before throttling.
            </p>
          </div>

          <div className="mt-4 pt-3 border-t border-[#1a1f2e] flex items-center justify-between text-xs text-[#71788e]">
            <span className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-indigo-400" />
              <span>Resets in {analytics?.resetsInMinutes ?? 60}m</span>
            </span>
            <span>Atomic Redis Lua Gate</span>
          </div>
        </div>
      </div>

      {/* 5. Top Recipient Activity (Only displayed if meaningful recipient statistics exist) */}
      {analytics?.topRecipients && analytics.topRecipients.length > 0 && (
        <div className="p-6 rounded-2xl bg-[#11141e] border border-[#212738]">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-400">
                <Users className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-semibold text-white tracking-tight">
                Most Active Recipients
              </h3>
            </div>
            <span className="text-[11px] text-[#71788e]">Top 5 Target Accounts</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-[#c5c9d6]">
              <thead>
                <tr className="border-b border-[#212738] text-[11px] font-semibold text-[#71788e] uppercase tracking-wider">
                  <th className="py-2.5 px-3">Recipient</th>
                  <th className="py-2.5 px-3">Sent</th>
                  <th className="py-2.5 px-3">Failed</th>
                  <th className="py-2.5 px-3 text-right">Total Emails</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1a2030]">
                {analytics.topRecipients.map((rec) => (
                  <tr key={rec.recipient} className="hover:bg-[#141824] transition-colors">
                    <td className="py-3 px-3 font-medium text-white">{rec.recipient}</td>
                    <td className="py-3 px-3 text-emerald-400 font-mono">{rec.sent}</td>
                    <td className="py-3 px-3 text-rose-400 font-mono">{rec.failed}</td>
                    <td className="py-3 px-3 text-right font-bold text-white font-mono">
                      {rec.emails}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 6. Recent Performance Table with Elasticsearch Search & Filter */}
      <div className="p-6 rounded-2xl bg-[#11141e] border border-[#212738]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
          <div>
            <h3 className="text-sm font-semibold text-white tracking-tight">
              Recent Performance
            </h3>
            <p className="text-xs text-[#71788e] mt-0.5">
              Live audit table backed by Elasticsearch full-text search
            </p>
          </div>

          {/* Search & Status Filters */}
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-[#5a627a] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                placeholder="Filter recipient/subject..."
                className="bg-[#141824] border border-[#262c3e] rounded-xl pl-8 pr-3 py-1.5 text-xs text-white placeholder-[#5a627a] focus:outline-none focus:border-indigo-500 w-48 sm:w-56"
              />
            </div>

            <div className="relative">
              <Filter className="w-3.5 h-3.5 text-[#5a627a] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-[#141824] border border-[#262c3e] text-white text-xs rounded-xl pl-8 pr-7 py-1.5 appearance-none focus:outline-none focus:border-indigo-500 cursor-pointer"
              >
                <option value="all">All Statuses</option>
                <option value="sent">Sent</option>
                <option value="failed">Failed</option>
                <option value="scheduled">Scheduled</option>
              </select>
              <span className="text-[#8c93a8] pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[9px]">
                ▼
              </span>
            </div>
          </div>
        </div>

        {isSearching ? (
          <div className="py-12 text-center text-xs text-[#71788e] flex items-center justify-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin text-indigo-400" />
            <span>Searching indexed records...</span>
          </div>
        ) : combinedRecent.length === 0 ? (
          <div className="py-10 text-center text-xs text-[#71788e]">
            No emails found matching the selected filters.
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
                {combinedRecent.slice(0, 15).map((row) => {
                  const badgeStyle = {
                    sent: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
                    failed: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
                    scheduled: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
                    queued: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
                    processing: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
                  }[row.status] || 'bg-[#1a2030] text-[#9ca3af] border-[#2b354d]';

                  return (
                    <tr key={row.id} className="hover:bg-[#141824] transition-colors">
                      <td className="py-3 px-3 font-medium text-white max-w-[200px] truncate">
                        {row.recipient}
                      </td>
                      <td className="py-3 px-3 text-[#9ca3af] max-w-[220px] truncate">
                        {row.subject}
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full border ${badgeStyle}`}>
                          {row.status === 'sent' && <CheckCircle2 className="w-3 h-3" />}
                          {row.status === 'failed' && <AlertTriangle className="w-3 h-3" />}
                          {row.status === 'scheduled' && <Clock className="w-3 h-3" />}
                          <span className="capitalize">{row.status}</span>
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-[11px] text-[#71788e] whitespace-nowrap">
                        {new Date(row.time).toLocaleString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
