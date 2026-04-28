import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router";

import { AppShell } from "./components/layout/AppShell";
import { AuthLayout } from "./components/layout/AuthLayout";
import { FocusLayout } from "./components/layout/FocusLayout";

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
const CoachClasses = lazy(() => import("./pages/coach/CoachClasses"));
const CoachReport = lazy(() => import("./pages/coach/CoachReport"));
const ExamNewPage = lazy(() => import("./pages/exams/ExamNew"));
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

export function AppRouter() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <Routes>
        <Route element={<AuthLayout />}>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/auth/callback" element={<AuthCallbackPage />} />
          <Route path="/auth/complete-profile" element={<CompleteProfilePage />} />
        </Route>

        <Route element={<FocusLayout />}>
          <Route path="/exams/:id" element={<ExamSessionPage />} />
        </Route>

        <Route element={<AppShell />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/exams/new" element={<ExamNewPage />} />
          <Route path="/exams/:id/result" element={<ExamResultPage />} />
          <Route path="/account/class" element={<AccountClassPage />} />
          <Route path="/account/security" element={<AccountSecurityPage />} />
          <Route path="/join" element={<AccountClassPage focusJoin />} />

          <Route path="/coach/classes" element={<CoachClasses />} />
          <Route path="/coach/classes/:id" element={<CoachClasses />} />
          <Route path="/coach/assignments" element={<CoachAssignments />} />
          <Route path="/coach/report" element={<CoachReport />} />

          <Route path="/admin" element={<AdminDashboard />} />
          <Route path="/admin/questions" element={<AdminQuestionLibrary />} />
          <Route path="/admin/papers" element={<AdminPaperLibrary />} />
          <Route path="/admin/imports" element={<AdminImports />} />
          <Route path="/admin/users" element={<AdminUsers />} />
          <Route path="/admin/review" element={<AdminReviewQueue />} />
          <Route path="/admin/settings" element={<AdminSettings />} />

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
