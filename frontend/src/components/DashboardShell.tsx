import React, { useState } from 'react';
import { Clock, Send, Plus, MessageSquare, X, CheckCircle2, AlertCircle, LayoutDashboard, BarChart3 } from 'lucide-react';
import { Navbar } from './Navbar';
import { DashboardOverviewTab } from '../pages/DashboardOverviewTab';
import { ScheduledEmailsTab } from '../pages/ScheduledEmailsTab';
import { SentEmailsTab } from '../pages/SentEmailsTab';
import { AnalyticsTab } from '../pages/AnalyticsTab';
import { ComposeEmailModal } from './ComposeEmailModal';
import { ZeroGravityCanvas } from './canvas/ZeroGravityCanvas';
import { useEmail } from '../context/EmailContext';

export const DashboardShell: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'scheduled' | 'sent' | 'analytics'>('dashboard');
  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [isAntiGravity, setIsAntiGravity] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (prefersReducedMotion) return false;
      const stored = localStorage.getItem('reachinbox_antigravity_mode');
      return stored === 'true';
    }
    return false;
  });

  const handleToggleAntiGravity = (enabled: boolean) => {
    setIsAntiGravity(enabled);
    if (typeof window !== 'undefined') {
      localStorage.setItem('reachinbox_antigravity_mode', String(enabled));
    }
  };

  const { scheduledEmails, sentEmails, slackStatus, bannerMessage, setBannerMessage } = useEmail();

  return (
    <div className="min-h-screen bg-[#0b0c10] text-[#e0e2ec] flex flex-col font-sans">
      {/* Top Navigation & Header */}
      <Navbar
        onOpenCompose={() => setIsComposeOpen(true)}
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        scheduledCount={scheduledEmails.length}
        sentCount={sentEmails.length}
        isAntiGravity={isAntiGravity}
        onToggleAntiGravity={handleToggleAntiGravity}
      />

      {/* Main Container or Anti-Gravity Canvas */}
      {isAntiGravity ? (
        <div className="flex-1 w-full relative flex flex-col min-h-0">
          <ZeroGravityCanvas
            onOpenComposeModal={() => setIsComposeOpen(true)}
            onSwitchToZenMode={() => handleToggleAntiGravity(false)}
          />
        </div>
      ) : (
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Banner Alert for OAuth notifications / feedback */}
        {bannerMessage && (
          <div
            className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 text-xs transition-all ${
              bannerMessage.type === 'success'
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
            }`}
          >
            <div className="flex items-center gap-2">
              {bannerMessage.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              )}
              <span>{bannerMessage.text}</span>
            </div>
            <button
              onClick={() => setBannerMessage(null)}
              className="text-[#8c93a8] hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* KPI Overview Cards for Scheduled / Sent Views */}
        {(activeTab === 'scheduled' || activeTab === 'sent') && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div
              onClick={() => setActiveTab('scheduled')}
              className={`p-4 rounded-xl border transition-all cursor-pointer ${
                activeTab === 'scheduled'
                  ? 'bg-[#141826] border-indigo-500/50 shadow-md shadow-indigo-500/5'
                  : 'bg-[#11141e] border-[#212738] hover:border-[#2f374e]'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-[#8c93a8]">Scheduled Queue</span>
                <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400">
                  <Clock className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-bold text-white">{scheduledEmails.length}</span>
                <span className="text-xs text-[#71788e]">pending dispatch</span>
              </div>
            </div>

            <div
              onClick={() => setActiveTab('sent')}
              className={`p-4 rounded-xl border transition-all cursor-pointer ${
                activeTab === 'sent'
                  ? 'bg-[#141826] border-emerald-500/50 shadow-md shadow-emerald-500/5'
                  : 'bg-[#11141e] border-[#212738] hover:border-[#2f374e]'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-[#8c93a8]">Dispatched Emails</span>
                <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
                  <Send className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-bold text-white">{sentEmails.length}</span>
                <span className="text-xs text-[#71788e]">delivered / processed</span>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-[#11141e] border border-[#212738]">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-[#8c93a8]">Slack Alert Hook</span>
                <div
                  className={`p-2 rounded-lg ${
                    slackStatus.isConnected ? 'bg-emerald-500/10 text-emerald-400' : 'bg-[#1d2232] text-[#6b7280]'
                  }`}
                >
                  <MessageSquare className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <span
                  className={`w-2 h-2 rounded-full ${
                    slackStatus.isConnected ? 'bg-emerald-400 animate-pulse' : 'bg-[#5a627a]'
                  }`}
                />
                <span className="text-xs font-medium text-[#c3c7db]">
                  {slackStatus.isConnected
                    ? `Active (${slackStatus.channelName || slackStatus.workspaceName || 'Connected'})`
                    : 'Integration Disconnected'}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="flex items-center justify-between border-b border-[#212738]">
          <div className="flex items-center gap-1 sm:gap-2 overflow-x-auto">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`flex items-center gap-2 px-3.5 py-3 text-xs font-medium border-b-2 transition-colors cursor-pointer shrink-0 ${
                activeTab === 'dashboard'
                  ? 'border-indigo-500 text-white'
                  : 'border-transparent text-[#8c93a8] hover:text-[#d4d8e5] hover:border-[#2d344d]'
              }`}
            >
              <LayoutDashboard className="w-4 h-4" />
              <span>Dashboard</span>
            </button>

            <button
              onClick={() => setActiveTab('scheduled')}
              className={`flex items-center gap-2 px-3.5 py-3 text-xs font-medium border-b-2 transition-colors cursor-pointer shrink-0 ${
                activeTab === 'scheduled'
                  ? 'border-indigo-500 text-white'
                  : 'border-transparent text-[#8c93a8] hover:text-[#d4d8e5] hover:border-[#2d344d]'
              }`}
            >
              <Clock className="w-4 h-4" />
              <span>Scheduled Emails</span>
              <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-[#1d2233] text-[#a0a5b8]">
                {scheduledEmails.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('sent')}
              className={`flex items-center gap-2 px-3.5 py-3 text-xs font-medium border-b-2 transition-colors cursor-pointer shrink-0 ${
                activeTab === 'sent'
                  ? 'border-indigo-500 text-white'
                  : 'border-transparent text-[#8c93a8] hover:text-[#d4d8e5] hover:border-[#2d344d]'
              }`}
            >
              <Send className="w-4 h-4" />
              <span>Sent Emails</span>
              <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-[#1d2233] text-[#a0a5b8]">
                {sentEmails.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('analytics')}
              className={`flex items-center gap-2 px-3.5 py-3 text-xs font-medium border-b-2 transition-colors cursor-pointer shrink-0 ${
                activeTab === 'analytics'
                  ? 'border-indigo-500 text-white'
                  : 'border-transparent text-[#8c93a8] hover:text-[#d4d8e5] hover:border-[#2d344d]'
              }`}
            >
              <BarChart3 className="w-4 h-4" />
              <span>Analytics</span>
            </button>
          </div>

          <button
            onClick={() => setIsComposeOpen(true)}
            className="hidden sm:flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 font-medium cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Compose New Email</span>
          </button>
        </div>

        {/* Tab Content Panels */}
        <div className="mt-4">
          {activeTab === 'dashboard' && (
            <DashboardOverviewTab
              onOpenCompose={() => setIsComposeOpen(true)}
              onNavigateToTab={(tab) => setActiveTab(tab)}
            />
          )}
          {activeTab === 'scheduled' && (
            <ScheduledEmailsTab onOpenCompose={() => setIsComposeOpen(true)} />
          )}
          {activeTab === 'sent' && (
            <SentEmailsTab onOpenCompose={() => setIsComposeOpen(true)} />
          )}
          {activeTab === 'analytics' && <AnalyticsTab />}
        </div>
      </main>
      )}

      {/* Compose Email Modal */}
      <ComposeEmailModal isOpen={isComposeOpen} onClose={() => setIsComposeOpen(false)} />
    </div>
  );
};
