import { Construction } from "lucide-react";

export default function PlaceholderPage({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="p-6 lg:p-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8">
          <p className="text-sm font-medium text-blue-600">Gestão Comercial</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-950">{title}</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-500">{description}</p>
        </div>

        <div className="grid min-h-[420px] place-items-center rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center shadow-sm">
          <div>
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-slate-100 text-slate-500">
              <Construction size={26} />
            </div>
            <h2 className="mt-4 text-lg font-semibold text-slate-900">Página preparada</h2>
            <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">
              A rota e o menu já estão prontos. O conteúdo será construído nas próximas etapas.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
