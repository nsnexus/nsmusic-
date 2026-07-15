'use client';

import React from 'react';
import Link from 'next/link';

export default function TermsOfUse() {
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
            <h1 style={{ fontSize: '2.5rem', marginBottom: '16px', fontFamily: 'var(--font-family-title)' }}>Termos de Uso</h1>
            <p style={{ color: 'var(--text-secondary)' }}>Última atualização: 15 de Julho de 2026</p>
          </div>

          <div style={styles.contentCard} className="glass-card">
            <div style={styles.section}>
              <h2 style={styles.sectionTitle}>1. Relação Contratual</h2>
              <p style={styles.paragraph}>
                Estes Termos de Uso regulam o acesso e o uso da plataforma <strong>NSMusic</strong> e de todos os serviços relacionados para a criação de músicas personalizadas por encomenda.
              </p>
              <p style={styles.paragraph}>
                Ao solicitar a criação de uma música ou navegar por nosso site, você confirma que leu, compreendeu e concorda integralmente com estes termos. Se você não concordar com estes termos, não deverá utilizar nossos serviços.
              </p>
            </div>

            <div style={styles.section}>
              <h2 style={styles.sectionTitle}>2. O Serviço de Músicas Personalizadas</h2>
              <p style={styles.paragraph}>
                A NSMusic oferece um serviço de composição e produção musical personalizada com o suporte de inteligência artificial. O cliente fornece informações, histórias, momentos marcantes e preferências estéticas através de nosso formulário eletrônico.
              </p>
              <ul style={styles.list}>
                <li><strong>Geração da Letra:</strong> Usamos processamento de linguagem natural (API Gemini) para compor a letra com base nos dados que você forneceu. O cliente revisa e pode solicitar alterações antes de aprovar.</li>
                <li><strong>Geração de Áudio:</strong> Após a aprovação da letra e confirmação do pagamento, a música é gerada instrumental e vocalmente usando sistemas de síntese de IA de alta qualidade (Suno AI) e refinada de forma manual por engenheiros de áudio da nossa equipe.</li>
                <li><strong>Cancelamento por Inadequação:</strong> Reservamo-nos o direito de cancelar e reembolsar pedidos que solicitem conteúdos de ódio, ofensivos, preconceituosos, pornográficos ou que violem leis vigentes.</li>
              </ul>
            </div>

            <div style={styles.section}>
              <h2 style={styles.sectionTitle}>3. Preços e Pagamentos</h2>
              <p style={styles.paragraph}>
                Os preços para cada pacote (Essencial, Presente Completo e Multi-Estilos) e seus adicionais (addons) estão claramente discriminados no formulário de contratação e no checkout antes de efetuar a compra.
              </p>
              <p style={styles.paragraph}>
                Os pagamentos são processados pela plataforma integrada do <strong>Mercado Pago</strong>, aceitando cartões de crédito, Pix e outros métodos suportados. A produção da música só será iniciada após a confirmação integral de recebimento do pagamento pelo Mercado Pago.
              </p>
            </div>

            <div style={styles.section}>
              <h2 style={styles.sectionTitle}>4. Prazos de Entrega e Download</h2>
              <p style={styles.paragraph}>
                Os prazos padrões de entrega dependem do pacote contratado (variando geralmente entre 2 e 3 dias úteis). O prazo é contado a partir da data de aprovação da letra final pelo cliente e da confirmação de pagamento.
              </p>
              <p style={styles.paragraph}>
                O arquivo final da música (em formato MP3 e/ou WAV, dependendo do pacote) será disponibilizado em uma página privada de entrega. É de responsabilidade do cliente efetuar o download e armazenamento seguro do arquivo de áudio. Não garantimos a hospedagem vitalícia dos links de entrega na nossa plataforma.
              </p>
            </div>

            <div style={styles.section}>
              <h2 style={styles.sectionTitle}>5. Propriedade Intelectual e Licença de Uso</h2>
              <p style={styles.paragraph}>
                Ao adquirir uma música com a NSMusic, o cliente recebe uma <strong>Licença de Uso Pessoal e Vitalícia</strong> do arquivo de áudio e da letra gerada:
              </p>
              <ul style={styles.list}>
                <li><strong>O que é permitido:</strong> Compartilhar a música em redes sociais pessoais, reproduzir em eventos privados (festas, casamentos, aniversários), enviar via WhatsApp, e-mail ou armazenar em seus dispositivos.</li>
                <li><strong>O que NÃO é permitido:</strong> Comercializar o arquivo de áudio, revendê-lo para terceiros, licenciar para uso em comerciais de TV/rádio lucrativos, ou registrar os direitos fonográficos como criador original da música em plataformas públicas sem consentimento por escrito da NSMusic.</li>
              </ul>
            </div>

            <div style={styles.section}>
              <h2 style={styles.sectionTitle}>6. Reembolsos e Direito de Arrependimento</h2>
              <p style={styles.paragraph}>
                Por se tratar de um produto digital inteiramente personalizado e feito sob medida com base em especificações exclusivas fornecidas pelo cliente (conforme Código de Defesa do Consumidor, Art. 49), **não realizamos reembolsos ou cancelamentos de pedidos após a produção do áudio final ter sido concluída**. 
              </p>
              <p style={styles.paragraph}>
                Se o cliente desejar desistir do pedido antes da aprovação da letra, o reembolso poderá ser solicitado de forma integral através dos nossos canais de suporte.
              </p>
            </div>

            <div style={styles.section}>
              <h2 style={styles.sectionTitle}>7. Limitação de Responsabilidade</h2>
              <p style={styles.paragraph}>
                A NSMusic não se responsabiliza por eventuais falhas decorrentes da instabilidade de serviços de terceiros (como a API do Suno, Mercado Pago ou instabilidades de rede do próprio cliente). Faremos o melhor esforço para contornar qualquer falha técnica e entregar o seu produto no menor prazo possível.
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
