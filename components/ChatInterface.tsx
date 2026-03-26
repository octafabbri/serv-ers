import { Send, Mic, Download } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { ServiceRequest } from '../types';
import { generateServiceRequestPDF, downloadPDF } from '../services/pdfService';

export interface ChatMessage {
  id: string;
  sender: 'user' | 'ai' | 'system';
  text: string;
  timestamp: Date;
  data?: any;
}

interface ChatInterfaceProps {
  isDark: boolean;
  messages: ChatMessage[];
  onSendMessage: (message: string) => void;
  onSwitchToVoice?: () => void;
  isAIResponding?: boolean;
}

export function ChatInterface({
  isDark,
  messages,
  onSendMessage,
  onSwitchToVoice,
  isAIResponding = false,
}: ChatInterfaceProps) {
  const [inputValue, setInputValue] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isAIResponding]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
    }
  }, [inputValue]);

  const handleSend = () => {
    if (!inputValue.trim()) return;
    onSendMessage(inputValue.trim());
    setInputValue('');
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Check if message is grouped with previous (same sender, within 1 minute)
  const isGrouped = (currentIndex: number): boolean => {
    if (currentIndex === 0) return false;
    const current = messages[currentIndex];
    const previous = messages[currentIndex - 1];

    // Don't group system messages
    if (current.sender === 'system' || previous.sender === 'system') return false;

    const timeDiff = current.timestamp.getTime() - previous.timestamp.getTime();
    return current.sender === previous.sender && timeDiff < 60000; // 1 minute
  };

  // Check if message is last in group
  const isLastInGroup = (currentIndex: number): boolean => {
    if (currentIndex === messages.length - 1) return true;
    const current = messages[currentIndex];
    const next = messages[currentIndex + 1];

    // System messages never group
    if (current.sender === 'system' || next.sender === 'system') return true;

    const timeDiff = next.timestamp.getTime() - current.timestamp.getTime();
    return current.sender !== next.sender || timeDiff >= 60000;
  };

  // Filter out system messages from display
  const displayMessages = messages.filter((msg) => msg.sender !== 'system');

  return (
    <div
      style={{
        height: '100vh',
        background: isDark
          ? 'linear-gradient(180deg, #000000 0%, #1C1C1E 100%)'
          : 'linear-gradient(180deg, #F2F2F7 0%, #FFFFFF 100%)',
        paddingTop: '80px',
        paddingBottom: '140px',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Messages Container */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          padding: '0 16px',
          paddingBottom: '80px', // Extra space above input bar to prevent overlap
          maxWidth: '640px',
          width: '100%',
          margin: '0 auto',
        }}
      >
        {displayMessages.map((message, index) => {
          const grouped = isGrouped(index);
          const lastInGroup = isLastInGroup(index);
          const isUser = message.sender === 'user';

          return (
            <div
              key={message.id}
              style={{
                display: 'flex',
                justifyContent: isUser ? 'flex-end' : 'flex-start',
                marginBottom: lastInGroup ? '16px' : '2px',
                marginTop: grouped ? '0' : '4px',
              }}
            >
              {/* Message Bubble */}
              <div
                style={{
                  maxWidth: '70%',
                  minWidth: '60px',
                  padding: '8px 12px',
                  borderRadius: '18px',
                  background: isUser
                    ? 'var(--accent-blue)'
                    : isDark
                      ? 'rgba(118, 118, 128, 0.24)'
                      : 'rgba(229, 229, 234, 1)',
                  boxShadow: '0 1px 2px rgba(0, 0, 0, 0.1)',
                }}
              >
                <p
                  style={{
                    margin: 0,
                    fontSize: '17px',
                    lineHeight: 1.35,
                    color: isUser
                      ? '#FFFFFF'
                      : isDark
                        ? 'rgba(255, 255, 255, 0.9)'
                        : '#000000',
                    fontWeight: 'var(--font-weight-normal)',
                    letterSpacing: '-0.01em',
                    wordWrap: 'break-word',
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {message.text}
                </p>

                {/* Download Work Order button for completed service requests */}
                {message.data && message.data.service_type && message.data.urgency && (
                  <button
                    onClick={async (e) => {
                      e.stopPropagation();
                      try {
                        const request = message.data as ServiceRequest;
                        const blob = await generateServiceRequestPDF(request);
                        const filename = `work-order-${request.urgency}-${request.id.slice(0, 8)}.pdf`;
                        downloadPDF(blob, filename);
                      } catch (error) {
                        console.error('PDF generation failed:', error);
                      }
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      width: '100%',
                      marginTop: '10px',
                      padding: '10px 16px',
                      borderRadius: '12px',
                      border: 'none',
                      background: 'var(--accent-blue)',
                      color: '#FFFFFF',
                      fontSize: '15px',
                      fontWeight: 'var(--font-weight-semibold)',
                      cursor: 'pointer',
                      transition: 'transform 0.1s ease',
                    }}
                    onMouseDown={(e) => {
                      e.currentTarget.style.transform = 'scale(0.97)';
                    }}
                    onMouseUp={(e) => {
                      e.currentTarget.style.transform = 'scale(1)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'scale(1)';
                    }}
                  >
                    <Download size={16} strokeWidth={2.5} />
                    Download Work Order
                  </button>
                )}
              </div>
            </div>
          );
        })}

        {/* Typing Indicator */}
        {isAIResponding && (
          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-start',
              marginBottom: '16px',
            }}
          >
            <div
              style={{
                padding: '12px 16px',
                borderRadius: '18px',
                background: isDark
                  ? 'rgba(118, 118, 128, 0.24)'
                  : 'rgba(229, 229, 234, 1)',
                boxShadow: '0 1px 2px rgba(0, 0, 0, 0.1)',
              }}
            >
              <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                <div
                  style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    background: isDark ? 'rgba(255, 255, 255, 0.5)' : 'rgba(0, 0, 0, 0.4)',
                    animation: 'pulse 1.4s ease-in-out infinite',
                  }}
                />
                <div
                  style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    background: isDark ? 'rgba(255, 255, 255, 0.5)' : 'rgba(0, 0, 0, 0.4)',
                    animation: 'pulse 1.4s ease-in-out 0.2s infinite',
                  }}
                />
                <div
                  style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    background: isDark ? 'rgba(255, 255, 255, 0.5)' : 'rgba(0, 0, 0, 0.4)',
                    animation: 'pulse 1.4s ease-in-out 0.4s infinite',
                  }}
                />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Container - Fixed at Bottom */}
      <div
        style={{
          position: 'fixed',
          bottom: '144px', // Above menu bar (64px) + toggle (48px) + spacing (32px)
          left: 0,
          right: 0,
          padding: '12px 16px',
          paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 12px)',
          pointerEvents: 'none',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            maxWidth: '640px',
            margin: '0 auto',
            background: isDark
              ? 'rgba(28, 28, 30, 0.85)'
              : 'rgba(255, 255, 255, 0.85)',
            backdropFilter: 'blur(40px)',
            WebkitBackdropFilter: 'blur(40px)',
            borderRadius: '24px',
            border: `0.5px solid ${
              isDark ? 'rgba(84, 84, 88, 0.6)' : 'rgba(60, 60, 67, 0.29)'
            }`,
            padding: '8px',
            display: 'flex',
            alignItems: 'flex-end',
            gap: '8px',
            pointerEvents: 'auto',
            boxShadow: isDark
              ? '0 4px 24px rgba(0, 0, 0, 0.4)'
              : '0 4px 24px rgba(0, 0, 0, 0.1)',
          }}
        >
          {/* Voice Button */}
          <button
            onClick={onSwitchToVoice}
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              border: 'none',
              background: isDark
                ? 'rgba(84, 84, 88, 0.4)'
                : 'rgba(60, 60, 67, 0.1)',
              color: 'var(--label-secondary)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              transition: 'all 0.2s ease',
            }}
            onMouseDown={(e) => {
              e.currentTarget.style.transform = 'scale(0.9)';
            }}
            onMouseUp={(e) => {
              e.currentTarget.style.transform = 'scale(1)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'scale(1)';
            }}
          >
            <Mic size={20} strokeWidth={2.5} />
          </button>

          {/* Text Input */}
          <textarea
            ref={textareaRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Message..."
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: isDark ? 'var(--label-primary)' : '#000000',
              fontSize: '17px',
              fontWeight: 'var(--font-weight-normal)',
              letterSpacing: '-0.01em',
              resize: 'none',
              maxHeight: '100px',
              minHeight: '24px',
              padding: '8px 0',
              fontFamily: 'system-ui, -apple-system, sans-serif',
              overflow: 'hidden',
            }}
            rows={1}
          />

          {/* Send Button */}
          <button
            onClick={handleSend}
            disabled={!inputValue.trim()}
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              border: 'none',
              background: inputValue.trim()
                ? 'var(--accent-blue)'
                : isDark
                  ? 'rgba(84, 84, 88, 0.4)'
                  : 'rgba(60, 60, 67, 0.1)',
              color: inputValue.trim() ? '#FFFFFF' : 'var(--label-tertiary)',
              cursor: inputValue.trim() ? 'pointer' : 'not-allowed',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              transition: 'all 0.2s ease',
              boxShadow: inputValue.trim()
                ? '0 2px 8px rgba(94, 159, 255, 0.3)'
                : 'none',
            }}
            onMouseDown={(e) => {
              if (inputValue.trim()) {
                e.currentTarget.style.transform = 'scale(0.9)';
              }
            }}
            onMouseUp={(e) => {
              e.currentTarget.style.transform = 'scale(1)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'scale(1)';
            }}
          >
            <Send size={20} strokeWidth={2.5} />
          </button>
        </div>
      </div>

      {/* CSS for typing animation */}
      <style>{`
        @keyframes pulse {
          0%, 60%, 100% {
            opacity: 0.3;
            transform: scale(0.8);
          }
          30% {
            opacity: 1;
            transform: scale(1);
          }
        }
      `}</style>
    </div>
  );
}
