import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, Matches } from 'class-validator';

const trimString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateClienteDto {
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  nome: string;

  @IsString()
  @Matches(/^\d{10,11}$/, {
    message: 'Telefone deve ter DDD + Número, só dígitos (10 ou 11)',
  })
  telefone: string;
}
