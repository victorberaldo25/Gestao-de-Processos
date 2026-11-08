# AGENT.md — Gestao-de-Processos

## Comandos
- Rodar: `npx serve . -l 5000`
- Deploy: `firebase deploy` (preencher a config do Firebase antes)
- Test/lint: não configurados

## Estilo
- JS: `camelCase` para variáveis/funções, `UPPER_SNAKE_CASE` para constantes globais.
- Textos de interface em pt-BR.
- Commits: Conventional Commits (`feat:`, `fix:`, `docs:`, `refactor:`, `chore:`, `security:`).

## Regras invioláveis
- **Nunca** commitar dados reais: razão social, CNPJ/CPF, nomes de pessoas, valores extraídos do ERP, logos de empresas reais.
- **Nunca** commitar credenciais: senhas fixas, `apiKey`, IDs reais de projeto Firebase, `serviceAccountKey.json`, `.env`.
- Toda base de demonstração vem de dados sintéticos (`mock_data.js` ou gerador) — identidade fictícia **AgroTech Bioenergia S.A.**
- Antes de cada push, rodar a checagem de dados sensíveis (ver `SKILLS.md`).
- Não editar libs minificadas (`*.min.js`).
