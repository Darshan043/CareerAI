import { useMutation } from "@tanstack/react-query";
import { UserPlus } from "lucide-react";
import { useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router-dom";
import { authApi } from "../api/queries";
import { Button } from "../components/Button";
import { ErrorBanner } from "../components/ErrorBanner";
import { Field, inputClass } from "../components/Field";
import { useAuthStore } from "../store/authStore";

export function Register() {
  const navigate = useNavigate();
  const setSession = useAuthStore((state) => state.setSession);
  const {
    register,
    handleSubmit,
    formState: { errors }
  } = useForm();

  const mutation = useMutation({
    mutationFn: authApi.register,
    onSuccess: (data) => {
      setSession(data);
      navigate("/profile");
    }
  });

  return (
    <main className="grid min-h-screen place-items-center bg-paper px-5 py-10">
      <div className="w-full max-w-md rounded-lg border border-ink/10 bg-white p-6 shadow-soft">
        <div className="mb-6">
          <p className="text-sm font-black uppercase tracking-[0.18em] text-moss">CareerPilot AI</p>
          <h2 className="mt-2 text-3xl font-black text-ink">Register</h2>
        </div>
        <ErrorBanner error={mutation.error} />
        <form className="mt-4 grid gap-4" onSubmit={handleSubmit((values) => mutation.mutate(values))}>
          <Field label="Name" error={errors.name}>
            <input className={inputClass} {...register("name", { required: "Name is required" })} />
          </Field>
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
              {...register("password", { required: "Password is required", minLength: 8 })}
            />
          </Field>
          <Button type="submit" icon={UserPlus} loading={mutation.isPending}>
            Register
          </Button>
        </form>
        <p className="mt-5 text-sm font-medium text-ink/60">
          Already registered?{" "}
          <Link className="font-black text-moss" to="/login">
            Login
          </Link>
        </p>
      </div>
    </main>
  );
}
