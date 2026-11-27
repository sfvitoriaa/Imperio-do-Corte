import { IsDateString } from 'class-validator';

export class PeriodoRelatorioDto {
  @IsDateString({ strict: true })
  inicio: string;

  @IsDateString({ strict: true })
  fim: string;
}
