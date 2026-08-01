---
name: run-quality-checks
description: Executa as verificações de qualidade do NS Music (build, lint, audit de dependências, varredura de segredos) e reporta o resultado real. Use antes de commitar, antes de push para master, ou quando pedirem para "checar se está tudo ok".
---

# Verificações de qualidade

Só comandos não destrutivos. **Nunca** rodar `npm audit fix`, `npm update` ou `npm install <pkg>` aqui.

## 1. Sanidade do ambiente

`node_modules` deste repositório quebra com frequência (fica sem `next`). Verifique antes:

```bash
ls node_modules/next/dist/bin >/dev/null 2>&1 || echo "QUEBRADO: rode npm ci"
```

Se estiver quebrado, `npm ci` é a única correção aceitável — nunca `npm install` (mudaria o lockfile).

## 2. Comandos

```bash
npm run build
npm run lint
npm audit --omit=dev
```

O gerenciador é **npm** (`package-lock.json`). Não trocar por pnpm/yarn/bun.
Não existem `npm test` nem `npm run typecheck` neste projeto — não invente.

## 3. Varredura de segredos

```bash
grep -rnE "(sk-|Bearer )[A-Za-z0-9_-]{16,}|[a-f0-9]{32}" src/
```

Qualquer resultado é bloqueante. Reporte o `arquivo:linha` e **nunca** o valor encontrado.

## 4. Saída esperada

Uma tabela de até 6 linhas: comando · resultado (passou/falhou) · primeira mensagem de erro.
Depois, no máximo 3 linhas de conclusão.

- Se um comando não rodou, diga que **não rodou** e por quê. Nunca reporte como aprovado.
- Baseline conhecido em 2026-08-01: `npm audit` acusava 14 vulnerabilidades (3 altas). Um número
  igual a esse não é uma regressão nova — compare antes de alarmar.
