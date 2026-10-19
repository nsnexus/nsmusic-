import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, describe, expect, it, vi } from 'vitest';

vi.stubGlobal('React', React);
vi.mock('next/image', () => ({ default: ({ unoptimized, priority, ...props }) => React.createElement('img', props) }));
vi.mock('next/link', () => ({ default: props => React.createElement('a', props) }));
const { default: VideoEditor } = await import('@/components/delivery/VideoEditor');
const { default: CartaEditor } = await import('@/components/delivery/CartaEditor');
const { default: RetrospectivaEditor } = await import('@/components/delivery/RetrospectivaEditor');
const { default: ProductWorkspace } = await import('@/components/delivery/ProductWorkspace');
const { default: CartaAddonCard } = await import('@/components/CartaAddonCard');
const { default: RetrospectivaAddonCard } = await import('@/components/RetrospectivaAddonCard');
const noop = () => {};
const render = (component, props) => renderToStaticMarkup(React.createElement(component, props));
const video = { order: {}, orderId: 'test', access: true, existingPhotos: [], files: [], tracks: ['https://example.test/track.mp3'], selectedTrack: 'v1' };
const retro = { titulo: '', contadorLabel: 'Juntos há', dataInicio: '', momentos: [], quiz: [], fotos: [], inheritedPhotos: 0, url: '/r/test' };
afterAll(() => vi.unstubAllGlobals());

describe('editores de produtos', () => {
  it('mantém upload e geração de vídeo bloqueados sem acesso comprado', () => {
    const html = render(VideoEditor, { ...video, access: false });
    expect(html).toContain('R$'); expect(html).toContain('6,90');
    expect(html).not.toContain('type="file"'); expect(html).not.toContain('Criar meu vídeo');
  });
  it('orienta a quantidade mínima e impede vídeo sem fotos', () => {
    const html = render(VideoEditor, video);
    expect(html).toContain('Faltam 10 para começar');
    expect(html).toMatch(/disabled=""[^>]*>Criar meu vídeo/);
  });
  it('permite gerar vídeo com dez fotos e uma faixa disponível', () => {
    const html = render(VideoEditor, { ...video, existingPhotos: Array(10).fill('/photo.jpg') });
    expect(html).toContain('Criar meu vídeo com 10 fotos');
    expect(html).not.toMatch(/disabled=""[^>]*>Criar meu vídeo/);
  });
  it('não promete prazo artificial durante a renderização', () => {
    const html = render(VideoEditor, { ...video, busy: true, progress: 'Enviando foto 3 de 10' });
    expect(html).toContain('Enviando foto 3 de 10');
    expect(html).not.toContain('40 segundos'); expect(html).not.toContain('>Criar meu vídeo');
  });
  it('preserva player e download quando o vídeo existe', () => {
    const html = render(VideoEditor, { ...video, order: { videoUrl: 'https://example.test/movie.mp4' } });
    expect(html).toContain('<video'); expect(html).toContain('Baixar meu vídeo');
    expect(html).not.toContain('type="file"');
  });
  it('carta sem texto mantém a ação de escrever e não oferece link vazio', () => {
    const html = render(CartaEditor, { texto: '', onGenerate: noop });
    expect(html).toContain('Escrever minha carta'); expect(html).not.toContain('Copiar link');
  });
  it('carta em edição mantém rascunho e ação de salvar', () => {
    const html = render(CartaEditor, { order: {}, texto: 'Texto salvo', editando: true, rascunho: 'Meu rascunho', themes: [], tracks: [], url: '/c/test', setRascunho: noop });
    expect(html).toContain('Meu rascunho'); expect(html).toContain('Salvar texto');
    expect(html).toContain('Prévia do rascunho'); expect(html).toContain('aria-disabled="true"');
  });
  it('retrospectiva mantém fotos herdadas sem botão de remoção e quiz editável', () => {
    const html = render(RetrospectivaEditor, { ...retro, fotos: ['/video.jpg', '/own.jpg'], inheritedPhotos: 1, quiz: [{ pergunta: 'Onde?', opcoes: ['A', 'B'], correta: 1 }] });
    expect(html).not.toContain('aria-label="Remover foto 1"'); expect(html).toContain('aria-label="Remover foto 2"');
    expect(html).toContain('Onde?'); expect(html).toContain('Opção 2 correta na pergunta 1');
  });
  it('bloqueia salvar e compartilhar enquanto envia fotos', () => {
    const html = render(RetrospectivaEditor, { ...retro, uploading: true });
    expect(html).toContain('Aguarde o envio das fotos'); expect(html).toContain('aria-disabled="true"');
  });
  it('pede salvar alterações antes de compartilhar a retrospectiva', () => {
    const html = render(RetrospectivaEditor, { ...retro, dirty: true });
    expect(html).toContain('Há alterações não salvas.');
    expect(html).toContain('aria-disabled="true"');
  });
  it('controllers não expõem editor de carta ou retrospectiva sem acesso', () => {
    const carta = render(CartaAddonCard, { orderId: 'test', order: {} });
    const retroHtml = render(RetrospectivaAddonCard, { orderId: 'test', order: {} });
    expect(carta).toContain('3,99'); expect(carta).not.toContain('Editar minhas palavras');
    expect(retroHtml).toContain('9,99'); expect(retroHtml).not.toContain('Título da página');
  });
  it('workspace inclui voltar à música e indica o produto atual', () => {
    const html = render(ProductWorkspace, { product: 'carta', honoree: 'Pessoa Teste', onProduct: noop });
    expect(html).toContain('Palavras que ficam.'); expect(html).toContain('aria-current="page"');
    expect(html).toContain('Voltar à minha música');
  });
});
