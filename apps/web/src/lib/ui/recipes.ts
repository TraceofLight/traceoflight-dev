import { cva } from "class-variance-authority";

export const surface = cva(
  "border border-surface-border bg-surface text-card-foreground",
  {
    variants: {
      kind: {
        section: "rounded-[2.25rem] shadow-card",
        panel: "rounded-[1.75rem] shadow-card",
        card: "rounded-[2rem] shadow-card",
        media: "rounded-[2.5rem] shadow-card",
        empty: "rounded-3xl border-dashed shadow-card bg-surface-soft",
      },
      tone: {
        default: "",
        strong: "bg-surface-strong",
        soft: "bg-surface-soft",
      },
      interactive: {
        true: "transition duration-300 hover:-translate-y-2 hover:bg-surface-strong hover:shadow-card-hover",
        false: "",
      },
    },
    defaultVariants: {
      kind: "panel",
      tone: "default",
      interactive: false,
    },
  },
);

export const mediaFrame = cva(
  "media-load-frame relative overflow-hidden rounded-[1.5rem] bg-surface-soft",
  {
    variants: {
      aspect: {
        "3/2": "aspect-[3/2]",
        "16/9": "aspect-[16/9]",
        square: "aspect-square",
      },
    },
    defaultVariants: { aspect: "3/2" },
  },
);

const actionBase =
  "inline-flex select-none items-center gap-2 whitespace-nowrap font-medium transition-all disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

export const action = cva(actionBase, {
  variants: {
    variant: {
      primary:
        "rounded-full bg-primary text-primary-foreground shadow-pill hover:bg-primary/92",
      secondary:
        "rounded-full bg-surface text-secondary-foreground shadow-pill hover:bg-surface-strong",
      outline:
        "rounded-full border border-surface-border bg-surface text-foreground shadow-pill hover:bg-surface-strong",
      ghost:
        "rounded-full text-muted-foreground hover:bg-surface hover:text-foreground",
      link: "text-primary underline-offset-4 hover:underline",
      surface:
        "rounded-full border border-surface-border bg-surface-soft text-muted-foreground shadow-pill hover:-translate-y-0.5 hover:bg-surface-strong hover:text-foreground",
      primaryOutline:
        "rounded-full border border-info-soft bg-surface-strong text-primary shadow-pill hover:-translate-y-0.5 hover:border-info hover:bg-info-soft",
      dangerOutline:
        "rounded-full border border-destructive/50 bg-surface font-semibold text-destructive shadow-pill hover:-translate-y-0.5 hover:border-destructive hover:bg-destructive-soft",
      danger:
        "rounded-full bg-destructive text-destructive-foreground shadow-pill hover:opacity-92",
    },
    size: {
      sm: "h-9 px-4 text-xs",
      md: "h-10 px-5 py-2.5 text-sm",
      lg: "h-11 px-8 text-sm",
      icon: "h-10 w-10 justify-center",
      pill: "px-2.5 py-1 text-xs leading-none",
    },
  },
  defaultVariants: { variant: "primary", size: "md" },
});

export const pill = cva(
  "inline-flex select-none items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-medium uppercase tracking-[0.18em]",
  {
    variants: {
      active: {
        true: "border-surface-border bg-surface text-foreground shadow-pill",
        false:
          "border-surface-border bg-surface-soft text-muted-foreground shadow-pill",
      },
    },
    defaultVariants: { active: false },
  },
);

export const field = cva("border border-surface-border", {
  variants: {
    kind: {
      input: "flex h-11 w-full rounded-2xl bg-surface px-4 py-2 shadow-card",
      frame: "rounded-2xl bg-surface-strong p-1 shadow-card",
      display:
        "rounded-[1.25rem] bg-surface-soft px-4 py-3 text-sm text-muted-foreground",
    },
  },
  defaultVariants: { kind: "input" },
});

export const overlay = cva("", {
  variants: {
    kind: {
      popover:
        "relative z-50 max-h-96 min-w-[8rem] overflow-hidden rounded-[1.5rem] border border-surface-border bg-surface-strong text-popover-foreground shadow-modal backdrop-blur-xl",
      "modal-overlay": "fixed inset-0 z-50 bg-foreground/16 backdrop-blur-sm",
      "modal-surface":
        "border border-surface-border bg-surface-strong text-foreground shadow-modal backdrop-blur-xl",
      "modal-close":
        "absolute right-4 top-4 rounded-full border border-surface-border bg-surface p-1.5 opacity-70 shadow-pill transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
    },
  },
});

export const chip = cva(
  "inline-flex select-none items-center gap-2 rounded-full border border-surface-border bg-muted/88 font-medium text-muted-foreground",
  {
    variants: {
      size: {
        sm: "px-2.5 py-0.5 text-[0.72rem]",
        md: "px-2.5 py-1 text-xs",
        lg: "px-3 py-1.5 text-xs",
      },
    },
    defaultVariants: { size: "md" },
  },
);

export const statusBadge = cva(
  "inline-flex select-none items-center gap-2 rounded-full border",
  {
    variants: {
      tone: {
        neutral: "border-surface-border bg-surface-soft text-muted-foreground",
        success: "border-success/30 bg-success-soft text-success",
        warning: "border-warning/30 bg-warning-soft text-warning",
        danger: "border-destructive/30 bg-destructive/10 text-destructive",
        info: "border-info/30 bg-info-soft text-info",
      },
      size: {
        sm: "px-2.5 py-1 text-xs",
        md: "px-3 py-1.5 text-xs font-medium",
      },
    },
    defaultVariants: { tone: "neutral", size: "sm" },
  },
);

export type SurfaceProps = Parameters<typeof surface>[0] & {
  className?: string;
};
export type ActionProps = Parameters<typeof action>[0] & { className?: string };
