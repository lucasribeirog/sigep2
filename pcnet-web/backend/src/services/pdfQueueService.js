let filaPdf = Promise.resolve();

let aguardando = 0;
let emExecucao = false;
let sequencial = 0;


function executarNaFilaPdf(tarefa, descricao = 'PDF') {

  const id = ++sequencial;

  aguardando += 1;

  console.log(
    `[PDF Queue #${id}] Adicionado à fila: ${descricao}. ` +
    `Aguardando: ${aguardando}.`
  );


  const execucao =
    filaPdf.then(async () => {

      aguardando -= 1;
      emExecucao = true;

      const inicio = Date.now();

      console.log(
        `[PDF Queue #${id}] Iniciando conversão. ` +
        `Restantes: ${aguardando}.`
      );


      try {

        const resultado =
          await tarefa();


        console.log(
          `[PDF Queue #${id}] Concluído em ` +
          `${Date.now() - inicio} ms.`
        );


        return resultado;

      } catch (error) {

        console.error(
          `[PDF Queue #${id}] Erro após ` +
          `${Date.now() - inicio} ms:`,
          error?.message || error
        );


        throw error;

      } finally {

        emExecucao = false;

      }

    });


  /*
   * Importantíssimo:
   *
   * um erro em um PDF não pode quebrar a fila inteira.
   */
  filaPdf =
    execucao.catch(() => {});


  return execucao;
}


function obterStatusFilaPdf() {

  return {
    emExecucao,
    aguardando,
  };

}


module.exports = {
  executarNaFilaPdf,
  obterStatusFilaPdf,
};