import { ConflictException, NotFoundException } from '@nestjs/common';
import { AgendamentosService } from './agendamentos.service.js';
import { EmpresasService } from '../empresas/empresas.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

describe('AgendamentosService', () => {
  const prisma = {
    cliente: {
      findFirst: vi.fn(),
    },
    profissional: {
      findFirst: vi.fn(),
    },
    servico: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
    agendamento: {
      create: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    agendamentoServico: {
      deleteMany: vi.fn(),
    },
    horarioProfissional: {
      findFirst: vi.fn(),
    },
    indisponibilidadeProfissional: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    $transaction: vi.fn(),
  };
  const empresas = {
    validarEmpresaAtiva: vi.fn().mockResolvedValue({}),
  };
  const service = new AgendamentosService(
    prisma as unknown as PrismaService,
    empresas as unknown as EmpresasService,
  );

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.$transaction.mockImplementation(async (callback: (tx: typeof prisma) => unknown) =>
      callback(prisma),
    );
    prisma.horarioProfissional.findFirst.mockResolvedValue({
      inicio: '00:00',
      fim: '23:59',
      intervalos: [],
    });
    prisma.indisponibilidadeProfissional.findFirst.mockResolvedValue(null);
    prisma.indisponibilidadeProfissional.findMany.mockResolvedValue([]);
  });

  it('does not allow inactive professionals to receive appointments', async () => {
    prisma.cliente.findFirst.mockResolvedValue({ id: 2 });
    prisma.profissional.findFirst.mockResolvedValue({
      id: 7,
      nome: 'João',
      ativo: false,
    });

    await expect(
      service.create(3, {
        clienteId: 2,
        profissionalId: 7,
        inicio: new Date(Date.now() + 60_000).toISOString(),
        servicoIds: [9],
      }),
    ).rejects.toThrow('Profissional inativo não recebe agendamentos');

    expect(prisma.agendamento.create).not.toHaveBeenCalled();
  });

  it('does not use inactive services in new appointments', async () => {
    prisma.cliente.findFirst.mockResolvedValue({ id: 2 });
    prisma.profissional.findFirst.mockResolvedValue({
      id: 7,
      nome: 'João',
      ativo: true,
    });
    prisma.servico.findMany.mockResolvedValue([]);

    await expect(
      service.create(3, {
        clienteId: 2,
        profissionalId: 7,
        inicio: new Date(Date.now() + 60_000).toISOString(),
        servicoIds: [9],
      }),
    ).rejects.toThrow('Serviço não encontrado ou inativo nesta empresa');

    expect(prisma.servico.findMany).toHaveBeenCalledWith({
      where: { empresaId: 3, ativo: true, id: { in: [9] } },
    });
    expect(prisma.agendamento.create).not.toHaveBeenCalled();
  });

  it('saves the current service price as the appointment price snapshot', async () => {
    prisma.cliente.findFirst.mockResolvedValue({ id: 2 });
    prisma.profissional.findFirst.mockResolvedValue({
      id: 7,
      nome: 'João',
      ativo: true,
    });
    prisma.servico.findMany.mockResolvedValue([
      { id: 9, preco: 45.5, duracaoMin: 20 },
    ]);
    prisma.agendamento.findFirst.mockResolvedValue(null);

    await service.create(3, {
      clienteId: 2,
      profissionalId: 7,
      inicio: new Date(Date.now() + 60_000).toISOString(),
      servicoIds: [9],
    });

    expect(prisma.agendamento.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          servicos: {
            create: [{ servicoId: 9, precoCobrado: 45.5 }],
          },
        }),
      }),
    );
  });

  it('filters the agenda by company, professional, and UTC date', async () => {
    prisma.agendamento.findMany.mockResolvedValue([]);

    await service.findAll(3, { profissionalId: 7, data: '2026-11-26' });

    expect(prisma.agendamento.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          empresaId: 3,
          profissionalId: 7,
          inicio: {
            gte: new Date('2026-11-26T00:00:00.000Z'),
            lt: new Date('2026-11-27T00:00:00.000Z'),
          },
        },
      }),
    );
  });

  it('does not expose an appointment from another company', async () => {
    prisma.agendamento.findFirst.mockResolvedValue(null);

    await expect(service.findOne(3, 12)).rejects.toBeInstanceOf(
      NotFoundException,
    );

    expect(prisma.agendamento.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 12, empresaId: 3 } }),
    );
  });

  it('does not update the status of an appointment from another company', async () => {
    prisma.agendamento.findFirst.mockResolvedValue(null);

    await expect(
      service.atualizarStatus(3, 12, { status: 'CONCLUIDO' }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.agendamento.update).not.toHaveBeenCalled();
  });

  it('does not change an already finalized appointment status', async () => {
    prisma.agendamento.findFirst.mockResolvedValue({ status: 'CANCELADO' });

    await expect(
      service.atualizarStatus(3, 12, { status: 'CONCLUIDO' }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.agendamento.update).not.toHaveBeenCalled();
  });

  it('does not schedule during a professional break', async () => {
    prisma.cliente.findFirst.mockResolvedValue({ id: 2 });
    prisma.profissional.findFirst.mockResolvedValue({
      id: 7,
      nome: 'João',
      ativo: true,
    });
    prisma.servico.findMany.mockResolvedValue([
      { id: 9, preco: 45.5, duracaoMin: 30 },
    ]);
    prisma.horarioProfissional.findFirst.mockResolvedValue({
      inicio: '09:00',
      fim: '18:00',
      intervalos: [{ inicio: '12:00', fim: '13:00' }],
    });

    await expect(
      service.create(3, {
        clienteId: 2,
        profissionalId: 7,
        inicio: '2026-11-30T12:15:00.000Z',
        servicoIds: [9],
      }),
    ).rejects.toThrow('Agendamento coincide com um intervalo');

    expect(prisma.agendamento.create).not.toHaveBeenCalled();
  });

  it('does not schedule during a registered time off period', async () => {
    prisma.cliente.findFirst.mockResolvedValue({ id: 2 });
    prisma.profissional.findFirst.mockResolvedValue({
      id: 7,
      nome: 'João',
      ativo: true,
    });
    prisma.servico.findMany.mockResolvedValue([
      { id: 9, preco: 45.5, duracaoMin: 20 },
    ]);
    prisma.indisponibilidadeProfissional.findFirst.mockResolvedValue({ id: 31 });

    await expect(
      service.create(3, {
        clienteId: 2,
        profissionalId: 7,
        inicio: '2026-11-30T15:00:00.000Z',
        servicoIds: [9],
      }),
    ).rejects.toThrow('Profissional folgado ou indisponível neste período');

    expect(prisma.agendamento.create).not.toHaveBeenCalled();
  });

  it('returns only free slots considering service duration and work hours', async () => {
    prisma.profissional.findFirst.mockResolvedValue({
      id: 7,
      nome: 'João',
      ativo: true,
    });
    prisma.servico.findFirst.mockResolvedValue({
      id: 9,
      duracaoMin: 60,
      ativo: true,
    });
    prisma.horarioProfissional.findFirst.mockResolvedValue({
      inicio: '09:00',
      fim: '12:00',
      intervalos: [],
    });
    prisma.agendamento.findMany.mockResolvedValue([]);

    const horarios = await service.consultarDisponibilidade(3, {
      profissionalId: 7,
      servicoId: 9,
      data: '2027-01-10',
    });

    expect(horarios).toEqual(['09:00', '09:30', '10:00', '10:30', '11:00']);
  });

  it('removes occupied slots and overlapping breaks', async () => {
    prisma.profissional.findFirst.mockResolvedValue({
      id: 7,
      ativo: true,
    });
    prisma.servico.findFirst.mockResolvedValue({
      id: 9,
      duracaoMin: 60,
      ativo: true,
    });
    prisma.horarioProfissional.findFirst.mockResolvedValue({
      inicio: '09:00',
      fim: '13:00',
      intervalos: [{ inicio: '11:00', fim: '12:00' }],
    });
    prisma.agendamento.findMany.mockResolvedValue([
      {
        inicio: new Date('2027-01-10T09:30:00.000Z'),
        fim: new Date('2027-01-10T10:30:00.000Z'),
      },
    ]);

    const horarios = await service.consultarDisponibilidade(3, {
      profissionalId: 7,
      servicoId: 9,
      data: '2027-01-10',
    });

    expect(horarios).not.toContain('09:00');
    expect(horarios).not.toContain('09:30');
    expect(horarios).not.toContain('10:30');
    expect(horarios).not.toContain('11:00');
  });

  it('returns no slots for an unavailable professional or without a work shift', async () => {
    prisma.profissional.findFirst.mockResolvedValue({
      id: 7,
      ativo: false,
    });

    await expect(
      service.consultarDisponibilidade(3, {
        profissionalId: 7,
        servicoId: 9,
        data: '2027-01-10',
      }),
    ).resolves.toEqual([]);

    prisma.profissional.findFirst.mockResolvedValue({ id: 7, ativo: true });
    prisma.servico.findFirst.mockResolvedValue({ id: 9, duracaoMin: 30, ativo: true });
    prisma.horarioProfissional.findFirst.mockResolvedValue(null);

    await expect(
      service.consultarDisponibilidade(3, {
        profissionalId: 7,
        servicoId: 9,
        data: '2027-01-10',
      }),
    ).resolves.toEqual([]);
  });

  it('removes slots overlapping a registered time off period', async () => {
    prisma.profissional.findFirst.mockResolvedValue({ id: 7, ativo: true });
    prisma.servico.findFirst.mockResolvedValue({ id: 9, duracaoMin: 30, ativo: true });
    prisma.horarioProfissional.findFirst.mockResolvedValue({
      inicio: '09:00',
      fim: '12:00',
      intervalos: [],
    });
    prisma.indisponibilidadeProfissional.findMany.mockResolvedValue([
      {
        inicio: new Date('2027-01-10T10:00:00.000Z'),
        fim: new Date('2027-01-10T11:00:00.000Z'),
      },
    ]);
    prisma.agendamento.findMany.mockResolvedValue([]);

    const horarios = await service.consultarDisponibilidade(3, {
      profissionalId: 7,
      servicoId: 9,
      data: '2027-01-10',
    });

    expect(horarios).not.toContain('10:00');
    expect(horarios).not.toContain('10:30');
  });

  it('filters appointments by company, date, professional, and client', async () => {
    prisma.agendamento.findMany.mockResolvedValue([]);

    await service.findAll(3, {
      data: '2027-01-10',
      profissionalId: 7,
      clienteId: 2,
    });

    expect(prisma.agendamento.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          empresaId: 3,
          profissionalId: 7,
          clienteId: 2,
          inicio: {
            gte: new Date('2027-01-10T00:00:00.000Z'),
            lt: new Date('2027-01-11T00:00:00.000Z'),
          },
        },
      }),
    );
  });

  it('cancels only an active appointment', async () => {
    prisma.agendamento.findFirst.mockResolvedValue({
      id: 12,
      status: 'AGENDADO',
    });
    prisma.agendamento.update.mockResolvedValue({
      id: 12,
      status: 'CANCELADO',
    });

    await expect(service.cancelar(3, 12)).resolves.toMatchObject({
      status: 'CANCELADO',
    });
    expect(prisma.agendamento.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 12, empresaId: 3 },
        data: { status: 'CANCELADO' },
      }),
    );

    prisma.agendamento.findFirst.mockResolvedValue({
      id: 13,
      status: 'CANCELADO',
    });
    await expect(service.cancelar(3, 13)).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects editing an appointment with a conflict', async () => {
    prisma.agendamento.findFirst
      .mockResolvedValueOnce({
        id: 12,
        status: 'AGENDADO',
        clienteId: 2,
        profissionalId: 7,
        inicio: new Date('2027-01-10T09:00:00.000Z'),
        servicos: [{
          precoCobrado: 45.5,
          servico: { id: 9, duracaoMin: 30 },
        }],
      })
      .mockResolvedValueOnce({
        id: 13,
        inicio: new Date('2027-01-10T10:00:00.000Z'),
        fim: new Date('2027-01-10T11:00:00.000Z'),
      });
    prisma.cliente.findFirst.mockResolvedValue({ id: 2 });
    prisma.profissional.findFirst.mockResolvedValue({
      id: 7,
      nome: 'João',
      ativo: true,
    });
    prisma.horarioProfissional.findFirst.mockResolvedValue({
      inicio: '09:00',
      fim: '18:00',
      intervalos: [],
    });
    prisma.indisponibilidadeProfissional.findFirst.mockResolvedValue(null);

    await expect(
      service.update(3, 12, { inicio: '2027-01-10T10:00:00.000Z' }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.agendamento.update).not.toHaveBeenCalled();
  });
});
