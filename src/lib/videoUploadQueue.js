/**
 * Executa uploads e preparações em paralelo, limitando quantas tarefas ficam
 * abertas no celular. Mantém a ordem das fotos mesmo que as requisições
 * terminem em ordem diferente. Aguarda todas as tarefas em andamento se uma falhar.
 */
export async function mapWithConcurrency(items, concurrency, mapper) {
  if (!Array.isArray(items)) throw new TypeError('items deve ser um array');
  if (typeof mapper !== 'function') throw new TypeError('mapper deve ser uma função');
  if (items.length === 0) return [];

  const limite = Math.min(items.length, Math.max(1, Math.floor(Number(concurrency) || 1)));
  const resultados = new Array(items.length);
  let proximo = 0;
  let primeiroErro = null;

  const executar = async () => {
    while (!primeiroErro && proximo < items.length) {
      const indice = proximo++;
      try {
        resultados[indice] = await mapper(items[indice], indice);
      } catch (err) {
        primeiroErro = err;
      }
    }
  };

  await Promise.all(Array.from({ length: limite }, () => executar()));
  if (primeiroErro) throw primeiroErro;
  return resultados;
}
