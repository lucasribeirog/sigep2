// src/config/swagger.js

const swaggerDocument = {
  openapi: '3.0.0',
  info: {
    title: 'PCNet - API do Sistema Pericial',
    version: '1.0.0',
    description: 'Documentação interativa das rotas do backend (Autenticação e Geração de Laudos).',
  },
  servers: [
    {
      url: 'http://localhost:3000/api', // Ajuste a porta se o seu server.js usar outra
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
                  natureza: { type: 'string', example: 'Patrimônio' },
                  especie: { type: 'string', example: 'Eficiencia e Prestabilidade de Objeto Utilizado Para Ofender a Integridade Fisica de Outrem' },
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
                  especie: { type: 'string', example: 'Eficiencia Armas de Fogo e/ou municoes' },
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
    '/gerar-laudo': {
      post: {
        tags: ['Laudos (Geração)'],
        summary: 'Processar e gerar laudo preenchido',
        description: 'Recebe um arquivo `.docx` base do PCNet, identifica a espécie, injeta as variáveis através de cirurgia XML e retorna o documento finalizado.',
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                properties: {
                  especie: { 
                    type: 'string', 
                    description: 'Nome exato da espécie pericial (deve bater com o banco de dados).',
                    example: 'Eficiencia Armas de Fogo e/ou municoes' 
                  },
                  dadosForm: { 
                    type: 'string', 
                    description: 'Objeto JSON **transformado em string** (stringified) contendo as respostas do formulário.\n\n**Exemplo (Balística):**\n```json\n{\n  "tipo_material": "revolver",\n  "calibre": ".38 SPL",\n  "marca": "Taurus",\n  "resultado_exame": "eficiente",\n  "pertence_pm": true\n}\n```',
                    example: '{"tipo_material": "revolver", "calibre": ".38 SPL", "marca": "Taurus", "resultado_exame": "eficiente"}'
                  },
                  perito: {
                    type: 'string',
                    description: '(Opcional) Objeto JSON **transformado em string** com os dados do perito para o cabeçalho/assinatura.',
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
            description: 'Laudo gerado e unificado com sucesso. Inicia o download do `.docx`.',
            content: { 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { schema: { type: 'string', format: 'binary' } } },
          },
          400: { description: 'Parâmetros obrigatórios ausentes (Espécie ou Arquivo).' },
          404: { description: 'Template não encontrado para a espécie informada.' },
          500: { description: 'Erro interno durante a cirurgia XML do documento.' },
        },
      },
    },
  },
};

module.exports = swaggerDocument;