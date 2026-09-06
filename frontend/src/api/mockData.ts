import type { ScheduledEmail, SentEmail } from '../types';

export const INITIAL_SCHEDULED_EMAILS: ScheduledEmail[] = [
  {
    id: 'sch_1',
    recipient: 'alex.rivers@hypergrowth.tech',
    subject: 'Scaling outreach at HyperGrowth with ReachInbox AI',
    body: 'Hi Alex,\n\nNoticed your team is scaling SDR hiring. We helped similar B2B teams 3x their meeting book rates using automated scheduling workflows.\n\nWorth a brief 5-min chat next Tuesday?',
    scheduledTime: new Date(Date.now() + 1000 * 60 * 45).toISOString(), // in 45 minutes
    status: 'scheduled',
    createdAt: new Date().toISOString(),
    delayBetweenSeconds: 30,
    hourlyLimit: 50,
  },
  {
    id: 'sch_2',
    recipient: 'sarah.connor@cyberdyne.io',
    subject: 'Automating high-volume deliverability pipelines',
    body: 'Hello Sarah,\n\nWanted to share our benchmark report on multi-inbox rotation and email queue persistence.\n\nBest,\nReachInbox Team',
    scheduledTime: new Date(Date.now() + 1000 * 60 * 180).toISOString(), // in 3 hours
    status: 'queued',
    createdAt: new Date().toISOString(),
    delayBetweenSeconds: 45,
    hourlyLimit: 60,
  },
  {
    id: 'sch_3',
    recipient: 'dev-lead@fintechpulse.com',
    subject: 'BullMQ & Redis queue integration demo',
    body: 'Hi Lead,\n\nFollowing up on our discussion regarding background worker fault-tolerance and automated retry mechanisms.\n\nRegards,\nReachInbox Engineering',
    scheduledTime: new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString(), // tomorrow
    status: 'scheduled',
    createdAt: new Date().toISOString(),
    delayBetweenSeconds: 60,
    hourlyLimit: 40,
  },
];

export const INITIAL_SENT_EMAILS: SentEmail[] = [
  {
    id: 'snt_1',
    recipient: 'elena.rostova@venturecap.co',
    subject: 'Introduction to ReachInbox automated scheduling',
    body: 'Elena,\n\nThanks for connecting at SaaStr! Here is the deck we discussed.\n\nCheers!',
    sentTime: new Date(Date.now() - 1000 * 60 * 120).toISOString(), // 2 hours ago
    status: 'sent',
  },
  {
    id: 'snt_2',
    recipient: 'marcus.vance@saasvelocity.net',
    subject: 'Partnership opportunity with ReachInbox outreach network',
    body: 'Hey Marcus,\n\nSharing the API contract docs for custom CRM webhook sync.\n\nLet me know your thoughts.',
    sentTime: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(), // 5 hours ago
    status: 'sent',
  },
  {
    id: 'snt_3',
    recipient: 'invalid-bounce@nonexistent-domain-404.org',
    subject: 'Deliverability verification check',
    body: 'Test ping for SMTP bounce detection.',
    sentTime: new Date(Date.now() - 1000 * 60 * 60 * 28).toISOString(), // yesterday
    status: 'failed',
    errorMessage: 'SMTP 550: Mailbox unavailable / domain not found',
  },
  {
    id: 'snt_4',
    recipient: 'clara.oswald@tardis-security.io',
    subject: 'Weekly outreach performance summary',
    body: 'Clara,\n\nYour campaign reached 98.4% inbox placement this week across 2,400 dispatched messages.',
    sentTime: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(), // 2 days ago
    status: 'sent',
  },
];
