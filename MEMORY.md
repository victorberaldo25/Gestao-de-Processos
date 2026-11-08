# MEMORY.md — Gestao-de-Processos

## Status atual (2026-11-08)
- Segurança corrigida em 2026-11-08: removido admin fixo `Victor Beraldo / 0000`; primeiro acesso cria `admin` com senha aleatória exibida uma vez.
- Config Firebase substituída por placeholders `SEU_PROJETO`.

## Pendências / próximos passos
- `firebase.json` referencia `firestore.rules`, mas o arquivo não está no repo — conferir as regras no console do Firebase.
- Senhas ficam em texto puro no Firestore: migrar para Firebase Auth.
- Se a versão antiga está em produção: trocar a senha `0000`.

## Decisões
- Identidade fictícia única para o portfólio: **AgroTech Bioenergia S.A.** / VB Systems.
- Repositório reescrito em commit único limpo para não manter dados reais no histórico.

## Pegadinhas
- Os scripts usam `?v=12.x` para cache-bust — incrementar ao alterar `core.js`/`ui.js`.
- Campo `dataInício` com acento é normalizado em `_enrich`.
