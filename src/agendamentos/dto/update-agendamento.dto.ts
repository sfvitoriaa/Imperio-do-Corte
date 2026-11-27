import { ArrayNotEmpty, ArrayUnique, IsArray, IsDateString, IsInt, IsOptional } from 'class-validator';

export class UpdateAgendamentoDto {
  @IsOptional()
  @IsInt()
  clienteId?: number;

  @IsOptional()
  @IsInt()
  profissionalId?: number;

  @IsOptional()
  @IsDateString()
  inicio?: string;

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsInt({ each: true })
  servicoIds?: number[];
}
