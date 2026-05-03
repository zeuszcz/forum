import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Вход",
};

export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  return <LoginScreen searchParamsP={searchParams} />;
}

async function LoginScreen({
  searchParamsP,
}: {
  searchParamsP: Promise<{ next?: string }>;
}) {
  const sp = await searchParamsP;
  return (
    <div className="container flex min-h-[calc(100vh-180px)] max-w-md items-center py-10">
      <div className="w-full space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold tracking-tight text-bone">Войти</h1>
          <p className="mt-1 text-sm text-smoke">
            Нет аккаунта?{" "}
            <a href="/register" className="link-plasma">
              Зарегистрируйся
            </a>
          </p>
        </div>
        <LoginForm next={sp?.next ?? "/"} />
      </div>
    </div>
  );
}
