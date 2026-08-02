---
description: Páginas e componentes React
globs:
  - "src/app/**/page.jsx"
  - "src/app/**/*.jsx"
  - "src/components/**"
---

# Frontend

## Estilo

- CSS inline (`style={{}}`) + classes de `src/app/globals.css`. **Tailwind é proibido** — não está
  instalado; classes como `flex`, `hidden`, `fixed`, `z-50`, `inset-0` não fazem nada.
- Fontes via `var(--font-family-title)` / `var(--font-family-body)`.

## React

- `'use client'` só quando houver hook, event handler ou API de browser.
- `export const runtime = 'edge'` **é permitido e necessário** em `page.jsx` com `'use client'` quando
  a rota tem segmento dinâmico (ex: `[id]`) — o Next.js lê essa config separado do componente, e o
  build da Cloudflare (`@cloudflare/next-on-pages`) falha sem ela para toda rota não-estática. Uma
  correção anterior removeu isso de `admin/pedidos/[id]/page.jsx` achando que "não tinha efeito"
  (validado só com `next build` local, que não faz essa checagem) — quebrou o deploy real. Rotas sem
  segmento dinâmico, mesmo sendo `'use client'`, normalmente já saem estáticas e não precisam disso.
- Todo `setInterval`/`setTimeout` precisa de cleanup. Polling vive dentro de `useEffect` com `return
  () => clearInterval(...)`, nunca solto dentro de um event handler — hoje há um poller de até 6
  minutos que sobrevive à desmontagem (`criar/page.jsx:1109`).
- Polling precisa de limite de tentativas e de parada em caso de erro persistente.
- Verificar as dependências de todo `useEffect`.
- Componente novo com mais de 400 linhas deve ser decomposto. `criar/page.jsx` (2.789) e
  `entrega/page.jsx` (1.443) já violam isso — não aumente.
- Função repetida em dois arquivos vai para `src/lib/`.

## Estados e erros

- Toda operação assíncrona precisa de estado visual de carregando, sucesso e erro.
- `catch(e => console.warn(e))` sem feedback ao usuário é proibido quando a operação era visível para ele.
- Se a escrita no banco falhou, a UI não pode exibir sucesso. Vale especialmente para o formulário de
  avaliação em `entrega/page.jsx`, que hoje mostra sucesso sem persistir nada.
- Nunca deixar a tela travada em `loading = true` quando `!res.ok`.

## Formulários e acessibilidade

- Todo campo precisa de `<label>`. Todo botão não-submit precisa de `type="button"`.
- Validação no cliente é conveniência; a mesma regra tem que existir no servidor.
- Imagem preferencialmente com `next/image` e sempre com `alt`.

## Checagem antes do commit

- [ ] Todo timer criado tem cleanup
- [ ] Nenhuma classe Tailwind introduzida
- [ ] Estados de erro e vazio cobertos
