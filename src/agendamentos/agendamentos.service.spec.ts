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
    },
    agendamento: {
      create: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
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
});
