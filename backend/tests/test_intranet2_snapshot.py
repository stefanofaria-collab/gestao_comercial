"""Testes dos filtros da copia local da Intranet 2.0.

Nao conectam a nenhum banco; permitem validar alteracoes nos filtros SQL.
"""
import unittest

from app.services.intranet2_service import normalize_filters
from app.services.intranet2_snapshot_service import (
    _fresh_row,
    _search_conditions,
)


class Intranet2SnapshotFilterTests(unittest.TestCase):
    def test_filtros_vazios_nao_exigem_condicoes(self):
        conditions, params = _search_conditions(normalize_filters())
        self.assertEqual(conditions, "TRUE")
        self.assertEqual(params, {})

    def test_filtros_texto_telefone_e_empresa(self):
        filters = normalize_filters(
            razao_social="Teste",
            telefone="(81) 99999-0000",
            empresa="gestaoclick",
            cidade="Recife",
        )
        conditions, params = _search_conditions(filters)
        self.assertIn("ILIKE :razao_social_pattern", conditions)
        self.assertIn("REGEXP_REPLACE", conditions)
        self.assertIn("LOWER(:cidade)", conditions)
        self.assertEqual(params["telefone_padrao"], "%81999990000%")
        self.assertEqual(params["empresa"], "GestãoClick")

    def test_datas_e_atrasos_sao_filtrados_no_servidor(self):
        filters = normalize_filters(
            vencimento_de="2026-11-01",
            vencido_min=60,
            somente_ultrapassou_media=True,
        )
        conditions, params = _search_conditions(filters)
        self.assertIn("data_vencimento", conditions)
        self.assertIn("_media_dias_pagamento_real", conditions)
        self.assertEqual(params["vencido_min"], 60)
        self.assertEqual(str(params["vencimento_de"]), "2026-11-01")

    def test_atualiza_contagem_de_dias_sem_alterar_dados_de_origem(self):
        raw = {
            "empresa_id": 1,
            "ultimo_acesso": "2020-01-01T10:00:00",
            "data_vencimento": "2020-06-01",
            "pago_em": "2020-05-01",
        }
        fresh = _fresh_row(raw)
        self.assertFalse(fresh["ativo"])
        self.assertGreater(fresh["dias_vencido"], 0)
        self.assertNotIn("dias_vencido", raw)


if __name__ == "__main__":
    unittest.main()
