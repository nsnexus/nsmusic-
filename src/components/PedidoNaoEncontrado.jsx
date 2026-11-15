import Link from 'next/link';

// Tela amigável quando o link do pedido está ausente, incompleto ou não existe mais.
export default function PedidoNaoEncontrado({ titulo = 'Não encontramos esse pedido', motivo }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '70vh', gap: '14px', textAlign: 'center', padding: '24px 20px', maxWidth: '460px', margin: '0 auto' }}>
      <h1 style={{ fontFamily: 'var(--font-family-title)', fontSize: '1.6rem', margin: 0, color: 'var(--text-primary)' }}>{titulo}</h1>
      <p style={{ margin: 0, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
        {motivo || 'O link pode estar incompleto ou ter mudado.'} Sua música continua guardada: entre na sua conta para achar o pedido de novo.
      </p>
      <Link href="/conta" className="btn btn-primary" style={{ minHeight: '44px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0 22px' }}>
        Perdeu o link? Encontrar meu pedido
      </Link>
      <Link href="/" style={{ color: 'var(--text-secondary)', fontSize: '0.92rem', textDecoration: 'underline' }}>Voltar ao início</Link>
    </div>
  );
}
