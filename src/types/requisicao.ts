export type StatusRequisicao =
  | 'Recebida'
  | 'Distribuída'
  | 'Em exame'
  | 'Concluída';

export type Requisicao = {
  id: string;
  numero: string;
  natureza: string;
  unidade: string;
  data: string;
  status: StatusRequisicao;
  solicitante: string;
  procedimento: string;
  observacao: string;
};