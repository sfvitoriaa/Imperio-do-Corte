import { Controller, Get, Post, Body, Patch, Param, Delete, Query, ParseIntPipe, ParseBoolPipe } from '@nestjs/common';
import { ProfissionaisService } from './profissionais.service.js';
import { CreateProfissionaisDto } from './dto/create-profissional.dto.js';
import { UpdateProfissionaisDto } from './dto/update-profissional.dto.js';
import { EmpresaId } from '../common/empresa-id.decorator.js';

@Controller('profissionais')
export class ProfissionaisController {
  constructor(private readonly profissionaisService: ProfissionaisService) { }

  @Post()
  create(@EmpresaId() empresaId: number, @Body() dto: CreateProfissionaisDto) {
    return this.profissionaisService.create(empresaId, dto);
  }

  @Get()
  findAll(
    @EmpresaId() empresaId: number,
    @Query('ativos', new ParseBoolPipe({ optional: true })) ativos?: boolean
  ) {
    return this.profissionaisService.findAll(empresaId, ativos);
  }

  @Get(':id')
  findOne(
    @EmpresaId() empresaId: number,
    @Param('id', ParseIntPipe) id: number
  ) {
    return this.profissionaisService.findOne(empresaId, id);
  }

  @Patch(':id')
  update(
    @EmpresaId() empresaId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateProfissionaisDto) {
    return this.profissionaisService.update(empresaId, id, dto);
  }

  @Delete(':id')
  remove(
    @EmpresaId() empresaId: number,
    @Param('id', ParseIntPipe) id: number) {
    return this.profissionaisService.remove(empresaId, id);
  }
}
