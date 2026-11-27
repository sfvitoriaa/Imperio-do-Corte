import { ConflictException, NotFoundException } from '@nestjs/common';
import { ProfissionaisService } from './profissionais.service.js';
import { EmpresasService } from '../empresas/empresas.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';

vi.mock('../prisma/prisma.service.js', () => ({
  PrismaService: class PrismaService {},
}));

describe('ProfissionaisService', () => {
  const prisma = {
    profissional: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    agendamento: {
      count: vi.fn(),
    },
    horarioProfissional: {
      deleteMany: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      upsert: vi.fn(),
    },
    intervaloHorario: {
      findMany: vi.fn(),
      deleteMany: vi.fn(),
      createMany: vi.fn(),
      create: vi.fn(),
    },
    indisponibilidadeProfissional: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    notificacaoInterna: {
      upsert: vi.fn(),
    },
    $transaction: vi.fn(),
  };
  const empresas = {
    validarEmpresaAtiva: vi.fn(),
  };
  const service = new ProfissionaisService(
    prisma as unknown as PrismaService,
    empresas as unknown as EmpresasService,
  );
  const profissional = { id: 8, nome: 'João', ativo: true, empresaId: 3 };

  beforeEach(() => {
    vi.resetAllMocks();
    empresas.validarEmpresaAtiva.mockResolvedValue({});
  });

  it('creates a professional for the selected company', async () => {
    prisma.profissional.create.mockResolvedValue(profissional);

    await service.create(3, { nome: 'João' });

    expect(prisma.profissional.create).toHaveBeenCalledWith({
      data: { nome: 'João', empresaId: 3 },
    });
  });

  it('lists professionals in the company with optional active filtering', async () => {
    prisma.profissional.findMany.mockResolvedValue([]);

    await service.findAll(3);
    await service.findAll(3, true);
    await service.findAll(3, false);

    expect(prisma.profissional.findMany).toHaveBeenNthCalledWith(1, {
      where: { empresaId: 3, ativo: undefined },
      orderBy: { nome: 'asc' },
    });
    expect(prisma.profissional.findMany).toHaveBeenNthCalledWith(2, {
      where: { empresaId: 3, ativo: true },
      orderBy: { nome: 'asc' },
    });
    expect(prisma.profissional.findMany).toHaveBeenNthCalledWith(3, {
      where: { empresaId: 3, ativo: false },
      orderBy: { nome: 'asc' },
    });
  });

  it('finds a professional by ID within the company', async () => {
    prisma.profissional.findUnique.mockResolvedValue(profissional);

    await expect(service.findOne(3, 8)).resolves.toBe(profissional);

    expect(prisma.profissional.findUnique).toHaveBeenCalledWith({
      where: { empresaId: 3, id: 8 },
    });
  });

  it('does not expose a professional from another company', async () => {
    prisma.profissional.findUnique.mockResolvedValue(null);

    await expect(service.findOne(3, 8)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('updates professional details and deactivates without deleting history', async () => {
    prisma.profissional.findUnique.mockResolvedValue(profissional);
    prisma.profissional.update.mockResolvedValue({
      ...profissional,
      nome: 'João Silva',
      ativo: false,
    });

    await service.update(3, 8, { nome: 'João Silva', ativo: false });

    expect(prisma.profissional.update).toHaveBeenCalledWith({
      where: { id: 8, empresaId: 3 },
      data: { nome: 'João Silva', ativo: false },
    });
    expect(prisma.profissional.delete).not.toHaveBeenCalled();
  });

  it('refuses to delete a professional with appointment history', async () => {
    prisma.profissional.findUnique.mockResolvedValue(profissional);
    prisma.agendamento.count.mockResolvedValue(1);

    await expect(service.remove(3, 8)).rejects.toBeInstanceOf(
      ConflictException,
    );

    expect(prisma.agendamento.count).toHaveBeenCalledWith({
      where: { profissionalId: 8, empresaId: 3 },
    });
    expect(prisma.profissional.delete).not.toHaveBeenCalled();
  });

  it('deletes a professional with no appointment history in the company', async () => {
    prisma.profissional.findUnique.mockResolvedValue(profissional);
    prisma.agendamento.count.mockResolvedValue(0);
    prisma.profissional.delete.mockResolvedValue(profissional);

    await service.remove(3, 8);

    expect(prisma.profissional.delete).toHaveBeenCalledWith({
      where: { empresaId: 3, id: 8 },
    });
  });

  it('rejects an invalid work shift', async () => {
    prisma.profissional.findUnique.mockResolvedValue(profissional);

    await expect(
      service.definirHorarios(3, 8, {
        diaSemana: 1,
        inicio: '18:00',
        fim: '08:00',
      }),
    ).rejects.toThrow('O horário de início deve ser anterior ao horário de término');

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects malformed schedule times and weekdays before writing', async () => {
    prisma.profissional.findUnique.mockResolvedValue(profissional);

    await expect(
      service.definirHorarios(3, 8, {
        diaSemana: 7,
        inicio: '09:00',
        fim: '18:00',
      }),
    ).rejects.toThrow('Dia da semana inválido');
    await expect(
      service.definirHorarios(3, 8, {
        diaSemana: 1,
        inicio: '9:00',
        fim: '18:00',
      }),
    ).rejects.toThrow('Horários inválidos; use HH:mm');

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects intervals outside the work shift', async () => {
    prisma.profissional.findUnique.mockResolvedValue(profissional);

    await expect(
      service.definirHorarios(3, 8, {
        diaSemana: 1,
        inicio: '09:00',
        fim: '18:00',
        intervalos: [{ inicio: '17:30', fim: '18:30' }],
      }),
    ).rejects.toThrow('Intervalos inválidos ou fora da jornada');

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects overlapping booked breaks', async () => {
    prisma.profissional.findUnique.mockResolvedValue(profissional);
    prisma.horarioProfissional.findFirst.mockResolvedValue({
      id: 21,
      inicio: '09:00',
      fim: '18:00',
      intervalos: [{ inicio: '12:00', fim: '13:00' }],
    });

    await expect(
      service.cadastrarIntervalo(3, 8, 21, {
        inicio: '12:30',
        fim: '13:30',
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.intervaloHorario.create).not.toHaveBeenCalled();
  });

  it('rejects overlapping time off periods', async () => {
    prisma.profissional.findUnique.mockResolvedValue(profissional);
    prisma.indisponibilidadeProfissional.findFirst.mockResolvedValue({ id: 31 });

    await expect(
      service.registrarFolga(3, 8, {
        tipo: 'FOLGA',
        inicio: '2026-11-30T00:00:00.000Z',
        fim: '2026-12-01T00:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.indisponibilidadeProfissional.create).not.toHaveBeenCalled();
  });

  it('creates one internal notification when an existing work shift changes', async () => {
    prisma.profissional.findUnique.mockResolvedValue(profissional);
    prisma.horarioProfissional.findFirst.mockResolvedValue({
      id: 21,
      inicio: '09:00',
      fim: '17:00',
      intervalos: [],
    });
    prisma.horarioProfissional.upsert.mockResolvedValue({ id: 21 });
    prisma.horarioProfissional.findMany.mockResolvedValue([]);
    prisma.indisponibilidadeProfissional.findMany.mockResolvedValue([]);
    prisma.$transaction.mockImplementation(
      async (callback: (tx: typeof prisma) => unknown) => callback(prisma),
    );

    await service.definirHorarios(3, 8, {
      diaSemana: 1,
      inicio: '10:00',
      fim: '18:00',
    });

    expect(prisma.notificacaoInterna.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          empresaId_tipo_entidadeId: {
            empresaId: 3,
            tipo: 'ALTERACAO_HORARIO',
            entidadeId: 21,
          },
        },
      }),
    );
  });

  it('replaces omitted weekdays when saving the complete weekly schedule', async () => {
    prisma.profissional.findUnique.mockResolvedValue(profissional);
    prisma.horarioProfissional.findFirst.mockResolvedValue(null);
    prisma.horarioProfissional.upsert.mockResolvedValue({ id: 21 });
    prisma.horarioProfissional.findMany.mockResolvedValue([]);
    prisma.indisponibilidadeProfissional.findMany.mockResolvedValue([]);
    prisma.$transaction.mockImplementation(
      async (callback: (tx: typeof prisma) => unknown) => callback(prisma),
    );

    await service.definirHorarios(3, 8, {
      horarios: [{ diaSemana: 1, inicio: '09:00', fim: '17:00' }],
    });

    expect(prisma.horarioProfissional.deleteMany).toHaveBeenCalledWith({
      where: {
        empresaId: 3,
        profissionalId: 8,
        diaSemana: { notIn: [1] },
      },
    });
    expect(prisma.horarioProfissional.upsert).toHaveBeenCalledOnce();
  });

  it('allows clearing all weekdays from the weekly schedule', async () => {
    prisma.profissional.findUnique.mockResolvedValue(profissional);
    prisma.horarioProfissional.findMany.mockResolvedValue([]);
    prisma.indisponibilidadeProfissional.findMany.mockResolvedValue([]);
    prisma.$transaction.mockImplementation(
      async (callback: (tx: typeof prisma) => unknown) => callback(prisma),
    );

    await service.definirHorarios(3, 8, { horarios: [] });

    expect(prisma.horarioProfissional.deleteMany).toHaveBeenCalledWith({
      where: { empresaId: 3, profissionalId: 8 },
    });
    expect(prisma.horarioProfissional.upsert).not.toHaveBeenCalled();
  });
});
