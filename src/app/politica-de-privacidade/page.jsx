'use client';

import React from 'react';
import Link from 'next/link';

export default function PrivacyPolicy() {
  return (
    <div style={styles.wrapper}>
      {/* Header */}
      <header style={styles.header} className="glass-panel">
        <div style={styles.headerContainer}>
          <div style={styles.logo}>
            <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#fff' }}>
              <span>🎵</span>
              <span className="logo-text">NS<span className="gradient-text">Music</span></span>
            </Link>
          </div>
          <Link href="/" className="btn btn-secondary" style={{ padding: '8px 16px', fontSize: '0.85rem' }}>
            ← Voltar ao site
          </Link>
        </div>
      </header>

      <main style={{ flex: 1, padding: '60px 0' }}>
        <div className="container" style={{ maxWidth: '800px' }}>
          
          <div style={{ marginBottom: '40px', textAlign: 'center' }}>
            <h1 style={{ fontSize: '2.5rem', marginBottom: '16px', fontFamily: 'var(--font-family-title)' }}>Política de Privacidade</h1>
            <p style={{ color: 'var(--text-secondary)' }}>Última atualização: 15 de Julho de 2026</p>
          </div>

          <div style={styles.contentCard} className="glass-card">
            <div style={styles.section}>
              <h2 style={styles.sectionTitle}>1. Informações Gerais</h2>
              <p style={styles.paragraph}>
                A sua privacidade é de extrema importância para nós. Esta Política de Privacidade descreve como a <strong>NSMusic</strong> coleta, usa, processa e compartilha as suas informações quando você utiliza o nosso site e serviços para a criação de músicas personalizadas.
              </p>
              <p style={styles.paragraph}>
                Ao acessar e utilizar nossa plataforma, você concorda com a coleta e uso de informações de acordo com esta política, em conformidade com a Lei Geral de Proteção de Dados (LGPD - Lei nº 13.709/2018).
              </p>
            </div>

            <div style={styles.section}>
              <h2 style={styles.sectionTitle}>2. Coleta de Informações</h2>
              <p style={styles.paragraph}>
                Nós coletamos informações que você nos fornece diretamente ao preencher o formulário de criação de música e durante o checkout:
              </p>
              <ul style={styles.list}>
                <li><strong>Dados Pessoais do Cliente:</strong> Nome completo, endereço de e-mail, número de telefone/WhatsApp.</li>
                <li><strong>Dados de Personalização:</strong> O nome do homenageado, relação com ele, a história de vocês, momentos importantes e características de personalidade que serão utilizadas para compor a letra.</li>
                <li><strong>Dados de Pagamento:</strong> Processados de forma segura e direta pelo Mercado Pago. Nós não armazenamos os dados do seu cartão de crédito ou informações confidenciais de faturamento.</li>
              </ul>
            </div>

            <div style={styles.section}>
              <h2 style={styles.sectionTitle}>3. Como Usamos Suas Informações</h2>
              <p style={styles.paragraph}>
                Utilizamos os dados coletados exclusivamente para as seguintes finalidades:
              </p>
              <ul style={styles.list}>
                <li>Gerar a composição da letra usando Inteligência Artificial (API Gemini).</li>
                <li>Produzir e refinar a música personalizada baseada nas escolhas de estilo e voz (usando Suno AI e processamento manual).</li>
                <li>Processar o seu pagamento via Mercado Pago.</li>
                <li>Enviar o link da sua música pronta e manter contato sobre o status do pedido via WhatsApp ou E-mail.</li>
                <li>Prestar suporte ao cliente em caso de dúvidas ou alterações na letra.</li>
              </ul>
            </div>

            <div style={styles.section}>
              <h2 style={styles.sectionTitle}>4. Compartilhamento de Dados</h2>
              <p style={styles.paragraph}>
                A NSMusic não vende, aluga ou compartilha suas informações pessoais com terceiros para fins de marketing. Para o funcionamento correto da plataforma, compartilhamos dados apenas com fornecedores integrados essenciais:
              </p>
              <ul style={styles.list}>
                <li><strong>Mercado Pago:</strong> Dados necessários para processar o pagamento do pedido.</li>
                <li><strong>Provedores de Infraestrutura:</strong> Firebase (hospedagem de banco de dados do pedido) e Google Cloud (processamento de APIs com segurança).</li>
              </ul>
            </div>

            <div style={styles.section}>
              <h2 style={styles.sectionTitle}>5. Segurança e Retenção dos Dados</h2>
              <p style={styles.paragraph}>
                Empregamos medidas de segurança técnicas e administrativas comercialmente viáveis para proteger suas informações contra acesso não autorizado, alteração ou destruição. Seus dados e a letra criada ficam armazenados em nosso banco de dados seguro para garantir que você possa acessar o seu link privado de entrega no futuro.
              </p>
            </div>

            <div style={styles.section}>
              <h2 style={styles.sectionTitle}>6. Seus Direitos</h2>
              <p style={styles.paragraph}>
                Como titular dos dados, você tem direito a solicitar a qualquer momento a confirmação de tratamento de dados, acesso aos dados coletados, correção de dados incompletos ou a exclusão definitiva dos seus dados de nosso banco de dados pessoal enviando uma solicitação ao nosso suporte.
              </p>
            </div>

            <div style={styles.section}>
              <h2 style={styles.sectionTitle}>7. Contato</h2>
              <p style={styles.paragraph}>
                Se você tiver qualquer dúvida ou questionamento sobre esta política de privacidade, pode entrar em contato conosco pelo e-mail institucional: <strong>contato@nsnexus.com.br</strong>.
              </p>
            </div>
          </div>

        </div>
      </main>

      {/* Footer */}
      <footer style={styles.footer}>
        <div className="container" style={styles.footerContainer}>
          <div>
            <h3 style={{ fontSize: '1.2rem', fontWeight: '800' }}>NS<span className="gradient-text">Music</span></h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '4px' }}>Músicas personalizadas que emocionam.</p>
          </div>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            © {new Date().getFullYear()} NSMusic. Todos os direitos reservados.
          </div>
        </div>
      </footer>
    </div>
  );
}

const styles = {
  wrapper: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: '#0a0a0c',
  },
  header: {
    borderRadius: 0,
    borderTop: 'none',
    borderLeft: 'none',
    borderRight: 'none',
  },
  headerContainer: {
    maxWidth: '1200px',
    margin: '0 auto',
    padding: '16px 24px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  logo: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  contentCard: {
    padding: '40px',
    lineHeight: '1.7',
  },
  section: {
    marginBottom: '32px',
  },
  sectionTitle: {
    fontSize: '1.25rem',
    fontFamily: 'var(--font-family-title)',
    color: '#fff',
    marginBottom: '12px',
    fontWeight: '700',
  },
  paragraph: {
    color: 'var(--text-secondary)',
    fontSize: '0.95rem',
    marginBottom: '12px',
  },
  list: {
    color: 'var(--text-secondary)',
    fontSize: '0.95rem',
    marginLeft: '20px',
    marginBottom: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  footer: {
    borderTop: '1px solid var(--border-color)',
    padding: '32px 0',
    backgroundColor: '#070709',
  },
  footerContainer: {
    maxWidth: '1200px',
    margin: '0 auto',
    padding: '0 24px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '16px',
  },
};
