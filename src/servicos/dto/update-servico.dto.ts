import { PartialType } from '@nestjs/mapped-types';
import { CreateServicoDto } from './create-servico.dto.js';
import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateServicoDto extends PartialType(CreateServicoDto) {
  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}
