import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { CreateAgendamentoDto } from './dto/create-agendamento.dto.js';
import { AgendaQueryDto } from './dto/agenda-query.dto.js';
import { UpdateStatusDto } from './dto/update-status.dto.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { EmpresasService } from '../empresas/empresas.service.js';
import { DisponibilidadeQueryDto } from './dto/disponibilidade-query.dto.js';
import { UpdateAgendamentoDto } from './dto/update-agendamento.dto.js';

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

  async consultarDisponibilidade(
    empresaId: number,
    query: DisponibilidadeQueryDto,
  ) {
    await this.empresas.validarEmpresaAtiva(empresaId);

    if (!/^\d{4}-\d{2}-\d{2}$/.test(query.data)) {
      throw new BadRequestException('data deve estar no formato AAAA-MM-DD');
    }

    const dia = new Date(`${query.data}T00:00:00.000Z`);
    if (Number.isNaN(dia.getTime()) || dia.toISOString().slice(0, 10) !== query.data) {
      throw new BadRequestException('Data inválida');
    }

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

    const horarioDelegate = (this.prisma as unknown as {
      horarioProfissional?: { findFirst: (args: unknown) => Promise<any> };
    }).horarioProfissional;

    if (!horarioDelegate?.findFirst) {
      return [];
    }

    const horario = await horarioDelegate.findFirst({
      where: {
        empresaId,
        profissionalId: query.profissionalId,
        diaSemana: dia.getUTCDay(),
      },
      include: { intervalos: true },
    });
    if (!horario) {
      return [];
    }

    const fimDia = new Date(dia.getTime() + 24 * 60 * 60 * 1000);
    const indisponibilidadeDelegate = (this.prisma as unknown as {
      indisponibilidadeProfissional?: { findMany: (args: unknown) => Promise<any[]> };
    }).indisponibilidadeProfissional;
    const indisponibilidades = indisponibilidadeDelegate?.findMany
      ? await indisponibilidadeDelegate.findMany({
          where: {
            empresaId,
            profissionalId: query.profissionalId,
            inicio: { lt: fimDia },
            fim: { gt: dia },
          },
        })
      : [];

    const agendamentos = await this.prisma.agendamento.findMany({
      where: {
        empresaId,
        profissionalId: query.profissionalId,
        status: 'AGENDADO',
        inicio: { gte: dia, lt: fimDia },
      },
      select: { inicio: true, fim: true },
    });

    const inicioJornada = this.horaParaMinutos(horario.inicio);
    const fimJornada = this.horaParaMinutos(horario.fim);
    const horariosDisponiveis: string[] = [];

    for (let inicioMin = inicioJornada; inicioMin + duracao <= fimJornada; inicioMin += 30) {
      const fimMin = inicioMin + duracao;
      const inicioSlot = new Date(dia.getTime() + inicioMin * 60_000);
      const fimSlot = new Date(dia.getTime() + fimMin * 60_000);

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

    const inicio = query.data ? new Date(`${query.data}T00:00:00.000Z`) : undefined;
    const fim = inicio ? new Date(inicio.getTime() + 24 * 60 * 60 * 1000) : undefined;

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
    const duracao = servicos.reduce((total: number, servico: any) => total + servico.duracaoMin, 0);
    const fim = new Date(inicio.getTime() + duracao * 60_000);

    const horario = await (this.prisma as any).horarioProfissional?.findFirst({
      where: { empresaId, profissionalId, diaSemana: inicio.getUTCDay() },
      include: { intervalos: true },
    });
    if (!horario) {
      throw new ConflictException('Profissional não atende neste dia');
    }
    const inicioMin = inicio.getUTCHours() * 60 + inicio.getUTCMinutes();
    const fimMin = fim.getUTCHours() * 60 + fim.getUTCMinutes();
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

      const indisponibilidade = await (tx as any).indisponibilidadeProfissional?.findFirst({
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
          status: 'AGENDADO',
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

    if (dto.status === 'PENDENTE' || dto.status === 'AGENDADO') {
      throw new ConflictException('O agendamento já está pendente');
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
