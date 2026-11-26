import { Transform } from 'class-transformer';
import { IsOptional, IsString, Matches, MinLength } from 'class-validator';

const trimString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class ClienteQueryDto {
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  nome?: string;

  @IsOptional()
  @Transform(trimString)
  @Matches(/^\d{1,11}$/, {
    message: 'Telefone de busca deve conter somente dígitos',
  })
  telefone?: string;
}
