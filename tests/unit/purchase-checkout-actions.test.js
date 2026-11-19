import { beforeEach, describe, expect, it, vi } from 'vitest';

// Exercise the real component's event handlers without a browser or live payments.
const state = vi.hoisted(() => ({ slots: [], index: 0, request: vi.fn() }));
vi.mock('react', async importOriginal => {
  const actual = await importOriginal();
  return { ...actual,
    useState: initial => {
      const index = state.index++;
      if (!(index in state.slots)) state.slots[index] = typeof initial === 'function' ? initial() : initial;
      return [state.slots[index], value => { state.slots[index] = typeof value === 'function' ? value(state.slots[index]) : value; }];
    },
    useRef: initial => { const index = state.index++; state.slots[index] ||= { current: initial }; return state.slots[index]; },
    useEffect: () => {},
  };
});
vi.mock('@/lib/authClient', () => ({ auth: { currentUser: null } }));
vi.mock('@/lib/pixCheckout', () => ({ requestPixCharge: (...args) => state.request(...args) }));
const { default: PurchaseCheckout } = await import('@/components/delivery/PurchaseCheckout');
const props = { orderId: 'test-order', onCharge: vi.fn(), onApproved: vi.fn() };
function render(overrides = {}) { state.index = 0; return PurchaseCheckout({ ...props, ...overrides }); }
function text(node) {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (Array.isArray(node)) return node.map(text).join('');
  if (typeof node !== 'object') return String(node);
  return text(node.props?.children);
}
function nodes(node) {
  if (!node || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap(nodes);
  return [node, ...nodes(node.props?.children)];
}
function button(tree, label) {
  const result = nodes(tree).find(node => node.type === 'button' && text(node).includes(label));
  if (!result) throw new Error(`Botão não encontrado: ${label}`);
  return result;
}
// A escolha do pacote fica na lista compacta (PacotesCompactos): o teste chama o onSelect dela.
function pacotes(tree) {
  const result = nodes(tree).find(node => node.type?.name === 'PacotesCompactos');
  if (!result) throw new Error('Lista de pacotes não encontrada');
  return result;
}
beforeEach(() => {
  state.slots = []; state.index = 0; state.request.mockReset(); props.onCharge.mockClear();
  state.request.mockResolvedValue({ ok: true, data: { paymentId: 'payment-test', qrCode: 'pix-test-code' } });
});

describe('checkout em um clique após escolher pacote', () => {
  it('não cria PIX só por entrar na página', () => {
    render();
    expect(state.request).not.toHaveBeenCalled();
  });
  it('tocar no pacote já gera o PIX daquele pacote e exibe o código', async () => {
    pacotes(render()).props.onSelect('combo_carta');
    await Promise.resolve(); await Promise.resolve();
    expect(state.request).toHaveBeenCalledExactlyOnceWith({ orderId: 'test-order', sku: 'combo_carta' });
    const tree = render();
    expect(nodes(tree).some(node => node.type === 'textarea' && node.props.value === 'pix-test-code')).toBe(true);
    expect(text(tree)).toContain('Copiar código PIX');
    expect(props.onCharge).toHaveBeenCalledWith(expect.objectContaining({ sku: 'combo_carta' }));
  });
  it('o botão do resumo gera o PIX do pacote marcado', async () => {
    await button(render(), 'Pagar Agora').props.onClick();
    expect(state.request).toHaveBeenCalledExactlyOnceWith({ orderId: 'test-order', sku: 'combo' });
  });
  it('impede duas cobranças com clique duplo', async () => {
    let resolve;
    state.request.mockImplementation(() => new Promise(done => { resolve = done; }));
    const action = button(render(), 'Pagar Agora').props.onClick;
    const first = action();
    await action();
    expect(state.request).toHaveBeenCalledTimes(1);
    resolve({ ok: true, data: { paymentId: 'test', qrCode: 'pix' } }); await first;
  });
  it('reutiliza o PIX válido quando o botão é pressionado novamente', async () => {
    await button(render(), 'Pagar Agora').props.onClick();
    await button(render(), 'Pagar Agora').props.onClick();
    expect(state.request).toHaveBeenCalledTimes(1);
  });
  it('trocar de pacote gera um PIX novo do pacote tocado', async () => {
    await button(render(), 'Pagar Agora').props.onClick();
    pacotes(render()).props.onSelect('audio_only');
    await Promise.resolve(); await Promise.resolve();
    expect(state.request).toHaveBeenCalledTimes(2);
    expect(state.request.mock.calls[1][0].sku).toBe('audio_only');
  });
  it('mostra erro e permite repetir sem um passo extra de revisão', async () => {
    state.request.mockResolvedValueOnce({ ok: false, error: 'Serviço indisponível.' });
    await button(render(), 'Pagar Agora').props.onClick();
    expect(text(render())).toContain('Serviço indisponível.');
    await button(render(), 'Tentar PIX novamente').props.onClick();
    expect(text(render())).toContain('Copiar código PIX');
  });
  it('não exibe mais opção de créditos no checkout', () => {
    expect(text(render())).not.toContain('Prefiro usar meus créditos');
    expect(text(render())).not.toContain('Confirmar uso de');
  });
  it('mantém SKU específico da oferta de recuperação', async () => {
    await button(render({ promo: '48h' }), 'Pagar Agora').props.onClick();
    expect(state.request).toHaveBeenCalledWith({ orderId: 'test-order', sku: 'recovery_combo_48h' });
  });
});

describe('checkout da entrega usa a lista compacta', () => {
  it('passa o pacote marcado e a ação de pagar para a lista', () => {
    const lista = pacotes(render());
    expect(lista.props.selecionado).toBe('combo');
    expect(lista.props.pagarAoEscolher).toBe(true);
    expect(typeof lista.props.onSelect).toBe('function');
  });
});
