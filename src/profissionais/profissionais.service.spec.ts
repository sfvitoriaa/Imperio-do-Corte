import { ConflictException, NotFoundException } from '@nestjs/common';
import { ProfissionaisService } from './profissionais.service.js';
import { EmpresasService } from '../empresas/empresas.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

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
});
