import { motion, AnimatePresence } from 'motion/react';

interface ListeningStateProps {
  isDark: boolean;
  transcription?: string;
}

export function ListeningState({ isDark, transcription = '' }: ListeningStateProps) {
  return (
    <div
      className="fixed inset-0 flex flex-col items-center justify-center"
      style={{
        background: isDark
          ? 'radial-gradient(circle at center, rgba(94, 159, 255, 0.06) 0%, transparent 50%)'
          : 'radial-gradient(circle at center, rgba(94, 159, 255, 0.04) 0%, transparent 50%)',
      }}
    >
      {/* Main Content Area - Centered Orb */}
      <div className="flex-1 flex items-center justify-center">
        <motion.div
          className="relative"
          initial={{ scale: 1, opacity: 0.85 }}
          animate={{
            scale: [1, 1.08, 1],
            opacity: [0.85, 1, 0.85],
          }}
          transition={{
            duration: 3,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        >
          {/* Listening Orb - Prominent electric blue glow */}
          <div className="relative w-32 h-32">
            {/* Outer glow - more prominent during listening */}
            <div
              className="absolute inset-0 rounded-full"
              style={{
                background: isDark
                  ? 'radial-gradient(circle, rgba(94, 159, 255, 0.5) 0%, transparent 70%)'
                  : 'radial-gradient(circle, rgba(94, 159, 255, 0.4) 0%, transparent 70%)',
                filter: 'blur(20px)',
              }}
            />

            {/* Middle glow layer */}
            <div
              className="absolute inset-0 m-auto w-24 h-24 rounded-full"
              style={{
                background: isDark
                  ? 'radial-gradient(circle, rgba(94, 159, 255, 0.6) 0%, transparent 80%)'
                  : 'radial-gradient(circle, rgba(94, 159, 255, 0.5) 0%, transparent 80%)',
                filter: 'blur(12px)',
              }}
            />

            {/* Core orb */}
            <div
              className="absolute inset-0 m-auto w-20 h-20 rounded-full"
              style={{
                background: isDark
                  ? 'radial-gradient(circle, rgba(94, 159, 255, 0.85) 0%, rgba(94, 159, 255, 0.4) 100%)'
                  : 'radial-gradient(circle, rgba(94, 159, 255, 0.75) 0%, rgba(94, 159, 255, 0.35) 100%)',
                boxShadow: isDark
                  ? '0 0 40px rgba(94, 159, 255, 0.6), inset 0 0 20px rgba(94, 159, 255, 0.5)'
                  : '0 0 36px rgba(94, 159, 255, 0.5), inset 0 0 18px rgba(94, 159, 255, 0.4)',
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
          {/* Transcription text with crossfade animation */}
          <AnimatePresence mode="wait">
            <motion.p
              key={transcription}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4, ease: "easeInOut" }}
              className="text-base leading-relaxed"
              style={{
                color: isDark
                  ? 'rgba(235, 235, 245, 0.5)' // Slightly dimmed in dark mode
                  : 'rgba(60, 60, 67, 0.5)', // Slightly dimmed in light mode
                fontWeight: 'var(--font-weight-normal)',
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
