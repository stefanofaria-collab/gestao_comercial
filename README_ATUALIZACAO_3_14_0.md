# Atualização 3.14.0

## Perfil

- Removida a mensagem técnica amarela da área de perfil empresarial.
- A página Perfil passa a consumir os dados empresariais exclusivamente da tabela `public.perfil_empresas_enriquecidas` no banco Gestão Comercial.
- O endpoint de detalhe de CNPJ não consulta BrasilAPI/CNPJ.ws.
- As APIs externas ficam isoladas no script de sincronização, que continua alimentando o Supabase em segundo plano.
- Leitura dos gráficos empresariais otimizada para buscar somente CNPJ, regime tributário, porte, setor e segmento.
- Corrigido o erro `QueuePool limit reached`: o FastAPI passa a usar conexões curtas através do Supavisor Transaction Mode, sem QueuePool local.
- Requisições antigas do frontend são canceladas quando filtros/página mudam, evitando consultas duplicadas concorrentes.

## Navegação

- `iniciar_frontend.ps1` passa a executar `next build` + `next start`.
- O primeiro início após uma atualização demora mais porque compila o projeto inteiro.
- Depois de aparecer `Ready`, as páginas já estão compiladas e a troca entre Faturamento, Churn, Perfil e Vencimentos Futuros não dispara `Compiling /pagina...`.

## Sincronizador

- O sincronizador continua sendo o responsável por chamar fontes externas.
- `get_cnpj_profile` é somente leitura do banco.
- `enrich_cnpj_profile_for_sync` é a função exclusiva do processo de carga externa.
