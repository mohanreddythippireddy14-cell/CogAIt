import { useState } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import { LogOut, User } from "lucide-react";
import { toast } from "sonner";

export function ProfileMenu({
  fullName,
  role,
  email,
}: {
  fullName: string;
  role: string;
  email?: string;
}) {
  const { signOut } = useAuthActions();
  const [open, setOpen] = useState(false);

  const handleSignOut = async () => {
    try {
      await signOut();
      toast.success("Signed out successfully");
    } catch (error) {
      console.error("Sign out error:", error);
      toast.error("Failed to sign out");
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="h-10 w-10 rounded-full bg-primary/20 text-primary flex items-center justify-center hover:bg-primary/30 transition-colors"
      >
        <User className="h-5 w-5" />
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-48 ui-card shadow-lg z-50">
          <div className="p-4 border-b border-border">
            <p className="font-medium text-foreground text-sm">{fullName}</p>
            <p className="text-xs text-muted-foreground">{email}</p>
            <span className="inline-block text-xs bg-primary/20 text-primary px-2 py-1 rounded mt-2">
              {role}
            </span>
          </div>
          <button
            onClick={() => {
              handleSignOut();
              setOpen(false);
            }}
            className="w-full px-4 py-2 text-left text-sm text-foreground hover:bg-muted flex items-center gap-2 transition-colors"
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </button>
        </div>
      )}
    </div>
  );
}
