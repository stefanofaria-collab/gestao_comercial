from sqlalchemy import URL, create_engine, event, text
from sqlalchemy.engine import Engine
from sqlalchemy.pool import NullPool

from app.config import settings
from app.services.global_filter_context import current_duration, current_plan


def _build_source_connect_args() -> dict:
    connect_args: dict = {
        "password": settings.db_password.encode("utf-8"),
        "connect_timeout": 8,
        "read_timeout": 300,
        "write_timeout": 300,
    }

    if settings.db_ssl:
        ssl_options: dict = {}
        if settings.db_ssl_ca:
            ssl_options["ca"] = settings.db_ssl_ca
        connect_args["ssl"] = ssl_options

    return connect_args


def _create_source_engine() -> Engine:
    url = URL.create(
        drivername="mysql+pymysql",
        username=settings.db_user or None,
        password=None,
        host=settings.db_host or None,
        port=settings.db_port,
        database=settings.db_name or None,
        query={"charset": settings.db_charset},
    )

    return create_engine(
        url,
        pool_pre_ping=True,
        pool_recycle=280,
        pool_size=5,
        max_overflow=10,
        pool_timeout=10,
        connect_args=_build_source_connect_args(),
    )


def _create_supabase_engine() -> Engine:
    host = settings.supabase_db_host or None
    configured_port = settings.supabase_db_port
    use_transaction_pooler = bool(
        host and "pooler.supabase.com" in host and configured_port == 5432
    )
    port = 6543 if use_transaction_pooler else configured_port

    url = URL.create(
        drivername="postgresql+psycopg",
        username=settings.supabase_db_user or None,
        password=settings.supabase_db_password or None,
        host=host,
        port=port,
        database=settings.supabase_db_name or None,
    )

    connect_args = {
        "sslmode": settings.supabase_db_sslmode,
        "prepare_threshold": None,
        "connect_timeout": 10,
    }

    return create_engine(
        url,
        poolclass=NullPool,
        connect_args=connect_args,
    )


def _inject_global_filter_params(conn, clauseelement, multiparams, params, execution_options):
    plan = current_plan()
    duration = current_duration()

    def enrich(values):
        if not isinstance(values, dict):
            return values
        result = dict(values)
        result.setdefault("filtro_plano_global", plan)
        result.setdefault("filtro_duracao_global", duration)
        return result

    if multiparams:
        multiparams = tuple(enrich(item) for item in multiparams)
    if isinstance(params, dict):
        params = enrich(params)
    return clauseelement, multiparams, params


source_engine = _create_source_engine()
supabase_engine = _create_supabase_engine()

event.listen(source_engine, "before_execute", _inject_global_filter_params, retval=True)
event.listen(supabase_engine, "before_execute", _inject_global_filter_params, retval=True)


def test_source_connection() -> bool:
    with source_engine.connect() as connection:
        connection.execute(text("SELECT 1"))
    return True


def test_supabase_connection() -> bool:
    with supabase_engine.connect() as connection:
        connection.execute(text("SELECT 1"))
    return True


def test_connection() -> bool:
    return test_supabase_connection()
