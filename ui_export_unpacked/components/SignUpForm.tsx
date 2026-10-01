import { useState } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { toast } from "sonner";
import { Link, useNavigate } from "react-router-dom";

export function SignUpForm() {
  const { signIn } = useAuthActions();
  const createProfile = useMutation(api.users.createUserProfile);
  const navigate = useNavigate();
  
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    confirmPassword: "",
    fullName: "",
    role: "" as "student" | "lecturer" | "",
    institution: "",
  });
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (formData.password !== formData.confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    
    if (formData.password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    
    if (!formData.role) {
      toast.error("Please select a role");
      return;
    }

    setIsLoading(true);
    
    try {
      // Create account
      await signIn("password", {
        email: formData.email,
        password: formData.password,
        flow: "signUp",
      });
      
      // Create user profile
      await createProfile({
        fullName: formData.fullName,
        role: formData.role,
        institution: formData.institution || undefined,
      });
      
      toast.success("Account created successfully!");
      
      // Redirect based on role
      if (formData.role === "student") {
        navigate("/student/dashboard");
      } else {
        navigate("/lecturer/dashboard");
      }
    } catch (error) {
      console.error("Signup error:", error);
      const message = error instanceof Error ? error.message : "Failed to create account";
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      <h2 className="text-2xl font-bold text-center">Create Account</h2>
      
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="ui-label">
            Full Name *
          </label>
          <input
            type="text"
            required
            className="auth-input-field"
            value={formData.fullName}
            onChange={(e) => setFormData(prev => ({ ...prev, fullName: e.target.value }))}
            placeholder="Enter your full name"
          />
        </div>

        <div>
          <label className="ui-label">
            Email *
          </label>
          <input
            type="email"
            required
            className="auth-input-field"
            value={formData.email}
            onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
            placeholder="Enter your email"
          />
        </div>

        <div>
          <label className="ui-label">
            Password *
          </label>
          <input
            type="password"
            required
            className="auth-input-field"
            value={formData.password}
            onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
            placeholder="Minimum 8 characters"
          />
        </div>

        <div>
          <label className="ui-label">
            Confirm Password *
          </label>
          <input
            type="password"
            required
            className="auth-input-field"
            value={formData.confirmPassword}
            onChange={(e) => setFormData(prev => ({ ...prev, confirmPassword: e.target.value }))}
            placeholder="Confirm your password"
          />
        </div>

        <div>
          <label className="ui-label">
            Role *
          </label>
          <select
            required
            className="auth-input-field"
            value={formData.role}
            onChange={(e) => setFormData(prev => ({ ...prev, role: e.target.value as "student" | "lecturer" }))}
          >
            <option value="">Select your role</option>
            <option value="student">Student</option>
            <option value="lecturer">Lecturer</option>
          </select>
        </div>

        <div>
          <label className="ui-label">
            Institution (Optional)
          </label>
          <input
            type="text"
            className="auth-input-field"
            value={formData.institution}
            onChange={(e) => setFormData(prev => ({ ...prev, institution: e.target.value }))}
            placeholder="Your school/college name"
          />
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className="auth-button"
        >
          {isLoading ? "Creating Account..." : "Create Account"}
        </button>
      </form>

      <div className="mt-6 text-center">
        <p className="text-sm text-muted">
          Already have an account?{" "}
          <Link to="/login" className="font-semibold text-[var(--color-primary)] hover:underline">
            Sign in here
          </Link>
        </p>
      </div>
    </div>
  );
}
