import { Module } from '@nestjs/common';
import { EmpresasModule } from '../empresas/empresas.module.js';
import { NotificacoesController } from './notificacoes.controller.js';
import { NotificacoesService } from './notificacoes.service.js';
import { RelatoriosController } from './relatorios.controller.js';
import { RelatoriosService } from './relatorios.service.js';

@Module({
  controllers: [RelatoriosController, NotificacoesController],
  providers: [RelatoriosService, NotificacoesService],
  imports: [EmpresasModule],
})
export class RelatoriosModule {}
