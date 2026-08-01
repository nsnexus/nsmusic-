#!/usr/bin/env node
/**
 * Define o custom claim `admin: true` numa conta do Firebase Auth (ver A-08 no AUDIT_REPORT.md).
 * Este é o mecanismo DEFINITIVO de identidade de admin — substitui a allowlist `ADMIN_EMAILS`
 * (que continua funcionando como fallback em `src/lib/auth.js`).
 *
 * ⚠️ Requer o Firebase Admin SDK e uma service account — NÃO EXECUTADO NESTA SESSÃO (sem credenciais).
 * ⚠️ NUNCA commite o arquivo de credenciais da service account.
 *
 * Uso:
 *   npm install --save-dev firebase-admin        # se ainda não estiver instalado
 *   GOOGLE_APPLICATION_CREDENTIALS=/caminho/para/service-account.json \
 *     node scripts/set-admin-claim.mjs seu-email@example.com
 *
 * Para revogar:
 *   GOOGLE_APPLICATION_CREDENTIALS=/caminho/para/service-account.json \
 *     node scripts/set-admin-claim.mjs seu-email@example.com --revoke
 *
 * A service account é obtida em: Firebase Console > Configurações do projeto > Contas de serviço >
 * Gerar nova chave privada.
 */
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const email = process.argv[2];
const revoke = process.argv.includes('--revoke');

if (!email) {
  console.error('Uso: node scripts/set-admin-claim.mjs <email> [--revoke]');
  process.exit(1);
}

if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error('Defina GOOGLE_APPLICATION_CREDENTIALS apontando para o JSON da service account.');
  process.exit(1);
}

async function main() {
  initializeApp({ credential: applicationDefault() });
  const auth = getAuth();

  const user = await auth.getUserByEmail(email);
  await auth.setCustomUserClaims(user.uid, revoke ? {} : { admin: true });

  console.log(
    revoke
      ? `Custom claim 'admin' removido de ${email} (uid: ${user.uid}).`
      : `Custom claim 'admin: true' definido para ${email} (uid: ${user.uid}).`
  );
  console.log('A conta precisa fazer login novamente (ou renovar o ID token) para o claim ter efeito.');
}

main().catch((err) => {
  console.error('Falha ao definir custom claim:', err.message);
  process.exit(1);
});
