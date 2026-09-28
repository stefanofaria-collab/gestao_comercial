# Atualização 3.10.0

- Página Perfil não consulta mais APIs externas durante a navegação.
- A página consome somente CNPJs já enriquecidos em `public.perfil_empresas_enriquecidas`.
- O botão da página apenas relê o Supabase e atualiza os gráficos conforme a carga avança.
- Abrir um cliente consulta somente o Supabase; se o CNPJ ainda estiver pendente, a tela informa isso.
- Leitura normal da página não grava mais `perfil_cliente_documentos`; a carga fica a cargo do sincronizador.
- Conexão Supabase do FastAPI reduzida a uma conexão por processo e, quando aplicável, usa Transaction mode (porta 6543).
- Consultas de CNPJs ao Supabase são feitas em blocos para evitar uma lista gigantesca de parâmetros.
