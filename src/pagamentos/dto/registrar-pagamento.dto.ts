import { IsEnum, IsNumber, IsPositive } from 'class-validator';

export enum FormaPagamentoDto {
  DINHEIRO = 'DINHEIRO',
  PIX = 'PIX',
  CARTAO_DEBITO = 'CARTAO_DEBITO',
  CARTAO_CREDITO = 'CARTAO_CREDITO',
}

export class RegistrarPagamentoDto {
  @IsEnum(FormaPagamentoDto)
  forma: FormaPagamentoDto;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  valorPago: number;
}
