import { MenuIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

type NavItem = {
  href: string;
  label: string;
};

type MobileNavSheetProps = {
  items: readonly NavItem[];
  isAdminViewer: boolean;
};

export default function MobileNavSheet({
  items,
  isAdminViewer,
}: MobileNavSheetProps) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button aria-label="Open navigation" size="icon" variant="outline">
          <MenuIcon className="h-4 w-4" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-[min(22rem,calc(100vw-1.5rem))] p-5">
        <nav className="mt-2 flex flex-col gap-1.5" aria-label="Mobile navigation">
          {items.map((item) => (
            <a
              key={item.href}
              className="rounded-2xl px-4 py-3 text-base font-medium text-foreground transition-all duration-200 hover:bg-white/84 hover:shadow-[0_8px_24px_rgba(15,23,42,0.08)]"
              href={item.href}
            >
              {item.label}
            </a>
          ))}
          {isAdminViewer ? (
            <form action="/internal-api/auth/logout?next=/" className="pt-3" method="POST">
              <Button className="w-full justify-center" type="submit" variant="outline">
                Logout
              </Button>
            </form>
          ) : null}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
