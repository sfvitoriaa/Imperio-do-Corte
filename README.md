# BarberCut

Sistema web para apoiar a operação de barbearias: cadastro de empresas,
clientes, profissionais e serviços, organização de horários e agendamentos,
registro de pagamentos e consulta de indicadores.

## Objetivo

Centralizar a rotina de atendimento da barbearia em uma interface para o
atendente, com os dados separados por empresa e persistidos no banco de dados.

## Tecnologias

- **Back-end:** Node.js, TypeScript e NestJS.
- **Persistência:** Prisma ORM 7 e MySQL, usando o adaptador
  `@prisma/adapter-mariadb`.
- **Front-end:** HTML, CSS e JavaScript; os arquivos estáticos são servidos pelo
  próprio NestJS.
- **Validação:** `class-validator`, `class-transformer` e `ValidationPipe` do
  NestJS.
- **Testes:** Vitest.
- **Gerenciador de pacotes:** pnpm (o projeto contém `pnpm-lock.yaml`).

## Funcionalidades

- Dashboard com indicadores calculados a partir dos dados da empresa.
- Cadastro e manutenção de empresas, clientes, profissionais e serviços.
- Agendamentos com consulta de disponibilidade, edição, cancelamento e consulta
  de situação e histórico.
- Configuração da jornada semanal, intervalos, folgas e indisponibilidades dos
  profissionais.
- Registro e consulta de pagamentos relacionados a agendamentos.
- Central de notificações sobre próximos agendamentos, cancelamentos,
  alterações de jornada e atendimentos pendentes de finalização.
- Relatórios por período, incluindo atendimentos, serviços e profissionais com
  mais atendimentos, pagamentos registrados e cancelamentos.
- Interface com tema escuro e detalhes dourados.

## Estrutura do projeto

```text
.
├── public/                 # Interface estática: HTML, CSS e JavaScript
├── prisma/
│   ├── migrations/          # Migrações do banco
│   ├── schema.prisma        # Modelos e relacionamentos
│   └── seed.mjs             # Dados de demonstração idempotentes
├── src/
│   ├── agendamentos/        # Agenda, disponibilidade e histórico
│   ├── clientes/
│   ├── common/              # Escopo da empresa e regras compartilhadas
│   ├── empresas/
│   ├── pagamentos/
│   ├── profissionais/      # Equipe, jornada e indisponibilidades
│   ├── prisma/              # Configuração do Prisma Client
│   ├── relatorios/          # Relatórios e notificações
│   ├── servicos/
│   ├── app.module.ts
│   └── main.ts
└── test/                    # Testes end-to-end
```

Testes unitários ficam junto aos módulos, em arquivos `*.spec.ts`.

## Instalação

Pré-requisitos: Node.js, pnpm e acesso a um banco MySQL/MariaDB.

```bash
pnpm install
```

## Banco de dados

Crie um banco vazio no servidor MySQL/MariaDB e configure `DATABASE_URL` na raiz
do projeto, em um arquivo `.env`:

```dotenv
DATABASE_URL="mysql://USUARIO:SENHA@HOST:3306/NOME_DO_BANCO"
PORT=3000
```

`PORT` é opcional; o back-end usa `3000` quando a variável não está definida.
O arquivo `.env` não deve ser versionado.

Gere o cliente Prisma e aplique as migrações existentes:

```bash
pnpm exec prisma generate
pnpm exec prisma migrate deploy
```

`migrate deploy` aplica as migrações existentes ao banco configurado; ele não
cria o servidor nem as credenciais do banco.

## Executar o sistema

O front-end não tem servidor separado: o NestJS serve `public/index.html`,
`public/app.js` e `public/styles.css`. Inicie o back-end em modo de
desenvolvimento:

```bash
pnpm run start:dev
```

Abra `http://localhost:3000` (ou a porta configurada em `PORT`). Para compilar e
executar a versão de produção, os scripts disponíveis são:

```bash
pnpm run build
pnpm run start:prod
```

## Testes

```bash
pnpm run test
pnpm run test:e2e
pnpm run test:cov
```

## Dados de demonstração

Depois de configurar o banco, aplicar as migrações e gerar o Prisma Client:

```bash
pnpm run db:seed
```

O seed cria ou atualiza duas empresas de demonstração, seus clientes,
profissionais, serviços, jornadas, agendamentos e pagamentos. Ele pode ser
executado novamente sem acrescentar cópias dos mesmos exemplos. Os agendamentos
de demonstração usam dias recentes e futuros no fuso de São Paulo.

## Rotas principais da API

Os recursos abaixo são servidos na raiz, por exemplo, `/clientes` e
`/agendamentos`; **não** existe um prefixo global `/api`. `GET /api` é uma rota
simples do controller principal.

As rotas de negócio que operam sobre uma empresa exigem o cabeçalho
`x-empresa-id`. As rotas de empresas (`/empresas`) são usadas para consultar e
manter empresas e não usam esse cabeçalho.

| Recurso | Rotas |
| --- | --- |
| Empresas | `GET, POST /empresas`; `GET, PATCH /empresas/:id` |
| Clientes | `GET, POST /clientes`; `GET, PATCH, DELETE /clientes/:id` |
| Profissionais | `GET, POST /profissionais`; `GET, PATCH, DELETE /profissionais/:id`; `GET /profissionais/:id/jornada`; `PUT /profissionais/:id/horarios`; `POST /profissionais/:id/horarios/:horarioId/intervalos`; `POST /profissionais/:id/folgas`; `POST /profissionais/:id/indisponibilidades` |
| Serviços | `GET, POST /servicos`; `GET, PATCH, DELETE /servicos/:id` |
| Agendamentos | `GET, POST /agendamentos`; `GET /agendamentos/:id`; `PATCH /agendamentos/:id`; `PATCH /agendamentos/:id/editar`; `POST /agendamentos/:id/cancelar`; `DELETE /agendamentos/:id` |
| Consultas de agenda | `GET /agendamentos/pendentes`; `GET /agendamentos/concluidos`; `GET /agendamentos/cancelamentos`; `GET /agendamentos/disponibilidade`; `GET /agendamentos/historico/cliente/:id`; `GET /agendamentos/historico/profissional/:id` |
| Pagamentos | `GET /pagamentos`; `GET /pagamentos/pendentes`; `GET /pagamentos/realizados`; `GET /pagamentos/periodo`; `GET /pagamentos/:id`; `POST /pagamentos/agendamento/:agendamentoId` |
| Notificações | `GET /notificacoes` |
| Relatórios | `GET /relatorios` |

Parâmetros de consulta usados pelas telas:

- `GET /clientes`: `nome` e/ou `telefone`.
- `GET /profissionais` e `GET /servicos`: `ativos`.
- `GET /agendamentos`: `data`, `clienteId` e/ou `profissionalId`.
- `GET /agendamentos/disponibilidade`: `profissionalId`, `data` e `servicoId`
  ou `servicoIds`.
- `GET /pagamentos/periodo` e `GET /relatorios`: `inicio` e `fim` no formato
  `AAAA-MM-DD`.

## Regras de negócio

- As consultas e operações da empresa selecionada são escopadas por
  `x-empresa-id`; clientes, profissionais e serviços usados em um agendamento
  devem pertencer à mesma empresa.
- A disponibilidade considera jornada, intervalos, indisponibilidades,
  duração dos serviços e agendamentos existentes. A criação e a edição também
  verificam conflitos para impedir sobreposição de horários.
- Datas de agenda, jornada e relatórios são interpretadas no fuso
  `America/Sao_Paulo`. Os filtros de data representam dias do calendário nesse
  fuso.
- Agendamentos têm situações como `PENDENTE`, `AGENDADO`, `CONCLUIDO`,
  `CANCELADO` e `FALTOU`. A rota `PATCH /agendamentos/:id` atualiza situação;
  o cancelamento também tem rota própria. `DELETE /agendamentos/:id` encaminha
  para o fluxo de cancelamento.
- Cada agendamento tem no máximo um pagamento associado. O sistema registra
  valor, forma e situação (`PENDENTE` ou `REALIZADO`); as formas são dinheiro,
  Pix, débito e crédito.
- Dashboard, relatórios e notificações usam dados da API. Períodos sem
  registros não devem ser preenchidos com valores inventados. Dados de
  demonstração são inseridos somente quando o seed é executado explicitamente.
- A API não oferece controle de leitura de notificações: o estado de leitura da
  interface fica salvo no navegador.

## Decisões de produto

- O sistema deve agilizar o atendimento feito pelo atendente, com consulta da
  disponibilidade antes da confirmação do horário.
- O fuso de negócio adotado para todas as empresas é `America/Sao_Paulo`.
- O tema visual é escuro, com detalhes dourados.
- Indicadores e notificações devem representar registros reais; não se criam
  avisos artificiais para preencher telas.

## Funcionalidades descartadas e justificativas

- **Transações bancárias:** não há cobrança, transferência, autorização de
  cartão nem integração com bancos. O sistema somente registra pagamentos
  associados a agendamentos.

