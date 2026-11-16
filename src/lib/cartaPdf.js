// Gera o PDF da carta no próprio navegador (jsPDF, carregado sob demanda).
// As fontes padrão do PDF só cobrem Latin-1: acentos do português funcionam, emoji não —
// por isso emojis e símbolos fora dessa faixa são removidos antes de escrever.

export function textoParaPdf(texto) {
  return String(texto || '')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/[^\n\r\t\x20-\x7E\xA0-\xFF]/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function nomeArquivoCarta(honoree) {
  const base = textoParaPdf(honoree || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
  return `carta${base ? `-para-${base}` : ''}.pdf`;
}

export async function gerarCartaPdf({ texto, honoree, remetente, url }) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210; const H = 297; const M = 24; const larg = W - M * 2;
  const papel = [255, 253, 247]; const tinta = [63, 58, 47]; const ouro = [138, 109, 59]; const rosa = [190, 24, 93];

  const fundo = () => {
    doc.setFillColor(...papel); doc.rect(0, 0, W, H, 'F');
    doc.setDrawColor(...ouro); doc.setLineWidth(0.4); doc.rect(10, 10, W - 20, H - 20);
    doc.setLineWidth(0.15); doc.rect(12, 12, W - 24, H - 24);
  };
  fundo();

  let y = 36;
  doc.setFont('times', 'italic'); doc.setFontSize(12); doc.setTextColor(...rosa);
  doc.text('uma carta', W / 2, y, { align: 'center' });
  y += 10;
  const titulo = textoParaPdf(honoree ? `Para ${honoree}` : 'Para você');
  doc.setFont('times', 'bold'); doc.setFontSize(24); doc.setTextColor(...tinta);
  doc.text(titulo, W / 2, y, { align: 'center', maxWidth: larg });
  y += 6;
  doc.setDrawColor(...ouro); doc.setLineWidth(0.3); doc.line(W / 2 - 18, y, W / 2 + 18, y);
  y += 12;

  doc.setFont('times', 'normal'); doc.setFontSize(13); doc.setTextColor(...tinta);
  const passo = 6.6;
  const limite = H - 40;
  const paragrafos = textoParaPdf(texto).split('\n');
  for (const par of paragrafos) {
    const linhas = par.trim() ? doc.splitTextToSize(par.trim(), larg) : [''];
    for (const linha of linhas) {
      if (y > limite) { doc.addPage(); fundo(); y = 30; doc.setFont('times', 'normal'); doc.setFontSize(13); doc.setTextColor(...tinta); }
      doc.text(linha, M, y);
      y += passo;
    }
  }

  const assinatura = textoParaPdf(remetente);
  if (assinatura) {
    y += 8;
    if (y > limite) { doc.addPage(); fundo(); y = 40; }
    doc.setFont('times', 'italic'); doc.setFontSize(16); doc.setTextColor(...ouro);
    doc.text(assinatura, W - M, y, { align: 'right' });
  }

  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p += 1) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(150, 140, 125);
    if (url) {
      doc.textWithLink('Ouça a música desta carta: ' + url, W / 2, H - 18, { align: 'center', url });
    } else {
      doc.text('Feito com carinho no NS Music · nsmusic.ia.br', W / 2, H - 18, { align: 'center' });
    }
  }

  return doc.output('blob');
}
