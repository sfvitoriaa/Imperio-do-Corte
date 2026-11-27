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
    if (!dto.valorPago || dto.valorPago <= 0) {
      throw new BadRequestException('O valor pago deve ser maior que zero');
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

    const existente = await this.prisma.pagamento.findUnique({
      where: { agendamentoId },
    });
    if (existente?.status === 'REALIZADO') {
      throw new ConflictException('Este agendamento já possui pagamento realizado');
    }

    return this.prisma.pagamento.upsert({
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
      include: { agendamento: true },
    });
  }

  async findAll(empresaId: number) {
    await this.empresas.validarEmpresaAtiva(empresaId);
    return this.prisma.pagamento.findMany({
      where: { empresaId },
      include: { agendamento: true },
      orderBy: { criadoEm: 'desc' },
    });
  }

  async findOne(empresaId: number, id: number) {
    await this.empresas.validarEmpresaAtiva(empresaId);
    const pagamento = await this.prisma.pagamento.findFirst({
      where: { id, empresaId },
      include: { agendamento: true },
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
      include: { agendamento: true },
      orderBy: { criadoEm: 'desc' },
    });
  }

  async realizados(empresaId: number) {
    await this.empresas.validarEmpresaAtiva(empresaId);
    return this.prisma.pagamento.findMany({
      where: { empresaId, status: 'REALIZADO' },
      include: { agendamento: true },
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
      include: { agendamento: true },
      orderBy: { registradoEm: 'desc' },
    });
  }
}
