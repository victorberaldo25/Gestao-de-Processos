# CONTEXT.md — Gestao-de-Processos

## Produto
Gestão do portfólio de projetos de mapeamento de processos por setor (status, revisões, inconformidades, linha do tempo). Sincroniza em tempo real com Firestore.

## Estrutura
- `index.html` — layout + init Firebase
- `core.js` — Store (Firestore), AuthManager, regras de negócio
- `ui.js` — componentes de interface
- `app.js` — views e controllers
- `banco_processos.json` — 119 projetos fictícios para carga inicial
- `upload_firestore.html`, `migrador.html` — utilitários de carga
- `firebase.json`, `firestore.indexes.json`

## Tecnologias
JS vanilla, Firebase (Firestore compat 10.8), SheetJS. Hosting Firebase.
