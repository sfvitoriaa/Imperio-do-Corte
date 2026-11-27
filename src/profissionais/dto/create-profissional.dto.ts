import { Transform } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';

const trimString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateProfissionaisDto {
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  nome: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{10,11}$/, {
    message: 'Telefone deve ter DDD + Número, só dígitos (10 ou 11)',
  })
  telefone?: string;
}
