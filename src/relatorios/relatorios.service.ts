import { BadRequestException, Injectable } from '@nestjs/common';
import { EmpresasService } from '../empresas/empresas.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { PeriodoRelatorioDto } from './dto/periodo-relatorio.dto.js';

@Injectable()
export class RelatoriosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly empresas: EmpresasService,
  ) {}

  async consultar(empresaId: number, periodo: PeriodoRelatorioDto) {
    await this.empresas.validarEmpresaAtiva(empresaId);
    const inicio = new Date(`${periodo.inicio}T00:00:00.000Z`);
    const fim = new Date(`${periodo.fim}T00:00:00.000Z`);
    if (
      Number.isNaN(inicio.getTime()) ||
      Number.isNaN(fim.getTime()) ||
      inicio > fim ||
      inicio.toISOString().slice(0, 10) !== periodo.inicio ||
      fim.toISOString().slice(0, 10) !== periodo.fim
    ) {
      throw new BadRequestException('Período de relatório inválido');
    }

    const fimExclusivo = new Date(fim.getTime() + 24 * 60 * 60 * 1000);
    const [agendamentos, pagamentos, cancelamentos] = await Promise.all([
      this.prisma.agendamento.findMany({
        where: {
          empresaId,
          inicio: { gte: inicio, lt: fimExclusivo },
        },
        include: {
          profissional: { select: { id: true, nome: true } },
          servicos: {
            include: { servico: { select: { id: true, nome: true } } },
          },
        },
      }),
      this.prisma.pagamento.findMany({
        where: {
          empresaId,
          status: 'REALIZADO',
          registradoEm: { gte: inicio, lt: fimExclusivo },
        },
        select: { valorPago: true },
      }),
      this.prisma.agendamento.count({
        where: {
          empresaId,
          status: 'CANCELADO',
          inicio: { gte: inicio, lt: fimExclusivo },
        },
      }),
    ]);

    const servicos = new Map<number, { servicoId: number; nome: string; quantidade: number }>();
    const profissionais = new Map<number, { profissionalId: number; nome: string; atendimentos: number }>();

    for (const agendamento of agendamentos) {
      if (agendamento.status !== 'CONCLUIDO') continue;
      if (agendamento.profissional) {
        const anterior = profissionais.get(agendamento.profissional.id);
        profissionais.set(agendamento.profissional.id, {
          profissionalId: agendamento.profissional.id,
          nome: agendamento.profissional.nome,
          atendimentos: (anterior?.atendimentos ?? 0) + 1,
        });
      }
      for (const item of agendamento.servicos) {
        if (!item.servico) continue;
        const anterior = servicos.get(item.servico.id);
        servicos.set(item.servico.id, {
          servicoId: item.servico.id,
          nome: item.servico.nome,
          quantidade: (anterior?.quantidade ?? 0) + 1,
        });
      }
    }

    return {
      periodo: { inicio: periodo.inicio, fim: periodo.fim },
      atendimentos: agendamentos.length,
      servicosMaisRealizados: [...servicos.values()].sort(
        (a, b) => b.quantidade - a.quantidade,
      ),
      profissionaisComMaisAtendimentos: [...profissionais.values()].sort(
        (a, b) => b.atendimentos - a.atendimentos,
      ),
      pagamentos: {
        quantidade: pagamentos.length,
        total: pagamentos.reduce((soma, pagamento) => soma + (pagamento.valorPago ?? 0), 0),
      },
      cancelamentos,
    };
  }
}
