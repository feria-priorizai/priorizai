/**
 * Página raíz de la aplicación.
 * Redirige automáticamente al dashboard principal.
 */

import { redirect } from "next/navigation";

export default function Home() {
  redirect("/dashboard");
}
