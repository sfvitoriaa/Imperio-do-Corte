import { ConflictException, NotFoundException } from '@nestjs/common';
import { ClientesService } from './clientes.service.js';
import { EmpresasService } from '../empresas/empresas.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

describe('ClientesService', () => {
  const prisma = {
    cliente: {
      create: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  };
  const empresas = {
    validarEmpresaAtiva: vi.fn(),
  };
  const service = new ClientesService(
    prisma as unknown as PrismaService,
    empresas as unknown as EmpresasService,
  );
  const cliente = { id: 12, nome: 'Ana Costa', telefone: '11987654321' };

  beforeEach(() => {
    vi.resetAllMocks();
    empresas.validarEmpresaAtiva.mockResolvedValue({});
  });

  it('creates a client for the selected company', async () => {
    prisma.cliente.findUnique.mockResolvedValue(null);
    prisma.cliente.create.mockResolvedValue({ ...cliente, empresaId: 4 });

    await service.create(4, { nome: cliente.nome, telefone: cliente.telefone });

    expect(prisma.cliente.create).toHaveBeenCalledWith({
      data: {
        nome: cliente.nome,
        telefone: cliente.telefone,
        empresaId: 4,
      },
    });
  });

  it('lists clients scoped to the company and searches name or phone', async () => {
    prisma.cliente.findMany.mockResolvedValue([cliente]);

    await service.findAll(4, { nome: 'Ana', telefone: '1198' });

    expect(prisma.cliente.findMany).toHaveBeenCalledWith({
      where: {
        empresaId: 4,
        nome: { contains: 'Ana' },
        telefone: { contains: '1198' },
      },
      orderBy: { nome: 'asc' },
    });
  });

  it('searches by name or phone independently', async () => {
    prisma.cliente.findMany.mockResolvedValue([]);

    await service.findAll(4, { nome: 'Ana' });
    await service.findAll(4, { telefone: '1198' });

    expect(prisma.cliente.findMany).toHaveBeenNthCalledWith(1, {
      where: {
        empresaId: 4,
        nome: { contains: 'Ana' },
        telefone: undefined,
      },
      orderBy: { nome: 'asc' },
    });
    expect(prisma.cliente.findMany).toHaveBeenNthCalledWith(2, {
      where: {
        empresaId: 4,
        nome: undefined,
        telefone: { contains: '1198' },
      },
      orderBy: { nome: 'asc' },
    });
  });

  it('returns a client by ID inside the selected company', async () => {
    prisma.cliente.findFirst.mockResolvedValue(cliente);

    await expect(service.findOne({ id: 12, empresaId: 4 })).resolves.toBe(
      cliente,
    );

    expect(prisma.cliente.findFirst).toHaveBeenCalledWith({
      where: { id: 12, empresaId: 4 },
    });
  });

  it('returns not found when the ID belongs to another company', async () => {
    prisma.cliente.findFirst.mockResolvedValue(null);

    await expect(
      service.findOne({ id: 12, empresaId: 4 }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.cliente.findFirst).toHaveBeenCalledWith({
      where: { id: 12, empresaId: 4 },
    });
  });

  it('updates a client only inside the selected company', async () => {
    prisma.cliente.findFirst.mockResolvedValue(cliente);
    prisma.cliente.update.mockResolvedValue({ ...cliente, nome: 'Ana Silva' });

    await service.update({
      id: 12,
      empresaId: 4,
      clienteData: { nome: 'Ana Silva' },
    });

    expect(prisma.cliente.update).toHaveBeenCalledWith({
      where: { id: 12, empresaId: 4 },
      data: { nome: 'Ana Silva' },
    });
  });

  it('rejects duplicate phone numbers within the same company', async () => {
    prisma.cliente.findUnique.mockResolvedValue({ id: 18 });

    await expect(
      service.create(4, { nome: 'Ana Costa', telefone: cliente.telefone }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.cliente.create).not.toHaveBeenCalled();
  });

  it('rejects changing to another client phone number in the same company', async () => {
    prisma.cliente.findFirst.mockResolvedValue(cliente);
    prisma.cliente.findUnique.mockResolvedValue({ id: 18 });

    await expect(
      service.update({
        id: 12,
        empresaId: 4,
        clienteData: { telefone: '11911112222' },
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.cliente.update).not.toHaveBeenCalled();
  });

  it('deletes a client only inside the selected company', async () => {
    prisma.cliente.findFirst.mockResolvedValue(cliente);
    prisma.cliente.delete.mockResolvedValue(cliente);

    await service.remove({ id: 12, empresaId: 4 });

    expect(prisma.cliente.delete).toHaveBeenCalledWith({
      where: { id: 12, empresaId: 4 },
    });
  });
});
