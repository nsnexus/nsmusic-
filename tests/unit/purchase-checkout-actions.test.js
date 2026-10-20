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
beforeEach(() => {
  state.slots = []; state.index = 0; state.request.mockReset(); props.onCharge.mockClear();
  state.request.mockResolvedValue({ ok: true, data: { paymentId: 'payment-test', qrCode: 'pix-test-code' } });
});

describe('checkout em um clique após escolher pacote', () => {
  it('não cria PIX ao entrar na página nem ao selecionar um pacote', () => {
    const tree = render();
    expect(state.request).not.toHaveBeenCalled();
    button(tree, 'Suas memórias').props.onClick();
    expect(state.request).not.toHaveBeenCalled();
  });
  it('gera o PIX do pacote selecionado ao adquirir e já exibe o código', async () => {
    button(render(), 'Suas memórias').props.onClick();
    expect(state.request).not.toHaveBeenCalled();
    await button(render(), 'Adquirir meu presente').props.onClick();
    expect(state.request).toHaveBeenCalledExactlyOnceWith({ orderId: 'test-order', sku: 'combo' });
    const tree = render();
    expect(nodes(tree).some(node => node.type === 'textarea' && node.props.value === 'pix-test-code')).toBe(true);
    expect(text(tree)).toContain('Copiar código PIX');
    expect(text(tree)).not.toContain('Gerar PIX de');
    expect(props.onCharge).toHaveBeenCalledWith(expect.objectContaining({ sku: 'combo' }));
  });
  it('impede duas cobranças com clique duplo', async () => {
    let resolve;
    state.request.mockImplementation(() => new Promise(done => { resolve = done; }));
    const action = button(render(), 'Adquirir meu presente').props.onClick;
    const first = action();
    await action();
    expect(state.request).toHaveBeenCalledTimes(1);
    resolve({ ok: true, data: { paymentId: 'test', qrCode: 'pix' } }); await first;
  });
  it('reutiliza o PIX válido quando o botão é pressionado novamente', async () => {
    await button(render(), 'Adquirir meu presente').props.onClick();
    await button(render(), 'Adquirir meu presente').props.onClick();
    expect(state.request).toHaveBeenCalledTimes(1);
  });
  it('trocar pacote limpa o código anterior e aguarda nova confirmação', async () => {
    await button(render(), 'Adquirir meu presente').props.onClick();
    button(render(), 'Suas palavras').props.onClick();
    expect(state.request).toHaveBeenCalledTimes(1);
    expect(nodes(render()).some(node => node.type === 'textarea')).toBe(false);
    await button(render(), 'Adquirir meu presente').props.onClick();
    expect(state.request.mock.calls[1][0].sku).toBe('combo_carta');
  });
  it('mostra erro e permite repetir sem um passo extra de revisão', async () => {
    state.request.mockResolvedValueOnce({ ok: false, error: 'Serviço indisponível.' });
    await button(render(), 'Adquirir meu presente').props.onClick();
    expect(text(render())).toContain('Serviço indisponível.');
    await button(render(), 'Tentar PIX novamente').props.onClick();
    expect(text(render())).toContain('Copiar código PIX');
  });
  it('preserva opção de usar créditos sem criar PIX nem resgatar automaticamente', () => {
    button(render(), 'Prefiro usar meus créditos').props.onClick();
    expect(text(render())).toContain('Confirmar uso de 2.5 crédito(s)');
    expect(state.request).not.toHaveBeenCalled();
  });
  it('mantém SKU específico da oferta de recuperação', async () => {
    await button(render({ promo: '48h' }), 'Adquirir meu presente').props.onClick();
    expect(state.request).toHaveBeenCalledWith({ orderId: 'test-order', sku: 'recovery_combo_48h' });
  });
});
