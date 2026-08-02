// Traduz códigos de erro do Firebase Auth para mensagens amigáveis. Antes duplicado literalmente em
// src/app/login/page.jsx e src/app/minhas-musicas/page.jsx (ver B-04 no AUDIT_REPORT.md).
export const getFriendlyAuthErrorMessage = (err) => {
  const code = err?.code || '';
  if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found' || code === 'auth/invalid-email') {
    return "E-mail ou senha incorretos. Por favor, verifique se digitou corretamente.";
  }
  if (code === 'auth/email-already-in-use') {
    return "Este e-mail já possui uma conta cadastrada. Alterne para Entrar abaixo ou redefina sua senha.";
  }
  if (code === 'auth/weak-password') {
    return "A senha é muito fraca. Digite uma senha com no mínimo 6 caracteres.";
  }
  if (code === 'auth/too-many-requests') {
    return "Muitas tentativas incorretas. Por favor, aguarde alguns instantes ou clique em esqueci minha senha.";
  }
  return err?.message || "Não foi possível concluir o acesso. Verifique seus dados e tente novamente.";
};
