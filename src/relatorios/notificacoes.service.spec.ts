import { EmpresasService } from '../empresas/empresas.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { NotificacoesService } from './notificacoes.service.js';

describe('NotificacoesService', () => {
  const prisma = {
    agendamento: { findMany: vi.fn() },
    notificacaoInterna: { findMany: vi.fn() },
  };
  const empresas = { validarEmpresaAtiva: vi.fn().mockResolvedValue({}) };
  const service = new NotificacoesService(
    prisma as unknown as PrismaService,
    empresas as unknown as EmpresasService,
  );

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.agendamento.findMany.mockResolvedValue([]);
    prisma.notificacaoInterna.findMany.mockResolvedValue([]);
  });

  it('queries company-scoped upcoming, canceled, pending, and schedule change notifications', async () => {
    prisma.agendamento.findMany
      .mockResolvedValueOnce([{ id: 1 }])
      .mockResolvedValueOnce([{ id: 2 }])
      .mockResolvedValueOnce([{ id: 3 }]);
    prisma.notificacaoInterna.findMany.mockResolvedValue([
      { entidadeId: 4, tipo: 'ALTERACAO_HORARIO' },
      { entidadeId: 4, tipo: 'ALTERACAO_HORARIO' },
    ]);

    const resultado = await service.findAll(3);

    expect(resultado.map((notificacao) => notificacao.tipo)).toEqual([
      'PROXIMO_AGENDAMENTO',
      'AGENDAMENTO_CANCELADO',
      'PENDENTE_FINALIZACAO',
      'ALTERACAO_HORARIO',
    ]);
    expect(prisma.agendamento.findMany).toHaveBeenCalledTimes(3);
    for (const [args] of prisma.agendamento.findMany.mock.calls) {
      expect(args.where.empresaId).toBe(3);
    }
    expect(prisma.notificacaoInterna.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { empresaId: 3, tipo: 'ALTERACAO_HORARIO' },
      }),
    );
  });
});
