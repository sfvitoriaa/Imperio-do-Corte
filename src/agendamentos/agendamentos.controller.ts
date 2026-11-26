import { Controller, Get, Post, Body, Patch, Param, Delete, ParseIntPipe, Query } from '@nestjs/common';
import { AgendamentosService } from './agendamentos.service.js';
import { CreateAgendamentoDto } from './dto/create-agendamento.dto.js';
import { AgendaQueryDto } from './dto/agenda-query.dto.js';
import { UpdateStatusDto } from './dto/update-status.dto.js';
import { EmpresaId } from '../common/empresa-id.decorator.js';

@Controller('agendamentos')
export class AgendamentosController {
  constructor(private readonly agendamentosService: AgendamentosService) { }

  @Post()
  create(@EmpresaId() empresaId: number, @Body() dto: CreateAgendamentoDto) {
    return this.agendamentosService.create(empresaId, dto);
  }

  @Get()
  findAll(@EmpresaId() empresaId: number, @Query() query: AgendaQueryDto) {
    return this.agendamentosService.findAll(empresaId, query);
  }

  @Get(':id')
  findOne(
    @EmpresaId() empresaId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.agendamentosService.findOne(empresaId, id);
  }

  @Patch(':id')
  atualizarStatus(
    @EmpresaId() empresaId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateStatusDto,
  ) {
    return this.agendamentosService.atualizarStatus(empresaId, id, dto);
  }

  @Delete(':id')
  remove(
    @EmpresaId() empresaId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.agendamentosService.remove(empresaId, id);
  }
}
