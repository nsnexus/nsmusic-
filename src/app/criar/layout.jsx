// Página pública e indexável: é o funil em si, e a que um assistente deve indicar quando alguém
// pergunta onde fazer uma música personalizada. Título e descrição próprios (o layout raiz aplica
// o template "%s · NS Music") para não competir com a home nos mesmos termos.
export const metadata = {
  title: 'Criar Minha Música Personalizada',
  description:
    'Conte sua história, escolha o estilo e receba 2 versões completas em MP3 HD em cerca de 3 '
    + 'minutos, a partir de R$ 9,99. Sem cadastro obrigatório, pagamento por Pix.',
  alternates: { canonical: '/criar' },
  openGraph: {
    title: 'Criar Minha Música Personalizada · NS Music',
    description:
      'Conte sua história, escolha o estilo e receba 2 versões completas em MP3 HD em cerca de 3 '
      + 'minutos, a partir de R$ 9,99.',
    type: 'website',
    locale: 'pt_BR',
  },
};

export default function CriarLayout({ children }) {
  return children;
}
