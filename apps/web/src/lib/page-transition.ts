export interface PageTransitionOptions {
  rootName?: string;
  durationMs?: number;
  distancePx?: number;
  easingIn?: string;
  easingOut?: string;
}

const DEFAULT_OPTIONS: Required<PageTransitionOptions> = {
  rootName: 'root',
  durationMs: 240,
  distancePx: 10,
  easingIn: 'cubic-bezier(0.22, 1, 0.36, 1)',
  easingOut: 'cubic-bezier(0.4, 0, 1, 1)',
};

export function createPageTransitionStyles(
  options: PageTransitionOptions = {},
): string {
  const { rootName, durationMs, distancePx, easingIn, easingOut } = {
    ...DEFAULT_OPTIONS,
    ...options,
  };

  return `
@media (prefers-reduced-motion: no-preference) {
  @keyframes tol-fade-slide-in {
    from {
      opacity: 0;
      transform: translateY(${distancePx}px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @keyframes tol-fade-slide-out {
    from {
      opacity: 1;
      transform: translateY(0);
    }
    to {
      opacity: 0;
      transform: translateY(-${distancePx}px);
    }
  }

  ::view-transition-old(${rootName}) {
    animation: tol-fade-slide-out ${durationMs}ms ${easingOut} both;
  }

  ::view-transition-new(${rootName}) {
    animation: tol-fade-slide-in ${durationMs}ms ${easingIn} both;
  }
}

@media (prefers-reduced-motion: reduce) {
  ::view-transition-old(${rootName}),
  ::view-transition-new(${rootName}) {
    animation: none;
  }
}
`;
}
