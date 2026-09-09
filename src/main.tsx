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
const UserTaskDetails = lazy(() => import("./screens/User/TaskDetailsPage.tsx"));
const UserDocuments  = lazy(() => import("./screens/User/Documents.tsx"));
const UserProfile    = lazy(() => import("./screens/User/Profile.tsx"));

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

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </ThemeProvider>
  </React.StrictMode>,
)
