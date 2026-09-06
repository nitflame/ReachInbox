import React, { useEffect, useState, useCallback } from 'react';
import { Clock, Send, AlertTriangle, TrendingUp, AlertCircle, RefreshCw } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useEmail } from '../context/EmailContext';
import { emailService } from '../api/emailService';
import type { AnalyticsData } from '../types';
import { DashboardHeader } from '../components/dashboard/DashboardHeader';
import { StatCard } from '../components/dashboard/StatCard';
import { HourlyLimitCard } from '../components/dashboard/HourlyLimitCard';
import { ActivityChart } from '../components/dashboard/ActivityChart';
import { RecentActivity } from '../components/dashboard/RecentActivity';
import { RecentEmails } from '../components/dashboard/RecentEmails';

interface DashboardOverviewTabProps {
  onOpenCompose: () => void;
  onNavigateToTab: (tab: 'scheduled' | 'sent' | 'analytics') => void;
}

export const DashboardOverviewTab: React.FC<DashboardOverviewTabProps> = ({
  onOpenCompose,
  onNavigateToTab,
}) => {
  const { user } = useAuth();
  const { scheduledEmails, sentEmails, refreshScheduled, refreshSent } = useEmail();

  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const loadAnalytics = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await emailService.fetchAnalytics('7d');
      setAnalytics(data);
    } catch (err) {
      console.warn('Failed to load dashboard analytics:', err);
      setError('Unable to load analytics');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics, scheduledEmails.length, sentEmails.length]);

  const handleManualRefresh = async () => {
    await Promise.all([loadAnalytics(), refreshScheduled(), refreshSent()]);
  };

  // Values from backend analytics or fallback to context emails
  const scheduledCount = analytics?.scheduled ?? scheduledEmails.length;
  const sentCount = analytics?.sent ?? sentEmails.length;
  const failedCount = analytics?.failed ?? 0;
  const successRate = analytics?.successRate ?? (sentCount + failedCount > 0 ? Number(((sentCount / (sentCount + failedCount)) * 100).toFixed(1)) : 0);

  return (
    <div className="space-y-6">
      {/* 1. Header */}
      <DashboardHeader
        userName={user?.name || user?.email?.split('@')[0] || 'User'}
        onOpenCompose={onOpenCompose}
      />

      {/* Error state if analytics endpoint failed */}
      {error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-between gap-3 text-xs text-rose-300">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            onClick={handleManualRefresh}
            className="flex items-center gap-1 font-semibold px-2.5 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 transition-colors cursor-pointer"
          >
            <RefreshCw className="w-3 h-3" />
            <span>Try again</span>
          </button>
        </div>
      )}

      {/* 2. KPI Cards Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Scheduled"
          value={scheduledCount.toLocaleString()}
          subtitle="Currently queued for dispatch"
          icon={<Clock className="w-4 h-4" />}
          variant="indigo"
          isLoading={isLoading}
          badge={{ text: 'Queued', variant: 'neutral' }}
          onClick={() => onNavigateToTab('scheduled')}
        />

        <StatCard
          title="Sent"
          value={sentCount.toLocaleString()}
          subtitle="Delivered via SMTP pipeline"
          icon={<Send className="w-4 h-4" />}
          variant="emerald"
          isLoading={isLoading}
          badge={{ text: 'Success', variant: 'success' }}
          onClick={() => onNavigateToTab('sent')}
        />

        <StatCard
          title="Failed"
          value={failedCount.toLocaleString()}
          subtitle="Undeliverable or rejected"
          icon={<AlertTriangle className="w-4 h-4" />}
          variant="rose"
          isLoading={isLoading}
          badge={{ text: 'Errors', variant: failedCount > 0 ? 'danger' : 'neutral' }}
        />

        <StatCard
          title="Success Rate"
          value={`${successRate}%`}
          subtitle="Delivery conversion ratio"
          icon={<TrendingUp className="w-4 h-4" />}
          variant={successRate >= 95 ? 'emerald' : successRate >= 80 ? 'amber' : 'default'}
          isLoading={isLoading}
          badge={{
            text: successRate >= 95 ? 'Optimal' : successRate >= 80 ? 'Average' : 'Review',
            variant: successRate >= 95 ? 'success' : 'warning',
          }}
          onClick={() => onNavigateToTab('analytics')}
        />
      </div>

      {/* 3. Middle Row: Sending Activity Chart & Hourly Limit Quota */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <ActivityChart
            data={analytics?.daily || []}
            isLoading={isLoading}
            onComposeClick={onOpenCompose}
          />
        </div>

        <div className="lg:col-span-1">
          <HourlyLimitCard
            hourlySent={analytics?.hourlySent ?? 0}
            hourlyLimit={analytics?.hourlyLimit ?? 100}
            resetsInMinutes={analytics?.resetsInMinutes}
            isLoading={isLoading}
          />
        </div>
      </div>

      {/* 4. Bottom Row: Recent Emails & Live Activity Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <RecentEmails
            scheduledEmails={scheduledEmails}
            sentEmails={sentEmails}
            isLoading={isLoading}
            onRefresh={handleManualRefresh}
            onComposeClick={onOpenCompose}
          />
        </div>

        <div className="lg:col-span-1">
          <RecentActivity
            scheduledEmails={scheduledEmails}
            sentEmails={sentEmails}
            isLoading={isLoading}
          />
        </div>
      </div>
    </div>
  );
};
