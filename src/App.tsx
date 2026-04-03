import { Authenticated, Unauthenticated, useConvexAuth, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { Id } from "../convex/_generated/dataModel";
import { SignInForm } from "./SignInForm";
import { ProfileMenu } from "./ProfileMenu";
import { Toaster } from "sonner";
import { BrowserRouter as Router, Routes, Route, Navigate, Link, useLocation } from "react-router-dom";
import { Menu, X, House, ClipboardList, Building2, Siren } from "lucide-react";
import { useState, type ReactNode } from "react";
import { AppLogo } from "./components/AppLogo";
import { StudentDashboard } from "./components/StudentDashboard";
import { LecturerDashboard } from "./components/LecturerDashboard";
import { CreateAssignment } from "./components/CreateAssignment";
import { CreateAIAssignment } from "./components/CreateAIAssignment";
import { EditAssignment } from "./components/EditAssignment";
import { QuestionView } from "./components/QuestionView";
import { AssignmentAnalytics } from "./components/AssignmentAnalytics";
import { StudentResults } from "./components/StudentResults";
import { LiveSessionMonitor } from "./components/LiveSessionMonitor";
import { AdminSystemMonitor } from "./components/AdminSystemMonitor";
import { JoinClassPage } from "./components/JoinClassPage";
import { SignUpForm } from "./components/SignUpForm";
import { AppErrorBoundary } from "./components/AppErrorBoundary";

interface UserProfile {
  _id: Id<"userProfiles">;
  _creationTime: number;
  userId: Id<"users">;
  organizationId: Id<"organizations">;
  fullName: string;
  role: "student" | "lecturer" | "organizationAdmin";
  institution?: string;
}

interface UserWithProfile {
  userId: Id<"users">;
  email?: string;
  profile: UserProfile | null;
}

export default function App() {
  return (
    <AppErrorBoundary>
      <Router>
        <div className="min-h-screen flex flex-col">
          <Routes>
            <Route path="/signup" element={<SignUpPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/add-account" element={<AddAccountPage />} />
            <Route path="/*" element={<AuthenticatedApp />} />
          </Routes>
          <Toaster richColors closeButton position="top-right" />
        </div>
      </Router>
    </AppErrorBoundary>
  );
}

function SignUpPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 md:p-8">
      <div className="w-full max-w-md ui-card p-6 md:p-8">
        <div className="text-center mb-6">
          <AppLogo size="lg" showTagline />
        </div>
        <SignUpForm />
      </div>
    </div>
  );
}

function LoginPage() {
  const location = useLocation();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const params = new URLSearchParams(location.search);
  const addAccountMode = params.get("addAccount") === "1";
  if (!isLoading && isAuthenticated && !addAccountMode) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 md:p-8">
      <div className="w-full max-w-md ui-card p-6 md:p-8">
        <div className="text-center mb-6">
          <AppLogo size="lg" showTagline />
          {addAccountMode && (
            <p className="text-sm text-muted mt-2">
              Add account mode: sign in with another email. Note: same browser profile uses one active session at a time.
            </p>
          )}
        </div>
        <SignInForm />
      </div>
    </div>
  );
}

function AddAccountPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 md:p-8">
      <div className="w-full max-w-md ui-card p-6 md:p-8">
        <div className="text-center mb-6">
          <AppLogo size="lg" />
          <p className="text-xl text-muted">Add Another Account</p>
          <p className="text-sm text-muted mt-2">
            Sign in here in a new tab. To keep both accounts active at once, use another browser profile/incognito window.
          </p>
        </div>
        <SignInForm />
        <p className="text-sm text-muted mt-4 text-center">
          Back to app?{" "}
          <Link to="/" className="text-primary hover:underline">
            Open Dashboard
          </Link>
        </p>
      </div>
    </div>
  );
}

function AuthenticatedApp() {
  const user = useQuery(api.users.loggedInUserWithProfile);

  if (user === undefined) {
    return (
      <div className="min-h-screen flex justify-center items-center">
        <div className="ui-card w-64 p-6">
          <div className="ui-skeleton h-4 w-2/3" />
          <div className="ui-skeleton mt-3 h-3 w-full" />
          <div className="ui-skeleton mt-2 h-3 w-5/6" />
        </div>
      </div>
    );
  }

  return (
    <>
      <Authenticated>
        <AppContent user={user} />
      </Authenticated>
      <Unauthenticated>
        <Navigate to="/login" replace />
      </Unauthenticated>
    </>
  );
}

function AppContent({ user }: { user: UserWithProfile }) {
  const location = useLocation();
  if (!user?.profile) {
    return <Navigate to="/signup" replace />;
  }

  const isStudent = user.profile.role === "student";
  const isLecturer = user.profile.role === "lecturer" || user.profile.role === "organizationAdmin";
  const [menuOpen, setMenuOpen] = useState(false);
  const navItems = [
    {
      key: "home",
      to: "/lecturer/dashboard?section=home",
      label: "Home",
      icon: <House className="h-5 w-5" />,
      active:
        location.pathname.startsWith("/lecturer/dashboard") &&
        (location.search.includes("section=home") || !location.search.includes("section=")),
    },
    {
      key: "assignments",
      to: "/lecturer/assignments?section=assignments",
      label: "Assignments",
      icon: <ClipboardList className="h-5 w-5" />,
      active:
        location.pathname.startsWith("/lecturer/assignments") || location.search.includes("section=assignments"),
    },
    {
      key: "classrooms",
      to: "/lecturer/dashboard?section=classrooms",
      label: "Classrooms",
      icon: <Building2 className="h-5 w-5" />,
      active: location.search.includes("section=classrooms"),
    },
    {
      key: "interventions",
      to: "/lecturer/dashboard?section=interventions",
      label: "Interventions",
      icon: <Siren className="h-5 w-5" />,
      active: location.search.includes("section=interventions"),
    },
  ] as const;

  return (
    <>
      <header className="app-shell-header h-16 flex justify-between items-center px-4">
        <div className="flex items-center gap-4 min-w-0">
          {isLecturer && (
            <button
              type="button"
              onClick={() => setMenuOpen((prev) => !prev)}
              aria-label="Toggle menu"
              className="h-10 w-10 rounded-xl border border-transparent hover:border-[var(--color-border)] hover:bg-[var(--color-surface-soft)] inline-flex items-center justify-center text-muted transition-colors"
            >
              {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          )}
          <AppLogo size="sm" />
          <div className="hidden sm:flex items-center gap-2 min-w-0">
            <span className="text-sm font-medium text-muted truncate">{user.profile.fullName}</span>
            <span className="app-pill">{user.profile.role}</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <ProfileMenu
            fullName={user.profile.fullName}
            role={user.profile.role}
            email={user.email}
          />
        </div>
      </header>

      <div className="flex-1 flex min-h-0 relative">
        {isLecturer && (
          <div className="relative z-30 shrink-0">
            <aside className="h-full w-16 border-r bg-[color:var(--color-surface)]/90 backdrop-blur-sm py-2">
              <nav className="space-y-1 px-2">
                {navItems.map((item) => (
                  <RailItem
                    key={item.key}
                    to={item.to}
                    icon={item.icon}
                    label={item.label}
                    active={item.active}
                  />
                ))}
              </nav>
            </aside>

            <aside
              className={`absolute left-16 top-0 h-full w-72 border-r bg-[color:var(--color-surface)]/95 backdrop-blur-sm px-3 py-2 transition-all duration-300 ease-out ${
                menuOpen
                  ? "translate-x-0 opacity-100 pointer-events-auto shadow-xl"
                  : "-translate-x-3 opacity-0 pointer-events-none"
              }`}
            >
              <nav className="space-y-1">
                {navItems.map((item) => (
                  <SidebarItem
                    key={item.key}
                    to={item.to}
                    label={item.label}
                    active={item.active}
                    onClick={() => setMenuOpen(false)}
                  />
                ))}
              </nav>
            </aside>
          </div>
        )}

        {isLecturer && menuOpen && (
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setMenuOpen(false)}
            className="absolute inset-0 z-20 bg-black/18 backdrop-blur-[2px]"
          />
        )}

        <main className="flex-1 min-w-0">
        <Routes>
          {isStudent && (
            <>
              <Route path="/" element={<Navigate to="/student/dashboard" replace />} />
              <Route path="/student/dashboard" element={<StudentDashboard />} />
              <Route path="/student/join-class" element={<JoinClassPage />} />
              <Route path="/student/assignment/:assignmentId/question/:questionNumber" element={<QuestionView />} />
              <Route path="/student/assignment/:assignmentId/results" element={<StudentResults />} />
            </>
          )}
          
          {isLecturer && (
            <>
              <Route path="/" element={<Navigate to="/lecturer/dashboard" replace />} />
              <Route path="/lecturer/dashboard" element={<LecturerDashboard />} />
              <Route path="/lecturer/assignments" element={<LecturerDashboard />} />
              <Route path="/lecturer/assignment/create" element={<CreateAssignment />} />
              <Route path="/lecturer/assignment/ai-create" element={<CreateAIAssignment />} />
              <Route path="/lecturer/assignment/:assignmentId/edit" element={<EditAssignment />} />
              <Route path="/lecturer/assignment/:assignmentId/analytics" element={<AssignmentAnalytics />} />
              <Route path="/lecturer/assignment/:assignmentId/live" element={<LiveSessionMonitor />} />
              <Route path="/admin/system" element={<AdminSystemMonitor />} />
            </>
          )}
          
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </main>
      </div>
    </>
  );
}

function RailItem({
  to,
  icon,
  label,
  active,
}: {
  to: string;
  icon: ReactNode;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      to={to}
      title={label}
      className={`h-11 w-11 rounded-2xl inline-flex items-center justify-center transition-colors duration-150 ${
        active
          ? "bg-[color:color-mix(in_srgb,var(--color-primary)_16%,transparent)] text-[var(--color-primary)] ring-1 ring-[color:color-mix(in_srgb,var(--color-primary)_28%,transparent)]"
          : "text-muted hover:bg-[var(--color-surface-soft)]"
      }`}
    >
      {icon}
    </Link>
  );
}

function SidebarItem({
  to,
  label,
  active,
  onClick,
}: {
  to: string;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <Link
      to={to}
      onClick={onClick}
      className={`w-full h-11 px-4 rounded-2xl flex items-center text-sm transition-colors ${
        active
          ? "bg-[color:color-mix(in_srgb,var(--color-primary)_16%,transparent)] text-[var(--color-primary)]"
          : "hover:bg-[var(--color-surface-soft)] text-muted"
      }`}
    >
      <span>{label}</span>
    </Link>
  );
}
