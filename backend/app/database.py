from sqlalchemy import URL, create_engine, text
from sqlalchemy.engine import Engine
from sqlalchemy.pool import NullPool

from app.config import settings


def _build_source_connect_args() -> dict:
    connect_args: dict = {
        "password": settings.db_password.encode("utf-8"),
        # Evita que o dashboard fique indefinidamente aguardando uma conexão MySQL.
        "connect_timeout": 8,
        "read_timeout": 180,
        "write_timeout": 180,
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
    # O Supabase usa Supavisor. O site trabalha em Transaction Mode (6543)
    # e NÃO mantém um QueuePool local. Cada consulta abre uma conexão curta,
    # usa o pooler do Supabase e libera imediatamente. Isso evita o erro
    # "QueuePool limit reached" quando o sincronizador e o dashboard rodam
    # ao mesmo tempo.
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
        # O Supavisor em transaction mode não deve usar prepared statements.
        "prepare_threshold": None,
        "connect_timeout": 10,
    }

    return create_engine(
        url,
        poolclass=NullPool,
        connect_args=connect_args,
    )


source_engine = _create_source_engine()
supabase_engine = _create_supabase_engine()


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
