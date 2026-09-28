# Gestão Comercial 3.9.0

## Perfil empresarial persistido no Supabase

Esta versão remove o cache local de CNPJs da página Perfil.

Fluxo:

1. MySQL corporativo identifica empresa_id, PF/PJ, CNPJ do cadastro e CNPJ da nota.
2. `perfil_cliente_documentos` recebe o vínculo entre empresa_id e CNPJs.
3. `perfil_empresas_enriquecidas` recebe os dados retornados pelas APIs públicas.
4. A página Perfil passa a consumir o enriquecimento salvo no Supabase Gestão Comercial.
5. CNPJs já enriquecidos não precisam ser consultados novamente nas próximas aberturas.

## Sincronização inicial

Primeiro grave todos os documentos das empresas:

```powershell
.\sincronizar_perfil_empresas.ps1 -SomenteDocumentos
```

Teste os primeiros 50 CNPJs:

```powershell
.\sincronizar_perfil_empresas.ps1 -Limite 50
```

Depois processe todos os CNPJs pendentes:

```powershell
.\sincronizar_perfil_empresas.ps1 -Todos -Delay 0.5
```

A sincronização pode ser interrompida. Cada CNPJ concluído é salvo imediatamente no Supabase, então a próxima execução continua apenas com os pendentes.

Para consultar o progresso:

```powershell
.\sincronizar_perfil_empresas.ps1 -Status
```
