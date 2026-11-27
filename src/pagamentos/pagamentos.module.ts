import { Module } from '@nestjs/common';
import { EmpresasModule } from '../empresas/empresas.module.js';
import { PagamentosController } from './pagamentos.controller.js';
import { PagamentosService } from './pagamentos.service.js';

@Module({
  controllers: [PagamentosController],
  providers: [PagamentosService],
  imports: [EmpresasModule],
})
export class PagamentosModule {}
