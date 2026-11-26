import { Type } from "class-transformer";
import { IsDateString, IsInt, IsOptional } from "class-validator";

export class AgendaQueryDto {
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    profissionalId?: number;

    @IsOptional()
    @IsDateString({ strict: true }, {
        message: "data deve estar no formato AAAA-MM-DD",
    })
    data?: string;
}