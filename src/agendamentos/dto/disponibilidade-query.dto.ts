import { Type } from 'class-transformer';
import { ArrayNotEmpty, ArrayUnique, IsArray, IsDateString, IsInt, IsOptional } from 'class-validator';

export class DisponibilidadeQueryDto {
  @Type(() => Number)
  @IsInt()
  profissionalId: number;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  servicoId?: number;

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @Type(() => Number)
  @IsInt({ each: true })
  servicoIds?: number[];

  @IsDateString({ strict: true }, {
    message: 'data deve estar no formato AAAA-MM-DD',
  })
  data: string;
}
