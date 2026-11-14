// A Efí chama a URL cadastrada + "/pix". Se o webhook for (re)cadastrado sem query string
// (ex: ".../api/webhooks/efi"), a notificação chega em ".../api/webhooks/efi/pix" — esta rota
// garante que ela não caia num 404. A validação do segredo e toda a lógica ficam no handler pai.
export { POST } from '../route';

export const runtime = 'edge';
