import { Routes, Route, Navigate } from "react-router";
import { lazy, Suspense } from "react";
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
const CoachAssignments = lazy(() => import("./pages/coach/CoachAssignments"));
const CoachClasses = lazy(() => import("./pages/coach/CoachClasses"));
const CoachReport = lazy(() => import("./pages/coach/CoachReport"));
const ExamNewPage = lazy(() => import("./pages/exams/ExamNew"));
const ExamSessionPage = lazy(() => import("./pages/exams/ExamSession"));
const ExamResultPage = lazy(() => import("./pages/exams/ExamResult"));

const UIGallery = lazy(() => import("./pages/dev/UIGallery"));

function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <div className="text-center">
        <h1 className="text-foreground text-3xl font-bold">{title}</h1>
        <p className="text-muted-foreground mt-2">页面开发中...</p>
      </div>
    </div>
  );
}

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
          <Route path="/register" element={<PlaceholderPage title="注册" />} />
          <Route path="/forgot-password" element={<PlaceholderPage title="找回密码" />} />
          <Route path="/auth/callback" element={<PlaceholderPage title="认证回调" />} />
        </Route>

        <Route element={<FocusLayout />}>
          <Route path="/exams/:id" element={<ExamSessionPage />} />
        </Route>

        <Route element={<AppShell />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/exams/new" element={<ExamNewPage />} />
          <Route path="/exams/:id/result" element={<ExamResultPage />} />
          <Route path="/account/class" element={<PlaceholderPage title="我的班级" />} />
          <Route path="/account/security" element={<PlaceholderPage title="账号安全" />} />
          <Route path="/join" element={<PlaceholderPage title="加入班级" />} />

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
        <Route path="*" element={<PlaceholderPage title="404 - 页面不存在" />} />
      </Routes>
    </Suspense>
  );
}
