import { motion, AnimatePresence } from 'motion/react';

interface RespondingStateProps {
  isDark: boolean;
  transcription?: string;
  isComplete?: boolean;
}

export function RespondingState({ isDark, transcription = '', isComplete = false }: RespondingStateProps) {
  return (
    <div
      className="fixed inset-0 flex flex-col items-center justify-center"
      style={{
        background: isDark
          ? 'radial-gradient(circle at center, rgba(94, 159, 255, 0.05) 0%, transparent 50%)'
          : 'radial-gradient(circle at center, rgba(94, 159, 255, 0.035) 0%, transparent 50%)',
      }}
    >
      {/* Main Content Area - Centered Orb */}
      <div className="flex-1 flex items-center justify-center">
        <motion.div
          className="relative"
          initial={{ scale: 1, opacity: 0.92 }}
          animate={{
            scale: [1, 1.015, 1],
            opacity: [0.92, 0.96, 0.92],
          }}
          transition={{
            duration: 6,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        >
          {/* Responding Orb - Stable and warm */}
          <div className="relative w-32 h-32">
            {/* Outer warm glow - stable and soft */}
            <div
              className="absolute inset-0 rounded-full"
              style={{
                background: isDark
                  ? 'radial-gradient(circle, rgba(94, 159, 255, 0.45) 0%, transparent 65%)'
                  : 'radial-gradient(circle, rgba(94, 159, 255, 0.35) 0%, transparent 65%)',
                filter: 'blur(18px)',
              }}
            />

            {/* Middle glow layer - soft and supportive */}
            <div
              className="absolute inset-0 m-auto w-24 h-24 rounded-full"
              style={{
                background: isDark
                  ? 'radial-gradient(circle, rgba(94, 159, 255, 0.55) 0%, transparent 75%)'
                  : 'radial-gradient(circle, rgba(94, 159, 255, 0.45) 0%, transparent 75%)',
                filter: 'blur(12px)',
              }}
            />

            {/* Core orb - stable and warm */}
            <div
              className="absolute inset-0 m-auto w-20 h-20 rounded-full"
              style={{
                background: isDark
                  ? 'radial-gradient(circle, rgba(94, 159, 255, 0.8) 0%, rgba(94, 159, 255, 0.38) 100%)'
                  : 'radial-gradient(circle, rgba(94, 159, 255, 0.7) 0%, rgba(94, 159, 255, 0.32) 100%)',
                boxShadow: isDark
                  ? '0 0 36px rgba(94, 159, 255, 0.55), inset 0 0 18px rgba(94, 159, 255, 0.45)'
                  : '0 0 32px rgba(94, 159, 255, 0.45), inset 0 0 16px rgba(94, 159, 255, 0.38)',
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
          {/* Chunked transcription text with crossfade animation */}
          <AnimatePresence mode="wait">
            <motion.p
              key={transcription}
              initial={{ opacity: 0 }}
              animate={{ opacity: isComplete ? 0.35 : 1 }}
              exit={{ opacity: 0 }}
              transition={{
                duration: isComplete ? 0.8 : 0.5,
                ease: "easeInOut"
              }}
              className="text-base leading-relaxed"
              style={{
                color: isDark
                  ? 'rgba(235, 235, 245, 0.75)' // More prominent than listening
                  : 'rgba(60, 60, 67, 0.75)', // More prominent than listening
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
