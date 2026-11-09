"""Regressao dos eventos SQLAlchemy usados na sincronizacao com Supabase.

Executar a partir de backend/: python -m unittest discover -s tests -v
Os testes usam somente SQLite em memoria; nao acessam MySQL ou Supabase.
"""
import unittest

from sqlalchemy import create_engine, event, text

from app.database import _inject_global_filter_params
from app.services.global_filter_context import pop_request_filters, push_request_filters


class DatabaseParamsEventTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite+pysqlite:///:memory:")
        event.listen(
            self.engine,
            "before_execute",
            _inject_global_filter_params,
            retval=True,
        )
        with self.engine.begin() as connection:
            connection.execute(text("CREATE TABLE registros (ano INTEGER, mes INTEGER)"))

    def tearDown(self):
        self.engine.dispose()

    def test_insert_em_lote_nao_retorna_params_e_multiparams_simultaneamente(self):
        with self.engine.begin() as connection:
            connection.execute(
                text("INSERT INTO registros (ano, mes) VALUES (:ano, :mes)"),
                [{"ano": 2026, "mes": 10}, {"ano": 2026, "mes": 11}],
            )
            result = connection.execute(
                text("SELECT ano, mes FROM registros ORDER BY mes")
            ).all()

        self.assertEqual(result, [(2026, 10), (2026, 11)])

    def test_insert_individual_continua_funcionando(self):
        with self.engine.begin() as connection:
            connection.execute(
                text("INSERT INTO registros (ano, mes) VALUES (:ano, :mes)"),
                {"ano": 2026, "mes": 10},
            )
            result = connection.execute(text("SELECT COUNT(*) FROM registros")).scalar_one()

        self.assertEqual(result, 1)

    def test_filtros_globais_sao_preenchidos_quando_necessarios(self):
        tokens = push_request_filters(
            raw_months="11", raw_year="2026", plan="Plano Teste", duration="M"
        )
        try:
            with self.engine.connect() as connection:
                result = connection.execute(
                    text(
                        "SELECT :filtro_plano_global AS plano, "
                        ":filtro_duracao_global AS duracao"
                    )
                ).one()
            self.assertEqual(result, ("Plano Teste", "M"))
        finally:
            pop_request_filters(tokens)


if __name__ == "__main__":
    unittest.main()
