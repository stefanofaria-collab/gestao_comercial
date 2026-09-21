# Gestão de Clientes — Dashboard Executivo

Web app para acompanhar, mensalmente:

- Clientes ativos
- Renovações previstas
- % Renovações / Clientes ativos
- Receita vencendo
- Ticket médio dos vencimentos
- Renovações em clientes
- Renovações em receita
- Ticket médio renovado
- Taxa de renovação em clientes
- Taxa de renovação em receita
- Churn em clientes
- Churn em receita
- Ticket médio perdido
- % Churn dos clientes ativos
- % Churn dos vencimentos
- % Churn da receita vencendo

O dashboard trabalha com **2025 e 2026**.

## Arquitetura

- Backend: FastAPI + SQLAlchemy + PyMySQL
- Frontend: Next.js + TypeScript + Tailwind CSS + Apache ECharts
- Banco: MySQL 8+ / MariaDB com suporte a `ROW_NUMBER()`

---

## 1. Configurar o banco

Abra:

`backend/.env`

e preencha:

```env
DB_HOST=
DB_PORT=3306
DB_NAME=
DB_USER=
DB_PASSWORD=
```

---

## 2. Rodar o backend

PowerShell:

```powershell
cd backend

python -m venv .venv

.\.venv\Scripts\Activate.ps1

pip install -r requirements.txt

python run.py
```

Backend:

`http://127.0.0.1:8000`

Swagger:

`http://127.0.0.1:8000/docs`

Teste do banco:

`http://127.0.0.1:8000/health`

---

## 3. Rodar o frontend

Em outro PowerShell:

```powershell
cd frontend

npm install

npm run dev
```

Abra:

`http://localhost:3000`

---

## 4. Datas dinâmicas

Se o usuário escolher Setembro/2026:

```text
data_inicio = 2026-09-01
data_fim    = 2026-10-01
```

Se escolher Dezembro/2025:

```text
data_inicio = 2025-12-01
data_fim    = 2026-01-01
```

Nenhuma consulta possui mês fixo.

---

## 5. Histórico

A API disponibiliza 2025 e 2026.

O mês atual aparece como **parcial**.

Meses futuros não são exibidos porque renovação e churn ainda não estão concluídos.

---

## 6. Endpoints

```http
GET /api/meta
GET /api/dashboard?ano=2026&mes=9
GET /api/historico?ano_inicio=2025&ano_fim=2026
GET /health
```

---

## 7. Churn

A consulta mantém a regra original:

```sql
ep.atual = 1
```

Isso foi feito para permitir a comparação direta com a planilha atual.

Observação importante: se o campo `atual` mudar depois, um mês histórico pode mudar. Para histórico imutável, a evolução recomendada é criar uma tabela de snapshot mensal.

---

## 8. Empresas excluídas

A lista de IDs excluídos ficou centralizada em:

`backend/app/constants.py`

Assim todas as consultas usam exatamente a mesma lista.

---

## 9. Cache

Os resultados mensais ficam em cache por 10 minutos para reduzir leituras repetidas no banco.
