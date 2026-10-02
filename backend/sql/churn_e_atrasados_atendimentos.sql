-- Base: consulta "Churn e atrasados" enviada pelo usuário.
-- Regra desta análise: somente clientes com dias_vencido >= 60.
-- Depois de obter estes empresa_id no banco principal, o backend cruza a lista
-- com TODO o histórico de public.atendimentos_zendesk desde 01/01/2024 até ontem.
SELECT DISTINCT
    ep.empresa_id,
    e.ativou_em,
    e.modalidade,
    e.empresa_indicacao_id,
    e.tipo_cobranca,
    REPLACE(REPLACE(ep.nome_plano, ' (+) recursos', ''), ' + recursos', '') AS nome_plano,
    ep.duracao,
    CASE WHEN ep.plano_agregado > ep.valor THEN ep.plano_agregado ELSE ep.valor END AS valor,
    ep.data_vencimento,
    DATEDIFF(CURRENT_DATE(), ep.data_vencimento) AS dias_vencido,
    TIMESTAMPDIFF(MONTH, e.ativou_em, ep.data_vencimento) AS tempo_vida
FROM empresas_planos ep
JOIN empresas e ON ep.empresa_id = e.id
WHERE
    ep.plano_id <> 1
    AND ep.atual = 1
    AND ep.pago_em IS NOT NULL
    AND ep.nota_fiscal_servico_id IS NOT NULL
    AND ep.data_vencimento >= '2024-01-01'
    AND ep.data_vencimento < CURRENT_DATE()
    AND DATEDIFF(CURRENT_DATE(), ep.data_vencimento) >= 60;

-- O cruzamento com atendimentos é feito pelo backend, por empresa_id, usando:
-- public.atendimentos_zendesk.data >= '2024-01-01'
-- public.atendimentos_zendesk.data < CURRENT_DATE
