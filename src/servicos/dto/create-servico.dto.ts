import { Transform } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

const trimString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateServicoDto {
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  nome: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(191)
  descricao?: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  preco: number;

  @IsInt()
  @Min(5)
  duracaoMin: number;
}
