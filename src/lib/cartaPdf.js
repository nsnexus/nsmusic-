// Gera o PDF da carta no próprio navegador (jsPDF, carregado sob demanda).
// Fontes: Great Vibes (títulos/assinatura) e Lora (texto), ambas SIL OFL, recortadas para Latin-1
// em public/fonts/carta/. Se não carregarem, cai em Times. Emoji não existe nessas fontes, então
// é removido antes de escrever (acentos do português ficam).

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

function bufferParaBase64(buf) {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return typeof btoa === 'function' ? btoa(bin) : Buffer.from(bin, 'binary').toString('base64');
}

// Busca as fontes em /fonts/carta/. Devolve { script, serif, serifItalic } em base64, ou null.
export async function carregarFontesCarta(base = '') {
  try {
    const nomes = { script: 'GreatVibes.ttf', serif: 'Lora.ttf', serifItalic: 'Lora-Italic.ttf' };
    const pares = await Promise.all(Object.entries(nomes).map(async ([k, arq]) => {
      const res = await fetch(`${base}/fonts/carta/${arq}`);
      if (!res.ok) throw new Error(`fonte ${arq}: HTTP ${res.status}`);
      return [k, bufferParaBase64(await res.arrayBuffer())];
    }));
    return Object.fromEntries(pares);
  } catch (e) {
    console.warn('[carta-pdf] fontes indisponíveis, usando padrão:', e?.message);
    return null;
  }
}

// Carrega a foto da homenagem (pela proxy do próprio site) como JPEG em data URL, recortada quadrada.
export async function carregarFotoCarta(url) {
  if (!url || typeof document === 'undefined') return null;
  try {
    const src = url.startsWith('http') ? `/api/image-proxy?url=${encodeURIComponent(url)}` : url;
    const img = await new Promise((ok, falha) => {
      const i = new Image();
      i.crossOrigin = 'anonymous';
      i.onload = () => ok(i);
      i.onerror = () => falha(new Error('imagem'));
      i.src = src;
    });
    const lado = Math.min(img.naturalWidth, img.naturalHeight);
    if (!lado) return null;
    const canvas = document.createElement('canvas');
    canvas.width = 600; canvas.height = 600;
    canvas.getContext('2d').drawImage(img, (img.naturalWidth - lado) / 2, (img.naturalHeight - lado) / 2, lado, lado, 0, 0, 600, 600);
    return canvas.toDataURL('image/jpeg', 0.86);
  } catch {
    return null;
  }
}

const COR = {
  papel: [255, 251, 246],
  tinta: [58, 48, 52],
  suave: [128, 112, 118],
  rosa: [196, 64, 112],
  rosaClaro: [248, 214, 226],
  ouro: [184, 146, 84],
  ouroClaro: [234, 214, 176],
};

// Coração vetorial centrado em (cx, cy), largura w.
function coracao(doc, cx, cy, w, estilo = 'F') {
  const s = w / 2;
  doc.lines([
    [-s * 0.15, -s * 0.55, -s, -s * 0.55, -s, s * 0.05],
    [0, s * 0.55, s * 0.55, s * 0.9, s, s * 1.15],
    [s * 0.45, -s * 0.25, s, -s * 0.6, s, -s * 1.15],
    [0, -s * 0.6, -s * 0.85, -s * 0.6, -s, -s * 0.05],
  ], cx, cy - s * 0.45, [1, 1], estilo, true);
}

function comOpacidade(doc, opacidade, desenhar) {
  const temGState = typeof doc.GState === 'function' && typeof doc.setGState === 'function';
  if (temGState) {
    doc.saveGraphicsState();
    doc.setGState(new doc.GState({ opacity: opacidade }));
  }
  desenhar();
  if (temGState) doc.restoreGraphicsState();
}

// Raminho de folhas saindo do canto (dx, dy = direção ±1).
function raminho(doc, x, y, dx, dy) {
  doc.setDrawColor(...COR.ouro);
  doc.setLineWidth(0.35);
  doc.lines([[dx * 10, dy * 2, dx * 22, dy * 10, dx * 30, dy * 24]], x, y, [1, 1], 'S', false);
  const folhas = [[7, 2.5], [14, 5.5], [20, 10], [25, 16]];
  doc.setFillColor(...COR.ouroClaro);
  folhas.forEach(([fx, fy], i) => {
    const px = x + dx * fx; const py = y + dy * fy;
    const lado = i % 2 === 0 ? 1 : -1;
    doc.ellipse(px + dx * lado * 1.6, py - dy * lado * 1.8, 2.4, 1.1, 'F');
  });
  doc.setFillColor(...COR.rosa);
  comOpacidade(doc, 0.55, () => doc.circle(x + dx * 30, y + dy * 24, 1.2, 'F'));
}

export async function gerarCartaPdf({ texto, honoree, remetente, url, fontes = null, foto = null }) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210; const H = 297; const M = 26;

  let fScript = 'times'; let fSerif = 'times'; let fSerifIt = 'times';
  if (fontes?.script && fontes?.serif) {
    doc.addFileToVFS('GreatVibes.ttf', fontes.script); doc.addFont('GreatVibes.ttf', 'GreatVibes', 'normal');
    doc.addFileToVFS('Lora.ttf', fontes.serif); doc.addFont('Lora.ttf', 'Lora', 'normal');
    fScript = 'GreatVibes'; fSerif = 'Lora'; fSerifIt = 'Lora';
    if (fontes.serifItalic) { doc.addFileToVFS('Lora-Italic.ttf', fontes.serifItalic); doc.addFont('Lora-Italic.ttf', 'LoraItalic', 'normal'); fSerifIt = 'LoraItalic'; }
  }
  const estiloIt = fSerifIt === 'times' ? 'italic' : 'normal';

  const fundo = (primeira) => {
    doc.setFillColor(...COR.papel); doc.rect(0, 0, W, H, 'F');
    // manchas suaves de cor nos cantos
    comOpacidade(doc, 0.35, () => {
      doc.setFillColor(...COR.rosaClaro); doc.circle(W + 8, -6, 48, 'F'); doc.circle(-14, H + 10, 52, 'F');
    });
    comOpacidade(doc, 0.25, () => {
      doc.setFillColor(...COR.ouroClaro); doc.circle(-10, -10, 34, 'F'); doc.circle(W + 12, H + 6, 38, 'F');
    });
    // moldura dupla com cantos arredondados
    doc.setDrawColor(...COR.ouro); doc.setLineWidth(0.5); doc.roundedRect(11, 11, W - 22, H - 22, 4, 4, 'S');
    doc.setLineWidth(0.2); doc.roundedRect(14, 14, W - 28, H - 28, 3, 3, 'S');
    raminho(doc, 16, 16, 1, 1);
    raminho(doc, W - 16, H - 16, -1, -1);
    if (!primeira) {
      doc.setFillColor(...COR.rosa);
      comOpacidade(doc, 0.5, () => coracao(doc, W / 2, 24, 4));
    }
  };

  fundo(true);

  // Cabeçalho
  let y = 42;
  const larguraTitulo = foto ? W - M * 2 - 42 : W - M * 2;
  const xTitulo = foto ? M + larguraTitulo / 2 : W / 2;
  doc.setFont(fSerif, 'normal'); doc.setFontSize(8); doc.setTextColor(...COR.ouro);
  doc.setCharSpace(1.4);
  doc.text('UMA CARTA ESCRITA COM O CORAÇÃO', xTitulo, y, { align: 'center' });
  doc.setCharSpace(0);
  y += 15;

  const nome = textoParaPdf(honoree) || 'você';
  doc.setFont(fScript, 'normal'); doc.setTextColor(...COR.rosa);
  let tam = 40;
  doc.setFontSize(tam);
  while (tam > 24 && doc.getTextWidth(`Para ${nome}`) > larguraTitulo) { tam -= 2; doc.setFontSize(tam); }
  doc.text(`Para ${nome}`, xTitulo, y, { align: 'center' });
  y += 9;

  // divisor: linha · coração · linha
  doc.setDrawColor(...COR.ouro); doc.setLineWidth(0.3);
  doc.line(xTitulo - 30, y, xTitulo - 5, y); doc.line(xTitulo + 5, y, xTitulo + 30, y);
  doc.setFillColor(...COR.rosa); coracao(doc, xTitulo, y, 4.2);

  // Foto estilo polaroid, levemente girada
  if (foto) {
    try {
      const fx = W - M - 34; const fy = 30; const lado = 30;
      comOpacidade(doc, 0.18, () => { doc.setFillColor(60, 40, 50); doc.rect(fx + 1.2, fy + 1.6, lado + 4, lado + 10, 'F'); });
      doc.setFillColor(255, 255, 255); doc.rect(fx, fy, lado + 4, lado + 10, 'F');
      doc.addImage(foto, 'JPEG', fx + 2, fy + 2, lado, lado);
      doc.setFillColor(...COR.rosa); comOpacidade(doc, 0.7, () => coracao(doc, fx + (lado + 4) / 2, fy + lado + 6.4, 3));
    } catch (e) {
      console.warn('[carta-pdf] foto ignorada:', e?.message);
    }
  }

  y = Math.max(y + 14, foto ? 82 : 0);

  // Corpo
  const larg = W - M * 2;
  const passo = 6.9;
  const limite = H - 46;
  const corpo = () => { doc.setFont(fSerif, 'normal'); doc.setFontSize(12.2); doc.setTextColor(...COR.tinta); };
  corpo();
  const paragrafos = textoParaPdf(texto).split('\n');
  let primeiraLinha = true;
  for (const par of paragrafos) {
    if (!par.trim()) { y += passo * 0.55; continue; }
    const linhas = doc.splitTextToSize(par.trim(), larg);
    for (const linha of linhas) {
      if (y > limite) { doc.addPage(); fundo(false); y = 40; corpo(); }
      if (primeiraLinha) {
        // capitular: primeira letra maior, em script e rosa
        const letra = linha.charAt(0); const resto = linha.slice(1);
        doc.setFont(fScript, 'normal'); doc.setFontSize(26); doc.setTextColor(...COR.rosa);
        doc.text(letra, M, y + 1.2);
        const wLetra = doc.getTextWidth(letra) + 0.8;
        corpo();
        doc.text(resto, M + wLetra, y);
        primeiraLinha = false;
      } else {
        doc.text(linha, M, y);
      }
      y += passo;
    }
    y += passo * 0.35;
  }

  // Assinatura
  const assinatura = textoParaPdf(remetente);
  if (assinatura) {
    y += 6;
    if (y > limite - 8) { doc.addPage(); fundo(false); y = 50; }
    doc.setFont(fSerifIt, estiloIt); doc.setFontSize(11); doc.setTextColor(...COR.suave);
    doc.text('com todo carinho,', W - M, y, { align: 'right' });
    y += 12;
    doc.setFont(fScript, 'normal'); doc.setFontSize(30); doc.setTextColor(...COR.ouro);
    doc.text(assinatura, W - M, y, { align: 'right' });
  }

  // Rodapé em todas as páginas
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p += 1) {
    doc.setPage(p);
    const yR = H - 26;
    if (url && p === total) {
      const rotulo = 'Ouça a música desta carta';
      doc.setFont(fSerif, 'normal'); doc.setFontSize(9.5);
      const wRot = doc.getTextWidth(rotulo) + 16;
      doc.setFillColor(...COR.rosaClaro); comOpacidade(doc, 0.7, () => doc.roundedRect(W / 2 - wRot / 2, yR - 5.2, wRot, 8, 4, 4, 'F'));
      doc.setFillColor(...COR.rosa); coracao(doc, W / 2 - wRot / 2 + 5, yR - 1.3, 3);
      doc.setTextColor(...COR.rosa);
      doc.textWithLink(rotulo, W / 2 + 2.5, yR, { align: 'center', url });
      doc.setFontSize(7.5); doc.setTextColor(...COR.suave);
      doc.textWithLink(url, W / 2, yR + 6, { align: 'center', url });
    } else {
      doc.setFont(fSerifIt, estiloIt); doc.setFontSize(8.5); doc.setTextColor(...COR.suave);
      doc.text('NS Music · nsmusic.ia.br', W / 2, yR + 4, { align: 'center' });
    }
  }

  return doc.output('blob');
}
