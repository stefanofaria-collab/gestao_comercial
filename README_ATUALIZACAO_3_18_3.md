# Atualização 3.18.3

Correção pontual do erro HTTP 422 ao abrir os vencimentos de um dia ou intervalo pelo calendário.

## Causa
Os campos opcionais de tempo mínimo e máximo estavam sendo enviados ao FastAPI como strings vazias (`tempo_cliente_minimo=&tempo_cliente_maximo=`). O FastAPI tenta converter esses parâmetros para números e rejeita a requisição com status 422.

## Correção
- Parâmetros opcionais vazios deixam de ser enviados.
- Quando preenchidos, os limites continuam sendo enviados normalmente.
- Melhoria na mensagem de validação caso a API retorne 422 novamente.
- Versão do backend: 3.18.3.
