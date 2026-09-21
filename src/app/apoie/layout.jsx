// Canonical próprio. Sem isto a página herda o `alternates.canonical: '/'` do layout raiz e passa
// a declarar que é cópia da home — foi o que o Search Console apontou em 20/09/2026 como "Cópia
// sem página canônica selecionada pelo usuário", enquanto o sitemap listava a página como
// indexável. Dois sinais opostos, e o Google descarta a página.
export const metadata = {
  title: 'Apoie o NS Music',
  description: 'Ajude a manter o estúdio de músicas personalizadas do NS Music no ar.',
  alternates: { canonical: '/apoie' },
};

export default function ApoieLayout({ children }) {
  return children;
}
