import { motion } from 'motion/react';

interface PDFGeneratingStateProps {
  isDark: boolean;
  documentName?: string;
}

export function PDFGeneratingState({ isDark, documentName = 'Document' }: PDFGeneratingStateProps) {
  return (
    <div
      className="fixed inset-0 flex flex-col items-center justify-center"
      style={{
        background: isDark
          ? 'radial-gradient(circle at center, rgba(94, 159, 255, 0.04) 0%, transparent 50%)'
          : 'radial-gradient(circle at center, rgba(94, 159, 255, 0.05) 0%, transparent 50%)',
      }}
    >
      {/* Main Content Area - Centered Orb */}
      <div className="flex-1 flex items-center justify-center">
        <motion.div
          className="relative"
          initial={{ scale: 1, opacity: 0.9 }}
          animate={{
            scale: [1, 1.02, 1],
            opacity: [0.9, 0.95, 0.9],
          }}
          transition={{
            duration: 5.5,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        >
          {/* Processing Orb - Focused and stable */}
          <div className="relative w-32 h-32">
            {/* Outer glow - reduced radius for focused appearance */}
            <div
              className="absolute inset-0 rounded-full"
              style={{
                background: isDark
                  ? 'radial-gradient(circle, rgba(94, 159, 255, 0.42) 0%, transparent 60%)'
                  : 'radial-gradient(circle, rgba(94, 159, 255, 0.32) 0%, transparent 60%)',
                filter: 'blur(14px)',
              }}
            />

            {/* Middle glow layer - tighter */}
            <div
              className="absolute inset-0 m-auto w-22 h-22 rounded-full"
              style={{
                background: isDark
                  ? 'radial-gradient(circle, rgba(94, 159, 255, 0.52) 0%, transparent 70%)'
                  : 'radial-gradient(circle, rgba(94, 159, 255, 0.42) 0%, transparent 70%)',
                filter: 'blur(10px)',
              }}
            />

            {/* Core orb - concentrated */}
            <div
              className="absolute inset-0 m-auto w-20 h-20 rounded-full"
              style={{
                background: isDark
                  ? 'radial-gradient(circle, rgba(94, 159, 255, 0.78) 0%, rgba(94, 159, 255, 0.36) 100%)'
                  : 'radial-gradient(circle, rgba(94, 159, 255, 0.68) 0%, rgba(94, 159, 255, 0.5) 100%)',
                boxShadow: isDark
                  ? '0 0 20px rgba(94, 159, 255, 0.5), inset 0 0 12px rgba(94, 159, 255, 0.4)'
                  : '0 0 18px rgba(94, 159, 255, 0.4), inset 0 0 10px rgba(94, 159, 255, 0.32)',
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
          {/* Calm statement about document preparation */}
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
            Preparing your document
          </p>
        </div>
      </div>
    </div>
  );
}
