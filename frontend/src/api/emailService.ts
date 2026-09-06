import type {
  ScheduledEmail,
  SentEmail,
  ScheduleEmailPayload,
  SearchResults,
  SlackConnectionStatus,
  UserProfile,
  AnalyticsData,
  DateRangeOption,
} from '../types';

export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

interface BackendEmailRecord {
  id: string;
  user_id: string;
  sender_id: string;
  idempotency_key: string;
  sender: string;
  recipient: string;
  subject: string;
  body: string;
  status: 'scheduled' | 'queued' | 'processing' | 'sent' | 'failed';
  scheduled_at: string | null;
  sent_at: string | null;
  bullmq_job_id: string | null;
  attempts: number;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

interface BackendSearchResponse {
  success: boolean;
  data: {
    emails: BackendEmailRecord[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

/**
 * Universal fetch wrapper enforcing `credentials: "include"` for session authentication.
 */
async function apiFetch<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = endpoint.startsWith('http') ? endpoint : `${API_BASE_URL}${endpoint}`;
  const response = await fetch(url, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    let errorMessage = `HTTP error ${response.status}: ${response.statusText}`;
    try {
      const errorJson = await response.json();
      if (errorJson.error) {
        errorMessage = typeof errorJson.error === 'string' ? errorJson.error : JSON.stringify(errorJson.error);
      } else if (errorJson.message) {
        errorMessage = errorJson.message;
      }
    } catch {
      // JSON parse failed, use fallback message
    }

    if (response.status === 401) {
      throw new Error('Unauthorized');
    }

    throw new Error(errorMessage);
  }

  return (await response.json()) as T;
}

export const emailService = {
  /**
   * Fetch current authenticated user profile
   * Backend endpoint: GET /api/auth/me
   */
  async fetchUserProfile(): Promise<UserProfile | null> {
    try {
      const data = await apiFetch<{
        id: string;
        email: string;
        name?: string | null;
        avatar?: string | null;
      }>('/api/auth/me');

      return {
        id: data.id,
        email: data.email,
        name: data.name || data.email.split('@')[0],
        avatarUrl: data.avatar ?? undefined,
      };
    } catch {
      return null;
    }
  },

  /**
   * Redirect browser to Google OAuth flow
   * Backend endpoint: GET /api/auth/google
   */
  loginWithGoogle(): void {
    window.location.href = `${API_BASE_URL}/api/auth/google`;
  },

  /**
   * Logout user and destroy session
   * Backend endpoint: POST /api/auth/logout
   */
  async logoutUser(): Promise<void> {
    try {
      await apiFetch<{ success: boolean }>('/api/auth/logout', { method: 'POST' });
    } catch (err) {
      console.warn('Logout error:', err);
    }
  },

  /**
   * Search emails across scheduled and sent collections via Elasticsearch-backed endpoint
   * Backend endpoint: GET /api/emails/search?q={query}&status={status}&limit=100
   */
  async searchEmails(query: string = '', status?: string): Promise<SearchResults> {
    const params = new URLSearchParams();
    if (query.trim()) {
      params.append('q', query.trim());
    }
    if (status && status !== 'all') {
      params.append('status', status.trim());
    }
    params.append('limit', '100');

    const result = await apiFetch<BackendSearchResponse>(`/api/emails/search?${params.toString()}`);
    const rawList = result.data?.emails || [];

    const scheduled: ScheduledEmail[] = [];
    const sent: SentEmail[] = [];

    for (const item of rawList) {
      if (item.status === 'sent' || item.status === 'failed') {
        sent.push({
          id: item.id,
          recipient: item.recipient,
          sender: item.sender,
          subject: item.subject,
          body: item.body,
          sentTime: item.sent_at || item.updated_at || item.created_at,
          status: item.status,
          errorMessage: item.last_error || undefined,
        });
      } else {
        scheduled.push({
          id: item.id,
          recipient: item.recipient,
          sender: item.sender,
          subject: item.subject,
          body: item.body,
          scheduledTime: item.scheduled_at || item.created_at,
          status: item.status,
          createdAt: item.created_at,
        });
      }
    }

    return { scheduled, sent };
  },

  /**
   * Fetch scheduled emails
   */
  async getScheduledEmails(): Promise<ScheduledEmail[]> {
    const results = await this.searchEmails('');
    return results.scheduled;
  },

  /**
   * Fetch dispatched/sent emails
   */
  async getSentEmails(): Promise<SentEmail[]> {
    const results = await this.searchEmails('');
    return results.sent;
  },

  /**
   * Schedule campaign emails
   * Backend endpoint: POST /api/emails/schedule
   */
  async scheduleEmails(
    payload: ScheduleEmailPayload,
    fallbackSenderEmail?: string
  ): Promise<{ success: boolean; scheduledCount: number }> {
    const sender = payload.sender || fallbackSenderEmail || 'no-reply@reachinbox.dev';

    const bodyData = {
      sender,
      recipients: payload.emails,
      subject: payload.subject,
      body: payload.body,
      startTime: payload.startTime,
      delayBetweenEmailsMs: (payload.delayBetweenSeconds || 2) * 1000,
      hourlyLimit: payload.hourlyLimit || 100,
    };

    const response = await apiFetch<{
      idempotencyKey: string;
      startTime: string;
      emails: Array<{ id: string }>;
    }>('/api/emails/schedule', {
      method: 'POST',
      body: JSON.stringify(bodyData),
    });

    return {
      success: true,
      scheduledCount: response.emails?.length || payload.emails.length,
    };
  },

  /**
   * Get Slack integration status
   * Backend endpoint: GET /api/slack/status
   */
  async getSlackStatus(): Promise<SlackConnectionStatus> {
    try {
      const data = await apiFetch<{
        connected: boolean;
        teamName?: string | null;
        channel?: string | null;
      }>('/api/slack/status');

      return {
        isConnected: Boolean(data.connected),
        workspaceName: data.teamName ?? undefined,
        channelName: data.channel ?? undefined,
      };
    } catch {
      return { isConnected: false };
    }
  },

  /**
   * Redirect browser to initiate Slack OAuth
   */
  connectSlack(): void {
    window.location.href = `${API_BASE_URL}/api/slack/connect`;
  },

  /**
   * Disconnect Slack integration
   * Backend endpoint: POST /api/slack/disconnect
   */
  async disconnectSlack(): Promise<SlackConnectionStatus> {
    try {
      await apiFetch<{ success: boolean }>('/api/slack/disconnect', { method: 'POST' });
    } catch (err) {
      console.warn('Slack disconnect error:', err);
    }
    return { isConnected: false };
  },

  /**
   * Fetch aggregated analytics metrics for current user
   * Backend endpoint: GET /api/emails/analytics?range={range}
   */
  async fetchAnalytics(range: DateRangeOption = '7d'): Promise<AnalyticsData> {
    const result = await apiFetch<AnalyticsData>(`/api/emails/analytics?range=${range}`);
    return result;
  },
};
