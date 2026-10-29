import { Construction } from "lucide-react";

export function ModulePlaceholder({ title }: { title: string }) {
  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">{title}</h1>
      <div className="flex flex-col items-center justify-center gap-3 rounded-xl border bg-card p-16 text-center">
        <Construction className="h-10 w-10 text-primary" />
        <p className="text-lg font-semibold">Módulo en construcción</p>
        <p className="max-w-sm text-sm text-muted-foreground">Esta sección estará disponible en una próxima entrega.</p>
      </div>
    </div>
  );
}
