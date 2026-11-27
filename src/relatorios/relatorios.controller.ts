import { Controller, Get, Query } from '@nestjs/common';
import { EmpresaId } from '../common/empresa-id.decorator.js';
import { PeriodoRelatorioDto } from './dto/periodo-relatorio.dto.js';
import { RelatoriosService } from './relatorios.service.js';

@Controller('relatorios')
export class RelatoriosController {
  constructor(private readonly relatoriosService: RelatoriosService) {}

  @Get()
  consultar(
    @EmpresaId() empresaId: number,
    @Query() periodo: PeriodoRelatorioDto,
  ) {
    return this.relatoriosService.consultar(empresaId, periodo);
  }
}
