// Papel de parede do chat de suporte: fundo bege com desenhos de traço fino bem clarinhos, no
// clima do app de mensagens, mas com desenhos próprios do tema da NS Music (notas, fone, microfone,
// vinil, coração, presente). Um bloco de 240×240 repetido em mosaico.

const T = 'fill="none" stroke="#000" stroke-opacity=".07" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"';

const DESENHOS = [
  // nota dupla
  `<path ${T} d="M24 46V20l18-5v26"/><circle ${T} cx="20" cy="46" r="4.5"/><circle ${T} cx="38" cy="41" r="4.5"/>`,
  // fone de ouvido
  `<path ${T} d="M104 52v-9a16 16 0 0 1 32 0v9"/><rect ${T} x="100" y="48" width="8" height="13" rx="3"/><rect ${T} x="132" y="48" width="8" height="13" rx="3"/>`,
  // microfone
  `<rect ${T} x="198" y="14" width="12" height="20" rx="6"/><path ${T} d="M192 28a12 12 0 0 0 24 0M204 40v8M197 48h14"/>`,
  // coração
  `<path ${T} d="M56 122c-9-7-15-11-15-18a7.5 7.5 0 0 1 15-2 7.5 7.5 0 0 1 15 2c0 7-6 11-15 18z"/>`,
  // estrela
  `<path ${T} d="M118 86l3 7 7 .6-5.4 4.6 1.7 7-6.3-3.8-6.3 3.8 1.7-7-5.4-4.6 7-.6z"/>`,
  // vinil
  `<circle ${T} cx="178" cy="114" r="16"/><circle ${T} cx="178" cy="114" r="5"/><path ${T} d="M178 102a12 12 0 0 1 12 12"/>`,
  // onda sonora
  `<path ${T} d="M18 192v10M25 186v22M32 190v14M39 182v30M46 188v18M53 193v8"/>`,
  // balão de conversa
  `<path ${T} d="M94 166h30a6 6 0 0 1 6 6v14a6 6 0 0 1-6 6h-17l-9 7v-7h-4a6 6 0 0 1-6-6v-14a6 6 0 0 1 6-6z"/>`,
  // presente
  `<rect ${T} x="182" y="188" width="26" height="20" rx="2"/><path ${T} d="M179 181h32v7h-32zM195 181v27M195 181c-4-7-11-5-9 0M195 181c4-7 11-5 9 0"/>`,
  // nota simples
  `<path ${T} d="M150 222v-22l10 4"/><circle ${T} cx="146" cy="222" r="4.5"/>`,
  // violão
  `<path ${T} d="M66 160l14-14M78 148l4 4M60 170a8 8 0 1 0 6-14 7 7 0 1 0-8 8 8 8 0 0 0 2 6z"/>`,
  // brilho
  `<path ${T} d="M226 150v10M221 155h10M12 120v8M8 124h8"/>`,
];

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240" viewBox="0 0 240 240">${DESENHOS.join('')}</svg>`;

export const FUNDO_CHAT = {
  backgroundColor: '#EFEAE2',
  backgroundImage: `url("data:image/svg+xml,${encodeURIComponent(SVG)}")`,
  backgroundSize: '240px 240px',
};
