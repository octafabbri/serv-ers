import { motion } from 'motion/react';
import { ServiceRequest } from '../../types';

interface PDFReadyStateProps {
  isDark: boolean;
  serviceRequest: ServiceRequest;
  onDownload: () => void;
}

export function PDFReadyState({
  isDark,
  serviceRequest,
  onDownload
}: PDFReadyStateProps) {

  return (
    <div
      className="fixed inset-0 flex flex-col items-center justify-center"
      style={{
        background: isDark
          ? 'radial-gradient(circle at center, rgba(94, 159, 255, 0.05) 0%, transparent 50%)'
          : 'radial-gradient(circle at center, rgba(94, 159, 255, 0.04) 0%, transparent 50%)',
      }}
    >
      {/* Main Content Area - Centered Orb */}
      <div className="flex-1 flex items-center justify-center">
        <motion.div
          className="relative"
          initial={{ scale: 1, opacity: 0.7 }}
          animate={{
            scale: [1, 1.03, 1],
            opacity: [0.7, 0.85, 0.7],
          }}
          transition={{
            duration: 4.5,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        >
          {/* Dormant Orb - Back to calm state */}
          <div className="relative w-28 h-28">
            {/* Outer subtle glow */}
            <div
              className="absolute inset-0 rounded-full"
              style={{
                background: isDark
                  ? 'radial-gradient(circle, rgba(94, 159, 255, 0.5) 0%, transparent 70%)'
                  : 'radial-gradient(circle, rgba(94, 159, 255, 0.12) 0%, transparent 70%)',
                filter: 'blur(16px)',
              }}
            />

            {/* Core orb */}
            <div
              className="absolute inset-0 m-auto w-20 h-20 rounded-full"
              style={{
                background: isDark
                  ? 'radial-gradient(circle, rgba(94, 159, 255, 0.52) 0%, rgba(94, 159, 255, 0.12) 100%)'
                  : 'radial-gradient(circle, rgba(94, 159, 255, 0.42) 0%, rgba(94, 159, 255, 0.1) 100%)',
                boxShadow: isDark
                  ? '0 0 24px rgba(94, 159, 255, 0.32), inset 0 0 12px rgba(94, 159, 255, 0.15)'
                  : '0 0 20px rgba(94, 159, 255, 0.15), inset 0 0 10px rgba(94, 159, 255, 0.12)',
              }}
            />
          </div>
        </motion.div>
      </div>

      {/* Transcription Area - Lower Third */}
      <div
        className="w-full px-8 pb-16"
        style={{
          paddingBottom: 'max(env(safe-area-inset-bottom, 0px) + 140px, 140px)',
        }}
      >
        <div
          className="mx-auto text-center"
          style={{
            maxWidth: '640px',
            minHeight: '120px',
          }}
        >
          {/* Calm confirmation */}
          <p
            className="text-base leading-relaxed"
            style={{
              color: isDark
                ? 'rgba(235, 235, 245, 0.6)'
                : 'rgba(60, 60, 67, 0.6)',
              fontWeight: 'var(--font-weight-normal)',
              letterSpacing: '-0.01em',
            }}
          >
            Your document is ready
          </p>
        </div>
      </div>

      {/* Bottom Confirmation Surface - Slides up gently */}
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        transition={{
          duration: 0.5,
          ease: [0.32, 0.72, 0, 1], // iOS spring curve
        }}
        className="fixed left-0 right-0"
        style={{
          bottom: '140px', // Above BottomMenuBar (64px) + InputModeToggle (~48px) + spacing
          paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 0px)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* iOS System Material - Frosted glass effect */}
        <div
          style={{
            background: isDark
              ? 'rgba(28, 28, 30, 0.85)'
              : 'rgba(255, 255, 255, 0.85)',
            backdropFilter: 'blur(40px) saturate(180%)',
            WebkitBackdropFilter: 'blur(40px) saturate(180%)',
            borderTop: `0.5px solid ${isDark ? 'rgba(84, 84, 88, 0.6)' : 'rgba(60, 60, 67, 0.29)'}`,
            boxShadow: isDark
              ? '0 -8px 32px rgba(0, 0, 0, 0.4)'
              : '0 -8px 32px rgba(0, 0, 0, 0.08)',
          }}
        >
          {/* Content Container */}
          <div
            className="px-6 pt-5 pb-6"
            style={{
              maxWidth: '640px',
              margin: '0 auto',
            }}
          >
            {/* Document Info */}
            <div className="mb-4">
              {/* Document Title */}
              <h3
                className="mb-1"
                style={{
                  fontSize: '20px',
                  fontWeight: 'var(--font-weight-semibold)',
                  color: 'var(--label-primary)',
                  letterSpacing: '-0.02em',
                  lineHeight: '1.3',
                }}
              >
                Work Order {serviceRequest.id.slice(0, 8)}
              </h3>

              {/* File Type */}
              <p
                style={{
                  fontSize: '15px',
                  fontWeight: 'var(--font-weight-normal)',
                  color: 'var(--label-secondary)',
                  letterSpacing: '-0.01em',
                }}
              >
                PDF Document • {serviceRequest.urgency}
              </p>
            </div>

            {/* Primary Action Button - iOS style */}
            <button
              onClick={onDownload}
              style={{
                width: '100%',
                height: '50px',
                borderRadius: '12px',
                background: 'var(--accent-blue)',
                border: 'none',
                color: '#FFFFFF',
                fontSize: '17px',
                fontWeight: 'var(--font-weight-semibold)',
                letterSpacing: '-0.01em',
                cursor: 'pointer',
                transition: 'transform 0.1s ease, opacity 0.2s ease',
                boxShadow: isDark
                  ? '0 2px 8px rgba(94, 159, 255, 0.5)'
                  : '0 2px 8px rgba(94, 159, 255, 0.32)',
              }}
              onMouseDown={(e) => {
                e.currentTarget.style.transform = 'scale(0.98)';
              }}
              onMouseUp={(e) => {
                e.currentTarget.style.transform = 'scale(1)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'scale(1)';
              }}
            >
              Share Document
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
