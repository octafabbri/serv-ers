import { Mic, MessageSquare } from 'lucide-react';

interface InputModeToggleProps {
  isDark: boolean;
  mode: 'voice' | 'chat';
  onModeChange: (mode: 'voice' | 'chat') => void;
}

export function InputModeToggle({ isDark, mode, onModeChange }: InputModeToggleProps) {
  return (
    <div
      style={{
        position: 'fixed',
        bottom: '80px', // Above the 64px menu bar + 16px spacing
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 200,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Toggle Container */}
      <div
        style={{
          background: isDark
            ? 'rgba(28, 28, 30, 0.85)'
            : 'rgba(255, 255, 255, 0.85)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderRadius: '24px',
          border: `0.5px solid ${
            isDark ? 'rgba(84, 84, 88, 0.6)' : 'rgba(60, 60, 67, 0.29)'
          }`,
          padding: '4px',
          display: 'flex',
          gap: '4px',
          boxShadow: isDark
            ? '0 4px 16px rgba(0, 0, 0, 0.3)'
            : '0 4px 16px rgba(0, 0, 0, 0.1)',
        }}
      >
        {/* Voice Button */}
        <button
          onClick={() => onModeChange('voice')}
          style={{
            padding: '10px 16px',
            borderRadius: '20px',
            border: 'none',
            background: mode === 'voice' ? 'var(--accent-blue)' : 'transparent',
            color: mode === 'voice'
              ? '#FFFFFF'
              : isDark
                ? 'var(--label-secondary)'
                : 'rgba(60, 60, 67, 0.6)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '15px',
            fontWeight: 'var(--font-weight-semibold)',
            letterSpacing: '-0.01em',
            transition: 'all 0.2s ease',
            boxShadow: mode === 'voice'
              ? '0 2px 8px rgba(94, 159, 255, 0.3)'
              : 'none',
          }}
          onMouseDown={(e) => {
            e.currentTarget.style.transform = 'scale(0.95)';
          }}
          onMouseUp={(e) => {
            e.currentTarget.style.transform = 'scale(1)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'scale(1)';
          }}
        >
          <Mic size={18} strokeWidth={2.5} />
          <span>Voice</span>
        </button>

        {/* Chat Button */}
        <button
          onClick={() => onModeChange('chat')}
          style={{
            padding: '10px 16px',
            borderRadius: '20px',
            border: 'none',
            background: mode === 'chat' ? 'var(--accent-blue)' : 'transparent',
            color: mode === 'chat'
              ? '#FFFFFF'
              : isDark
                ? 'var(--label-secondary)'
                : 'rgba(60, 60, 67, 0.6)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '15px',
            fontWeight: 'var(--font-weight-semibold)',
            letterSpacing: '-0.01em',
            transition: 'all 0.2s ease',
            boxShadow: mode === 'chat'
              ? '0 2px 8px rgba(94, 159, 255, 0.3)'
              : 'none',
          }}
          onMouseDown={(e) => {
            e.currentTarget.style.transform = 'scale(0.95)';
          }}
          onMouseUp={(e) => {
            e.currentTarget.style.transform = 'scale(1)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'scale(1)';
          }}
        >
          <MessageSquare size={18} strokeWidth={2.5} />
          <span>Chat</span>
        </button>
      </div>
    </div>
  );
}
