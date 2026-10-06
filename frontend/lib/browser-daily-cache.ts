// O cache persistente do navegador foi removido de propósito.
// O backend já mantém snapshots no banco e é a única fonte de cache do dashboard.
// Ter duas camadas de cache permitia que um período antigo continuasse aparecendo
// depois da troca de mês/ano.
export async function browserDailyCache<T>(_key: string, loader: () => Promise<T>): Promise<T> {
  return loader();
}
