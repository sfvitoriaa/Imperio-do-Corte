import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  Matches,
  ValidateNested,
} from 'class-validator';

export class IntervaloHorarioDto {
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'Horário inválido; use HH:mm' })
  inicio: string;

  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'Horário inválido; use HH:mm' })
  fim: string;
}

export class HorarioProfissionalDto {
  @IsInt()
  @IsIn([0, 1, 2, 3, 4, 5, 6])
  diaSemana: number;

  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'Horário inválido; use HH:mm' })
  inicio: string;

  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'Horário inválido; use HH:mm' })
  fim: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => IntervaloHorarioDto)
  intervalos?: IntervaloHorarioDto[];
}

export class DefinirHorariosProfissionalDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => HorarioProfissionalDto)
  horarios: HorarioProfissionalDto[];
}
