export type EmailStatus = 'scheduled' | 'queued' | 'processing' | 'sent' | 'failed';

export interface ScheduledEmail {
  id: string;
  recipient: string;
  sender?: string;
  subject: string;
  body: string;
  scheduledTime: string; // ISO 8601 string
  status: EmailStatus;
  createdAt: string;
  delayBetweenSeconds?: number;
  hourlyLimit?: number;
}

export interface SentEmail {
  id: string;
  recipient: string;
  sender?: string;
  subject: string;
  body: string;
  sentTime: string; // ISO 8601 string
  status: EmailStatus;
  errorMessage?: string;
}

export interface ScheduleEmailPayload {
  subject: string;
  body: string;
  emails: string[];
  startTime: string; // ISO 8601 string
  delayBetweenSeconds: number;
  hourlyLimit: number;
  sender?: string;
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
}

export interface SlackConnectionStatus {
  isConnected: boolean;
  channelName?: string;
  workspaceName?: string;
}

export interface SearchResults {
  scheduled: ScheduledEmail[];
  sent: SentEmail[];
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

export interface ActivityDataPoint {
  date: string;
  sent: number;
  failed: number;
  scheduled: number;
  total: number;
}

export interface StatusBreakdownItem {
  status: string;
  count: number;
  percentage: number;
}

export interface TopRecipientItem {
  recipient: string;
  emails: number;
  sent: number;
  failed: number;
}

export interface AnalyticsData {
  scheduled: number;
  sent: number;
  failed: number;
  total: number;
  successRate: number;
  hourlySent: number;
  hourlyLimit: number;
  resetsInMinutes: number;
  daily: ActivityDataPoint[];
  statusBreakdown: StatusBreakdownItem[];
  topRecipients: TopRecipientItem[];
}

export type DateRangeOption = 'today' | '7d' | '30d' | 'all';

