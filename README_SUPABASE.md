# Integração Supabase — Gestão de Clientes

Nova arquitetura:

- MySQL corporativo continua sendo a fonte oficial.
- O script `backend/scripts/sincronizar_indicadores.py` calcula os indicadores.
- Os resultados consolidados são gravados no PostgreSQL do Supabase.
- O backend do dashboard passa a ler somente o Supabase.
- O GitHub Actions atualiza o mês atual e o mês anterior diariamente às 08:00 de São Paulo.

## 1. Criar a tabela no Supabase

Execute no SQL Editor:

`backend/sql/001_indicadores_mensais.sql`

## 2. Atualizar o .env

Copie as novas variáveis de `backend/.env.example` para o seu `backend/.env`.

Para uso local, use o Session Pooler na porta 5432.

Para o GitHub Actions, use o Transaction Pooler na porta 6543.

## 3. Instalar dependências

Dentro de `backend`:

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

## 4. Testar as conexões

```powershell
.\.venv\Scripts\python.exe -c "from app.database import test_source_connection, test_supabase_connection; print('MySQL:', test_source_connection()); print('Supabase:', test_supabase_connection())"
```

Esperado:

```text
MySQL: True
Supabase: True
```

## 5. Carga histórica inicial

```powershell
.\.venv\Scripts\python.exe scripts\sincronizar_indicadores.py --modo historico
```

Isso processa janeiro/2024 até o mês atual.

Também é possível processar um único mês:

```powershell
.\.venv\Scripts\python.exe scripts\sincronizar_indicadores.py --modo mes --ano 2026 --mes 9
```

## 6. Modo diário

```powershell
.\.venv\Scripts\python.exe scripts\sincronizar_indicadores.py --modo diario
```

O modo diário recalcula:

- mês atual;
- mês anterior.

## 7. GitHub Secrets

Cadastre:

```text
DB_HOST
DB_PORT
DB_NAME
DB_USER
DB_PASSWORD
DB_CHARSET

SUPABASE_DB_HOST
SUPABASE_DB_PORT
SUPABASE_DB_NAME
SUPABASE_DB_USER
SUPABASE_DB_PASSWORD
SUPABASE_DB_SSLMODE
```

Não versione o `.env`.

## 8. Horário do GitHub Action

O workflow usa:

```yaml
cron: "0 11 * * *"
```

que corresponde a 08:00 no horário de São Paulo (UTC-3).

## 9. Segurança

O frontend não precisa da anon key nem da service role key nesta arquitetura.

O backend utiliza diretamente o PostgreSQL do Supabase.

## 10. Atenção ao MySQL no GitHub Actions

O runner do GitHub precisa alcançar o RDS/MySQL corporativo.

Se o banco estiver permitido apenas para IPs específicos ou VPN, um runner hospedado pelo GitHub pode não conseguir conectar. Nesse caso, use um runner self-hosted dentro da rede autorizada.
