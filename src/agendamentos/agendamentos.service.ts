import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { CreateAgendamentoDto } from './dto/create-agendamento.dto.js';
import { AgendaQueryDto } from './dto/agenda-query.dto.js';
import { UpdateStatusDto } from './dto/update-status.dto.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { EmpresasService } from '../empresas/empresas.service.js';
import { DisponibilidadeQueryDto } from './dto/disponibilidade-query.dto.js';
import { UpdateAgendamentoDto } from './dto/update-agendamento.dto.js';
import {
  businessDateKey,
  businessDateTime,
  businessDayBounds,
  businessMinutes,
  businessWeekday,
  BUSINESS_TIME_ZONE,
  isValidBusinessDateKey,
} from '../common/business-time.js';

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
  d.toLocaleTimeString('pt-BR', {
    timeZone: BUSINESS_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
  });

const formatMinutes = (minutes: number) =>
  `${Math.floor(minutes / 60).toString().padStart(2, '0')}:${(minutes % 60).toString().padStart(2, '0')}`;

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

  async consultarDisponibilidade(
    empresaId: number,
    query: DisponibilidadeQueryDto,
  ) {
    await this.empresas.validarEmpresaAtiva(empresaId);

    if (!isValidBusinessDateKey(query.data)) {
      throw new BadRequestException('data deve estar no formato AAAA-MM-DD');
    }

    const { start: dia, end: fimDia } = businessDayBounds(query.data);

    const profissional = await this.prisma.profissional.findFirst({
      where: { id: query.profissionalId, empresaId },
    });
    if (!profissional) {
      throw new NotFoundException('Profissional não encontrado nesta empresa');
    }
    if (!profissional.ativo) {
      return [];
    }

    let duracao: number;
    if (query.servicoId) {
      const servico = await this.prisma.servico.findFirst({
        where: { id: query.servicoId, empresaId, ativo: true },
      });
      if (!servico) {
        throw new NotFoundException('Serviço não encontrado ou inativo nesta empresa');
      }
      duracao = servico.duracaoMin;
    } else if (query.servicoIds?.length) {
      const servicos = await this.prisma.servico.findMany({
        where: { id: { in: query.servicoIds }, empresaId, ativo: true },
      });
      if (servicos.length !== query.servicoIds.length) {
        throw new NotFoundException('Serviço não encontrado ou inativo nesta empresa');
      }
      duracao = servicos.reduce((total, servico) => total + servico.duracaoMin, 0);
    } else {
      throw new NotFoundException('Serviço não encontrado ou inativo nesta empresa');
    }

    const horario = await this.prisma.horarioProfissional.findFirst({
      where: {
        empresaId,
        profissionalId: query.profissionalId,
        diaSemana: businessWeekday(query.data),
      },
      include: { intervalos: true },
    });
    if (!horario) {
      return [];
    }

    const indisponibilidades = await this.prisma.indisponibilidadeProfissional.findMany({
      where: {
        empresaId,
        profissionalId: query.profissionalId,
        inicio: { lt: fimDia },
        fim: { gt: dia },
      },
    });

    const agendamentos = await this.prisma.agendamento.findMany({
      where: {
        empresaId,
        profissionalId: query.profissionalId,
        status: { in: ['AGENDADO', 'PENDENTE'] },
        inicio: { gte: dia, lt: fimDia },
      },
      select: { inicio: true, fim: true },
    });

    const inicioJornada = this.horaParaMinutos(horario.inicio);
    const fimJornada = this.horaParaMinutos(horario.fim);
    const horariosDisponiveis: string[] = [];

    for (let inicioMin = inicioJornada; inicioMin + duracao <= fimJornada; inicioMin += 30) {
      const fimMin = inicioMin + duracao;
      const inicioSlot = businessDateTime(query.data, formatMinutes(inicioMin));
      const fimSlot = businessDateTime(query.data, formatMinutes(fimMin));

      if (fimSlot <= new Date()) {
        continue;
      }

      const coincideIntervalo = (horario.intervalos ?? []).some(
        (intervalo: { inicio: string; fim: string }) =>
          inicioMin < this.horaParaMinutos(intervalo.fim) &&
          this.horaParaMinutos(intervalo.inicio) < fimMin,
      );
      if (coincideIntervalo) {
        continue;
      }

      const coincideFolga = indisponibilidades.some((indisponibilidade) =>
        inicioSlot < new Date(indisponibilidade.fim) &&
        new Date(indisponibilidade.inicio) < fimSlot,
      );
      if (coincideFolga) {
        continue;
      }

      const coincideAgendamento = agendamentos.some((agendamento) =>
        inicioSlot < new Date(agendamento.fim) &&
        new Date(agendamento.inicio) < fimSlot,
      );
      if (coincideAgendamento) {
        continue;
      }

      const hora = Math.floor(inicioMin / 60).toString().padStart(2, '0');
      const minuto = (inicioMin % 60).toString().padStart(2, '0');
      horariosDisponiveis.push(`${hora}:${minuto}`);
    }

    return horariosDisponiveis;
  }

  async disponibilidade(empresaId: number, query: DisponibilidadeQueryDto) {
    return this.consultarDisponibilidade(empresaId, query);
  }

  async create(empresaId: number, dto: CreateAgendamentoDto) {
    await this.empresas.validarEmpresaAtiva(empresaId)

    const inicio = new Date(dto.inicio)
    if (Number.isNaN(inicio.getTime()) || inicio <= new Date()) {
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

    const dataNegocio = businessDateKey(inicio);
    const horario = await this.prisma.horarioProfissional.findFirst({
      where: {
        empresaId,
        profissionalId: dto.profissionalId,
        diaSemana: businessWeekday(dataNegocio),
      },
      include: { intervalos: true },
    });
    if (!horario) {
      throw new ConflictException('Profissional não atende neste dia');
    }

    const inicioMin = businessMinutes(inicio);
    const fimMin = businessMinutes(fim);
    const jornadaInicio = this.horaParaMinutos(horario.inicio);
    const jornadaFim = this.horaParaMinutos(horario.fim);

    if (inicioMin < jornadaInicio || fimMin > jornadaFim) {
      throw new ConflictException('Agendamento fora do horário de trabalho');
    }

    const emIntervalo = horario.intervalos.some((intervalo) =>
      inicioMin < this.horaParaMinutos(intervalo.fim) &&
      this.horaParaMinutos(intervalo.inicio) < fimMin
    );
    if (emIntervalo) {
      throw new ConflictException('Agendamento coincide com um intervalo');
    }

    const indisponibilidade = await this.prisma.indisponibilidadeProfissional.findFirst({
      where: {
        empresaId,
        profissionalId: dto.profissionalId,
        inicio: { lt: fim },
        fim: { gt: inicio },
      },
    });
    if (indisponibilidade) {
      throw new ConflictException('Profissional folgado ou indisponível neste período');
    }

    return this.prisma.$transaction(async (tx) => {
      if (typeof (tx as any).$queryRawUnsafe === 'function') {
        await (tx as any).$queryRawUnsafe(
          'SELECT id FROM profissionais WHERE id = ? AND empresaId = ? FOR UPDATE',
          dto.profissionalId,
          empresaId,
        );
      }

      const conflito = await tx.agendamento.findFirst({
        where: {
          empresaId,
          profissionalId: dto.profissionalId,
          status: { in: ['AGENDADO', 'PENDENTE'] },
          inicio: { lt: fim },
          fim: { gt: inicio }
        }
      })

      if (conflito) {
        throw new ConflictException(
          `${profissional.nome} já tem atendimento das ` + `${hora(conflito.inicio)} às ${hora(conflito.fim)}`
        )
      }

      return tx.agendamento.create({
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
          },
          pagamento: {
            create: { empresaId, status: 'PENDENTE' }
          }
        },
        include: DETALHES
      });
    });
  }

  async findAll(empresaId: number, query: AgendaQueryDto) {
    await this.empresas.validarEmpresaAtiva(empresaId);

    const { start: inicio, end: fim } = query.data
      ? businessDayBounds(query.data)
      : { start: undefined, end: undefined };

    return this.prisma.agendamento.findMany({
      where: {
        empresaId,
        profissionalId: query.profissionalId,
        ...(query.clienteId ? { clienteId: query.clienteId } : {}),
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

  async update(
    empresaId: number,
    id: number,
    dto: UpdateAgendamentoDto,
  ) {
    await this.empresas.validarEmpresaAtiva(empresaId);
    const atual = await this.findOne(empresaId, id);
    if (!['AGENDADO', 'PENDENTE'].includes(atual.status)) {
      throw new ConflictException('Somente agendamentos ativos podem ser editados');
    }
    if (!dto.clienteId && !dto.profissionalId && !dto.inicio && !dto.servicoIds) {
      throw new BadRequestException('Informe ao menos uma informação para editar');
    }

    const clienteId = dto.clienteId ?? atual.clienteId;
    const profissionalId = dto.profissionalId ?? atual.profissionalId;
    if (clienteId === null || profissionalId === null) {
      throw new BadRequestException('Cliente e profissional são obrigatórios');
    }
    const cliente = await this.prisma.cliente.findFirst({
      where: { id: clienteId, empresaId },
    });
    if (!cliente) {
      throw new NotFoundException('Cliente não encontrado nesta empresa');
    }

    const profissional = await this.prisma.profissional.findFirst({
      where: { id: profissionalId, empresaId },
    });
    if (!profissional) {
      throw new NotFoundException('Profissional não encontrado nesta empresa');
    }
    if (!profissional.ativo) {
      throw new ConflictException('Profissional inativo não recebe agendamentos');
    }

    const servicos = dto.servicoIds
      ? await this.prisma.servico.findMany({
          where: { empresaId, ativo: true, id: { in: dto.servicoIds } },
        })
      : atual.servicos.map((item: any) => ({
          ...item.servico,
          preco: item.precoCobrado,
        }));
    if (dto.servicoIds && servicos.length !== dto.servicoIds.length) {
      throw new NotFoundException('Serviço não encontrado ou inativo nesta empresa');
    }

    const inicio = dto.inicio ? new Date(dto.inicio) : new Date(atual.inicio);
    if (Number.isNaN(inicio.getTime()) || inicio <= new Date()) {
      throw new BadRequestException('Não é possível agendar numa data antiga');
    }
    const dataNegocio = businessDateKey(inicio);
    const duracao = servicos.reduce((total: number, servico: any) => total + servico.duracaoMin, 0);
    const fim = new Date(inicio.getTime() + duracao * 60_000);

    const horario = await this.prisma.horarioProfissional.findFirst({
      where: { empresaId, profissionalId, diaSemana: businessWeekday(dataNegocio) },
      include: { intervalos: true },
    });
    if (!horario) {
      throw new ConflictException('Profissional não atende neste dia');
    }
    const inicioMin = businessMinutes(inicio);
    const fimMin = businessMinutes(fim);
    if (inicioMin < this.horaParaMinutos(horario.inicio) ||
      fimMin > this.horaParaMinutos(horario.fim)) {
      throw new ConflictException('Agendamento fora do horário de trabalho');
    }
    if ((horario.intervalos ?? []).some((intervalo: any) =>
      inicioMin < this.horaParaMinutos(intervalo.fim) &&
      this.horaParaMinutos(intervalo.inicio) < fimMin)) {
      throw new ConflictException('Agendamento coincide com um intervalo');
    }

    return this.prisma.$transaction(async (tx) => {
      if (typeof (tx as any).$queryRawUnsafe === 'function') {
        await (tx as any).$queryRawUnsafe(
          'SELECT id FROM profissionais WHERE id = ? AND empresaId = ? FOR UPDATE',
          profissionalId,
          empresaId,
        );
      }

      const indisponibilidade = await tx.indisponibilidadeProfissional.findFirst({
        where: { empresaId, profissionalId, inicio: { lt: fim }, fim: { gt: inicio } },
      });
      if (indisponibilidade) {
        throw new ConflictException('Profissional folgado ou indisponível neste período');
      }

      const conflito = await tx.agendamento.findFirst({
        where: {
          id: { not: id },
          empresaId,
          profissionalId,
          status: { in: ['AGENDADO', 'PENDENTE'] },
          inicio: { lt: fim },
          fim: { gt: inicio },
        },
      });
      if (conflito) {
        throw new ConflictException(
          `${profissional.nome} já tem atendimento das ${hora(conflito.inicio)} às ${hora(conflito.fim)}`,
        );
      }

      await tx.agendamentoServico.deleteMany({ where: { agendamentoId: id } });
      return tx.agendamento.update({
        where: { id, empresaId },
        data: {
          inicio,
          fim,
          clienteId,
          profissionalId,
          servicos: {
            create: servicos.map((servico: any) => ({
              servicoId: servico.id,
              precoCobrado: servico.preco,
            })),
          },
        },
        include: DETALHES,
      });
    });
  }

  async cancelar(empresaId: number, id: number) {
    await this.empresas.validarEmpresaAtiva(empresaId);
    const agendamento = await this.findOne(empresaId, id);
    if (!['AGENDADO', 'PENDENTE'].includes(agendamento.status)) {
      throw new ConflictException('Somente agendamentos ativos podem ser cancelados');
    }
    return this.prisma.agendamento.update({
      where: { id, empresaId },
      data: { status: 'CANCELADO' },
      include: DETALHES,
    });
  }

  async consultarPendentes(empresaId: number) {
    await this.empresas.validarEmpresaAtiva(empresaId);
    return this.prisma.agendamento.findMany({
      where: {
        empresaId,
        status: { in: ['AGENDADO', 'PENDENTE'] },
      },
      include: DETALHES,
      orderBy: { inicio: 'asc' },
    });
  }

  async consultarConcluidos(empresaId: number) {
    await this.empresas.validarEmpresaAtiva(empresaId);
    return this.prisma.agendamento.findMany({
      where: { empresaId, status: 'CONCLUIDO' },
      include: DETALHES,
      orderBy: { inicio: 'desc' },
    });
  }

  async consultarCancelamentos(empresaId: number) {
    await this.empresas.validarEmpresaAtiva(empresaId);
    return this.prisma.agendamento.findMany({
      where: {
        empresaId,
        status: { in: ['CANCELADO', 'FALTOU', 'NAO_COMPARECEU'] },
      },
      include: DETALHES,
      orderBy: { inicio: 'desc' },
    });
  }

  async consultarHistoricoCliente(empresaId: number, clienteId: number) {
    await this.empresas.validarEmpresaAtiva(empresaId);
    const cliente = await this.prisma.cliente.findFirst({
      where: { id: clienteId, empresaId },
    });
    if (!cliente) {
      throw new NotFoundException('Cliente não encontrado nesta empresa');
    }
    return this.prisma.agendamento.findMany({
      where: { empresaId, clienteId },
      include: DETALHES,
      orderBy: { inicio: 'desc' },
    });
  }

  async consultarHistoricoProfissional(empresaId: number, profissionalId: number) {
    await this.empresas.validarEmpresaAtiva(empresaId);
    const profissional = await this.prisma.profissional.findFirst({
      where: { id: profissionalId, empresaId },
    });
    if (!profissional) {
      throw new NotFoundException('Profissional não encontrado nesta empresa');
    }
    return this.prisma.agendamento.findMany({
      where: { empresaId, profissionalId },
      include: DETALHES,
      orderBy: { inicio: 'desc' },
    });
  }

  async atualizarStatus(empresaId: number, id: number, dto: UpdateStatusDto) {
    await this.empresas.validarEmpresaAtiva(empresaId);

    const agendamento = await this.findOne(empresaId, id);
    if (!['AGENDADO', 'PENDENTE'].includes(agendamento.status)) {
      throw new ConflictException('O status do agendamento já foi finalizado');
    }

    const statusInterno =
      dto.status === 'NAO_COMPARECEU'
        ? 'FALTOU'
        : dto.status;

    return this.prisma.agendamento.update({
      where: { id, empresaId },
      data: { status: statusInterno },
      include: DETALHES,
    });
  }

  async remove(empresaId: number, id: number) {
    return this.cancelar(empresaId, id);
  }
}
