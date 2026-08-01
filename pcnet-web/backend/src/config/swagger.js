// src/config/swagger.js

const swaggerDocument = {
  openapi: '3.0.0',
  info: {
    title: 'PCNet - API do Sistema Pericial',
    version: '1.0.0',
    description: 'Documentação interativa das rotas do backend (Autenticação, Análise Pericial e Geração de Laudos).',
  },
  servers: [
    {
      url: 'http://localhost:3000/api',
      description: 'Servidor Local',
    },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Insira o token JWT gerado no login para acessar rotas protegidas.',
      },
    },
  },
  paths: {
    '/login': {
      post: {
        tags: ['Autenticação'],
        summary: 'Login do usuário',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  email: { type: 'string', example: 'perito@mg.gov.br' },
                  senha: { type: 'string', example: '123456' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Sucesso. Retorna dados e Token.' },
          401: { description: 'Credenciais inválidas.' },
        },
      },
    },
    '/register': {
      post: {
        tags: ['Autenticação'],
        summary: 'Cadastrar novo usuário',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  nome: { type: 'string', example: 'João Silva' },
                  email: { type: 'string', example: 'joao@mg.gov.br' },
                  senha: { type: 'string', example: '123456' },
                  masp: { type: 'string', example: '112233-4' },
                  unidade: { type: 'string', example: 'Posto de Perícia Integrada' },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Usuário cadastrado com sucesso.' },
        },
      },
    },
    '/usuarios': {
      get: {
        tags: ['Autenticação'],
        summary: 'Listar usuários cadastrados',
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'Lista de usuários.' },
        },
      },
    },
    '/catalogo': {
      get: {
        tags: ['Catálogo e Templates'],
        summary: 'Listar espécies periciais disponíveis',
        responses: {
          200: { description: 'Retorna array com o catálogo.' },
        },
      },
      post: {
        tags: ['Catálogo e Templates'],
        summary: 'Cadastrar nova espécie no catálogo',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  natureza: { type: 'string', example: 'Química Forense' },
                  especie: { type: 'string', example: 'Laudo Preliminar de Constatação de Drogas' },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Espécie cadastrada.' },
        },
      },
    },
    '/templates': {
      post: {
        tags: ['Catálogo e Templates'],
        summary: 'Fazer upload de um template (.docx) para uma espécie',
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                properties: {
                  especie: { type: 'string', example: 'Laudo Preliminar de Constatação de Drogas' },
                  arquivo: { type: 'string', format: 'binary' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Template salvo no banco de dados.' },
        },
      },
    },
    '/analisar-foto': {
      post: {
        tags: ['Laudos (Geração)'],
        summary: 'Analisar foto do vestígio com IA',
        description: 'Recebe a imagem do vestígio (arma ou drogas), extrai os parâmetros técnicos por IA e retorna o JSON estruturado para pré-preencher o formulário.',
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                properties: {
                  foto_objeto: {
                    type: 'string',
                    format: 'binary',
                    description: 'Imagem do vestígio fotografado.',
                  },
                  especie: {
                    type: 'string',
                    description: 'Espécie do objeto para direcionar a análise (ex: "Eficiencia Armas de Fogo e/ou municoes" ou "Laudo Preliminar de Constatação de Drogas").',
                    example: 'Laudo Preliminar de Constatação de Drogas',
                  },
                },
                required: ['foto_objeto'],
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Análise concluída com sucesso. Retorna os dados extraídos para o formulário.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    mensagem: { type: 'string', example: 'Imagem analisada com sucesso via IA e Visão Computacional!' },
                    dadosForm: {
                      type: 'object',
                      properties: {
                        droga: { type: 'string', example: 'cocaina' },
                        cor_material: { type: 'string', example: 'branca' },
                        qtd_involucros: { type: 'integer', example: 1 },
                        massa_liquida: { type: 'string', example: '5,2' },
                        resultado: { type: 'string', example: 'positivo' },
                      },
                    },
                    imagemProcessadaBase64: { type: 'string', example: 'data:image/jpeg;base64,...' },
                  },
                },
              },
            },
          },
          400: { description: 'Nenhuma imagem enviada.' },
          500: { description: 'Erro interno durante a análise da imagem pericial.' },
        },
      },
    },
    '/gerar-laudo': {
      post: {
        tags: ['Laudos (Geração)'],
        summary: 'Processar e gerar laudo preenchido',
        description: 'Recebe o arquivo `.docx` original do PCNet, identifica a espécie, injeta as variáveis condicionais e retorna o documento finalizado.',
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                properties: {
                  especie: { 
                    type: 'string', 
                    description: 'Nome exato da espécie pericial.',
                    example: 'Laudo Preliminar de Constatação de Drogas' 
                  },
                  dadosForm: { 
                    type: 'string', 
                    description: 'Objeto JSON transformado em string com as respostas do formulário de drogas ou balística.\n\n**Exemplo (Drogas):**\n```json\n{\n  "droga": "cocaina",\n  "cor_material": "branca",\n  "qtd_involucros": 2,\n  "massa_liquida": "10,5",\n  "extenso_massa": "dez gramas e cinco decigramas",\n  "numero_envelope": "123456",\n  "resultado": "positivo",\n  "tipo_encaminhamento": "fragmentado",\n  "massa_amostra": "2,0",\n  "fav_amostra": "998877/2026",\n  "envelope_amostra": "654321",\n  "envelope_restante": "111222"\n}\n```',
                    example: '{"droga": "cocaina", "cor_material": "branca", "qtd_involucros": 1, "massa_liquida": "5,2", "resultado": "positivo"}' 
                  },
                  perito: {
                    type: 'string',
                    description: '(Opcional) Objeto JSON em string com os dados do perito.',
                    example: '{"nome": "João Silva", "masp": "112233-4", "unidade": "Posto de Perícia"}'
                  },
                  arquivo_pcnet: { 
                    type: 'string', 
                    format: 'binary', 
                    description: 'O arquivo base (`.docx`) baixado originalmente do sistema PCNet.' 
                  },
                },
                required: ['especie', 'dadosForm', 'arquivo_pcnet'],
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Laudo gerado e unificado com sucesso.',
            content: { 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { schema: { type: 'string', format: 'binary' } } },
          },
          400: { description: 'Parâmetros obrigatórios ausentes.' },
          404: { description: 'Template não encontrado.' },
          500: { description: 'Erro interno durante a cirurgia XML.' },
        },
      },
    },
  },
};

module.exports = swaggerDocument;