import { ConflictException, NotFoundException } from '@nestjs/common';
import { AgendamentosService } from './agendamentos.service.js';
import { EmpresasService } from '../empresas/empresas.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

describe('AgendamentosService', () => {
  const prisma = {
    agendamento: {
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

    await expect(service.findOne(3, 12)).rejects.toBeInstanceOf(NotFoundException);

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
