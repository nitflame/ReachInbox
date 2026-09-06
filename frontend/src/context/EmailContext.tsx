import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type {
  ScheduledEmail,
  SentEmail,
  ScheduleEmailPayload,
  SlackConnectionStatus,
} from '../types';
import { emailService } from '../api/emailService';
import { useAuth } from './AuthContext';

interface EmailContextType {
  scheduledEmails: ScheduledEmail[];
  sentEmails: SentEmail[];
  isLoadingScheduled: boolean;
  isLoadingSent: boolean;
  searchQuery: string;
  isSearching: boolean;
  slackStatus: SlackConnectionStatus;
  bannerMessage: { type: 'success' | 'error'; text: string } | null;
  setBannerMessage: (msg: { type: 'success' | 'error'; text: string } | null) => void;
  refreshScheduled: () => Promise<void>;
  refreshSent: () => Promise<void>;
  refreshSlackStatus: () => Promise<void>;
  scheduleEmails: (payload: ScheduleEmailPayload) => Promise<{ success: boolean; scheduledCount: number }>;
  setSearchQuery: (query: string) => void;
  toggleSlack: () => Promise<void>;
}

const EmailContext = createContext<EmailContextType | undefined>(undefined);

export const EmailProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();

  const [scheduledEmails, setScheduledEmails] = useState<ScheduledEmail[]>([]);
  const [sentEmails, setSentEmails] = useState<SentEmail[]>([]);
  const [isLoadingScheduled, setIsLoadingScheduled] = useState<boolean>(true);
  const [isLoadingSent, setIsLoadingSent] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [slackStatus, setSlackStatus] = useState<SlackConnectionStatus>({ isConnected: false });
  const [bannerMessage, setBannerMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Fetch initial scheduled emails
  const refreshScheduled = useCallback(async () => {
    setIsLoadingScheduled(true);
    try {
      const data = await emailService.getScheduledEmails();
      setScheduledEmails(data);
    } catch (err) {
      console.error('Failed to load scheduled emails', err);
    } finally {
      setIsLoadingScheduled(false);
    }
  }, []);

  // Fetch initial sent emails
  const refreshSent = useCallback(async () => {
    setIsLoadingSent(true);
    try {
      const data = await emailService.getSentEmails();
      setSentEmails(data);
    } catch (err) {
      console.error('Failed to load sent emails', err);
    } finally {
      setIsLoadingSent(false);
    }
  }, []);

  // Fetch Slack status
  const refreshSlackStatus = useCallback(async () => {
    try {
      const status = await emailService.getSlackStatus();
      setSlackStatus(status);
    } catch (err) {
      console.error('Failed to load Slack status', err);
    }
  }, []);

  // Initial load when user changes or mounts
  useEffect(() => {
    if (user) {
      refreshScheduled();
      refreshSent();
      refreshSlackStatus();
    }
  }, [user, refreshScheduled, refreshSent, refreshSlackStatus]);

  // Check URL query parameters for OAuth callbacks (Slack, Google)
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const slackSuccess = urlParams.get('slack_success');
    const slackError = urlParams.get('slack_error');
    const errorParam = urlParams.get('error');

    if (slackSuccess === 'true') {
      setBannerMessage({ type: 'success', text: 'Slack notifications successfully connected!' });
      refreshSlackStatus();
    } else if (slackError) {
      setBannerMessage({ type: 'error', text: `Slack authorization failed (${slackError}).` });
    } else if (errorParam) {
      setBannerMessage({ type: 'error', text: `Authentication error: ${errorParam}` });
    }

    if (slackSuccess || slackError || errorParam) {
      // Clean query string from browser URL
      const cleanUrl = window.location.origin + window.location.pathname;
      window.history.replaceState({}, document.title, cleanUrl);
    }
  }, [refreshSlackStatus]);

  // Debounced search via Elasticsearch-backed endpoint
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (!user) return;

      if (!searchQuery.trim()) {
        refreshScheduled();
        refreshSent();
        return;
      }

      setIsSearching(true);
      try {
        const results = await emailService.searchEmails(searchQuery);
        setScheduledEmails(results.scheduled);
        setSentEmails(results.sent);
      } catch (err) {
        console.error('Search error:', err);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, user, refreshScheduled, refreshSent]);

  const scheduleEmails = async (payload: ScheduleEmailPayload) => {
    const result = await emailService.scheduleEmails(payload, user?.email);
    await refreshScheduled();
    await refreshSent();
    return result;
  };

  const toggleSlack = async () => {
    if (slackStatus.isConnected) {
      const updated = await emailService.disconnectSlack();
      setSlackStatus(updated);
      setBannerMessage({ type: 'success', text: 'Slack connection disconnected.' });
    } else {
      emailService.connectSlack();
    }
  };

  return (
    <EmailContext.Provider
      value={{
        scheduledEmails,
        sentEmails,
        isLoadingScheduled,
        isLoadingSent,
        searchQuery,
        isSearching,
        slackStatus,
        bannerMessage,
        setBannerMessage,
        refreshScheduled,
        refreshSent,
        refreshSlackStatus,
        scheduleEmails,
        setSearchQuery,
        toggleSlack,
      }}
    >
      {children}
    </EmailContext.Provider>
  );
};

export const useEmail = () => {
  const context = useContext(EmailContext);
  if (!context) {
    throw new Error('useEmail must be used within an EmailProvider');
  }
  return context;
};
