import React, { useState } from 'react';
import {
  Send,
  Plus,
  Search,
  LogOut,
  ChevronDown,
  MessageSquare,
  Sparkles,
  LayoutDashboard,
  Clock,
  BarChart3,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useEmail } from '../context/EmailContext';
import { Button } from './ui/Button';
import { AntiGravityToggle } from './canvas/AntiGravityToggle';
import { API_BASE_URL } from '../api/emailService';

interface NavbarProps {
  onOpenCompose: () => void;
  activeTab?: 'dashboard' | 'scheduled' | 'sent' | 'analytics';
  onSelectTab?: (tab: 'dashboard' | 'scheduled' | 'sent' | 'analytics') => void;
  scheduledCount?: number;
  sentCount?: number;
  isAntiGravity?: boolean;
  onToggleAntiGravity?: (enabled: boolean) => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  onOpenCompose,
  activeTab = 'dashboard',
  onSelectTab,
  scheduledCount = 0,
  sentCount = 0,
  isAntiGravity = false,
  onToggleAntiGravity,
}) => {
  const { user, logout } = useAuth();
  const { searchQuery, setSearchQuery, isSearching, slackStatus, toggleSlack } = useEmail();
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isSlackModalOpen, setIsSlackModalOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 w-full border-b border-[#212738] bg-[#0f121a]/95 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        {/* Brand Logo & App Name */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-md shadow-indigo-500/20">
            <Send className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-base tracking-tight text-white">ReachInbox</span>
              <span className="text-[10px] uppercase font-semibold tracking-wider bg-indigo-500/10 text-indigo-400 px-1.5 py-0.5 rounded border border-indigo-500/20">
                Scheduler
              </span>
            </div>
            <p className="text-[11px] text-[#71788e] hidden sm:block">Cold Outreach & Email Automation</p>
          </div>
        </div>

        {/* Navigation Tabs for Desktop */}
        {onSelectTab && (
          <nav className="hidden lg:flex items-center gap-1 bg-[#121624] p-1 rounded-xl border border-[#212738]">
            <button
              onClick={() => onSelectTab('dashboard')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                activeTab === 'dashboard'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-[#8c93a8] hover:text-white hover:bg-[#1a2030]'
              }`}
            >
              <LayoutDashboard className="w-3.5 h-3.5" />
              <span>Dashboard</span>
            </button>

            <button
              onClick={() => onSelectTab('scheduled')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                activeTab === 'scheduled'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-[#8c93a8] hover:text-white hover:bg-[#1a2030]'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>Scheduled</span>
              {scheduledCount > 0 && (
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-indigo-900/60 text-indigo-200">
                  {scheduledCount}
                </span>
              )}
            </button>

            <button
              onClick={() => onSelectTab('sent')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                activeTab === 'sent'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-[#8c93a8] hover:text-white hover:bg-[#1a2030]'
              }`}
            >
              <Send className="w-3.5 h-3.5" />
              <span>Sent</span>
              {sentCount > 0 && (
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-emerald-900/60 text-emerald-200">
                  {sentCount}
                </span>
              )}
            </button>

            <button
              onClick={() => onSelectTab('analytics')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                activeTab === 'analytics'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-[#8c93a8] hover:text-white hover:bg-[#1a2030]'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span>Analytics</span>
            </button>
          </nav>
        )}

        {/* Elasticsearch Search Bar */}
        <div className="flex-1 max-w-md hidden md:block">
          <div className="relative">
            <Search className="w-4 h-4 text-[#5a627a] absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by recipient or subject (Elasticsearch indexed)..."
              className="w-full bg-[#141824] border border-[#262c3e] rounded-lg pl-9 pr-4 py-1.5 text-xs text-[#e0e2ec] placeholder-[#5a627a] focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
            />
            {isSearching && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <span className="w-3 h-3 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin inline-block" />
              </div>
            )}
          </div>
        </div>

        {/* Actions, Slack Connector, and Profile */}
        <div className="flex items-center gap-3">
          {/* Anti-Gravity Mode Toggle */}
          {onToggleAntiGravity && (
            <AntiGravityToggle
              isAntiGravity={isAntiGravity}
              onToggle={onToggleAntiGravity}
            />
          )}

          {/* Slack Connection Control / Status Area */}
          <div className="relative">
            <button
              onClick={() => setIsSlackModalOpen(!isSlackModalOpen)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                slackStatus.isConnected
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/15'
                  : 'bg-[#161a27] text-[#9ca3af] border-[#262c3e] hover:bg-[#1f2537] hover:text-white'
              }`}
              title="Slack Integration Status"
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">
                {slackStatus.isConnected ? 'Slack Connected' : 'Connect Slack'}
              </span>
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  slackStatus.isConnected ? 'bg-emerald-400' : 'bg-[#5a627a]'
                }`}
              />
            </button>

            {/* Slack Popover / Dropdown */}
            {isSlackModalOpen && (
              <div className="absolute right-0 mt-2 w-72 bg-[#141824] border border-[#262c3e] rounded-xl shadow-2xl p-4 z-50 animate-in fade-in zoom-in-95 duration-150">
                <div className="flex items-center gap-2 mb-2">
                  <div className="p-1.5 bg-[#4A154B]/20 text-[#ECB22E] rounded-md">
                    <MessageSquare className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-semibold text-white">Slack Notifications</h4>
                    <p className="text-[11px] text-[#71788e]">Get alerts when hourly rate limits trigger</p>
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-[#0d0f17] border border-[#1e2333] mb-3 text-[11px] text-[#9ca3af] space-y-1">
                  <div className="flex justify-between">
                    <span>Status:</span>
                    <span className={slackStatus.isConnected ? 'text-emerald-400 font-medium' : 'text-[#71788e]'}>
                      {slackStatus.isConnected
                        ? `Active (${slackStatus.channelName || slackStatus.workspaceName || 'Connected'})`
                        : 'Not Connected'}
                    </span>
                  </div>
                  <div className="text-[10px] text-[#636b83] italic pt-1 border-t border-[#1a1e2d]">
                    OAuth 2.0 connected server-side
                  </div>
                </div>

                <Button
                  variant={slackStatus.isConnected ? 'danger' : 'primary'}
                  size="sm"
                  className="w-full text-xs"
                  onClick={() => {
                    toggleSlack();
                    setIsSlackModalOpen(false);
                  }}
                >
                  {slackStatus.isConnected ? 'Disconnect Slack' : 'Connect Slack'}
                </Button>
              </div>
            )}
          </div>

          {/* Compose New Email CTA */}
          <Button
            onClick={onOpenCompose}
            size="sm"
            leftIcon={<Plus className="w-4 h-4" />}
            className="shadow-sm shadow-indigo-600/30 font-medium"
          >
            <span className="hidden sm:inline">Compose Email</span>
            <span className="sm:hidden">Compose</span>
          </Button>

          {/* User Profile / Header Menu */}
          <div className="relative">
            <button
              onClick={() => setIsProfileOpen(!isProfileOpen)}
              className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-[#181d2c] border border-transparent hover:border-[#262c3e] transition-colors cursor-pointer"
              aria-label="User menu"
            >
              {user?.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt={user.name}
                  className="w-7 h-7 rounded-full object-cover border border-[#2d344d]"
                />
              ) : (
                <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-indigo-600 to-purple-600 flex items-center justify-center text-xs font-semibold text-white">
                  {user?.name?.charAt(0) || 'U'}
                </div>
              )}
              <ChevronDown className="w-3.5 h-3.5 text-[#71788e] hidden sm:block" />
            </button>

            {/* Profile Dropdown */}
            {isProfileOpen && (
              <div className="absolute right-0 mt-2 w-56 bg-[#141824] border border-[#262c3e] rounded-xl shadow-2xl py-1 z-50 animate-in fade-in zoom-in-95 duration-150">
                <div className="px-4 py-3 border-b border-[#212738]">
                  <p className="text-xs font-semibold text-[#f1f3f9] truncate">{user?.name || 'Authenticated User'}</p>
                  <p className="text-[11px] text-[#71788e] truncate mt-0.5">{user?.email || 'user@domain.com'}</p>
                </div>
                <div className="px-2 py-1.5">
                  <a
                    href={`${API_BASE_URL}/admin/queues`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 px-3 py-1.5 text-xs text-[#c3c7db] hover:bg-[#1f2538] rounded-lg transition-colors"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Bull Board Queues</span>
                  </a>
                  <button
                    onClick={async () => {
                      setIsProfileOpen(false);
                      await logout();
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Log Out</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile Search input */}
      <div className="md:hidden px-4 pb-2 pt-1 border-t border-[#1a1f2e]">
        <div className="relative">
          <Search className="w-4 h-4 text-[#5a627a] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search emails..."
            className="w-full bg-[#141824] border border-[#262c3e] rounded-lg pl-9 pr-4 py-1.5 text-xs text-[#e0e2ec] placeholder-[#5a627a] focus:outline-none focus:border-indigo-500"
          />
        </div>
      </div>

      {/* Mobile Navigation Tabs */}
      {onSelectTab && (
        <div className="lg:hidden flex items-center justify-around border-t border-[#1a1f2e] bg-[#0d1017] px-2 py-1.5 overflow-x-auto">
          <button
            onClick={() => onSelectTab('dashboard')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium shrink-0 cursor-pointer ${
              activeTab === 'dashboard' ? 'bg-indigo-600 text-white' : 'text-[#8c93a8]'
            }`}
          >
            <LayoutDashboard className="w-3.5 h-3.5" />
            <span>Dashboard</span>
          </button>
          <button
            onClick={() => onSelectTab('scheduled')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium shrink-0 cursor-pointer ${
              activeTab === 'scheduled' ? 'bg-indigo-600 text-white' : 'text-[#8c93a8]'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Scheduled</span>
            {scheduledCount > 0 && (
              <span className="text-[10px] px-1 rounded-full bg-indigo-900/60 text-indigo-200">
                {scheduledCount}
              </span>
            )}
          </button>
          <button
            onClick={() => onSelectTab('sent')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium shrink-0 cursor-pointer ${
              activeTab === 'sent' ? 'bg-indigo-600 text-white' : 'text-[#8c93a8]'
            }`}
          >
            <Send className="w-3.5 h-3.5" />
            <span>Sent</span>
            {sentCount > 0 && (
              <span className="text-[10px] px-1 rounded-full bg-emerald-900/60 text-emerald-200">
                {sentCount}
              </span>
            )}
          </button>
          <button
            onClick={() => onSelectTab('analytics')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium shrink-0 cursor-pointer ${
              activeTab === 'analytics' ? 'bg-indigo-600 text-white' : 'text-[#8c93a8]'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            <span>Analytics</span>
          </button>
        </div>
      )}
    </header>
  );
};
