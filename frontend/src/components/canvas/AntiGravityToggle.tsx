import React, { useEffect } from 'react';
import { Sparkles, Maximize2 } from 'lucide-react';

interface AntiGravityToggleProps {
  isAntiGravity: boolean;
  onToggle: (enabled: boolean) => void;
}

export const AntiGravityToggle: React.FC<AntiGravityToggleProps> = ({
  isAntiGravity,
  onToggle,
}) => {
  // Listen for Alt+G keyboard shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && (e.key === 'g' || e.key === 'G' || e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        onToggle(!isAntiGravity);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isAntiGravity, onToggle]);

  return (
    <button
      onClick={() => onToggle(!isAntiGravity)}
      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all cursor-pointer shadow-sm ${
        isAntiGravity
          ? 'bg-gradient-to-r from-indigo-500/20 to-purple-500/20 text-indigo-300 border-indigo-500/40 shadow-indigo-500/10'
          : 'bg-[#161a27] text-[#9ca3af] border-[#262c3e] hover:bg-[#1f2537] hover:text-white'
      }`}
      title="Toggle between Physics Anti-Gravity Canvas and Zen Mode (Alt+G)"
    >
      {isAntiGravity ? (
        <>
          <Sparkles className="w-3.5 h-3.5 text-indigo-400 animate-pulse" />
          <span>Anti-Gravity (Alt+G)</span>
        </>
      ) : (
        <>
          <Maximize2 className="w-3.5 h-3.5 text-[#8c93a8]" />
          <span>Zen Grid (Alt+G)</span>
        </>
      )}
    </button>
  );
};
