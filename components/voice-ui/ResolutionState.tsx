import { motion } from 'motion/react';

interface ResolutionStateProps {
  isDark: boolean;
}

export function ResolutionState({ isDark }: ResolutionStateProps) {
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
          {/* Dormant Orb - Back to idle state */}
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
          {/* Empty transcription - faded to nothing */}
          <motion.p
            initial={{ opacity: 0.35 }}
            animate={{ opacity: 0 }}
            transition={{ duration: 1.2, ease: "easeOut" }}
            className="text-base leading-relaxed"
            style={{
              color: 'var(--label-secondary)',
              fontWeight: 'var(--font-weight-normal)',
              letterSpacing: '-0.01em',
            }}
          >
            {/* No prompts, no follow-up questions */}
          </motion.p>
        </div>
      </div>
    </div>
  );
}
