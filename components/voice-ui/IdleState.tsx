import { motion } from 'motion/react';

interface IdleStateProps {
  isDark: boolean;
}

export function IdleState({ isDark }: IdleStateProps) {
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
          {/* Dormant Orb - Subtle with improved contrast */}
          <div className="relative w-28 h-28">
            {/* Outer subtle glow */}
            <div
              className="absolute inset-0 rounded-full"
              style={{
                background: isDark
                  ? 'radial-gradient(circle, rgba(94, 159, 255, 0.35) 0%, transparent 70%)'
                  : 'radial-gradient(circle, rgba(94, 159, 255, 0.25) 0%, transparent 70%)',
                filter: 'blur(16px)',
              }}
            />

            {/* Core orb */}
            <div
              className="absolute inset-0 m-auto w-20 h-20 rounded-full"
              style={{
                background: isDark
                  ? 'radial-gradient(circle, rgba(94, 159, 255, 0.65) 0%, rgba(94, 159, 255, 0.3) 100%)'
                  : 'radial-gradient(circle, rgba(94, 159, 255, 0.55) 0%, rgba(94, 159, 255, 0.25) 100%)',
                boxShadow: isDark
                  ? '0 0 32px rgba(94, 159, 255, 0.4), inset 0 0 16px rgba(94, 159, 255, 0.3)'
                  : '0 0 28px rgba(94, 159, 255, 0.35), inset 0 0 14px rgba(94, 159, 255, 0.25)',
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
          {/* Empty transcription text - secondary label color, SF Pro Regular */}
          <p
            className="text-base leading-relaxed"
            style={{
              color: 'var(--label-secondary)',
              fontWeight: 'var(--font-weight-normal)',
              letterSpacing: '-0.01em',
            }}
          >
            {/* Always-on transcription appears here */}
          </p>
        </div>
      </div>
    </div>
  );
}
