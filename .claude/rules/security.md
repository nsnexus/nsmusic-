---
description: Segredos, autorização e exposição de dados
globs:
  - "src/**"
---

# Segurança

## Segredos

- Segredo de servidor: `process.env.NOME`, **sem** prefixo `NEXT_PUBLIC_`.
- Nunca usar fallback literal: `process.env.X || 'chave-real'` é proibido. Se a variável faltar,
  falhe com `500` e uma mensagem que cite o **nome** da variável, nunca o valor.
- Tudo com `NEXT_PUBLIC_` chega ao browser. Só configuração pública do Firebase e a URL do site.
- Ao encontrar um segredo versionado: rotacionar no provedor **primeiro**, depois remover do código.

## Autorização

- Nenhuma decisão de autorização pode viver em código com `'use client'`. Checagem no browser é UX,
  não é controle de acesso.
- Rota que lê, altera ou exclui dado de pedido exige ID token do Firebase verificado no servidor.
- Identidade de admin por custom claim, nunca por comparação de string de e-mail.
- `orderId` vindo do cliente é uma alegação, não uma permissão — verifique a posse antes de agir.

## Entrada e saída

- Proxy (`/api/image-proxy`, `/api/audio/proxy`) só aceita URL de domínio em allowlist e nunca repassa
  o `Content-Type` da origem sem validar. Sem isso é SSRF e XSS no próprio domínio.
- Não colocar dado pessoal em query string.
- Não logar telefone, e-mail, CPF, endereço, nem prefixo/tamanho de token.
- Mensagem de erro devolvida ao cliente não deve conter `error.message` de serviço externo.

## Checagem antes do commit

- [ ] `grep -rE "(sk-|Bearer )[A-Za-z0-9_-]{16,}|[a-f0-9]{32}" src/` sem resultados
- [ ] Nenhuma variável nova sem `NEXT_PUBLIC_` sendo lida em componente cliente
- [ ] Nenhum `console.log` novo com campo de `customerPhone`/`customerEmail`
