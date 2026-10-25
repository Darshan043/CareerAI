import { useMutation } from "@tanstack/react-query";
import { LogIn } from "lucide-react";
import { useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router-dom";
import { authApi } from "../api/queries";
import { Button } from "../components/Button";
import { ErrorBanner } from "../components/ErrorBanner";
import { Field, inputClass } from "../components/Field";
import { useAuthStore } from "../store/authStore";

export function Login() {
  const navigate = useNavigate();
  const setSession = useAuthStore((state) => state.setSession);
  const {
    register,
    handleSubmit,
    formState: { errors }
  } = useForm({
    defaultValues: { email: "", password: "" }
  });

  const mutation = useMutation({
    mutationFn: authApi.login,
    onSuccess: (data) => {
      setSession(data);
      navigate("/");
    }
  });

  return (
    <main className="grid min-h-screen bg-paper lg:grid-cols-[1.05fr_0.95fr]">
      <section className="relative hidden overflow-hidden bg-ink lg:block">
        <img
          className="h-full w-full object-cover opacity-75"
          src="https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&w=1400&q=80"
          alt="Students planning career applications"
        />
        <div className="absolute inset-0 bg-ink/45" />
        <div className="absolute bottom-10 left-10 right-10 text-white">
          <p className="text-sm font-black uppercase tracking-[0.2em] text-gold">CareerPilot AI</p>
          <h1 className="mt-3 max-w-xl text-5xl font-black leading-tight">Internship discovery and application management</h1>
        </div>
      </section>

      <section className="flex items-center justify-center px-5 py-10">
        <div className="w-full max-w-md rounded-lg border border-ink/10 bg-white p-6 shadow-soft">
          <div className="mb-6">
            <p className="text-sm font-black uppercase tracking-[0.18em] text-moss">CareerPilot AI</p>
            <h2 className="mt-2 text-3xl font-black text-ink">Login</h2>
          </div>
          <ErrorBanner error={mutation.error} />
          <form className="mt-4 grid gap-4" onSubmit={handleSubmit((values) => mutation.mutate(values))}>
            <Field label="Email" error={errors.email}>
              <input
                className={inputClass}
                type="email"
                {...register("email", { required: "Email is required" })}
              />
            </Field>
            <Field label="Password" error={errors.password}>
              <input
                className={inputClass}
                type="password"
                {...register("password", { required: "Password is required" })}
              />
            </Field>
            <Button type="submit" icon={LogIn} loading={mutation.isPending}>
              Login
            </Button>
          </form>
          <p className="mt-5 text-sm font-medium text-ink/60">
            New here?{" "}
            <Link className="font-black text-moss" to="/register">
              Create account
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}
