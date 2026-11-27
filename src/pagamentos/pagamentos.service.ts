import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { EmpresasService } from '../empresas/empresas.service.js';
import { RegistrarPagamentoDto } from './dto/registrar-pagamento.dto.js';
import { PagamentoPeriodoDto } from './dto/pagamento-periodo.dto.js';

const DETALHES_PAGAMENTO = {
  agendamento: {
    include: {
      cliente: { select: { id: true, nome: true, telefone: true } },
      profissional: { select: { id: true, nome: true } },
      servicos: {
        include: {
          servico: { select: { id: true, nome: true, duracaoMin: true } },
        },
      },
    },
  },
};

@Injectable()
export class PagamentosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly empresas: EmpresasService,
  ) {}

  async registrar(
    empresaId: number,
    agendamentoId: number,
    dto: RegistrarPagamentoDto,
  ) {
    await this.empresas.validarEmpresaAtiva(empresaId);
    if (!Number.isFinite(dto.valorPago) || dto.valorPago <= 0) {
      throw new BadRequestException('O valor pago deve ser maior que zero');
    }
    if (Number(dto.valorPago.toFixed(2)) !== dto.valorPago) {
      throw new BadRequestException('O valor pago deve conter no máximo duas casas decimais');
    }

    const agendamento = await this.prisma.agendamento.findFirst({
      where: { id: agendamentoId, empresaId },
      include: {
        servicos: { include: { servico: true } },
      },
    });
    if (!agendamento) {
      throw new NotFoundException('Agendamento não encontrado nesta empresa');
    }
    if (agendamento.status !== 'CONCLUIDO') {
      throw new ConflictException('Somente atendimentos concluídos podem receber pagamento');
    }

    return this.prisma.$transaction(async (tx) => {
      const txWithLock = tx as typeof tx & {
        $queryRawUnsafe?: (query: string, ...values: number[]) => Promise<unknown>;
      };
      if (typeof txWithLock.$queryRawUnsafe === 'function') {
        await txWithLock.$queryRawUnsafe(
          'SELECT id FROM agendamentos WHERE id = ? AND empresaId = ? FOR UPDATE',
          agendamentoId,
          empresaId,
        );
      }

      const existente = await tx.pagamento.findUnique({
        where: { agendamentoId },
      });
      if (existente?.status === 'REALIZADO') {
        throw new ConflictException('Este agendamento já possui pagamento realizado');
      }

      return tx.pagamento.upsert({
        where: { agendamentoId },
        create: {
          agendamentoId,
          empresaId,
          forma: dto.forma,
          valorPago: dto.valorPago,
          status: 'REALIZADO',
          registradoEm: new Date(),
        },
        update: {
          forma: dto.forma,
          valorPago: dto.valorPago,
          status: 'REALIZADO',
          registradoEm: new Date(),
        },
        include: DETALHES_PAGAMENTO,
      });
    });
  }

  async findAll(empresaId: number) {
    await this.empresas.validarEmpresaAtiva(empresaId);
    return this.prisma.pagamento.findMany({
      where: { empresaId },
      include: DETALHES_PAGAMENTO,
      orderBy: { criadoEm: 'desc' },
    });
  }

  async findOne(empresaId: number, id: number) {
    await this.empresas.validarEmpresaAtiva(empresaId);
    const pagamento = await this.prisma.pagamento.findFirst({
      where: { id, empresaId },
      include: DETALHES_PAGAMENTO,
    });
    if (!pagamento) {
      throw new NotFoundException('Pagamento não encontrado');
    }
    return pagamento;
  }

  async pendentes(empresaId: number) {
    await this.empresas.validarEmpresaAtiva(empresaId);
    return this.prisma.pagamento.findMany({
      where: { empresaId, status: 'PENDENTE' },
      include: DETALHES_PAGAMENTO,
      orderBy: { criadoEm: 'desc' },
    });
  }

  async realizados(empresaId: number) {
    await this.empresas.validarEmpresaAtiva(empresaId);
    return this.prisma.pagamento.findMany({
      where: { empresaId, status: 'REALIZADO' },
      include: DETALHES_PAGAMENTO,
      orderBy: { registradoEm: 'desc' },
    });
  }

  async porPeriodo(empresaId: number, dto: PagamentoPeriodoDto) {
    await this.empresas.validarEmpresaAtiva(empresaId);
    const inicio = new Date(dto.inicio);
    const fim = new Date(dto.fim);
    if (Number.isNaN(inicio.getTime()) || Number.isNaN(fim.getTime()) || inicio > fim) {
      throw new BadRequestException('Período de consulta inválido');
    }
    return this.prisma.pagamento.findMany({
      where: {
        empresaId,
        status: 'REALIZADO',
        registradoEm: { gte: inicio, lte: fim },
      },
      include: DETALHES_PAGAMENTO,
      orderBy: { registradoEm: 'desc' },
    });
  }
}
