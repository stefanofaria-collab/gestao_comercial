from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def read(rel: str) -> tuple[Path, str]:
    path = ROOT / rel
    if not path.exists():
        raise FileNotFoundError(f"Arquivo não encontrado: {rel}")
    return path, path.read_text(encoding="utf-8")


def write(path: Path, text: str) -> None:
    path.write_text(text, encoding="utf-8")


def add_import(text: str, import_line: str, after_prefix: str = "from app.database import") -> str:
    if import_line in text:
        return text
    lines = text.splitlines()
    insert_at = None
    for idx, line in enumerate(lines):
        if line.startswith(after_prefix):
            insert_at = idx + 1
    if insert_at is None:
        # Insere depois do último import do bloco inicial.
        for idx, line in enumerate(lines):
            if line.startswith("from ") or line.startswith("import "):
                insert_at = idx + 1
    if insert_at is None:
        insert_at = 0
    lines.insert(insert_at, import_line)
    return "\n".join(lines) + ("\n" if text.endswith("\n") else "")


def replace_function(text: str, name: str, replacement: str) -> str:
    pattern = re.compile(rf"^def {re.escape(name)}\([^\n]*\).*?(?=^def |^@|\Z)", re.M | re.S)
    match = pattern.search(text)
    if not match:
        raise RuntimeError(f"Função {name} não encontrada")
    return text[: match.start()] + replacement.rstrip() + "\n\n" + text[match.end():].lstrip("\n")


def append_triple_filter(text: str, variable: str, addition: str) -> str:
    marker = ":filtro_plano_global"
    pattern = re.compile(rf'({re.escape(variable)}\s*=\s*""")([\s\S]*?)("""\s*)')
    match = pattern.search(text)
    if not match:
        raise RuntimeError(f"Bloco {variable} não encontrado")
    body = match.group(2)
    if marker in body:
        return text
    new_body = body.rstrip() + "\n" + addition.rstrip() + "\n"
    return text[:match.start(2)] + new_body + text[match.end(2):]


SOURCE_PLAN_FILTER = """
    AND (
        :filtro_plano_global = 'todos'
        OR REPLACE(REPLACE(ep.nome_plano, ' (+) recursos', ''), ' + recursos', '') = :filtro_plano_global
    )
    AND (
        :filtro_duracao_global = 'todos'
        OR ep.duracao = :filtro_duracao_global
    )
"""

ATTENDANCE_CONTEXT_FILTER = """
    AND (
        :filtro_plano_global = 'todos'
        OR COALESCE(NULLIF(c.plano, ''), '') = :filtro_plano_global
    )
    AND (
        :filtro_duracao_global = 'todos'
        OR COALESCE(NULLIF(c.duracao, ''), '') = :filtro_duracao_global
    )
"""

# ---------------------------------------------------------------------------
# Cache: cada combinação global passa a ter sua própria fotografia.
# ---------------------------------------------------------------------------
path, text = read("backend/app/services/dashboard_cache_service.py")
text = add_import(text, "from app.services.global_filter_context import cache_context, pop_request_filters, push_request_filters")
if '"ano_global"' not in text:
    text = text.replace('    "periodo_fim",\n}', '    "periodo_fim",\n    "ano_global",\n    "meses_global",\n}')
old = "    normalized = _normalize_params(params)\n    snapshot = get_snapshot(page, normalized)"
new = "    params = {**params, **cache_context()}\n    normalized = _normalize_params(params)\n    snapshot = get_snapshot(page, normalized)"
if old in text:
    text = text.replace(old, new, 1)
elif "params = {**params, **cache_context()}" not in text:
    raise RuntimeError("Não foi possível atualizar o cache global")
background_old = """        with _SOURCE_REFRESH_LOCK:
            payload = builder()
            save_snapshot(page, params, payload)"""
background_new = """        with _SOURCE_REFRESH_LOCK:
            month_values = params.get("meses_global") or []
            tokens = push_request_filters(
                raw_months=",".join(str(value) for value in month_values),
                raw_year=str(params.get("ano_global") or "") or None,
                plan=str(params.get("plano_global") or "todos"),
                duration=str(params.get("duracao_global") or "todos"),
            )
            try:
                payload = builder()
                save_snapshot(page, params, payload)
            finally:
                pop_request_filters(tokens)"""
if background_old in text:
    text = text.replace(background_old, background_new, 1)
write(path, text)

# ---------------------------------------------------------------------------
# Período global e Plano/Duração nas consultas das páginas.
# ---------------------------------------------------------------------------
period_specs = [
    ("backend/app/services/churn_service.py", "_month_bounds", "today_inclusive", "DIMENSION_FILTER_SQL"),
    ("backend/app/services/vencimentos_futuros_service.py", "_period_bounds", "none", "DIMENSION_FILTER_SQL"),
    ("backend/app/services/atendimentos_service.py", "_month_bounds", "none", None),
]

for rel, function_name, mode, dimension_block in period_specs:
    path, text = read(rel)
    text = add_import(text, "from app.services.global_filter_context import period_bounds as global_period_bounds")
    function = f'''def {function_name}(year: int, month: int) -> tuple[date, date]:\n    return global_period_bounds(year, month, current_mode="{mode}")'''
    text = replace_function(text, function_name, function)
    if dimension_block:
        text = append_triple_filter(text, dimension_block, SOURCE_PLAN_FILTER)
    write(path, text)

# Faturamento usa também o período anterior para comparações.
path, text = read("backend/app/services/faturamento_service.py")
text = add_import(
    text,
    "from app.services.global_filter_context import current_duration, current_plan, period_bounds as global_period_bounds, previous_period_bounds as global_previous_period_bounds",
)
text = replace_function(
    text,
    "_period_bounds",
    'def _period_bounds(year: int, month: int) -> tuple[date, date]:\n    return global_period_bounds(year, month, current_mode="today_exclusive")',
)
text = replace_function(
    text,
    "_previous_period_bounds",
    'def _previous_period_bounds(year: int, month: int, current_end: date) -> tuple[int, int, date, date]:\n    return global_previous_period_bounds(year, month, current_end)',
)
text = append_triple_filter(text, "DIMENSION_FILTER_SQL", SOURCE_PLAN_FILTER)
text = text.replace(
    'def _filters_active(empresa: str, origem: str, pagador: str) -> bool:\n    return empresa != "todos" or origem != "todos" or pagador != "todos"',
    'def _filters_active(empresa: str, origem: str, pagador: str) -> bool:\n    return (\n        empresa != "todos"\n        or origem != "todos"\n        or pagador != "todos"\n        or current_plan() != "todos"\n        or current_duration() != "todos"\n    )',
)
# A leitura rápida do mês atual é feita em Python; portanto o filtro também
# precisa ser aplicado nessa etapa, e não apenas no SQL tradicional.
needle = '    if pagador == "parceiro" and label_pagador != "Parceiro":\n        return False\n    return True\n'
replacement = '''    if pagador == "parceiro" and label_pagador != "Parceiro":\n        return False\n    selected_plan = current_plan()\n    selected_duration = current_duration()\n    if selected_plan != "todos" and _normalized_plan_name(row.get("nome_plano")) != selected_plan:\n        return False\n    if selected_duration != "todos" and str(row.get("duracao") or "") != selected_duration:\n        return False\n    return True\n'''
if needle in text:
    text = text.replace(needle, replacement, 1)
# Nos detalhamentos, usa o início real do intervalo global.
text = text.replace("    start = _month_start(year, month)\n    end = _selected_period_end(year, month, compare_mode)", "    start, _ = _period_bounds(year, month)\n    end = _selected_period_end(year, month, compare_mode)")
# Este cache interno não conhecia Plano/Duração/Múltiplos meses. O cache diário
# externo já cobre a performance e evita reaproveitar um recorte incorreto.
text = text.replace("@lru_cache(maxsize=64)\ndef _fast_current_month_pair", "def _fast_current_month_pair")
write(path, text)

# Serviços com Plano/Duração, mas sem seletor de período principal.
for rel in [
    "backend/app/services/ativos_atrasados_service.py",
    "backend/app/services/perfil_service.py",
]:
    path, text = read(rel)
    text = append_triple_filter(text, "DIMENSION_FILTER_SQL", SOURCE_PLAN_FILTER)
    if rel.endswith("perfil_service.py"):
        text = add_import(text, "from app.services.global_filter_context import current_duration, current_plan")
        text = text.replace(
            "def _get_active_clients_cached(empresa: str, origem: str, pagador: str, reference_iso: str) -> tuple[dict, ...]:",
            "def _get_active_clients_cached(empresa: str, origem: str, pagador: str, reference_iso: str, plan_key: str, duration_key: str) -> tuple[dict, ...]:",
        )
        text = text.replace(
            "return [dict(row) for row in _get_active_clients_cached(empresa, origem, pagador, date.today().isoformat())]",
            "return [dict(row) for row in _get_active_clients_cached(empresa, origem, pagador, date.today().isoformat(), current_plan(), current_duration())]",
        )
    write(path, text)

# Pagamentos precisa preservar toda a sequência antes de calcular LEAD.
# Por isso Plano/Duração são aplicados depois da identificação da renovação.
path, text = read("backend/app/services/pagamentos_service.py")
if "duracao_renovacao" not in text:
    plan_lead = """        LEAD(REPLACE(REPLACE(ep.nome_plano, ' (+) recursos', ''), ' + recursos', '')) OVER (
            PARTITION BY ep.empresa_id
            ORDER BY ep.pago_em, ep.id
        ) AS plano_renovacao,"""
    plan_lead_new = plan_lead + """
        LEAD(ep.duracao) OVER (
            PARTITION BY ep.empresa_id
            ORDER BY ep.pago_em, ep.id
        ) AS duracao_renovacao,"""
    if plan_lead not in text:
        raise RuntimeError("Não foi possível adicionar a duração de renovação em Pagamentos")
    text = text.replace(plan_lead, plan_lead_new, 1)

    final_from = """FROM resultado
ORDER BY pgto_renovacao, empresa_id"""
    final_from_new = """FROM resultado
WHERE
    (
        :filtro_plano_global = 'todos'
        OR COALESCE(NULLIF(plano_renovacao, ''), nome_plano, 'Não informado') = :filtro_plano_global
    )
    AND (
        :filtro_duracao_global = 'todos'
        OR COALESCE(NULLIF(duracao_renovacao, ''), duracao, '') = :filtro_duracao_global
    )
ORDER BY pgto_renovacao, empresa_id"""
    if final_from not in text:
        raise RuntimeError("Não foi possível adicionar os filtros globais em Pagamentos")
    text = text.replace(final_from, final_from_new, 1)
write(path, text)

# Atendimentos possui dois bancos/aliases: origem MySQL (ep) e contexto (c).
path, text = read("backend/app/services/atendimentos_service.py")
text = append_triple_filter(text, "SOURCE_DIMENSION_FILTER", SOURCE_PLAN_FILTER)
text = append_triple_filter(text, "DIMENSION_FILTER", ATTENDANCE_CONTEXT_FILTER)
write(path, text)

# ---------------------------------------------------------------------------
# Pagamentos: além do histórico mensal, cria o resumo exato do intervalo global.
# ---------------------------------------------------------------------------
path, text = read("backend/app/services/pagamentos_service.py")
text = add_import(text, "from app.services.global_filter_context import current_months, current_year, selected_period_label")

if '"periodo_selecionado"' not in text:
    # Inicializa os buckets do período global.
    anchor = '    plan_monthly: dict[tuple[int, int, str], dict[str, Any]] = defaultdict(_new_bucket)\n\n    for event in events:'
    repl = '''    plan_monthly: dict[tuple[int, int, str], dict[str, Any]] = defaultdict(_new_bucket)\n    selected_bucket = _new_bucket()\n    selected_plan_buckets: dict[str, dict[str, Any]] = defaultdict(_new_bucket)\n    selected_year = current_year() or date.today().year\n    selected_months = set(current_months() or (date.today().month,))\n\n    for event in events:'''
    if anchor not in text:
        raise RuntimeError("Âncora dos buckets de Pagamentos não encontrada")
    text = text.replace(anchor, repl, 1)

    anchor = '''        _add_event(monthly[(paid_at.year, paid_at.month)], event)\n        _add_event(yearly[paid_at.year], event)\n        _add_event(plan_monthly[(paid_at.year, paid_at.month, plan)], event)'''
    repl = '''        _add_event(monthly[(paid_at.year, paid_at.month)], event)\n        _add_event(yearly[paid_at.year], event)\n        _add_event(plan_monthly[(paid_at.year, paid_at.month, plan)], event)\n        if paid_at.year == selected_year and paid_at.month in selected_months:\n            _add_event(selected_bucket, event)\n            _add_event(selected_plan_buckets[plan], event)'''
    if anchor not in text:
        raise RuntimeError("Âncora de agregação de Pagamentos não encontrada")
    text = text.replace(anchor, repl, 1)

    anchor = '        "planos": plans,\n        "historico_mensal": monthly_rows,'
    repl = '''        "planos": plans,\n        "periodo_selecionado": {\n            "ano": selected_year,\n            "meses": sorted(selected_months),\n            "label": selected_period_label(selected_year),\n            **_serialize_bucket(selected_bucket),\n        },\n        "planos_periodo_selecionado": [\n            {"plano": plan, **_serialize_bucket(bucket)}\n            for plan, bucket in sorted(selected_plan_buckets.items(), key=lambda item: item[0].casefold())\n        ],\n        "historico_mensal": monthly_rows,'''
    if anchor not in text:
        raise RuntimeError("Âncora de retorno de Pagamentos não encontrada")
    text = text.replace(anchor, repl, 1)
    text = text.replace(
        '"periodo_padrao": {\n            "ano": today.year,\n            "mes": today.month,\n        }',
        '"periodo_padrao": {\n            "ano": selected_year,\n            "mes": min(selected_months) if selected_months else today.month,\n        }',
    )
write(path, text)

# ---------------------------------------------------------------------------
# Frontend: seletor mensal agora existe apenas na barra global.
# Os componentes continuam guardando seus estados internos para compatibilidade,
# mas o request é substituído pelo contexto global e os controles locais somem.
# ---------------------------------------------------------------------------
hide_replacements = {
    "frontend/components/faturamento/FaturamentoDashboard.tsx": [
        ('<div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">\n              <CalendarDays', '<div className="hidden items-center gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">\n              <CalendarDays'),
    ],
    "frontend/components/churn/ChurnDashboard.tsx": [
        ('<div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">\n            <CalendarDays', '<div className="hidden items-center gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">\n            <CalendarDays'),
    ],
    "frontend/components/perfil/PerfilDashboard.tsx": [
        ('<div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">\n            <CalendarDays', '<div className="hidden items-center gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">\n            <CalendarDays'),
    ],
    "frontend/components/atendimentos/AtendimentosDashboard.tsx": [
        ('<div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">\n            <div className="flex items-center gap-3">\n              <div className="grid h-10 w-10 place-items-center rounded-xl bg-slate-50 text-slate-500"><CalendarDays', '<div className="hidden rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">\n            <div className="flex items-center gap-3">\n              <div className="grid h-10 w-10 place-items-center rounded-xl bg-slate-50 text-slate-500"><CalendarDays'),
    ],
    "frontend/components/pagamentos/PagamentosDashboard.tsx": [
        ('<div className="flex items-end gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">\n            <div className="grid h-10 w-10 place-items-center rounded-xl bg-slate-50 text-slate-500">\n              <CalendarDays', '<div className="hidden items-end gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">\n            <div className="grid h-10 w-10 place-items-center rounded-xl bg-slate-50 text-slate-500">\n              <CalendarDays'),
    ],
    "frontend/components/vencimentos-futuros/VencimentosFuturosDashboard.tsx": [
        ('<div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">\n              <div className="flex items-center gap-3">\n              <div className="grid h-10 w-10 place-items-center rounded-xl bg-slate-50 text-slate-500">\n                <CalendarDays', '<div className="hidden rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">\n              <div className="flex items-center gap-3">\n              <div className="grid h-10 w-10 place-items-center rounded-xl bg-slate-50 text-slate-500">\n                <CalendarDays'),
    ],
}

for rel, replacements in hide_replacements.items():
    path, text = read(rel)
    changed = False
    for old, new in replacements:
        if old in text:
            text = text.replace(old, new, 1)
            changed = True
    if not changed and "hidden" not in text:
        raise RuntimeError(f"Não foi possível ocultar o filtro local em {rel}")
    write(path, text)

# Sincroniza os estados internos de período com a barra global.
state_specs = {
    "frontend/components/faturamento/FaturamentoDashboard.tsx": [
        ("const [year, setYear] = useState(currentYear);", "const [year, setYear] = useState(filters.ano);"),
        ("const [month, setMonth] = useState(currentMonth);", "const [month, setMonth] = useState(filters.anoCompleto ? 0 : (filters.meses[0] ?? currentMonth));"),
    ],
    "frontend/components/churn/ChurnDashboard.tsx": [
        ("const [year, setYear] = useState(currentYear);", "const [year, setYear] = useState(filters.ano);"),
        ("const [month, setMonth] = useState(currentMonth);", "const [month, setMonth] = useState(filters.anoCompleto ? 0 : (filters.meses[0] ?? currentMonth));"),
    ],
    "frontend/components/perfil/PerfilDashboard.tsx": [
        ("const [year, setYear] = useState(currentYear);", "const [year, setYear] = useState(filters.ano);"),
        ("const [month, setMonth] = useState(currentMonth);", "const [month, setMonth] = useState(filters.anoCompleto ? 0 : (filters.meses[0] ?? currentMonth));"),
    ],
}
for rel, pairs in state_specs.items():
    path, text = read(rel)
    for old, new in pairs:
        if old in text:
            text = text.replace(old, new, 1)
    write(path, text)

# Atendimentos não aceita mes=0 na rota antiga. O contexto global amplia o
# intervalo, enquanto o estado interno guarda o primeiro mês apenas para
# compatibilidade da tela.
path, text = read("frontend/components/atendimentos/AtendimentosDashboard.tsx")
text = text.replace(
    "setYear(response.ano_padrao);\n        setMonth(response.mes_padrao);",
    "setYear(filters.ano);\n        setMonth(filters.meses[0] ?? response.mes_padrao);",
)
write(path, text)

# Vencimentos Futuros aceita Ano Completo e também precisa montar um calendário
# para cada mês do intervalo quando há seleção com Shift.
path, text = read("frontend/components/vencimentos-futuros/VencimentosFuturosDashboard.tsx")
text = text.replace(
    "setYear(response.ano_atual);\n        setMonth(response.mes_atual);",
    "setYear(filters.ano);\n        setMonth(filters.anoCompleto ? 0 : (filters.meses[0] ?? response.mes_atual));",
)
old_calendar = """    if (data.periodo.ano_completo) {
      return MONTHS.map((_, index) => ({ month: index + 1, year: data.periodo.ano, items: map.get(index + 1) ?? [] }));
    }

    return [{ month: data.periodo.mes, year: data.periodo.ano, items: map.get(data.periodo.mes) ?? [] }];"""
new_calendar = """    const selectedMonths = filters.anoCompleto
      ? Array.from({ length: 12 }, (_, index) => index + 1)
      : (filters.meses.length ? filters.meses : [data.periodo.mes]);
    return selectedMonths.map((selectedMonth) => ({
      month: selectedMonth,
      year: filters.ano,
      items: map.get(selectedMonth) ?? [],
    }));"""
if old_calendar in text:
    text = text.replace(old_calendar, new_calendar, 1)
    calendar_pos = text.find(new_calendar)
    dependency_pos = text.find("  }, [data]);", calendar_pos)
    if dependency_pos >= 0:
        text = text[:dependency_pos] + "  }, [data, filters.ano, filters.anoCompleto, filters.meses]);" + text[dependency_pos + len("  }, [data]);"):]
write(path, text)

# Textos visíveis acompanham o período global, inclusive quando há vários meses.
path, text = read("frontend/components/faturamento/FaturamentoDashboard.tsx")
text = text.replace(
    'const periodLabel = month === 0 ? `Ano completo/${year}` : `${MONTHS[month - 1]}/${year}`;\n  const periodWord = month === 0 ? "ano" : "mês";\n  const previousPeriodWord = month === 0 ? "ano anterior" : "mês passado";',
    'const periodLabel = filters.anoCompleto ? `Ano completo/${filters.ano}` : filters.meses.length > 1 ? `${MONTHS[(filters.meses[0] ?? 1) - 1]} a ${MONTHS[(filters.meses[filters.meses.length - 1] ?? 1) - 1]}/${filters.ano}` : `${MONTHS[(filters.meses[0] ?? month) - 1]}/${filters.ano}`;\n  const periodWord = filters.anoCompleto ? "ano" : filters.meses.length > 1 ? "período" : "mês";\n  const previousPeriodWord = filters.anoCompleto ? "ano anterior" : filters.meses.length > 1 ? "período anterior" : "mês passado";',
)
write(path, text)

path, text = read("frontend/components/churn/ChurnDashboard.tsx")
text = text.replace(
    'const periodLabel = month === 0 ? `Ano completo de ${year}` : `${MONTHS[month - 1]} de ${year}`;',
    'const periodLabel = filters.anoCompleto ? `Ano completo de ${filters.ano}` : filters.meses.length > 1 ? `${MONTHS[(filters.meses[0] ?? 1) - 1]} a ${MONTHS[(filters.meses[filters.meses.length - 1] ?? 1) - 1]} de ${filters.ano}` : `${MONTHS[(filters.meses[0] ?? month) - 1]} de ${filters.ano}`;',
)
write(path, text)

path, text = read("frontend/components/perfil/PerfilDashboard.tsx")
text = text.replace(
    'subtitle={month === 0 ? `Acumulado de ${year}.` : `${MONTHS[month]} de ${year}.`}',
    'subtitle={filters.anoCompleto ? `Acumulado de ${filters.ano}.` : filters.meses.length > 1 ? `${MONTHS[filters.meses[0] ?? 1]} a ${MONTHS[filters.meses[filters.meses.length - 1] ?? 1]} de ${filters.ano}.` : `${MONTHS[filters.meses[0] ?? month]} de ${filters.ano}.`}',
)
write(path, text)

path, text = read("frontend/components/vencimentos-futuros/VencimentosFuturosDashboard.tsx")
text = text.replace(
    'title={data.periodo.ano_completo ? "Calendário de vencimentos do ano" : "Calendário de vencimentos do mês"}',
    'title={filters.anoCompleto ? "Calendário de vencimentos do ano" : filters.meses.length > 1 ? "Calendários de vencimentos do período" : "Calendário de vencimentos do mês"}',
)
write(path, text)

# Títulos de Atendimentos deixam de falar em um único mês.
path, text = read("frontend/components/atendimentos/AtendimentosDashboard.tsx")
text = text.replace('title="Atendimentos no mês"', 'title="Atendimentos no período"')
text = text.replace(
    'footer={`${MONTHS[data.periodo.mes - 1]} de ${data.periodo.ano}`}',
    'footer={filters.anoCompleto ? `Ano completo de ${filters.ano}` : filters.meses.length > 1 ? `${MONTHS[(filters.meses[0] ?? 1) - 1]} a ${MONTHS[(filters.meses[filters.meses.length - 1] ?? 1) - 1]} de ${filters.ano}` : `${MONTHS[(filters.meses[0] ?? data.periodo.mes) - 1]} de ${filters.ano}`}',
)
write(path, text)

# Pagamentos usa o bucket agregado do período global, inclusive quando há vários meses.
path, text = read("frontend/components/pagamentos/PagamentosDashboard.tsx")
if "periodo_selecionado" not in text:
    text = text.replace(
        'const monthSummary = monthly ?? emptySummary();\n  const yearSummary = yearly ?? emptySummary();',
        'const monthSummary = data?.periodo_selecionado ?? monthly ?? emptySummary();\n  const yearSummary = yearly ?? emptySummary();',
    )
    text = text.replace(
        '''    return data.historico_planos\n      .filter((row) => row.ano === year && row.mes === month)\n      .sort((a, b) => b.pagamentos_total - a.pagamentos_total || a.plano.localeCompare(b.plano, "pt-BR"));''',
        '''    if (Array.isArray(data.planos_periodo_selecionado)) {\n      return data.planos_periodo_selecionado\n        .map((row) => ({ ...row, ano: filters.ano, mes: filters.meses[0] ?? month, label: data.periodo_selecionado?.label ?? "Período" } as PaymentPlanMonthly))\n        .sort((a, b) => b.pagamentos_total - a.pagamentos_total || a.plano.localeCompare(b.plano, "pt-BR"));\n    }\n    return data.historico_planos\n      .filter((row) => row.ano === year && row.mes === month)\n      .sort((a, b) => b.pagamentos_total - a.pagamentos_total || a.plano.localeCompare(b.plano, "pt-BR"));''',
    )
    text = text.replace('title={`Pagamentos de ${monthLabel} de ${year}`}', 'title={`Pagamentos de ${data?.periodo_selecionado?.label ?? `${monthLabel} de ${year}`}`}`')
    text = text.replace('subtitle={`Base: ${count(monthSummary.pagamentos_total)} pagamentos de renovação no mês.`}', 'subtitle={`Base: ${count(monthSummary.pagamentos_total)} pagamentos de renovação no período.`}')
write(path, text)

# Tipos da resposta de Pagamentos.
path, text = read("frontend/types/pagamentos.ts")
if "periodo_selecionado" not in text:
    text = text.replace(
        '  planos: string[];\n  historico_mensal: PaymentMonthly[];',
        '  planos: string[];\n  periodo_selecionado?: PaymentSummary & { ano: number; meses: number[]; label: string };\n  planos_periodo_selecionado?: Array<PaymentSummary & { plano: string }>;\n  historico_mensal: PaymentMonthly[];',
    )
write(path, text)

print("[OK] Padronização de filtros aplicada.")
