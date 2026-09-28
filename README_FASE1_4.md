FASE 1.4 — correção de runtime

Correção aplicada:
- evita erro "Cannot read properties of undefined (reading map)" no ranking de planos;
- aceita respostas antigas da API sem ranking_planos;
- quando ranking_planos não vier do backend, o frontend deriva o ranking a partir de por_plano;
- API identificada como versão 3.1.0 para facilitar a validação após reinício.
