// Contagem de cobranças por degrau do checkout (ver api/payments/create):
// efi = normal · infinitepay = Efí falhou · static = Efí e InfinitePay falharam (não confirma sozinho).
const VAZIO = () => ({ efi: 0, infinitepay: 0, static: 0, total: 0 });

export function contarProvedoresPix(linhas, inicioHojeIso) {
  const hoje = VAZIO();
  const semana = VAZIO();
  const inicio = Date.parse(inicioHojeIso);
  for (const l of linhas || []) {
    const p = ['efi', 'infinitepay', 'static'].includes(l?.provider) ? l.provider : 'efi';
    semana[p] += 1; semana.total += 1;
    if (Date.parse(l?.created_at) >= inicio) { hoje[p] += 1; hoje.total += 1; }
  }
  return { hoje, semana };
}
