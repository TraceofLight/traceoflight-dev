import * as React from "react";

import { cn } from "@/lib/utils";
import { mediaFrame } from "@/lib/ui/recipes";

type Aspect = "3/2" | "16/9" | "square";
type Props = React.HTMLAttributes<HTMLDivElement> & { aspect?: Aspect };

export const MediaFrame = React.forwardRef<HTMLDivElement, Props>(
  ({ aspect, className, ...rest }, ref) => (
    <div ref={ref} className={cn(mediaFrame({ aspect }), className)} {...rest} />
  ),
);
MediaFrame.displayName = "MediaFrame";
