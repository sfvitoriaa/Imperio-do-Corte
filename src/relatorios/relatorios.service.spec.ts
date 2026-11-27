import { BadRequestException } from '@nestjs/common';
import { EmpresasService } from '../empresas/empresas.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RelatoriosService } from './relatorios.service.js';

vi.mock('../prisma/prisma.service.js', () => ({
  PrismaService: class PrismaService {},
}));

describe('RelatoriosService', () => {
  const prisma = {
    agendamento: { findMany: vi.fn(), count: vi.fn() },
    pagamento: { findMany: vi.fn() },
  };
  const empresas = { validarEmpresaAtiva: vi.fn().mockResolvedValue({}) };
  const service = new RelatoriosService(
    prisma as unknown as PrismaService,
    empresas as unknown as EmpresasService,
  );
  const periodo = { inicio: '2026-11-01', fim: '2026-11-30' };

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.agendamento.findMany.mockResolvedValue([
      {
        status: 'CONCLUIDO',
        profissional: { id: 8, nome: 'João' },
        servicos: [{ servico: { id: 4, nome: 'Corte' } }],
      },
      {
        status: 'PENDENTE',
        profissional: { id: 9, nome: 'Ana' },
        servicos: [{ servico: { id: 5, nome: 'Barba' } }],
      },
    ]);
    prisma.pagamento.findMany.mockResolvedValue([
      { valorPago: 50 },
      { valorPago: 25.5 },
    ]);
    prisma.agendamento.count.mockResolvedValue(2);
  });

  it('builds period summaries from company-scoped database records', async () => {
    const resultado = await service.consultar(3, periodo);

    expect(resultado).toMatchObject({
      atendimentos: 2,
      servicosMaisRealizados: [{ servicoId: 4, nome: 'Corte', quantidade: 1 }],
      profissionaisComMaisAtendimentos: [
        { profissionalId: 8, nome: 'João', atendimentos: 1 },
      ],
      pagamentos: { quantidade: 2, total: 75.5 },
      cancelamentos: 2,
    });
    expect(prisma.agendamento.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          empresaId: 3,
          inicio: {
            gte: new Date('2026-11-01T00:00:00.000Z'),
            lt: new Date('2026-12-01T00:00:00.000Z'),
          },
        },
      }),
    );
    expect(prisma.pagamento.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ empresaId: 3 }) }),
    );
  });

  it('rejects reversed date ranges', async () => {
    await expect(
      service.consultar(3, { inicio: '2026-12-01', fim: '2026-11-01' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
