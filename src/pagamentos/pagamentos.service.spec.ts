import { ConflictException, NotFoundException } from '@nestjs/common';
import { EmpresasService } from '../empresas/empresas.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { PagamentosService } from './pagamentos.service.js';

vi.mock('../prisma/prisma.service.js', () => ({
  PrismaService: class PrismaService {},
}));

describe('PagamentosService', () => {
  const prisma = {
    agendamento: { findFirst: vi.fn() },
    pagamento: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
    $transaction: vi.fn(),
  };
  const empresas = { validarEmpresaAtiva: vi.fn().mockResolvedValue({}) };
  const service = new PagamentosService(
    prisma as unknown as PrismaService,
    empresas as unknown as EmpresasService,
  );

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.$transaction.mockImplementation(
      async (callback: (tx: typeof prisma) => unknown) => callback(prisma),
    );
  });

  it('registers a payment for a concluded appointment', async () => {
    prisma.agendamento.findFirst.mockResolvedValue({
      id: 12,
      empresaId: 3,
      status: 'CONCLUIDO',
    });
    prisma.pagamento.findUnique.mockResolvedValue({ status: 'PENDENTE' });
    prisma.pagamento.upsert.mockResolvedValue({
      id: 1,
      status: 'REALIZADO',
      valorPago: 50,
      forma: 'PIX',
    });

    await expect(
      service.registrar(3, 12, { forma: 'PIX' as any, valorPago: 50 }),
    ).resolves.toMatchObject({ status: 'REALIZADO', valorPago: 50 });
  });

  it('does not register a payment for another company', async () => {
    prisma.agendamento.findFirst.mockResolvedValue(null);

    await expect(
      service.registrar(3, 12, { forma: 'DINHEIRO' as any, valorPago: 30 }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('does not allow duplicate realized payments', async () => {
    prisma.agendamento.findFirst.mockResolvedValue({
      id: 12,
      status: 'CONCLUIDO',
    });
    prisma.pagamento.findUnique.mockResolvedValue({ status: 'REALIZADO' });

    await expect(
      service.registrar(3, 12, { forma: 'PIX' as any, valorPago: 30 }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.pagamento.upsert).not.toHaveBeenCalled();
  });

  it('rejects invalid payment values', async () => {
    await expect(
      service.registrar(3, 12, { forma: 'PIX' as any, valorPago: 0 }),
    ).rejects.toThrow('O valor pago deve ser maior que zero');
  });

  it('rejects payment values with more than two decimal places', async () => {
    await expect(
      service.registrar(3, 12, { forma: 'PIX' as any, valorPago: 20.001 }),
    ).rejects.toThrow('O valor pago deve conter no máximo duas casas decimais');
  });

  it('does not register payment for an unfinished appointment', async () => {
    prisma.agendamento.findFirst.mockResolvedValue({
      id: 12,
      status: 'PENDENTE',
    });

    await expect(
      service.registrar(3, 12, { forma: 'PIX' as any, valorPago: 30 }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('lists pending, realized, all, and payments by period', async () => {
    prisma.pagamento.findMany.mockResolvedValue([]);

    await service.pendentes(3);
    await service.realizados(3);
    await service.findAll(3);
    await service.porPeriodo(3, {
      inicio: '2026-11-01T00:00:00.000Z',
      fim: '2026-11-30T23:59:59.000Z',
    });

    expect(prisma.pagamento.findMany).toHaveBeenCalledTimes(4);
  });

  it('does not expose a payment from another company', async () => {
    prisma.pagamento.findFirst.mockResolvedValue(null);

    await expect(service.findOne(3, 99)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
