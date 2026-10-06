from __future__ import annotations

from contextvars import ContextVar, Token
from datetime import date
from calendar import monthrange

_MONTHS: ContextVar[tuple[int, ...]] = ContextVar("global_filter_months", default=())
_YEAR: ContextVar[int | None] = ContextVar("global_filter_year", default=None)
_PLAN: ContextVar[str] = ContextVar("global_filter_plan", default="todos")
_DURATION: ContextVar[str] = ContextVar("global_filter_duration", default="todos")


def _normalize_months(raw: str | None) -> tuple[int, ...]:
    if not raw:
        return ()
    values: set[int] = set()
    for item in str(raw).split(","):
        try:
            value = int(item.strip())
        except (TypeError, ValueError):
            continue
        if 1 <= value <= 12:
            values.add(value)
    if not values:
        return ()
    ordered = sorted(values)
    # A interface usa Shift para selecionar um intervalo; normalizamos o
    # intervalo para impedir lacunas acidentais no período.
    return tuple(range(ordered[0], ordered[-1] + 1))


def _safe_filter(value: str | None) -> str:
    cleaned = str(value or "todos").strip()
    return cleaned or "todos"


def push_request_filters(*, raw_months: str | None, raw_year: str | None, plan: str | None, duration: str | None) -> tuple[Token, Token, Token, Token]:
    try:
        year = int(raw_year) if raw_year else None
    except (TypeError, ValueError):
        year = None
    if year is not None and not 2024 <= year <= 2100:
        year = None
    return (
        _MONTHS.set(_normalize_months(raw_months)),
        _YEAR.set(year),
        _PLAN.set(_safe_filter(plan)),
        _DURATION.set(_safe_filter(duration)),
    )


def pop_request_filters(tokens: tuple[Token, Token, Token, Token]) -> None:
    month_token, year_token, plan_token, duration_token = tokens
    _MONTHS.reset(month_token)
    _YEAR.reset(year_token)
    _PLAN.reset(plan_token)
    _DURATION.reset(duration_token)


def current_months() -> tuple[int, ...]:
    return _MONTHS.get()


def current_year() -> int | None:
    return _YEAR.get()


def current_plan() -> str:
    return _PLAN.get()


def current_duration() -> str:
    return _DURATION.get()


def cache_context() -> dict:
    months = current_months()
    return {
        "ano_global": current_year(),
        "meses_global": list(months),
        "plano_global": current_plan(),
        "duracao_global": current_duration(),
    }


def _month_start(year: int, month: int) -> date:
    return date(year, month, 1)


def _next_month(year: int, month: int) -> date:
    return date(year + 1, 1, 1) if month == 12 else date(year, month + 1, 1)


def period_bounds(year: int, fallback_month: int, *, current_mode: str = "none") -> tuple[date, date]:
    selected_year = current_year() or year
    months = current_months()

    if months:
        first = months[0]
        last = months[-1]
    elif fallback_month == 0:
        first, last = 1, 12
    else:
        first = last = fallback_month

    start = _month_start(selected_year, first)
    end = _next_month(selected_year, last)
    today = date.today()

    # Para períodos correntes, cada serviço já tinha uma convenção própria.
    # Mantemos as mesmas convenções ao ampliar o filtro para vários meses.
    if selected_year == today.year and first <= today.month <= last:
        if current_mode == "today_exclusive":
            end = min(end, today)
        elif current_mode == "today_inclusive":
            from datetime import timedelta
            end = min(end, today + timedelta(days=1))

    return start, end


def previous_period_bounds(year: int, fallback_month: int, current_end: date) -> tuple[int, int, date, date]:
    selected_year = current_year() or year
    months = current_months()

    if months:
        first, last = months[0], months[-1]
        count = last - first + 1
        current_start = date(selected_year, first, 1)

        # Anda N meses para trás preservando o tamanho do intervalo.
        y, m = current_start.year, current_start.month
        for _ in range(count):
            if m == 1:
                y -= 1
                m = 12
            else:
                m -= 1
        previous_start = date(y, m, 1)
        previous_end = current_start
        return previous_start.year, previous_start.month, previous_start, previous_end

    if fallback_month == 0:
        previous_year = selected_year - 1
        previous_start = date(previous_year, 1, 1)
        previous_end = date(selected_year, 1, 1)
        return previous_year, 0, previous_start, previous_end

    previous_year = selected_year if fallback_month > 1 else selected_year - 1
    previous_month = fallback_month - 1 if fallback_month > 1 else 12
    previous_start = date(previous_year, previous_month, 1)
    previous_end = date(selected_year, fallback_month, 1)
    return previous_year, previous_month, previous_start, previous_end


def selected_period_label(year: int | None = None) -> str:
    selected_year = current_year() or year or date.today().year
    months = current_months()
    if not months or len(months) == 12:
        return f"Ano completo de {selected_year}"
    labels = (
        "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
        "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
    )
    if len(months) == 1:
        return f"{labels[months[0] - 1]} de {selected_year}"
    return f"{labels[months[0] - 1]} a {labels[months[-1] - 1]} de {selected_year}"
