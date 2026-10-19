# Validação da experiência — 19/10/2026

- `npm test`: 82 arquivos e 561 testes aprovados. Execução com permissão ampliada porque o ambiente restrito bloqueava renomeação de arquivos temporários (EPERM).
- `npm run build`: aprovado, incluindo compilação, tipos e geração das páginas. Permissão ampliada necessária para arquivos temporários do Next.
- `npm run lint`: aprovado com avisos de hooks e imagens; não está sem avisos.
- Cache antigo preservado em `node_modules/.cache/next-cache-before-experience-20261019`, fora da busca de tipos. Nenhum cache foi apagado.
- Diagnóstico enviado pelo usuário confirma a base de quatro tabelas e quatro funções de créditos anterior à migração. Usuário informou conclusão da execução do SQL incremental; resultado pós-migração ainda não consultado diretamente.
- Acesso administrativo via Management API segue com token inválido. Não registrar tokens em mensagens nem neste documento.
- `node scripts/check-experience-schema.mjs`: estrutura pós-migração confirmada via OpenAPI com credencial de serviço; nove funções novas, duas tabelas e três colunas disponíveis, sem consultar dados de clientes.
- Auditoria de dependências: quatro vulnerabilidades (três altas, uma crítica), sem mudança em dependências ou lockfile nesta implementação. Atualização de framework fica fora deste deploy.
- Varredura de segredos em `src`: único resultado é o hostname público já existente do bucket R2 em `proxyAllowlist.js`, não uma credencial.
- Navegação manual local: quatro etapas do formulário e revisão, redirecionamento `/minhas-musicas` → `/conta`, entrada de visitante e checkout com pedido próprio de teste. PIX gerado em contingência estática, sem pagamento realizado e sem telefone de cliente.
- Produção ainda não confirmada neste registro; envio ao Git autorizado explicitamente pelo usuário.

## Pendências antes de produção

1. Confirmar permissões e execução real das funções de aprovação após pagamento.
2. Completar login real, vínculo e biblioteca autenticada; navegação de visitante conferida.
3. Com pedido próprio, completar pagamento e desbloqueio, compra única da oferta e resgate; nunca usar pedido real de cliente. Não houve transferência financeira neste teste.
4. Revisar cobranças pendentes expiradas e concorrência entre contingência PIX estático e cobrança dinâmica.
5. Confirmar deploy Cloudflare e novas páginas em produção após o push.
