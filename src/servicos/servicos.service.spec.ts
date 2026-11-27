import { ConflictException, NotFoundException } from '@nestjs/common';
import { ServicosService } from './servicos.service.js';
import { EmpresasService } from '../empresas/empresas.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';

vi.mock('../prisma/prisma.service.js', () => ({
  PrismaService: class PrismaService {},
}));

describe('ServicosService', () => {
  const prisma = {
    servico: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    agendamentoServico: {
      count: vi.fn(),
    },
  };
  const empresas = {
    validarEmpresaAtiva: vi.fn(),
  };
  const service = new ServicosService(
    prisma as unknown as PrismaService,
    empresas as unknown as EmpresasService,
  );
  const servico = {
    id: 11,
    empresaId: 5,
    nome: 'Corte',
    descricao: 'Corte tradicional',
    preco: 40,
    duracaoMin: 30,
    ativo: true,
  };

  beforeEach(() => {
    vi.resetAllMocks();
    empresas.validarEmpresaAtiva.mockResolvedValue({});
  });

  it('creates a service attached to the selected company', async () => {
    prisma.servico.create.mockResolvedValue(servico);

    await service.create(5, {
      nome: servico.nome,
      descricao: servico.descricao,
      preco: servico.preco,
      duracaoMin: servico.duracaoMin,
    });

    expect(prisma.servico.create).toHaveBeenCalledWith({
      data: {
        nome: 'Corte',
        descricao: 'Corte tradicional',
        preco: 40,
        duracaoMin: 30,
        empresaId: 5,
      },
    });
  });

  it('lists services scoped to the company with optional active filtering', async () => {
    prisma.servico.findMany.mockResolvedValue([]);

    await service.findAll(5);
    await service.findAll(5, true);
    await service.findAll(5, false);

    expect(prisma.servico.findMany).toHaveBeenNthCalledWith(1, {
      where: { empresaId: 5, ativo: undefined },
      orderBy: { nome: 'asc' },
    });
    expect(prisma.servico.findMany).toHaveBeenNthCalledWith(2, {
      where: { empresaId: 5, ativo: true },
      orderBy: { nome: 'asc' },
    });
    expect(prisma.servico.findMany).toHaveBeenNthCalledWith(3, {
      where: { empresaId: 5, ativo: false },
      orderBy: { nome: 'asc' },
    });
  });

  it('finds a service by ID inside the company', async () => {
    prisma.servico.findUnique.mockResolvedValue(servico);

    await expect(service.findOne(5, 11)).resolves.toBe(servico);

    expect(prisma.servico.findUnique).toHaveBeenCalledWith({
      where: { empresaId: 5, id: 11 },
    });
  });

  it('does not expose a service from another company', async () => {
    prisma.servico.findUnique.mockResolvedValue(null);

    await expect(service.findOne(5, 11)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('updates service details, price, duration, and active state', async () => {
    prisma.servico.findUnique.mockResolvedValue(servico);
    prisma.servico.update.mockResolvedValue({
      ...servico,
      nome: 'Corte premium',
      descricao: 'Corte e finalização',
      preco: 55,
      duracaoMin: 40,
      ativo: false,
    });

    await service.update(5, 11, {
      nome: 'Corte premium',
      descricao: 'Corte e finalização',
      preco: 55,
      duracaoMin: 40,
      ativo: false,
    });

    expect(prisma.servico.update).toHaveBeenCalledWith({
      where: { empresaId: 5, id: 11 },
      data: {
        nome: 'Corte premium',
        descricao: 'Corte e finalização',
        preco: 55,
        duracaoMin: 40,
        ativo: false,
      },
    });
    expect(prisma.agendamentoServico.count).not.toHaveBeenCalled();
  });

  it('reactivates a service through its existing update route', async () => {
    prisma.servico.findUnique.mockResolvedValue({
      ...servico,
      ativo: false,
    });
    prisma.servico.update.mockResolvedValue(servico);

    await service.update(5, 11, { ativo: true });

    expect(prisma.servico.update).toHaveBeenCalledWith({
      where: { empresaId: 5, id: 11 },
      data: { ativo: true },
    });
  });

  it('refuses to delete a service used in appointment history', async () => {
    prisma.servico.findUnique.mockResolvedValue(servico);
    prisma.agendamentoServico.count.mockResolvedValue(1);

    await expect(service.remove(5, 11)).rejects.toBeInstanceOf(
      ConflictException,
    );

    expect(prisma.agendamentoServico.count).toHaveBeenCalledWith({
      where: { servicoId: 11 },
    });
    expect(prisma.servico.delete).not.toHaveBeenCalled();
  });

  it('deletes an unused service only within its company', async () => {
    prisma.servico.findUnique.mockResolvedValue(servico);
    prisma.agendamentoServico.count.mockResolvedValue(0);
    prisma.servico.delete.mockResolvedValue(servico);

    await service.remove(5, 11);

    expect(prisma.servico.delete).toHaveBeenCalledWith({
      where: { empresaId: 5, id: 11 },
    });
  });
});
