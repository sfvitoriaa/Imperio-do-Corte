import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { CreateAgendamentoDto } from './dto/create-agendamento.dto.js';
import { AgendaQueryDto } from './dto/agenda-query.dto.js';
import { UpdateStatusDto } from './dto/update-status.dto.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { EmpresasService } from '../empresas/empresas.service.js';

const DETALHES = {
  cliente: { select: { id: true, nome: true, telefone: true } },
  profissional: { select: { id: true, nome: true } },
  servicos: {
    include: {
      servico: { select: { id: true, nome: true, duracaoMin: true } },
    }
  }

}

const hora = (d: Date) =>
  d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

@Injectable()
export class AgendamentosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly empresas: EmpresasService
  ) { }

  private horaParaMinutos(hora: string) {
    const [h, m] = hora.split(':').map(Number)
    return h * 60 + m
  }

  async create(empresaId: number, dto: CreateAgendamentoDto) {
    await this.empresas.validarEmpresaAtiva(empresaId)

    const inicio = new Date(dto.inicio)
    if (inicio <= new Date()) {
      throw new BadRequestException('Não é possível agendar numa data antiga')
    }

    const cliente = await this.prisma.cliente.findFirst({
      where: { empresaId, id: dto.clienteId }
    })

    if (!cliente) {
      throw new NotFoundException("Cliente não encontrado nesta empresa")
    }

    const profissional = await this.prisma.profissional.findFirst({
      where: { id: dto.profissionalId, empresaId }
    })

    if (!profissional) {
      throw new NotFoundException("Profissional não encontrado nesta empresa")
    }

    if (!profissional.ativo) {
      throw new NotFoundException("Profissional inativo não recebe agendamentos")
    }

    const servicos = await this.prisma.servico.findMany({
      where: { empresaId, ativo: true, id: { in: dto.servicoIds } }
    })

    if (servicos.length !== dto.servicoIds.length) {
      throw new NotFoundException("Serviço não encontrado ou inativo nesta empresa")
    }

    const duracaoTotal = servicos.reduce((soma, s) => soma + s.duracaoMin, 0)
    const fim = new Date(inicio.getTime() + duracaoTotal * 60_000)

    const horarioDelegate = (this.prisma as unknown as {
      horarioProfissional?: { findFirst: (args: unknown) => Promise<any> };
    }).horarioProfissional

    if (horarioDelegate?.findFirst) {
      const horario = await horarioDelegate.findFirst({
        where: {
          empresaId,
          profissionalId: dto.profissionalId,
          diaSemana: inicio.getUTCDay(),
        },
        include: { intervalos: true },
      })

      if (!horario) {
        throw new ConflictException('Profissional não atende neste dia')
      }

      const minutos = (data: Date) => data.getUTCHours() * 60 + data.getUTCMinutes()
      const inicioMin = minutos(inicio)
      const fimMin = minutos(fim)
      const jornadaInicio = this.horaParaMinutos(horario.inicio)
      const jornadaFim = this.horaParaMinutos(horario.fim)

      if (inicioMin < jornadaInicio || fimMin > jornadaFim) {
        throw new ConflictException('Agendamento fora do horário de trabalho')
      }

      const emIntervalo = horario.intervalos?.some((intervalo: { inicio: string; fim: string }) =>
        inicioMin < this.horaParaMinutos(intervalo.fim) &&
        this.horaParaMinutos(intervalo.inicio) < fimMin
      )
      if (emIntervalo) {
        throw new ConflictException('Agendamento coincide com um intervalo')
      }

      const indisponibilidadeDelegate = (this.prisma as unknown as {
        indisponibilidadeProfissional?: {
          findFirst: (args: unknown) => Promise<any>;
        };
      }).indisponibilidadeProfissional

      if (indisponibilidadeDelegate?.findFirst) {
        const indisponibilidade = await indisponibilidadeDelegate.findFirst({
          where: {
            empresaId,
            profissionalId: dto.profissionalId,
            inicio: { lt: fim },
            fim: { gt: inicio },
          },
        })
        if (indisponibilidade) {
          throw new ConflictException('Profissional folgado ou indisponível neste período')
        }
      }
    }

    const conflito = await this.prisma.agendamento.findFirst({
      where: {
        empresaId,
        profissionalId: dto.profissionalId,
        status: 'AGENDADO',
        inicio: { lt: fim },
        fim: { gt: inicio }
      }
    })

    if (conflito) {
      throw new ConflictException(
        `${profissional.nome} já tem atendimento das ` + `${hora(conflito.inicio)} às ${hora(conflito.fim)}`
      )
    }

    return this.prisma.agendamento.create({
      data: {
        inicio,
        fim,
        empresaId,
        clienteId: dto.clienteId,
        profissionalId: dto.profissionalId,
        servicos: {
          create: servicos.map((s) => ({
            servicoId: s.id,
            precoCobrado: s.preco
          }))
        }
      },
      include: DETALHES
    });
  }

  async findAll(empresaId: number, query: AgendaQueryDto) {
    await this.empresas.validarEmpresaAtiva(empresaId);

    const inicio = query.data ? new Date(`${query.data}T00:00:00.000Z`) : undefined;
    const fim = inicio ? new Date(inicio.getTime() + 24 * 60 * 60 * 1000) : undefined;

    return this.prisma.agendamento.findMany({
      where: {
        empresaId,
        profissionalId: query.profissionalId,
        inicio: inicio && fim ? { gte: inicio, lt: fim } : undefined,
      },
      include: DETALHES,
      orderBy: { inicio: 'asc' },
    });
  }

  async findOne(empresaId: number, id: number) {
    await this.empresas.validarEmpresaAtiva(empresaId);

    const agendamento = await this.prisma.agendamento.findFirst({
      where: { id, empresaId },
      include: DETALHES,
    });

    if (!agendamento) {
      throw new NotFoundException('Agendamento não encontrado');
    }

    return agendamento;
  }

  async atualizarStatus(empresaId: number, id: number, dto: UpdateStatusDto) {
    await this.empresas.validarEmpresaAtiva(empresaId);

    const agendamento = await this.findOne(empresaId, id);
    if (agendamento.status !== 'AGENDADO') {
      throw new ConflictException('O status do agendamento já foi finalizado');
    }

    return this.prisma.agendamento.update({
      where: { id, empresaId },
      data: { status: dto.status },
      include: DETALHES,
    });
  }

  async remove(empresaId: number, id: number) {
    await this.findOne(empresaId, id);

    return this.prisma.$transaction(async (prisma) => {
      await prisma.agendamentoServico.deleteMany({ where: { agendamentoId: id } });
      return prisma.agendamento.delete({ where: { id, empresaId } });
    });
  }
}
