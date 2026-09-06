import React from 'react';
import { Send, Shield, Zap, Sparkles } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { API_BASE_URL } from '../api/emailService';

export const LoginPage: React.FC = () => {
  const { loginWithGoogle, isLoading } = useAuth();

  return (
    <div className="min-h-screen bg-[#0b0c10] flex flex-col justify-center items-center px-4 py-12 relative overflow-hidden">
      {/* Subtle Background Glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 left-1/3 w-64 h-64 bg-purple-600/10 rounded-full blur-3xl pointer-events-none" />

      {/* Main Login Card */}
      <div className="w-full max-w-md bg-[#121520] border border-[#212738] rounded-2xl shadow-2xl p-8 z-10 relative">
        {/* Brand Logo */}
        <div className="flex flex-col items-center text-center mb-8">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/25 mb-4">
            <Send className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">ReachInbox</h1>
          <p className="text-xs text-[#8c93a8] mt-1.5 max-w-xs leading-relaxed">
            AI-driven cold email outreach, queue automation, and deliverability infrastructure.
          </p>
        </div>

        {/* Feature Highlights Banner */}
        <div className="bg-[#0e1018] border border-[#1e2333] rounded-xl p-3.5 mb-6 space-y-2">
          <div className="flex items-center gap-2.5 text-xs text-[#c3c7db]">
            <Zap className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
            <span>Persistent BullMQ background job dispatch</span>
          </div>
          <div className="flex items-center gap-2.5 text-xs text-[#c3c7db]">
            <Shield className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span>Multi-inbox rotation & automated rate limiting</span>
          </div>
          <div className="flex items-center gap-2.5 text-xs text-[#c3c7db]">
            <Sparkles className="w-3.5 h-3.5 text-purple-400 shrink-0" />
            <span>Elasticsearch-indexed email analytics</span>
          </div>
        </div>

        {/* Google OAuth Login Section */}
        <div className="space-y-4">
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-[#212738]" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-[#121520] px-3 text-[#71788e] font-medium tracking-wider">
                Authenticate
              </span>
            </div>
          </div>

          {/* Real Google OAuth Button */}
          <button
            onClick={loginWithGoogle}
            disabled={isLoading}
            className="w-full flex items-center justify-center gap-3 px-4 py-2.5 rounded-xl bg-white hover:bg-gray-100 text-gray-900 font-semibold text-sm transition-all duration-150 shadow-md hover:shadow-lg active:scale-[0.99] cursor-pointer disabled:opacity-50"
          >
            {/* Google SVG Icon */}
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.66v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.15z"
              />
              <path
                fill="#34A853"
                d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.24v3.15C3.26 21.36 7.33 24 12 24z"
              />
              <path
                fill="#FBBC05"
                d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.24C.45 8.14 0 9.99 0 12s.45 3.86 1.24 5.42l4.04-3.15z"
              />
              <path
                fill="#EA4335"
                d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.24 6.58l4.04 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
              />
            </svg>
            <span>{isLoading ? 'Verifying session...' : 'Sign in with Google'}</span>
          </button>

          {/* Quick Dev Login Button */}
          <button
            onClick={() => {
              window.location.href = `${API_BASE_URL}/api/auth/dev-login`;
            }}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#1a1f2e] hover:bg-[#232a3e] text-[#c3c7db] hover:text-white font-medium text-xs transition-all duration-150 border border-[#2d354d] cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
            <span>Quick Dev Login (Local Development)</span>
          </button>

          <p className="text-[11px] text-center text-[#71788e]">
            Authenticated via secure server-side Google OAuth 2.0 & Redis session cookies.
          </p>
        </div>
      </div>

      {/* Footer info */}
      <div className="mt-8 text-center text-xs text-[#5a627a]">
        ReachInbox Software Development Intern Assignment &bull; Full-Stack Production System
      </div>
    </div>
  );
};
