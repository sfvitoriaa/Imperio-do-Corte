import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { CreateProfissionaisDto } from './dto/create-profissional.dto.js';
import { UpdateProfissionaisDto } from './dto/update-profissional.dto.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { EmpresasService } from '../empresas/empresas.service.js';
import { DefinirHorariosProfissionalDto, HorarioProfissionalDto } from './dto/horario-profissional.dto.js';
import { IndisponibilidadeProfissionalDto } from './dto/indisponibilidade-profissional.dto.js';

const timeToMinutes = (time: string) => {
  const [hora, minuto] = time.split(':').map(Number);
  return hora * 60 + minuto;
};

const intervalsOverlap = (
  aInicio: number,
  aFim: number,
  bInicio: number,
  bFim: number,
) => aInicio < bFim && bInicio < aFim;

@Injectable()
export class ProfissionaisService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly empresas: EmpresasService
  ) { }

  async create(empresaId: number, dto: CreateProfissionaisDto) {
    await this.empresas.validarEmpresaAtiva(empresaId);

    return this.prisma.profissional.create({
      data: { ...dto, empresaId }
    })
  }

  async findAll(empresaId: number, ativos?: boolean) {
    await this.empresas.validarEmpresaAtiva(empresaId);

    return this.prisma.profissional.findMany({
      where: { empresaId, ativo: ativos },
      orderBy: { nome: 'asc' }
    })
  }

  async findOne(empresaId: number, id: number) {
    await this.empresas.validarEmpresaAtiva(empresaId);

    const profissional = await this.prisma.profissional.findUnique({
      where: { empresaId, id }
    })

    if (!profissional) {
      throw new NotFoundException('Profissional não encontrado')
    }

    return profissional;
  }

  async update(empresaId: number, id: number, dto: UpdateProfissionaisDto) {
    await this.empresas.validarEmpresaAtiva(empresaId);

    await this.findOne(empresaId, id)

    return this.prisma.profissional.update({ where: { id, empresaId }, data: dto })
  }

  async remove(empresaId: number, id: number) {
    await this.empresas.validarEmpresaAtiva(empresaId);

    await this.findOne(empresaId, id)

    const totalAgendamentos = await this.prisma.agendamento.count({
      where: { profissionalId: id, empresaId }
    })

    if (totalAgendamentos > 0) {
      throw new ConflictException('O profissional possui agendamentos. Desative-o com PATCH { ativo: false }')
    }

    return this.prisma.profissional.delete({ where: { empresaId, id } })
  }

  async consultarJornada(empresaId: number, profissionalId: number) {
    await this.empresas.validarEmpresaAtiva(empresaId);
    await this.findOne(empresaId, profissionalId);

    const horarios = await this.prisma.horarioProfissional.findMany({
      where: { empresaId, profissionalId },
      include: { intervalos: true },
      orderBy: [{ diaSemana: 'asc' }, { inicio: 'asc' }],
    });
    const indisponibilidades = await this.prisma.indisponibilidadeProfissional.findMany({
      where: { empresaId, profissionalId, fim: { gte: new Date() } },
      orderBy: [{ inicio: 'asc' }],
    });

    return { profissionalId, horarios, indisponibilidades };
  }

  async definirHorarios(
    empresaId: number,
    profissionalId: number,
    dto: DefinirHorariosProfissionalDto | HorarioProfissionalDto,
  ) {
    await this.empresas.validarEmpresaAtiva(empresaId);
    await this.findOne(empresaId, profissionalId);

    const horarios = Array.isArray((dto as DefinirHorariosProfissionalDto).horarios)
      ? (dto as DefinirHorariosProfissionalDto).horarios
      : [dto as HorarioProfissionalDto];

    if (horarios.length === 0) {
      throw new BadRequestException('Informe ao menos um dia de trabalho');
    }

    const dias = new Set<number>();
    for (const horario of horarios) {
      if (dias.has(horario.diaSemana)) {
        throw new BadRequestException('Não é permitido cadastrar o mesmo dia duas vezes');
      }
      dias.add(horario.diaSemana);

      const inicio = timeToMinutes(horario.inicio);
      const fim = timeToMinutes(horario.fim);
      if (inicio >= fim) {
        throw new BadRequestException('O horário de início deve ser anterior ao horário de término');
      }

      const intervalos = horario.intervalos ?? [];
      const ordenados = intervalos
        .map((intervalo) => ({
          inicio: timeToMinutes(intervalo.inicio),
          fim: timeToMinutes(intervalo.fim),
        }))
        .sort((a, b) => a.inicio - b.inicio);

      let fimAnterior = inicio;
      for (const intervalo of ordenados) {
        if (intervalo.inicio < fimAnterior || intervalo.inicio < inicio || intervalo.fim > fim ||
          intervalo.inicio >= intervalo.fim) {
          throw new BadRequestException('Intervalos inválidos ou fora da jornada');
        }
        fimAnterior = intervalo.fim;
      }
    }

    for (const horario of horarios) {
      await this.prisma.$transaction(async (tx) => {
        const anterior = await tx.horarioProfissional.findFirst({
          where: {
            profissionalId,
            empresaId,
            diaSemana: horario.diaSemana,
          },
          include: { intervalos: true },
        });
        const novosIntervalos = [...(horario.intervalos ?? [])]
          .sort((a, b) => a.inicio.localeCompare(b.inicio));
        const intervalosAnteriores = [...(anterior?.intervalos ?? [])]
          .map(({ inicio, fim }) => ({ inicio, fim }))
          .sort((a, b) => a.inicio.localeCompare(b.inicio));
        const houveAlteracao = anterior && (
          anterior.inicio !== horario.inicio ||
          anterior.fim !== horario.fim ||
          JSON.stringify(intervalosAnteriores) !== JSON.stringify(novosIntervalos)
        );

        const registro = await tx.horarioProfissional.upsert({
          where: {
            profissionalId_empresaId_diaSemana: {
              profissionalId,
              empresaId,
              diaSemana: horario.diaSemana,
            },
          },
          create: {
            profissionalId,
            empresaId,
            diaSemana: horario.diaSemana,
            inicio: horario.inicio,
            fim: horario.fim,
          },
          update: { inicio: horario.inicio, fim: horario.fim },
        });

        await tx.intervaloHorario.deleteMany({ where: { horarioId: registro.id } });
        if (horario.intervalos?.length) {
          await tx.intervaloHorario.createMany({
            data: horario.intervalos.map((intervalo) => ({
              horarioId: registro.id,
              inicio: intervalo.inicio,
              fim: intervalo.fim,
            })),
          });
        }

        if (houveAlteracao) {
          await tx.notificacaoInterna.upsert({
            where: {
              empresaId_tipo_entidadeId: {
                empresaId,
                tipo: 'ALTERACAO_HORARIO',
                entidadeId: registro.id,
              },
            },
            create: {
              empresaId,
              tipo: 'ALTERACAO_HORARIO',
              entidadeId: registro.id,
              mensagem: `Jornada do profissional ${profissionalId} alterada para o dia ${horario.diaSemana}`,
            },
            update: {
              mensagem: `Jornada do profissional ${profissionalId} alterada para o dia ${horario.diaSemana}`,
              criadoEm: new Date(),
            },
          });
        }
      });
    }

    return this.consultarJornada(empresaId, profissionalId);
  }

  async cadastrarIntervalo(
    empresaId: number,
    profissionalId: number,
    horarioId: number,
    dto: { inicio: string; fim: string },
  ) {
    await this.empresas.validarEmpresaAtiva(empresaId);
    await this.findOne(empresaId, profissionalId);

    const horario = await this.prisma.horarioProfissional.findFirst({
      where: { id: horarioId, empresaId, profissionalId },
      include: { intervalos: true },
    });
    if (!horario) {
      throw new NotFoundException('Horário de trabalho não encontrado');
    }

    const inicio = timeToMinutes(dto.inicio);
    const fim = timeToMinutes(dto.fim);
    const jornadaInicio = timeToMinutes(horario.inicio);
    const jornadaFim = timeToMinutes(horario.fim);
    if (inicio >= fim || inicio < jornadaInicio || fim > jornadaFim) {
      throw new BadRequestException('Intervalo inválido ou fora da jornada');
    }

    const sobrepoe = horario.intervalos.some((intervalo) =>
      intervalsOverlap(inicio, fim, timeToMinutes(intervalo.inicio), timeToMinutes(intervalo.fim)),
    );
    if (sobrepoe) {
      throw new ConflictException('O intervalo se sobrepõe a outro intervalo');
    }

    return this.prisma.intervaloHorario.create({
      data: { horarioId, inicio: dto.inicio, fim: dto.fim },
    });
  }

  async registrarIndisponibilidade(
    empresaId: number,
    profissionalId: number,
    dto: IndisponibilidadeProfissionalDto,
  ) {
    await this.empresas.validarEmpresaAtiva(empresaId);
    await this.findOne(empresaId, profissionalId);

    const inicio = new Date(dto.inicio);
    const fim = new Date(dto.fim);
    if (Number.isNaN(inicio.getTime()) || Number.isNaN(fim.getTime()) || inicio >= fim) {
      throw new BadRequestException('Período de indisponibilidade inválido');
    }

    const conflito = await this.prisma.indisponibilidadeProfissional.findFirst({
      where: {
        empresaId,
        profissionalId,
        inicio: { lt: fim },
        fim: { gt: inicio },
      },
    });
    if (conflito) {
      throw new ConflictException('Já existe folga ou indisponibilidade nesse período');
    }

    return this.prisma.indisponibilidadeProfissional.create({
      data: { empresaId, profissionalId, tipo: dto.tipo, inicio, fim },
    });
  }

  async registrarFolga(
    empresaId: number,
    profissionalId: number,
    dto: IndisponibilidadeProfissionalDto,
  ) {
    return this.registrarIndisponibilidade(empresaId, profissionalId, {
      ...dto,
      tipo: 'FOLGA',
    });
  }

  async definirJornada(empresaId: number, profissionalId: number, dto: DefinirHorariosProfissionalDto | HorarioProfissionalDto) {
    return this.definirHorarios(empresaId, profissionalId, dto);
  }
}
