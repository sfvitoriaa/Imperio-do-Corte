import { Controller, Get } from '@nestjs/common';
import { EmpresaId } from '../common/empresa-id.decorator.js';
import { NotificacoesService } from './notificacoes.service.js';

@Controller('notificacoes')
export class NotificacoesController {
  constructor(private readonly notificacoesService: NotificacoesService) {}

  @Get()
  findAll(@EmpresaId() empresaId: number) {
    return this.notificacoesService.findAll(empresaId);
  }
}
