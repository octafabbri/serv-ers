import { motion, AnimatePresence } from 'motion/react';

interface UrgentResponseStateProps {
  isDark: boolean;
  transcription?: string;
}

export function UrgentResponseState({ isDark, transcription = '' }: UrgentResponseStateProps) {
  return (
    <div
      className="fixed inset-0 flex flex-col items-center justify-center"
      style={{
        background: isDark
          ? 'radial-gradient(circle at center, rgba(94, 159, 255, 0.08) 0%, transparent 50%)'
          : 'radial-gradient(circle at center, rgba(94, 159, 255, 0.06) 0%, transparent 50%)',
      }}
    >
      {/* Main Content Area - Centered Orb */}
      <div className="flex-1 flex items-center justify-center">
        <motion.div
          className="relative"
          initial={{ scale: 1, opacity: 1 }}
          animate={{
            scale: [1, 1.01, 1],
            opacity: [1, 1, 1],
          }}
          transition={{
            duration: 4,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        >
          {/* Urgent Response Orb - Enhanced clarity and presence */}
          <div className="relative w-32 h-32">
            {/* Outer glow - stronger and more present */}
            <div
              className="absolute inset-0 rounded-full"
              style={{
                background: isDark
                  ? 'radial-gradient(circle, rgba(94, 159, 255, 0.45) 0%, transparent 68%)'
                  : 'radial-gradient(circle, rgba(94, 159, 255, 0.52) 0%, transparent 68%)',
                filter: 'blur(18px)',
              }}
            />

            {/* Middle glow layer - enhanced */}
            <div
              className="absolute inset-0 m-auto w-24 h-24 rounded-full"
              style={{
                background: isDark
                  ? 'radial-gradient(circle, rgba(94, 159, 255, 0.55) 0%, transparent 75%)'
                  : 'radial-gradient(circle, rgba(94, 159, 255, 0.42) 0%, transparent 75%)',
                filter: 'blur(12px)',
              }}
            />

            {/* Core orb - high clarity and authority */}
            <div
              className="absolute inset-0 m-auto w-20 h-20 rounded-full"
              style={{
                background: isDark
                  ? 'radial-gradient(circle, rgba(94, 159, 255, 0.8) 0%, rgba(94, 159, 255, 0.52) 100%)'
                  : 'radial-gradient(circle, rgba(94, 159, 255, 0.7) 0%, rgba(94, 159, 255, 0.42) 100%)',
                boxShadow: isDark
                  ? '0 0 32px rgba(94, 159, 255, 0.68), inset 0 0 16px rgba(94, 159, 255, 0.4)'
                  : '0 0 28px rgba(94, 159, 255, 0.4), inset 0 0 14px rgba(94, 159, 255, 0.32)',
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
          {/* High-clarity directive transcription */}
          <AnimatePresence mode="wait">
            <motion.p
              key={transcription}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{
                duration: 0.35,
                ease: "easeInOut"
              }}
              className="text-base leading-relaxed"
              style={{
                color: isDark
                  ? 'rgba(235, 235, 245, 0.95)' // High contrast for clarity
                  : 'rgba(60, 60, 67, 0.92)', // High contrast for clarity
                fontWeight: 'var(--font-weight-medium)', // Medium weight for authority
                letterSpacing: '-0.01em',
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {transcription}
            </motion.p>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
