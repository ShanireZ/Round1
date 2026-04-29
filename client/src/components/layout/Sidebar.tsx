import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Menu } from "lucide-react";
import { NavLink } from "react-router";

import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { fetchAuthSession } from "@/lib/auth";
import { cn } from "@/lib/utils";
import {
  getNavigationSections,
  type NavigationRole,
  type NavItem,
  type NavSection,
} from "@/lib/navigation";

function useRoleNavigation(includeDev: boolean) {
  const sessionQuery = useQuery({
    queryKey: ["auth-session"],
    queryFn: fetchAuthSession,
    retry: false,
    staleTime: 60_000,
  });
  const role: NavigationRole =
    sessionQuery.data?.authenticated === true ? sessionQuery.data.user.role : null;

  return useMemo(() => getNavigationSections(role, includeDev), [includeDev, role]);
}

function SidebarSection({
  title,
  items,
  onNavigate,
}: {
  title: string;
  items: NavItem[];
  onNavigate?: () => void;
}) {
  return (
    <nav className="flex flex-col gap-1 px-3">
      <span className="text-muted-foreground mb-1 px-3 text-xs font-semibold tracking-wider uppercase">
        {title}
      </span>
      {items.map((item) => (
        <SidebarNavItem key={item.to} item={item} onNavigate={onNavigate} />
      ))}
    </nav>
  );
}

function SidebarNavItem({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  return (
    <NavLink
      to={item.to}
      end={item.to === "/admin"}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          "flex items-center gap-3 rounded-[var(--radius-md)] border-l-2 px-3 py-2 text-sm font-medium transition-colors duration-[var(--duration-fast)]",
          isActive
            ? "border-primary bg-accent-wash text-primary"
            : "text-muted-foreground hover:bg-subtle hover:text-foreground border-transparent",
        )
      }
    >
      <item.icon className="h-4 w-4 shrink-0" />
      <span>{item.label}</span>
    </NavLink>
  );
}

function NavigationSections({
  sections,
  onNavigate,
}: {
  sections: NavSection[];
  onNavigate?: () => void;
}) {
  return (
    <div className="space-y-6">
      {sections.map((section) => (
        <SidebarSection
          key={section.title}
          title={section.title}
          items={section.items}
          onNavigate={onNavigate}
        />
      ))}
    </div>
  );
}

export function Sidebar() {
  const sections = useRoleNavigation(import.meta.env.DEV);

  return (
    <aside className="border-border bg-surface hidden w-[var(--sidebar-width)] shrink-0 border-r md:block">
      <ScrollArea className="h-full py-4">
        <NavigationSections sections={sections} />
      </ScrollArea>
    </aside>
  );
}

export function MobileNavigation() {
  const [open, setOpen] = useState(false);
  const sections = useRoleNavigation(import.meta.env.DEV);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="md:hidden"
          aria-label="打开导航菜单"
          data-testid="mobile-navigation-trigger"
        >
          <Menu className="h-4 w-4" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-[min(88vw,22rem)] overflow-y-auto p-0">
        <SheetHeader className="border-border border-b px-6 py-5 text-left">
          <SheetTitle>Round1</SheetTitle>
          <SheetDescription className="sr-only">导航入口</SheetDescription>
        </SheetHeader>
        <ScrollArea className="h-[calc(100dvh-5.75rem)] py-4">
          <NavigationSections sections={sections} onNavigate={() => setOpen(false)} />
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
