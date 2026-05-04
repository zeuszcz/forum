import { CasesList } from "@/components/forum/CasesList";
import { apiServerOptional } from "@/lib/api";

export const dynamic = "force-dynamic";

interface CaseItemDef {
  id: number;
  title: string;
  rarity: string;
  weight: number;
  reward_kind: string;
  reward_value: number;
  reward_payload: string | null;
  icon_color: string | null;
}
interface CaseDef {
  id: number;
  slug: string;
  title: string;
  description: string;
  icon: string;
  accent: string;
  key_cost: number;
  items: CaseItemDef[];
}

export default async function CasesPage() {
  const data = await apiServerOptional<{
    cases: CaseDef[];
    user_keys: number;
  }>("/cases/");

  if (!data) {
    return (
      <div className="container max-w-4xl py-10">
        <p className="text-center text-sm text-smoke">Не удалось загрузить кейсы</p>
      </div>
    );
  }

  return (
    <div className="container max-w-5xl py-6 md:py-10">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-bone md:text-3xl">
          Кейсы
        </h1>
        <p className="mt-1 text-sm text-smoke">
          Выполняй ежедневные квесты — получай ключи. Открывай кейсы — забирай
          награды.
        </p>
      </header>
      <CasesList cases={data.cases} initialKeys={data.user_keys} />
    </div>
  );
}
