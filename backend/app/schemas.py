from typing import Optional

from pydantic import BaseModel


class DashboardBlock(BaseModel):
    clientes_ativos: int
    renovacoes_previstas: int
    receita_vencendo: float
    renovacoes_clientes: int
    renovacoes_receita: float
    churn_clientes: int
    churn_receita: float

    percentual_renovacoes_clientes_ativos: float
    ticket_medio_vencimentos: float
    ticket_medio_renovado: float
    taxa_renovacao_clientes: float
    taxa_renovacao_receita: float
    ticket_medio_perdido: float
    percentual_churn_clientes_ativos: float
    percentual_churn_vencimentos: float
    percentual_churn_receita_vencendo: float


class Periodo(BaseModel):
    ano: int
    mes: int
    data_inicio: str
    data_fim: str
    parcial: bool


class DashboardDetail(DashboardBlock):
    nome_plano: str
    duracao: str
    duracao_label: str


class DashboardPlan(DashboardBlock):
    nome_plano: str


class DashboardDuration(DashboardBlock):
    duracao: str
    duracao_label: str


class PreviousMonth(BaseModel):
    ano: int
    mes: int
    resumo: DashboardBlock


class DashboardResponse(BaseModel):
    periodo: Periodo
    resumo: DashboardBlock
    por_plano: list[DashboardPlan]
    por_duracao: list[DashboardDuration]
    detalhe: list[DashboardDetail]
    mes_anterior: Optional[PreviousMonth] = None


class HistoryPoint(BaseModel):
    ano: int
    mes: int
    label: str
    parcial: bool
    resumo: DashboardBlock


class HistoricoResponse(BaseModel):
    ano_inicio: int
    ano_fim: int
    pontos: list[HistoryPoint]


class ActiveClientsPoint(BaseModel):
    ano: int
    mes: int
    label: str
    clientes_ativos: int
    variacao_clientes: Optional[int] = None
    variacao_percentual: Optional[float] = None


class ActiveClientsPlanPoint(BaseModel):
    ano: int
    mes: int
    label: str
    nome_plano: str
    clientes_ativos: int


class ActiveClientsHistoryResponse(BaseModel):
    ano_inicio: int
    ano_fim: int
    pontos: list[ActiveClientsPoint]
    planos: list[str]
    pontos_planos: list[ActiveClientsPlanPoint]


class DurationOption(BaseModel):
    value: str
    label: str


class MetaResponse(BaseModel):
    anos: list[int]
    ultimo_ano: int
    ultimo_mes: int
    mes_atual_parcial: bool
    planos: list[str]
    duracoes: list[DurationOption]
