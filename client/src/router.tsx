import { lazy, Suspense } from "react";
import type { ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router";

import { AppShell } from "./components/layout/AppShell";
import { AuthLayout } from "./components/layout/AuthLayout";
import { FocusLayout } from "./components/layout/FocusLayout";
import { GuestOnly, RequireRole } from "./components/layout/RouteGuards";

const AdminDashboard = lazy(() => import("./pages/admin/AdminDashboard"));
const AdminQuestionLibrary = lazy(() => import("./pages/admin/AdminQuestionLibrary"));
const AdminPaperLibrary = lazy(() => import("./pages/admin/AdminPaperLibrary"));
const AdminImports = lazy(() => import("./pages/admin/AdminImports"));
const AdminReviewQueue = lazy(() => import("./pages/admin/AdminReviewQueue"));
const AdminUsers = lazy(() => import("./pages/admin/AdminUsers"));
const AdminSettings = lazy(() => import("./pages/admin/AdminSettings"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const LoginPage = lazy(() => import("./pages/auth/LoginPage"));
const RegisterPage = lazy(() => import("./pages/auth/RegisterPage"));
const ForgotPasswordPage = lazy(() => import("./pages/auth/ForgotPasswordPage"));
const AuthCallbackPage = lazy(() => import("./pages/auth/AuthCallbackPage"));
const CompleteProfilePage = lazy(() => import("./pages/auth/CompleteProfilePage"));
const NotFoundPage = lazy(() => import("./pages/NotFoundPage"));
const AccountClassPage = lazy(() => import("./pages/account/AccountClassPage"));
const AccountSecurityPage = lazy(() => import("./pages/account/AccountSecurityPage"));
const CoachAssignments = lazy(() => import("./pages/coach/CoachAssignments"));
const CoachClassDetail = lazy(() => import("./pages/coach/CoachClassDetail"));
const CoachClasses = lazy(() => import("./pages/coach/CoachClasses"));
const CoachReport = lazy(() => import("./pages/coach/CoachReport"));
const ExamNewPage = lazy(() => import("./pages/exams/ExamNew"));
const RealPapersPage = lazy(() => import("./pages/exams/RealPapers"));
const ExamSessionPage = lazy(() => import("./pages/exams/ExamSession"));
const ExamResultPage = lazy(() => import("./pages/exams/ExamResult"));
const UIGallery = lazy(() => import("./pages/dev/UIGallery"));

function LoadingSpinner() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <div className="border-primary h-8 w-8 animate-spin rounded-full border-4 border-t-transparent" />
    </div>
  );
}

function studentPage(element: ReactNode) {
  return <RequireRole minimumRole="student">{element}</RequireRole>;
}

function coachPage(element: ReactNode) {
  return <RequireRole minimumRole="coach">{element}</RequireRole>;
}

function adminPage(element: ReactNode) {
  return <RequireRole minimumRole="admin">{element}</RequireRole>;
}

function guestPage(element: ReactNode) {
  return <GuestOnly>{element}</GuestOnly>;
}

export function AppRouter() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <Routes>
        <Route element={<AuthLayout />}>
          <Route path="/login" element={guestPage(<LoginPage />)} />
          <Route path="/register" element={guestPage(<RegisterPage />)} />
          <Route path="/forgot-password" element={guestPage(<ForgotPasswordPage />)} />
          <Route path="/auth/callback" element={<AuthCallbackPage />} />
          <Route path="/auth/complete-profile" element={<CompleteProfilePage />} />
        </Route>

        <Route element={<FocusLayout />}>
          <Route path="/exams/:id" element={studentPage(<ExamSessionPage />)} />
        </Route>

        <Route element={<AppShell />}>
          <Route path="/dashboard" element={studentPage(<Dashboard />)} />
          <Route path="/exams/new" element={studentPage(<ExamNewPage />)} />
          <Route path="/exams/real-papers" element={studentPage(<RealPapersPage />)} />
          <Route path="/exams/:id/result" element={studentPage(<ExamResultPage />)} />
          <Route path="/account/class" element={studentPage(<AccountClassPage />)} />
          <Route path="/account/security" element={studentPage(<AccountSecurityPage />)} />
          <Route path="/join" element={studentPage(<AccountClassPage focusJoin />)} />

          <Route path="/coach/classes" element={coachPage(<CoachClasses />)} />
          <Route path="/coach/classes/:id" element={coachPage(<CoachClassDetail />)} />
          <Route path="/coach/assignments" element={coachPage(<CoachAssignments />)} />
          <Route path="/coach/report" element={coachPage(<CoachReport />)} />

          <Route path="/admin" element={adminPage(<AdminDashboard />)} />
          <Route path="/admin/questions" element={adminPage(<AdminQuestionLibrary />)} />
          <Route path="/admin/papers" element={adminPage(<AdminPaperLibrary />)} />
          <Route path="/admin/imports" element={adminPage(<AdminImports />)} />
          <Route path="/admin/users" element={adminPage(<AdminUsers />)} />
          <Route path="/admin/review" element={adminPage(<AdminReviewQueue />)} />
          <Route path="/admin/settings" element={adminPage(<AdminSettings />)} />

          <Route path="/dev/ui-gallery" element={<UIGallery />} />
        </Route>

        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route
          path="*"
          element={
            <AuthLayout>
              <NotFoundPage />
            </AuthLayout>
          }
        />
      </Routes>
    </Suspense>
  );
}
