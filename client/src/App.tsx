import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router";

import { AppRouter } from "./router";
import { Toaster } from "./components/ui/sonner";
import { fetchAuthSession } from "./lib/auth";
import { fetchActiveAttempt } from "./lib/exam-runtime";

function shouldSkipActiveAttemptRedirect(pathname: string) {
  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/register") ||
    pathname.startsWith("/forgot-password") ||
    pathname.startsWith("/auth/")
  ) {
    return true;
  }

  if (/^\/exams\/[^/]+$/.test(pathname) || /^\/exams\/[^/]+\/result$/.test(pathname)) {
    return true;
  }

  return false;
}

function ActiveAttemptResumeGate() {
  const navigate = useNavigate();
  const location = useLocation();
  const skipActiveAttemptRedirect = shouldSkipActiveAttemptRedirect(location.pathname);
  const sessionQuery = useQuery({
    queryKey: ["auth-session"],
    queryFn: fetchAuthSession,
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: 30_000,
  });
  const activeAttemptQuery = useQuery({
    queryKey: ["active-attempt"],
    queryFn: fetchActiveAttempt,
    enabled: sessionQuery.data?.authenticated === true && !skipActiveAttemptRedirect,
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: 30_000,
  });

  useEffect(() => {
    const activeAttempt = activeAttemptQuery.data;
    if (!activeAttempt || skipActiveAttemptRedirect) {
      return;
    }

    navigate(activeAttempt.resumePath, { replace: true });
  }, [activeAttemptQuery.data, navigate, skipActiveAttemptRedirect]);

  return null;
}

export default function App() {
  return (
    <>
      <ActiveAttemptResumeGate />
      <AppRouter />
      <Toaster />
    </>
  );
}
