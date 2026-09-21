// Página de ocasião gerada a partir de src/lib/ocasioes.js — o conteúdo mora lá, aqui fica só a
// rota e os metadados. Server Component estático de propósito: é uma página feita para ser lida
// por crawler e por assistente de IA, então nada depende de JavaScript no cliente.
import PaginaOcasiao from '@/components/PaginaOcasiao';
import { getOcasiao } from '@/lib/ocasioes';

const ocasiao = getOcasiao('musica-de-aniversario');

export const metadata = {
  title: ocasiao.titulo,
  description: ocasiao.descricao,
  keywords: ocasiao.palavrasChave,
  alternates: { canonical: '/musica-de-aniversario' },
  openGraph: {
    title: ocasiao.titulo,
    description: ocasiao.descricao,
    url: '/musica-de-aniversario',
    type: 'website',
    locale: 'pt_BR',
    siteName: 'NS Music',
  },
  twitter: { card: 'summary_large_image', title: ocasiao.titulo, description: ocasiao.descricao },
  robots: { index: true, follow: true },
};

export default function Page() {
  return <PaginaOcasiao ocasiao={ocasiao} />;
}
