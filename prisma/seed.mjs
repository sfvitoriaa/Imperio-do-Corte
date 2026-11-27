import 'dotenv/config';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '../src/generated/prisma/client.js';

const BUSINESS_TIME_ZONE = 'America/Sao_Paulo';
const WORK_DAYS = [1, 2, 3, 4, 5, 6];
const WORK_START = '09:00';
const WORK_END = '18:00';
const WORK_BREAK = { inicio: '12:00', fim: '13:00' };

const companies = [
  {
    nome: 'Imperio do Corte Demonstração Centro',
    cnpj: formatCnpj('123456780001'),
    telefone: '(11) 3000-1000',
    phonePrefix: '119876510',
    professionalPrefix: '119700010',
    professionals: ['Lucas Almeida', 'Rafael Costa'],
    clients: [
      'Ana Ribeiro',
      'Bruno Martins',
      'Camila Souza',
      'Daniel Oliveira',
      'Eduarda Lima',
      'Felipe Santos',
      'Giovana Rocha',
      'Heitor Mendes',
    ],
  },
  {
    nome: 'Imperio do Corte Demonstração Jardins',
    cnpj: formatCnpj('987654320001'),
    telefone: '(21) 3000-2000',
    phonePrefix: '219876520',
    professionalPrefix: '219700020',
    professionals: ['Marcos Ferreira', 'Thiago Nunes'],
    clients: [
      'Isabela Cardoso',
      'João Pedro Alves',
      'Karen Azevedo',
      'Leonardo Barros',
      'Mariana Freitas',
      'Nicolas Carvalho',
      'Olivia Monteiro',
      'Pedro Henrique Dias',
    ],
  },
];

const services = [
  {
    nome: 'Corte tradicional',
    descricao: 'Corte masculino com acabamento.',
    preco: 55,
    duracaoMin: 30,
  },
  {
    nome: 'Barba completa',
    descricao: 'Modelagem e acabamento de barba.',
    preco: 40,
    duracaoMin: 30,
  },
  {
    nome: 'Corte e barba',
    descricao: 'Corte tradicional combinado com barba completa.',
    preco: 85,
    duracaoMin: 60,
  },
];

const appointmentExamples = [
  { client: 0, professional: 0, service: 0, days: -1, time: '09:00', status: 'CONCLUIDO', payment: 'DINHEIRO' },
  { client: 1, professional: 1, service: 1, days: -2, time: '10:00', status: 'CONCLUIDO', payment: 'PIX' },
  { client: 2, professional: 0, service: 2, days: -3, time: '14:00', status: 'CONCLUIDO', payment: 'CARTAO_DEBITO' },
  { client: 3, professional: 1, service: 0, days: -4, time: '15:00', status: 'CONCLUIDO', payment: 'CARTAO_CREDITO' },
  { client: 4, professional: 0, service: 1, days: -5, time: '10:00', status: 'CANCELADO' },
  { client: 5, professional: 1, service: 0, days: -6, time: '11:00', status: 'FALTOU' },
  { client: 6, professional: 0, service: 2, days: 1, time: '09:00', status: 'PENDENTE' },
  { client: 7, professional: 1, service: 1, days: 1, time: '10:00', status: 'AGENDADO' },
];

function formatCnpj(base) {
  const checkDigit = (digits, weights) => {
    const total = [...digits].reduce(
      (sum, digit, index) => sum + Number(digit) * weights[index],
      0,
    );
    const remainder = total % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };
  const firstDigit = checkDigit(base, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const secondDigit = checkDigit(
    `${base}${firstDigit}`,
    [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2],
  );
  const digits = `${base}${firstDigit}${secondDigit}`;
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
}

function businessDateParts(date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  return Object.fromEntries(parts.map(({ type, value }) => [type, value]));
}

function dateString(date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function businessDayOffset(offset) {
  const today = businessDateParts(new Date());
  const date = new Date(Date.UTC(Number(today.year), Number(today.month) - 1, Number(today.day)));
  const direction = Math.sign(offset);
  let remaining = Math.abs(offset);

  while (remaining > 0) {
    date.setUTCDate(date.getUTCDate() + direction);
    if (date.getUTCDay() !== 0) {
      remaining -= 1;
    }
  }

  return dateString(date);
}

function businessDateTime(date, time) {
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const targetAsUtc = Date.UTC(year, month - 1, day, hour, minute);
  let timestamp = targetAsUtc;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const local = businessDateParts(new Date(timestamp));
    const localAsUtc = Date.UTC(
      Number(local.year),
      Number(local.month) - 1,
      Number(local.day),
      Number(local.hour),
      Number(local.minute),
    );
    timestamp += targetAsUtc - localAsUtc;
  }

  return new Date(timestamp);
}

async function findOrCreateByCompany(tx, delegate, companyId, where, create, update) {
  const existing = await tx[delegate].findFirst({
    where: { empresaId: companyId, ...where },
  });
  if (existing) {
    return tx[delegate].update({ where: { id: existing.id }, data: update });
  }
  return tx[delegate].create({
    data: { empresaId: companyId, ...create },
  });
}

async function seedCompany(tx, company) {
  const empresa = await tx.empresa.upsert({
    where: { cnpj: company.cnpj },
    create: {
      nome: company.nome,
      cnpj: company.cnpj,
      telefone: company.telefone,
      ativa: true,
    },
    update: {
      nome: company.nome,
      telefone: company.telefone,
      ativa: true,
    },
  });

  const clientes = [];
  for (const [index, nome] of company.clients.entries()) {
    const telefone = `${company.phonePrefix}${String(index + 1).padStart(2, '0')}`;
    clientes.push(await tx.cliente.upsert({
      where: { empresaId_telefone: { empresaId: empresa.id, telefone } },
      create: { empresaId: empresa.id, nome, telefone },
      update: { nome },
    }));
  }

  const profissionais = [];
  for (const [index, nome] of company.professionals.entries()) {
    const telefone = `${company.professionalPrefix}${String(index + 1).padStart(2, '0')}`;
    profissionais.push(await findOrCreateByCompany(
      tx,
      'profissional',
      empresa.id,
      { telefone },
      { nome, telefone, ativo: true },
      { nome, telefone, ativo: true },
    ));
  }

  const servicos = [];
  for (const service of services) {
    servicos.push(await findOrCreateByCompany(
      tx,
      'servico',
      empresa.id,
      { nome: service.nome },
      { ...service, ativo: true },
      { ...service, ativo: true },
    ));
  }

  for (const profissional of profissionais) {
    for (const diaSemana of WORK_DAYS) {
      const horario = await tx.horarioProfissional.upsert({
        where: {
          profissionalId_empresaId_diaSemana: {
            profissionalId: profissional.id,
            empresaId: empresa.id,
            diaSemana,
          },
        },
        create: {
          profissionalId: profissional.id,
          empresaId: empresa.id,
          diaSemana,
          inicio: WORK_START,
          fim: WORK_END,
        },
        update: { inicio: WORK_START, fim: WORK_END },
      });

      await tx.intervaloHorario.deleteMany({ where: { horarioId: horario.id } });
      await tx.intervaloHorario.create({
        data: { horarioId: horario.id, ...WORK_BREAK },
      });
    }
  }

  for (const example of appointmentExamples) {
    const cliente = clientes[example.client];
    const profissional = profissionais[example.professional];
    const servico = servicos[example.service];
    const inicio = businessDateTime(businessDayOffset(example.days), example.time);
    const fim = new Date(inicio.getTime() + servico.duracaoMin * 60_000);
    const existing = await tx.agendamento.findFirst({
      where: {
        empresaId: empresa.id,
        clienteId: cliente.id,
        profissionalId: profissional.id,
        servicos: { some: { servicoId: servico.id } },
      },
      orderBy: { id: 'asc' },
    });

    const appointmentData = {
      empresaId: empresa.id,
      clienteId: cliente.id,
      profissionalId: profissional.id,
      inicio,
      fim,
      status: example.status,
    };
    const agendamento = existing
      ? await tx.agendamento.update({
          where: { id: existing.id },
          data: appointmentData,
        })
      : await tx.agendamento.create({
          data: {
            ...appointmentData,
            servicos: {
              create: { servicoId: servico.id, precoCobrado: servico.preco },
            },
          },
        });

    if (existing) {
      await tx.agendamentoServico.update({
        where: {
          agendamentoId_servicoId: {
            agendamentoId: agendamento.id,
            servicoId: servico.id,
          },
        },
        data: { precoCobrado: servico.preco },
      });
    }

    const realizado = example.status === 'CONCLUIDO';
    await tx.pagamento.upsert({
      where: { agendamentoId: agendamento.id },
      create: {
        empresaId: empresa.id,
        agendamentoId: agendamento.id,
        status: realizado ? 'REALIZADO' : 'PENDENTE',
        valorPago: realizado ? servico.preco : null,
        forma: realizado ? example.payment : null,
        registradoEm: realizado ? fim : null,
      },
      update: {
        empresaId: empresa.id,
        status: realizado ? 'REALIZADO' : 'PENDENTE',
        valorPago: realizado ? servico.preco : null,
        forma: realizado ? example.payment : null,
        registradoEm: realizado ? fim : null,
      },
    });
  }

  return {
    empresa: empresa.nome,
    clientes: clientes.length,
    profissionais: profissionais.length,
    servicos: servicos.length,
    agendamentos: appointmentExamples.length,
  };
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL must be set to seed the example data');
  }

  const prisma = new PrismaClient({
    adapter: new PrismaMariaDb(databaseUrl),
  });

  try {
    const results = await prisma.$transaction(async (tx) => {
      const seededCompanies = [];
      for (const company of companies) {
        seededCompanies.push(await seedCompany(tx, company));
      }
      return seededCompanies;
    });

    for (const result of results) {
      console.info(
        `${result.empresa}: ${result.clientes} clientes, ${result.profissionais} profissionais, ` +
        `${result.servicos} serviços e ${result.agendamentos} agendamentos sincronizados.`,
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('Falha ao carregar os dados de demonstração:', error);
  process.exitCode = 1;
});
