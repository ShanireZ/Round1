/**
 * Motion presets for the motion (framer-motion v12+) library.
 * Import these as variants or transition configs.
 */

export const DURATION = {
  instant: 0.075,
  fast: 0.15,
  normal: 0.25,
  slow: 0.4,
  deliberate: 0.6,
  page: 0.6,
  ceremony: 1.5,
} as const;

export const EASE = {
  standard: [0.4, 0, 0.2, 1] as const,
  enter: [0, 0, 0.2, 1] as const,
  exit: [0.4, 0, 1, 1] as const,
  springCurve: [0.34, 1.56, 0.64, 1.0] as const,
  ceremony: [0.16, 1, 0.3, 1] as const,
  default: [0.4, 0, 0.2, 1] as const,
  bounce: [0.34, 1.56, 0.64, 1.0] as const,
  spring: { type: "spring" as const, stiffness: 300, damping: 24 },
};

export type MotionIntensity = "none" | "subtle" | "live" | "ceremony";

export function resolveMotionIntensity(
  intensity: MotionIntensity,
  prefersReducedMotion: boolean,
): MotionIntensity {
  if (!prefersReducedMotion) {
    return intensity;
  }

  return intensity === "none" ? "none" : "subtle";
}

/** Page‑level enter / exit */
export const pageTransition = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: { duration: DURATION.page, ease: EASE.standard } },
  exit: { opacity: 0, y: -8, transition: { duration: DURATION.normal, ease: EASE.exit } },
};

/** Scale-in for modals / dialogs */
export const scaleIn = {
  initial: { opacity: 0, scale: 0.96 },
  animate: { opacity: 1, scale: 1, transition: { duration: DURATION.normal, ease: EASE.enter } },
  exit: { opacity: 0, scale: 0.96, transition: { duration: DURATION.fast } },
};

/** Slide up for bottom sheets / toasts */
export const slideUp = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0, transition: { duration: DURATION.normal, ease: EASE.enter } },
  exit: { opacity: 0, y: 16, transition: { duration: DURATION.fast } },
};

/** Stagger children in a list */
export const staggerContainer = {
  animate: {
    transition: {
      staggerChildren: 0.05,
    },
  },
};

export const staggerItem = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: { duration: DURATION.normal, ease: EASE.enter } },
};

/** Fade only, no transform */
export const fadeOnly = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: DURATION.normal } },
  exit: { opacity: 0, transition: { duration: DURATION.fast } },
};
