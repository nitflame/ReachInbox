import React from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { EmailProvider } from './context/EmailContext';
import { LoginPage } from './pages/LoginPage';
import { DashboardShell } from './components/DashboardShell';

const MainApp: React.FC = () => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0b0c10] flex flex-col justify-center items-center">
        <span className="w-8 h-8 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin mb-4" />
        <p className="text-xs text-[#71788e]">Verifying authentication...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  return <DashboardShell />;
};

export function App() {
  return (
    <AuthProvider>
      <EmailProvider>
        <MainApp />
      </EmailProvider>
    </AuthProvider>
  );
}

export default App;
