# Gestão Comercial — atualização 3.7.0

## Nova página Perfil

- compara a base ativa atual com os churns do período selecionado;
- separa indicadores por PF e PJ usando o documento do cadastro;
- mostra clientes ativos, valor atual da base, churn, LTV e perfil por plano;
- compara o documento do cadastro com o documento usado na nota fiscal;
- quando os dois CNPJs são diferentes, o usuário pode escolher qual deles quer consultar;
- CPF nunca é enviado para APIs de empresas;
- consulta de CNPJ é feita sob demanda, ao abrir um cliente, para evitar milhares de requisições externas;
- integração principal: BrasilAPI / Minha Receita;
- fallback: API pública CNPJ.ws;
- setor e segmento são derivados da hierarquia oficial do CNAE;
- número de colaboradores fica explicitamente como não disponível quando a fonte pública não trouxer esse dado.

## Dados adicionais de empresa

- razão social e nome fantasia;
- CNAE principal e descrição;
- setor, segmento, grupo e classe CNAE;
- porte;
- natureza jurídica;
- regime tributário quando retornado;
- Simples Nacional / MEI;
- capital social;
- situação cadastral;
- matriz/filial;
- data de abertura;
- cidade, UF e endereço;
- telefone e e-mail quando públicos;
- CNAEs secundários;
- quadro de sócios e administradores retornado pela fonte pública.
