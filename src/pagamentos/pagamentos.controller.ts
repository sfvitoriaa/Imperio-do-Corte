import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import { EmpresaId } from '../common/empresa-id.decorator.js';
import { PagamentoPeriodoDto } from './dto/pagamento-periodo.dto.js';
import { RegistrarPagamentoDto } from './dto/registrar-pagamento.dto.js';
import { PagamentosService } from './pagamentos.service.js';

@Controller('pagamentos')
export class PagamentosController {
  constructor(private readonly pagamentosService: PagamentosService) {}

  @Post('agendamento/:agendamentoId')
  registrar(
    @EmpresaId() empresaId: number,
    @Param('agendamentoId', ParseIntPipe) agendamentoId: number,
    @Body() dto: RegistrarPagamentoDto,
  ) {
    return this.pagamentosService.registrar(empresaId, agendamentoId, dto);
  }

  @Get()
  findAll(@EmpresaId() empresaId: number) {
    return this.pagamentosService.findAll(empresaId);
  }

  @Get('pendentes')
  pendentes(@EmpresaId() empresaId: number) {
    return this.pagamentosService.pendentes(empresaId);
  }

  @Get('realizados')
  realizados(@EmpresaId() empresaId: number) {
    return this.pagamentosService.realizados(empresaId);
  }

  @Get('periodo')
  porPeriodo(
    @EmpresaId() empresaId: number,
    @Query() dto: PagamentoPeriodoDto,
  ) {
    return this.pagamentosService.porPeriodo(empresaId, dto);
  }

  @Get(':id')
  findOne(
    @EmpresaId() empresaId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.pagamentosService.findOne(empresaId, id);
  }
}
