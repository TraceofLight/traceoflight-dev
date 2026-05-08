import * as React from "react";

import { cn } from "@/lib/utils";
import { field } from "@/lib/ui/recipes";

type Kind = "input" | "frame" | "display";
type Props = React.HTMLAttributes<HTMLDivElement> & { kind?: Kind };

export const Field = React.forwardRef<HTMLDivElement, Props>(
  ({ kind, className, ...rest }, ref) => (
    <div ref={ref} className={cn(field({ kind }), className)} {...rest} />
  ),
);
Field.displayName = "Field";
