import React, { useState, useRef } from 'react';
import {
  Upload,
  Clock,
  Send,
  CheckCircle2,
  X,
  Calendar,
  Layers,
  Sparkles,
} from 'lucide-react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import type { ScheduleEmailPayload } from '../types';
import { useEmail } from '../context/EmailContext';

interface ComposeEmailModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

export const ComposeEmailModal: React.FC<ComposeEmailModalProps> = ({ isOpen, onClose }) => {
  const { scheduleEmails } = useEmail();

  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [recipientInput, setRecipientInput] = useState('');
  const [detectedEmails, setDetectedEmails] = useState<string[]>([]);
  const [isParsingFile, setIsParsingFile] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);

  // Default start time: 10 minutes from now formatted for datetime-local
  const getDefaultStartTime = () => {
    const d = new Date(Date.now() + 10 * 60 * 1000);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  };

  const [startTime, setStartTime] = useState(getDefaultStartTime());
  const [delayBetweenSeconds, setDelayBetweenSeconds] = useState(30);
  const [hourlyLimit, setHourlyLimit] = useState(50);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Parse text or pasted content for emails
  const parseEmailsFromText = (text: string) => {
    const matches = text.match(EMAIL_REGEX) || [];
    const unique = Array.from(new Set(matches.map((e) => e.toLowerCase())));
    return unique;
  };

  // Handle manual typing/pasting
  const handleRecipientChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setRecipientInput(val);
    const parsed = parseEmailsFromText(val);
    setDetectedEmails(parsed);
  };

  // Handle CSV / text file upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setIsParsingFile(true);
    setErrorMessage(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      const parsed = parseEmailsFromText(content);

      if (parsed.length === 0) {
        setErrorMessage(`No valid email addresses found in "${file.name}".`);
      } else {
        setDetectedEmails(parsed);
        setRecipientInput(parsed.join(', '));
      }
      setIsParsingFile(false);
    };

    reader.onerror = () => {
      setErrorMessage('Failed to read file. Please try again.');
      setIsParsingFile(false);
    };

    reader.readAsText(file);
  };

  // Quick preset helpers for schedule time
  const setPresetTime = (minutesFromNow: number) => {
    const d = new Date(Date.now() + minutesFromNow * 60 * 1000);
    setStartTime(new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16));
  };

  const setTomorrowMorning = () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
    setStartTime(new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16));
  };

  const removeEmailChip = (emailToRemove: string) => {
    const updated = detectedEmails.filter((e) => e !== emailToRemove);
    setDetectedEmails(updated);
    setRecipientInput(updated.join(', '));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!subject.trim()) {
      setErrorMessage('Please provide an email subject line.');
      return;
    }

    if (!body.trim()) {
      setErrorMessage('Please provide an email body.');
      return;
    }

    if (detectedEmails.length === 0) {
      setErrorMessage('Please upload a CSV or enter at least one valid recipient email address.');
      return;
    }

    if (!startTime) {
      setErrorMessage('Please specify a schedule start time.');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload: ScheduleEmailPayload = {
        subject: subject.trim(),
        body: body.trim(),
        emails: detectedEmails,
        startTime: new Date(startTime).toISOString(),
        delayBetweenSeconds: Number(delayBetweenSeconds) || 30,
        hourlyLimit: Number(hourlyLimit) || 50,
      };

      await scheduleEmails(payload);

      // Reset form
      setSubject('');
      setBody('');
      setRecipientInput('');
      setDetectedEmails([]);
      setFileName(null);
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to schedule emails';
      setErrorMessage(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Compose & Schedule Campaign"
      description="Queue automated personalized cold emails with custom delay intervals."
      maxWidth="2xl"
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        {errorMessage && (
          <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-lg text-xs text-rose-400 flex items-center justify-between">
            <span>{errorMessage}</span>
            <button type="button" onClick={() => setErrorMessage(null)} className="text-rose-400 hover:text-white">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Recipients: CSV Upload and Text Input */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-[#c3c7db] flex items-center gap-1.5">
              <span>Recipients (CSV or Manual Entry)</span>
              {detectedEmails.length > 0 && (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                  <CheckCircle2 className="w-3 h-3" />
                  {detectedEmails.length} {detectedEmails.length === 1 ? 'recipient' : 'recipients'} detected
                </span>
              )}
            </label>

            {/* Hidden CSV file input */}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept=".csv,.txt"
              className="hidden"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              isLoading={isParsingFile}
              leftIcon={<Upload className="w-3.5 h-3.5 text-indigo-400" />}
              className="text-xs py-1"
            >
              {fileName ? `File: ${fileName}` : 'Upload CSV / TXT'}
            </Button>
          </div>

          <textarea
            rows={2}
            value={recipientInput}
            onChange={handleRecipientChange}
            placeholder="Paste emails separated by commas, spaces, or lines (e.g. alex@reachinbox.ai, sara@growth.co)"
            className="w-full rounded-lg bg-[#141722] border border-[#262c3e] p-3 text-xs text-[#f1f3f9] placeholder-[#5a627a] focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
          />

          {/* Detected emails chips preview */}
          {detectedEmails.length > 0 && (
            <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto p-2 bg-[#0e1017] border border-[#1e2333] rounded-lg">
              {detectedEmails.slice(0, 15).map((email) => (
                <span
                  key={email}
                  className="inline-flex items-center gap-1 text-[11px] bg-[#1a1f30] text-[#c3c7db] border border-[#2d3652] px-2 py-0.5 rounded-md"
                >
                  <span className="truncate max-w-[150px]">{email}</span>
                  <button
                    type="button"
                    onClick={() => removeEmailChip(email)}
                    className="text-[#71788e] hover:text-rose-400"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
              {detectedEmails.length > 15 && (
                <span className="text-[11px] text-[#71788e] px-1 py-0.5 font-medium">
                  +{detectedEmails.length - 15} more
                </span>
              )}
            </div>
          )}
        </div>

        {/* Email Subject */}
        <Input
          label="Email Subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="e.g. Quick question regarding your outreach strategy"
          required
        />

        {/* Email Body */}
        <div className="space-y-1.5 text-left">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-[#c3c7db]">Email Body</label>
            <span className="text-[11px] text-[#636b83]">Plain text email template</span>
          </div>
          <textarea
            rows={5}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write your email body here..."
            className="w-full rounded-lg bg-[#141722] border border-[#262c3e] p-3 text-xs text-[#f1f3f9] placeholder-[#5a627a] focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors leading-relaxed font-sans"
            required
          />
        </div>

        {/* Scheduling Parameters Grid */}
        <div className="p-4 bg-[#0e1018] border border-[#212738] rounded-xl space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-[#1c2130]">
            <Clock className="w-4 h-4 text-indigo-400" />
            <h4 className="text-xs font-semibold text-white">Queue & Timing Controls</h4>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Start Time */}
            <div className="sm:col-span-1 space-y-1.5">
              <label className="block text-xs font-medium text-[#a0a5b8] flex items-center gap-1">
                <Calendar className="w-3 h-3 text-[#71788e]" />
                <span>Start Time</span>
              </label>
              <input
                type="datetime-local"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full rounded-lg bg-[#141722] border border-[#262c3e] px-2.5 py-1.5 text-xs text-[#f1f3f9] focus:outline-none focus:border-indigo-500"
                required
              />
            </div>

            {/* Delay between emails */}
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-[#a0a5b8] flex items-center gap-1">
                <Layers className="w-3 h-3 text-[#71788e]" />
                <span>Delay (seconds)</span>
              </label>
              <input
                type="number"
                min="1"
                max="3600"
                value={delayBetweenSeconds}
                onChange={(e) => setDelayBetweenSeconds(Number(e.target.value))}
                className="w-full rounded-lg bg-[#141722] border border-[#262c3e] px-3 py-1.5 text-xs text-[#f1f3f9] focus:outline-none focus:border-indigo-500"
                required
              />
            </div>

            {/* Hourly Limit */}
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-[#a0a5b8] flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-[#71788e]" />
                <span>Hourly Limit</span>
              </label>
              <input
                type="number"
                min="1"
                max="1000"
                value={hourlyLimit}
                onChange={(e) => setHourlyLimit(Number(e.target.value))}
                className="w-full rounded-lg bg-[#141722] border border-[#262c3e] px-3 py-1.5 text-xs text-[#f1f3f9] focus:outline-none focus:border-indigo-500"
                required
              />
            </div>
          </div>

          {/* Quick Schedule Presets */}
          <div className="flex items-center gap-2 pt-1">
            <span className="text-[11px] text-[#71788e]">Quick Presets:</span>
            <button
              type="button"
              onClick={() => setPresetTime(10)}
              className="text-[11px] px-2 py-0.5 rounded bg-[#161a27] hover:bg-[#202538] text-[#c3c7db] border border-[#262c3e] cursor-pointer"
            >
              +10 min
            </button>
            <button
              type="button"
              onClick={() => setPresetTime(60)}
              className="text-[11px] px-2 py-0.5 rounded bg-[#161a27] hover:bg-[#202538] text-[#c3c7db] border border-[#262c3e] cursor-pointer"
            >
              +1 hour
            </button>
            <button
              type="button"
              onClick={setTomorrowMorning}
              className="text-[11px] px-2 py-0.5 rounded bg-[#161a27] hover:bg-[#202538] text-[#c3c7db] border border-[#262c3e] cursor-pointer"
            >
              Tomorrow 9 AM
            </button>
          </div>
        </div>

        {/* Actions Footer */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            isLoading={isSubmitting}
            leftIcon={<Send className="w-4 h-4" />}
            disabled={detectedEmails.length === 0 || !subject.trim() || !body.trim()}
          >
            {detectedEmails.length > 0
              ? `Schedule ${detectedEmails.length} ${detectedEmails.length === 1 ? 'Email' : 'Emails'}`
              : 'Schedule Emails'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
