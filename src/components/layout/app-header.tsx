"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import {
  Sun,
  Moon,
  SearchIcon,
  User,
  LogOut,
} from "lucide-react";
import { useAuth } from "@/providers/auth-provider";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { QuickSearch } from "@/components/search/quick-search";
import { InstanceSwitcher } from "./instance-switcher";

export function AppHeader() {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const { user, isAuthenticated, logout } = useAuth();
  const [searchOpen, setSearchOpen] = useState(false);

  // Global Cmd+K / Ctrl+K shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleLogout = async () => {
    await logout();
    router.push("/");
  };

  const userInitials = user?.display_name
    ? user.display_name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : user?.username?.slice(0, 2).toUpperCase() ?? "?";

  return (
    <>
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-background/60 px-3 backdrop-blur-sm">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mr-1 h-4" />
        <div className="flex flex-1 items-center gap-2">
          {isAuthenticated && (
            <span className="hidden text-[11px] tabular-nums text-muted-foreground sm:inline">
              <span className="text-primary">ak://</span>
              <span className="text-foreground/80">prod</span>
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            aria-label="Search (Cmd+K)"
            aria-keyshortcuts="Meta+K Control+K"
            className="hidden h-7 w-60 items-center gap-2 border border-border bg-card/40 px-2 text-[12px] text-muted-foreground hover:border-primary/60 hover:text-foreground sm:inline-flex"
          >
            <span aria-hidden className="text-primary">{">"}</span>
            <span>search…</span>
            <kbd
              aria-hidden
              className="pointer-events-none ml-auto inline-flex h-4 select-none items-center gap-0.5 border border-border px-1 text-[10px] text-muted-foreground"
            >
              <span>&#8984;</span>K
            </kbd>
          </button>
          <button
            type="button"
            className="inline-flex size-8 items-center justify-center text-muted-foreground hover:text-foreground sm:hidden"
            onClick={() => setSearchOpen(true)}
            aria-label="Search"
          >
            <SearchIcon className="size-4" />
          </button>

          <InstanceSwitcher />

          <button
            type="button"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="relative inline-flex size-8 items-center justify-center text-muted-foreground hover:text-foreground"
            aria-label="Toggle theme"
          >
            <Sun className="size-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
            <Moon className="absolute size-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
            <span className="sr-only">Toggle theme</span>
          </button>

          {isAuthenticated ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="inline-flex h-7 items-center gap-1.5 border border-border bg-card/30 px-2 text-[12px] hover:border-primary/60 hover:bg-card"
                  aria-label="User menu"
                >
                  <span className="text-primary">@</span>
                  <span className="max-w-[120px] truncate text-foreground/90">
                    {user?.username ?? user?.display_name ?? userInitials.toLowerCase()}
                  </span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <div className="px-2 py-1.5">
                  <p className="text-[12px]">
                    <span className="text-primary">@</span>
                    {user?.username ?? user?.display_name}
                  </p>
                  <p className="text-[11px] text-muted-foreground">{user?.email}</p>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => router.push("/profile")}>
                  <User className="mr-2 size-4" />
                  profile
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout} className="text-destructive">
                  <LogOut className="mr-2 size-4" />
                  logout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <button
              type="button"
              onClick={() => router.push("/login")}
              className="inline-flex h-7 items-center gap-1.5 border border-primary bg-primary/10 px-2.5 text-[12px] font-medium text-primary hover:bg-primary/20"
            >
              <span>{">"}</span>
              <span>sign in</span>
            </button>
          )}
        </div>
      </header>

      <QuickSearch open={searchOpen} onOpenChange={setSearchOpen} />
    </>
  );
}
