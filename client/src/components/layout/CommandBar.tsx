import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Monitor, Moon, Search, Sun } from "lucide-react";
import { useNavigate } from "react-router";

import { Button } from "@/components/ui/button";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { fetchAuthSession } from "@/lib/auth";
import {
  adminNavItems,
  canSeeAdminNav,
  canSeeCoachNav,
  coachNavItems,
  devNavItems,
  primaryNavItems,
  type NavItem,
} from "@/lib/navigation";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

type CommandGroupItem = NavItem & {
  group: "primary" | "coach" | "admin" | "dev";
};

function CommandNavItem({
  item,
  onSelect,
}: {
  item: CommandGroupItem;
  onSelect: (to: string) => void;
}) {
  return (
    <CommandItem
      value={`${item.label} ${item.description ?? ""} ${item.to}`}
      onSelect={() => onSelect(item.to)}
    >
      <item.icon className="text-muted-foreground h-4 w-4" />
      <div className="min-w-0">
        <div className="truncate text-sm font-medium">{item.label}</div>
        {item.description ? (
          <div className="text-muted-foreground truncate text-xs">{item.description}</div>
        ) : null}
      </div>
    </CommandItem>
  );
}

export function CommandBar() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  const sessionQuery = useQuery({
    queryKey: ["auth-session"],
    queryFn: fetchAuthSession,
    retry: false,
    staleTime: 60_000,
  });
  const role = sessionQuery.data?.authenticated === true ? sessionQuery.data.user.role : null;

  const navGroups = useMemo(() => {
    const items: CommandGroupItem[] = [
      ...primaryNavItems.map((item) => ({ ...item, group: "primary" as const })),
    ];

    if (canSeeCoachNav(role)) {
      items.push(...coachNavItems.map((item) => ({ ...item, group: "coach" as const })));
    }

    if (canSeeAdminNav(role)) {
      items.push(...adminNavItems.map((item) => ({ ...item, group: "admin" as const })));
    }

    if (import.meta.env.DEV) {
      items.push(...devNavItems.map((item) => ({ ...item, group: "dev" as const })));
    }

    return {
      primary: items.filter((item) => item.group === "primary"),
      coach: items.filter((item) => item.group === "coach"),
      admin: items.filter((item) => item.group === "admin"),
      dev: items.filter((item) => item.group === "dev"),
    };
  }, [role]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((current) => !current);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  function runCommand(action: () => void) {
    setOpen(false);
    window.requestAnimationFrame(action);
  }

  function navigateTo(to: string) {
    runCommand(() => navigate(to));
  }

  const themeCommands = [
    { label: "浅色主题", value: "theme light", icon: Sun, theme: "light" as const },
    { label: "深色主题", value: "theme dark", icon: Moon, theme: "dark" as const },
    { label: "跟随系统", value: "theme system", icon: Monitor, theme: "system" as const },
  ];

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="text-muted-foreground hidden min-w-28 justify-start sm:inline-flex"
        aria-label="打开命令面板"
        onClick={() => setOpen(true)}
      >
        <Search />
        <span>命令</span>
      </Button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="搜索页面、操作或主题" />
        <CommandList className="max-h-[min(70vh,460px)]">
          <CommandEmpty>没有匹配项</CommandEmpty>

          <CommandGroup heading="主导航">
            {navGroups.primary.map((item) => (
              <CommandNavItem key={item.to} item={item} onSelect={navigateTo} />
            ))}
          </CommandGroup>

          {navGroups.coach.length > 0 ? (
            <>
              <CommandSeparator />
              <CommandGroup heading="教练">
                {navGroups.coach.map((item) => (
                  <CommandNavItem key={item.to} item={item} onSelect={navigateTo} />
                ))}
              </CommandGroup>
            </>
          ) : null}

          {navGroups.admin.length > 0 ? (
            <>
              <CommandSeparator />
              <CommandGroup heading="管理">
                {navGroups.admin.map((item) => (
                  <CommandNavItem key={item.to} item={item} onSelect={navigateTo} />
                ))}
              </CommandGroup>
            </>
          ) : null}

          <CommandSeparator />
          <CommandGroup heading="主题">
            {themeCommands.map((item) => (
              <CommandItem
                key={item.theme}
                value={item.value}
                onSelect={() => runCommand(() => setTheme(item.theme))}
              >
                <item.icon className="text-muted-foreground h-4 w-4" />
                <span className="text-sm">{item.label}</span>
                <Check
                  className={cn(
                    "text-primary ml-auto h-4 w-4",
                    theme === item.theme ? "opacity-100" : "opacity-0",
                  )}
                />
              </CommandItem>
            ))}
          </CommandGroup>

          {navGroups.dev.length > 0 ? (
            <>
              <CommandSeparator />
              <CommandGroup heading="开发验收">
                {navGroups.dev.map((item) => (
                  <CommandNavItem key={item.to} item={item} onSelect={navigateTo} />
                ))}
              </CommandGroup>
            </>
          ) : null}
        </CommandList>
      </CommandDialog>
    </>
  );
}
