import React from 'react'
import ReactDOM from 'react-dom/client'
import { Navigate, RouterProvider, createBrowserRouter } from "react-router-dom";
import App from './App.tsx'
import './index.css'
import { Suspense, lazy } from "react";

import NotFound from "./screens/notFound";
import Loader from './components/loader/loader.tsx';
import { AuthProvider, useAuth } from './screens/Auth/AuthContext.tsx';
import ProtectedRoute from './screens/Auth/ProtectedRoute.tsx';
import AdminRoute from './screens/Auth/AdminRoute.tsx';
import GuestRoute from './screens/Auth/GuestRoute.tsx';
import { getHomePath } from './screens/Auth/roles.ts';
import { ThemeProvider } from './components/theme-provider.tsx';

const Page1 = lazy(() =>
  wait(1300).then(() => import("./screens/page1.tsx"))
);

const Page2 = lazy(() =>
  wait(1300).then(() => import("./screens/page2.tsx"))
);

const Login = lazy(() => import("./screens/Auth/login.tsx"));
const Register = lazy(() => import("./screens/Auth/Register.tsx"));

// ── User pages (eTM) ────────────────────────────────────────────────────
const UserDashboard  = lazy(() => import("./screens/User/Dashboard.tsx"));
const UserAddTask    = lazy(() => import("./screens/User/AddTask.tsx"));
const UserAllTasks   = lazy(() => import("./screens/User/AllTasks.tsx"));
const UserReports    = lazy(() => import("./screens/User/Reports.tsx"));
const UserHowTo      = lazy(() => import("./screens/User/HowTo.tsx"));
const UserCalendar   = lazy(() => import("./screens/User/Calendar.tsx"));
const UserTaskDetails = lazy(() => import("./screens/User/TaskDetailsPage.tsx"));
const UserDocuments  = lazy(() => import("./screens/User/Documents.tsx"));
const UserProfile    = lazy(() => import("./screens/User/Profile.tsx"));
const UserTemplates  = lazy(() => import("./screens/User/Templates.tsx"));
const UserQuickLinks = lazy(() => import("./screens/User/QuickLinks.tsx"));

// ── Admin pages (eTM) ────────────────────────────────────────────────────
const AdminDashboard   = lazy(() => import("./screens/Admin/Dashboard.tsx"));
const AdminAddTask     = lazy(() => import("./screens/Admin/AddTask.tsx"));
const AdminTasks       = lazy(() => import("./screens/Admin/Tasks.tsx"));
const AdminTaskDetails = lazy(() => import("./screens/Admin/TaskDetailsPage.tsx"));
const AdminTemplates   = lazy(() => import("./screens/Admin/Templates.tsx"));
const AdminQuickLinks  = lazy(() => import("./screens/Admin/QuickLinks.tsx"));
const AdminProfile     = lazy(() => import("./screens/Admin/Profile.tsx"));

// Sends "/" to the right place: dashboard if logged in, login otherwise.
const Home = () => {
  const { user, isAuthenticated, isLoading } = useAuth();
  if (isLoading) return <Loader />;
  return (
    <Navigate
      to={isAuthenticated ? getHomePath(user) : "/etms/login"}
      replace
    />
  );
};

const router = createBrowserRouter([
  // ── Auth pages (no navbar) — redirect away if already logged in ────────
  {
    path: "/etms/login",
    element: (
      <GuestRoute>
        <Suspense fallback={<Loader />}>
          <Login />
        </Suspense>
      </GuestRoute>
    ),
  },
  {
    path: "/etms/register",
    element: (
      <GuestRoute>
        <Suspense fallback={<Loader />}>
          <Register />
        </Suspense>
      </GuestRoute>
    ),
  },

  // ── User pages — any authenticated user ────────────────
  {
    path: "/etms/dashboard",
    element: <ProtectedRoute><Suspense fallback={<Loader />}><UserDashboard /></Suspense></ProtectedRoute>,
  },
  {
    path: "/etms/user/dashboard",
    element: <Navigate to="/etms/dashboard" replace />,
  },
  {
    path: "/etms/tasks/new",
    element: <ProtectedRoute><Suspense fallback={<Loader />}><UserAddTask /></Suspense></ProtectedRoute>,
  },
  {
    path: "/etms/tasks",
    element: <ProtectedRoute><Suspense fallback={<Loader />}><UserAllTasks /></Suspense></ProtectedRoute>,
  },
  {
    path: "/etms/templates",
    element: <ProtectedRoute><Suspense fallback={<Loader />}><UserTemplates /></Suspense></ProtectedRoute>,
  },
  {
    path: "/etms/quick-links",
    element: <ProtectedRoute><Suspense fallback={<Loader />}><UserQuickLinks /></Suspense></ProtectedRoute>,
  },
  {
    path: "/etms/reports",
    element: <ProtectedRoute><Suspense fallback={<Loader />}><UserReports /></Suspense></ProtectedRoute>,
  },
  {
    path: "/etms/how-to",
    element: <ProtectedRoute><Suspense fallback={<Loader />}><UserHowTo /></Suspense></ProtectedRoute>,
  },
  {
    path: "/etms/calendar",
    element: <ProtectedRoute><Suspense fallback={<Loader />}><UserCalendar /></Suspense></ProtectedRoute>,
  },
  {
    path: "/etms/tasks/:taskId",
    element: <ProtectedRoute><Suspense fallback={<Loader />}><UserTaskDetails /></Suspense></ProtectedRoute>,
  },
  {
    path: "/etms/user/documents",
    element: <ProtectedRoute><Suspense fallback={<Loader />}><UserDocuments /></Suspense></ProtectedRoute>,
  },
  {
    path: "/etms/user/profile",
    element: <ProtectedRoute><Suspense fallback={<Loader />}><UserProfile /></Suspense></ProtectedRoute>,
  },

  // ── Admin pages — role=admin / is_staff only ────────────────
  {
    path: "/etms/admin/dashboard",
    element: <AdminRoute><Suspense fallback={<Loader />}><AdminDashboard /></Suspense></AdminRoute>,
  },
  {
    path: "/etms/admin/tasks/new",
    element: <AdminRoute><Suspense fallback={<Loader />}><AdminAddTask /></Suspense></AdminRoute>,
  },
  {
    path: "/etms/admin/tasks",
    element: <AdminRoute><Suspense fallback={<Loader />}><AdminTasks /></Suspense></AdminRoute>,
  },
  {
    path: "/etms/admin/tasks/:taskId",
    element: <AdminRoute><Suspense fallback={<Loader />}><AdminTaskDetails /></Suspense></AdminRoute>,
  },
  {
    path: "/etms/admin/templates",
    element: <AdminRoute><Suspense fallback={<Loader />}><AdminTemplates /></Suspense></AdminRoute>,
  },
  {
    path: "/etms/admin/quick-links",
    element: <AdminRoute><Suspense fallback={<Loader />}><AdminQuickLinks /></Suspense></AdminRoute>,
  },
  {
    path: "/etms/admin/profile",
    element: <AdminRoute><Suspense fallback={<Loader />}><AdminProfile /></Suspense></AdminRoute>,
  },

  // ── Main app with navbar ──────────────────────────────
  {
    path: "/etms/",
    element: <App />,
    children: [
      {
        path: "/etms/",
        element: <Home />,
      },
      {
        path: "/etms/page1",
        element: (
          <Suspense fallback={<Loader />}>
            <Page1 />
          </Suspense>
        ),
      },
      {
        path: "/etms/page2",
        element: (
          <Suspense fallback={<Loader />}>
            <Page2 />
          </Suspense>
        ),
      },
      {
        path: "*",
        element: <NotFound />,
      },
    ],
  },
]);

function wait(time: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, time);
  });
}

// A lazy-loaded route chunk 404s when the page was left open across a deploy — the
// hashed filename it was built with no longer exists once a newer build replaces it.
// Reload once to pick up the current build instead of leaving the user on a white screen.
window.addEventListener('vite:preloadError', () => {
  if (sessionStorage.getItem('vite-reload-once')) return;
  sessionStorage.setItem('vite-reload-once', '1');
  window.location.reload();
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </ThemeProvider>
  </React.StrictMode>,
)

// Reaching here means the current build's chunks loaded fine — allow another
// auto-reload later in this tab if a future deploy triggers preloadError again.
sessionStorage.removeItem('vite-reload-once');
sessionStorage.removeItem('etms-cache-bust-reload');
