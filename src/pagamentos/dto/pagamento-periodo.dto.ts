import { IsDateString } from 'class-validator';

export class PagamentoPeriodoDto {
  @IsDateString({ strict: true })
  inicio: string;

  @IsDateString({ strict: true })
  fim: string;
}
