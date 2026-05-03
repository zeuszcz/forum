import { apiServer } from "@/lib/api";
import type { RoleAdminRead } from "@/lib/types";

import { RolesManager } from "./roles-manager";

export const dynamic = "force-dynamic";

export const metadata = { title: "Роли — админка" };

export default async function RolesAdminPage() {
  const roles = await apiServer<RoleAdminRead[]>("/admin/roles");
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-bold tracking-tight text-bone">Роли</h1>
        <p className="text-xs text-smoke">
          create / edit / delete · защищённые роли (owner / admin / member) удалить нельзя
        </p>
      </header>
      <RolesManager initialRoles={roles} />
    </div>
  );
}
