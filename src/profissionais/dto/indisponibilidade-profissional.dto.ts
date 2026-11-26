import { IsDateString, IsIn, IsOptional, IsString } from 'class-validator';

export class IndisponibilidadeProfissionalDto {
  @IsString()
  @IsIn(['FOLGA', 'INDISPONIBILIDADE'])
  tipo: 'FOLGA' | 'INDISPONIBILIDADE';

  @IsDateString()
  inicio: string;

  @IsDateString()
  fim: string;

  @IsOptional()
  @IsString()
  motivo?: string;
}
