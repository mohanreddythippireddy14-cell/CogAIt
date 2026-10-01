"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import { useConvexAuth } from "convex/react";
import { toast } from "sonner";

type SavedAccount = {
  email: string;
  lastUsedAt: number;
};

const SAVED_ACCOUNTS_KEY = "cogait_saved_accounts_v1";

function loadSavedAccounts(): SavedAccount[] {
  try {
    const raw = window.localStorage.getItem(SAVED_ACCOUNTS_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as SavedAccount[];
    return Array.isArray(parsed) ? parsed.filter((a) => typeof a.email === "string") : [];
  } catch {
    return [];
  }
}

function persistSavedAccounts(accounts: SavedAccount[]) {
  window.localStorage.setItem(SAVED_ACCOUNTS_KEY, JSON.stringify(accounts));
}

export function ProfileMenu({
  fullName,
  role,
  email,
}: {
  fullName: string;
  role: string;
  email?: string;
}) {
  const { isAuthenticated } = useConvexAuth();
  const { signOut, signIn } = useAuthActions();
  const [open, setOpen] = useState(false);
  const [savedAccounts, setSavedAccounts] = useState<SavedAccount[]>([]);
  const [switchingEmail, setSwitchingEmail] = useState<string | null>(null);
  const [pendingSwitchEmail, setPendingSwitchEmail] = useState<string | null>(null);
  const [switchPassword, setSwitchPassword] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent | TouchEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("touchstart", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, [open]);

  if (!isAuthenticated) {
    return null;
  }

  useEffect(() => {
    setSavedAccounts(loadSavedAccounts());
  }, []);

  useEffect(() => {
    if (!email) {
      return;
    }
    setSavedAccounts((prev) => {
      const withoutCurrent = prev.filter((item) => item.email.toLowerCase() !== email.toLowerCase());
      const next = [{ email, lastUsedAt: Date.now() }, ...withoutCurrent]
        .sort((a, b) => b.lastUsedAt - a.lastUsedAt)
        .slice(0, 10);
      persistSavedAccounts(next);
      return next;
    });
  }, [email]);

  const otherAccounts = useMemo(
    () =>
      savedAccounts.filter(
        (account) => account.email.toLowerCase() !== (email ?? "").toLowerCase(),
      ),
    [savedAccounts, email],
  );

  const switchToAccount = (targetEmail: string) => {
    setPendingSwitchEmail(targetEmail);
    setSwitchPassword("");
  };

  const submitAccountSwitch = async () => {
    if (!pendingSwitchEmail || !switchPassword) {
      return;
    }
    setSwitchingEmail(pendingSwitchEmail);
    try {
      await signIn("password", {
        email: pendingSwitchEmail,
        password: switchPassword,
        flow: "signIn",
      });
      setSavedAccounts((prev) => {
        const updated = [{ email: pendingSwitchEmail, lastUsedAt: Date.now() }, ...prev.filter((a) => a.email !== pendingSwitchEmail)]
          .sort((a, b) => b.lastUsedAt - a.lastUsedAt)
          .slice(0, 10);
        persistSavedAccounts(updated);
        return updated;
      });
      setPendingSwitchEmail(null);
      setSwitchPassword("");
      window.location.href = "/";
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not switch account";
      toast.error(message);
    } finally {
      setSwitchingEmail(null);
    }
  };

  const removeSavedAccount = (targetEmail: string) => {
    setSavedAccounts((prev) => {
      const next = prev.filter((a) => a.email !== targetEmail);
      persistSavedAccounts(next);
      return next;
    });
  };

  const initial = fullName.trim().charAt(0).toUpperCase() || "U";

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="h-10 w-10 rounded-2xl bg-[linear-gradient(135deg,var(--color-primary-hover),var(--color-primary-active))] text-white font-semibold inline-flex items-center justify-center shadow-[0_16px_30px_rgba(77,105,255,0.28)] transition-all hover:-translate-y-[1px]"
        aria-label="Open account menu"
      >
        {initial}
      </button>

      {open && (
        <>
          <div 
            className="fixed inset-0 z-10" 
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <div className="absolute right-0 mt-2 w-80 rounded-3xl p-4 z-20 bg-white/95 backdrop-blur-xl shadow-xl border border-gray-100">
            <div className="pb-3 border-b text-center">
              <p className="text-sm text-muted">{email ?? "No email found"}</p>
              <p className="text-xs text-subtle mt-1">Managed by CogAIt</p>
            </div>

            <div className="py-4 text-center">
              <div className="h-20 w-20 mx-auto rounded-[1.5rem] bg-[linear-gradient(135deg,var(--color-primary-hover),var(--color-primary-active))] text-white text-4xl font-medium inline-flex items-center justify-center shadow-[0_18px_36px_rgba(77,105,255,0.25)]">
                {initial}
              </div>
              <p className="text-3xl mt-3">Hi, {fullName.split(" ")[0]}!</p>
              <p className="text-xs text-subtle mt-1 uppercase tracking-wide">{role}</p>
            </div>

            {otherAccounts.length > 0 && (
              <div className="border rounded-xl p-2 mb-3">
                <p className="text-xs text-subtle px-2 py-1">Saved accounts</p>
                <div className="space-y-1">
                  {otherAccounts.map((account) => (
                    <div key={account.email} className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void switchToAccount(account.email)}
                        disabled={switchingEmail === account.email}
                        className="flex-1 text-left px-2 py-2 rounded-lg hover:bg-[var(--color-surface-soft)] text-sm disabled:opacity-50"
                      >
                        {switchingEmail === account.email ? "Switching..." : account.email}
                      </button>
                      <button
                        type="button"
                        onClick={() => removeSavedAccount(account.email)}
                        className="px-2 py-2 rounded-lg text-[var(--color-danger)] hover:bg-[color:color-mix(in_srgb,var(--color-danger)_10%,transparent)] text-xs"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="pt-3 grid grid-cols-2 gap-2">
              <a
                href="/login?addAccount=1"
                className="ui-button ui-button-secondary w-full py-2 text-center"
              >
                Add account
              </a>
              <button
                type="button"
                className="ui-button ui-button-secondary w-full py-2"
                onClick={() => void signOut()}
              >
                Sign out
              </button>
            </div>
          </div>
        </>
      )}

      {pendingSwitchEmail && (
        <div className="ui-modal-backdrop z-30">
          <div className="ui-modal max-w-md">
            <h3 className="text-lg font-semibold">Switch account</h3>
            <p className="mt-1 text-sm text-muted">Enter password for {pendingSwitchEmail}</p>
            <form
              className="mt-4 space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                void submitAccountSwitch();
              }}
            >
              <input
                type="password"
                value={switchPassword}
                onChange={(e) => setSwitchPassword(e.target.value)}
                autoFocus
                className="auth-input-field"
                placeholder="Enter password"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  className="ui-button ui-button-secondary px-4 py-2"
                  onClick={() => {
                    setPendingSwitchEmail(null);
                    setSwitchPassword("");
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!switchPassword || switchingEmail === pendingSwitchEmail}
                  className="ui-button ui-button-primary px-4 py-2 disabled:cursor-not-allowed"
                >
                  {switchingEmail === pendingSwitchEmail ? "Switching..." : "Continue"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
