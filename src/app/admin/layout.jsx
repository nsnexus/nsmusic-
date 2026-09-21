// noindex em todo o /admin. O robots.txt já bloqueia, mas robots.txt é um pedido: robô que o
// ignora ainda assim lê esta meta. Sem isto o painel herdava `index: true` e o canonical da home
// do layout raiz — ou seja, se anunciava como indexável.
export const metadata = {
  title: 'Painel',
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }) {
  return children;
}
