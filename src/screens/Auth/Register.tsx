import { useState, FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { authService } from "./authService";
import viteLogo from "/vite.svg";
import Swal from "sweetalert2";
import axios from "axios";

const Register = () => {
  const navigate = useNavigate();

  const [form, setForm] = useState({
    username: "",
    email: "",
    password: "",
    re_password: "",
  });
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
    setErrors((prev) => ({ ...prev, [e.target.name]: "" }));
  };

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!form.username) newErrors.username = "Username is required.";
    if (!form.email) newErrors.email = "Email is required.";
    else if (!/\S+@\S+\.\S+/.test(form.email))
      newErrors.email = "Enter a valid email address.";
    if (!form.password) newErrors.password = "Password is required.";
    else if (form.password.length < 8)
      newErrors.password = "Password must be at least 8 characters.";
    if (!form.re_password) newErrors.re_password = "Please confirm your password.";
    else if (form.password !== form.re_password)
      newErrors.re_password = "Passwords do not match.";
    return newErrors;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const validationErrors = validate();
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }
    setIsLoading(true);
    try {
      await authService.register(form);
      Swal.fire({
        icon: "success",
        title: "Account Created!",
        text: "You can now log in.",
        timer: 1800,
        showConfirmButton: false,
        background: "hsl(var(--background))",
        color: "hsl(var(--foreground))",
      });
      navigate("/tm/login");
    } catch (err: unknown) {
      const data = axios.isAxiosError(err) ? err.response?.data : undefined;
      if (data && typeof data === "object") {
        const mapped: Record<string, string> = {};
        Object.entries(data).forEach(([key, val]) => {
          mapped[key] = Array.isArray(val) ? (val as string[]).join(" ") : String(val);
        });
        setErrors(mapped);
      } else {
        setErrors({ non_field: "Registration failed. Please try again." });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const fields: { name: keyof typeof form; label: string; type: string; placeholder: string }[] = [
    { name: "username", label: "Username", type: "text", placeholder: "Choose a username" },
    { name: "email", label: "Email address", type: "email", placeholder: "you@example.com" },
    { name: "password", label: "Password", type: "password", placeholder: "Min. 8 characters" },
    {
      name: "re_password",
      label: "Confirm Password",
      type: "password",
      placeholder: "Repeat your password",
    },
  ];

  return (
    <div className="min-h-screen w-full bg-background flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-[480px] sm:max-w-full">
        {/* Card */}
        <div className="bg-card border border-border rounded-2xl shadow-lg px-8 py-10 sm:px-5 sm:py-8">
          {/* Logo & Title */}
          <div className="flex flex-col items-center gap-3 mb-8">
            <img src={viteLogo} alt="Logo" className="w-10 h-10" />
            <h1 className="text-2xl font-bold text-foreground tracking-tight">
              Create an account
            </h1>
            <p className="text-sm text-muted-foreground">
              Already have an account?{" "}
              <Link
                to="/tm/login"
                className="text-primary font-medium hover:underline"
              >
                Sign in
              </Link>
            </p>
          </div>

          {/* Global error */}
          {errors.non_field && (
            <div className="mb-5 flex items-center gap-2 bg-destructive/10 border border-destructive/30 text-destructive text-sm rounded-lg px-4 py-3">
              <span>⚠</span>
              <span>{errors.non_field}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            {fields.map(({ name, label, type, placeholder }) => (
              <div key={name} className="flex flex-col gap-1.5">
                <label
                  htmlFor={name}
                  className="text-sm font-medium text-foreground"
                >
                  {label}
                </label>
                <input
                  id={name}
                  name={name}
                  type={type}
                  autoComplete={name}
                  value={form[name]}
                  onChange={handleChange}
                  placeholder={placeholder}
                  className={`w-full rounded-lg border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition ${
                    errors[name]
                      ? "border-destructive focus:border-destructive"
                      : "border-border focus:border-primary"
                  }`}
                />
                {errors[name] && (
                  <p className="text-xs text-destructive mt-0.5">{errors[name]}</p>
                )}
              </div>
            ))}

            {/* Submit */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full mt-1 bg-primary text-primary-foreground font-semibold text-sm py-2.5 rounded-lg hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg
                    className="animate-spin h-4 w-4"
                    viewBox="0 0 24 24"
                    fill="none"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8v8H4z"
                    />
                  </svg>
                  Creating account...
                </span>
              ) : (
                "Create Account"
              )}
            </button>
          </form>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-muted-foreground mt-6">
          &copy; {new Date().getFullYear()} YourApp. All rights reserved.
        </p>
      </div>
    </div>
  );
};

export default Register;
