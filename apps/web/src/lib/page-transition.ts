export interface PageTransitionOptions {
  rootName?: string;
  contentName?: string;
  headerName?: string;
  durationMs?: number;
  distancePx?: number;
  easingIn?: string;
  easingOut?: string;
}

const DEFAULT_OPTIONS: Required<PageTransitionOptions> = {
  rootName: 'root',
  contentName: 'page-content',
  headerName: 'site-header',
  durationMs: 240,
  distancePx: 10,
  easingIn: 'cubic-bezier(0.22, 1, 0.36, 1)',
  easingOut: 'cubic-bezier(0.4, 0, 1, 1)',
};

export function createPageTransitionStyles(
  options: PageTransitionOptions = {},
): string {
  const {
    rootName,
    contentName,
    headerName,
    durationMs,
    distancePx,
    easingIn,
    easingOut,
  } = {
    ...DEFAULT_OPTIONS,
    ...options,
  };

  return `
::view-transition-group(${rootName}) {
  z-index: 0;
}

::view-transition-group(${contentName}) {
  z-index: 10;
}

::view-transition-group(${headerName}) {
  z-index: 20;
}

::view-transition-old(${headerName}),
::view-transition-new(${headerName}) {
  animation: none;
  mix-blend-mode: normal;
}

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
