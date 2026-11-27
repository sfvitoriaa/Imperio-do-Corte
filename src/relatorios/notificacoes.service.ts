import { Injectable } from '@nestjs/common';
import { EmpresasService } from '../empresas/empresas.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class NotificacoesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly empresas: EmpresasService,
  ) {}

  async findAll(empresaId: number) {
    await this.empresas.validarEmpresaAtiva(empresaId);
    const agora = new Date();
    const proximas24Horas = new Date(agora.getTime() + 24 * 60 * 60 * 1000);
    const [proximos, cancelados, pendentes, alteracoesHorario] = await Promise.all([
      this.prisma.agendamento.findMany({
        where: {
          empresaId,
          status: { in: ['AGENDADO', 'PENDENTE'] },
          inicio: { gte: agora, lte: proximas24Horas },
        },
        include: {
          cliente: { select: { id: true, nome: true } },
          profissional: { select: { id: true, nome: true } },
        },
        orderBy: { inicio: 'asc' },
      }),
      this.prisma.agendamento.findMany({
        where: {
          empresaId,
          status: 'CANCELADO',
        },
        include: {
          cliente: { select: { id: true, nome: true } },
          profissional: { select: { id: true, nome: true } },
        },
        orderBy: { criadoEm: 'desc' },
      }),
      this.prisma.agendamento.findMany({
        where: {
          empresaId,
          status: { in: ['AGENDADO', 'PENDENTE'] },
          fim: { lt: agora },
        },
        include: {
          cliente: { select: { id: true, nome: true } },
          profissional: { select: { id: true, nome: true } },
        },
        orderBy: { fim: 'asc' },
      }),
      this.prisma.notificacaoInterna.findMany({
        where: { empresaId, tipo: 'ALTERACAO_HORARIO' },
        orderBy: { criadoEm: 'desc' },
      }),
    ]);
    const horariosAlterados = alteracoesHorario.length
      ? await this.prisma.horarioProfissional.findMany({
          where: {
            empresaId,
            id: { in: alteracoesHorario.map((notificacao) => notificacao.entidadeId) },
          },
          include: {
            profissional: { select: { id: true, nome: true } },
            intervalos: true,
          },
        })
      : [];
    const horariosPorId = new Map(
      horariosAlterados.map((horario) => [horario.id, horario]),
    );

    const unicas = new Map<string, { tipo: string; referenciaId: number; dados: unknown }>();
    for (const agendamento of proximos) {
      unicas.set(`PROXIMO:${agendamento.id}`, {
        tipo: 'PROXIMO_AGENDAMENTO',
        referenciaId: agendamento.id,
        dados: agendamento,
      });
    }
    for (const agendamento of cancelados) {
      unicas.set(`CANCELADO:${agendamento.id}`, {
        tipo: 'AGENDAMENTO_CANCELADO',
        referenciaId: agendamento.id,
        dados: agendamento,
      });
    }
    for (const agendamento of pendentes) {
      unicas.set(`PENDENTE:${agendamento.id}`, {
        tipo: 'PENDENTE_FINALIZACAO',
        referenciaId: agendamento.id,
        dados: agendamento,
      });
    }
    for (const notificacao of alteracoesHorario) {
      unicas.set(`HORARIO:${notificacao.entidadeId}`, {
        tipo: notificacao.tipo,
        referenciaId: notificacao.entidadeId,
        dados: {
          ...notificacao,
          horario: horariosPorId.get(notificacao.entidadeId) ?? null,
        },
      });
    }
    return [...unicas.values()];
  }
}
