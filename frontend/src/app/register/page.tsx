import { RegisterForm } from "./register-form";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Регистрация",
};

export default function RegisterPage() {
  return (
    <div className="container flex min-h-[calc(100vh-180px)] max-w-md items-center py-10">
      <div className="w-full space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold tracking-tight text-bone">Регистрация</h1>
          <p className="mt-1 text-sm text-smoke">
            Уже есть аккаунт?{" "}
            <a href="/login" className="link-plasma">
              Войти
            </a>
          </p>
        </div>
        <RegisterForm />
      </div>
    </div>
  );
}
