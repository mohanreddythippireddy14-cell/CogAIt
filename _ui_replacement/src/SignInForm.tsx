import { useState } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import { toast } from "sonner";
import { Link, useNavigate } from "react-router-dom";

export function SignInForm() {
  const { signIn } = useAuthActions();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      await signIn("password", {
        email,
        password,
        flow: "signIn",
      });
      toast.success("Signed in successfully!");
      navigate("/");
    } catch (error) {
      console.error("Sign in error:", error);
      const message = error instanceof Error ? error.message : "Failed to sign in";
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      <h2 className="text-2xl font-bold text-center text-foreground">Sign In</h2>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">
            Email *
          </label>
          <input
            type="email"
            required
            className="ui-input w-full"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Enter your email"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">
            Password *
          </label>
          <input
            type="password"
            required
            className="ui-input w-full"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter your password"
          />
        </div>
        <button type="submit" disabled={isLoading} className="ui-button-primary w-full">
          {isLoading ? "Signing in..." : "Sign In"}
        </button>
      </form>
      <div className="mt-6 text-center">
        <p className="text-sm text-muted-foreground">
          Don&apos;t have an account?{" "}
          <Link to="/signup" className="font-semibold text-primary hover:underline">
            Create one here
          </Link>
        </p>
      </div>
    </div>
  );
}
