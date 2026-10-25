import { createBrowserRouter, Navigate } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { Analytics } from "./pages/Analytics";
import { ApplicationTracker } from "./pages/ApplicationTracker";
import { Dashboard } from "./pages/Dashboard";
import { InternshipDetails } from "./pages/InternshipDetails";
import { InternshipExplorer } from "./pages/InternshipExplorer";
import { Login } from "./pages/Login";
import { Profile } from "./pages/Profile";
import { Register } from "./pages/Register";

export const router = createBrowserRouter([
  { path: "/login", element: <Login /> },
  { path: "/register", element: <Register /> },
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <AppShell />,
        children: [
          { index: true, element: <Dashboard /> },
          { path: "profile", element: <Profile /> },
          { path: "internships", element: <InternshipExplorer /> },
          { path: "internships/:id", element: <InternshipDetails /> },
          { path: "tracker", element: <ApplicationTracker /> },
          { path: "analytics", element: <Analytics /> }
        ]
      }
    ]
  },
  { path: "*", element: <Navigate to="/" replace /> }
]);
