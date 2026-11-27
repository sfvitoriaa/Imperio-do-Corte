import { IsIn } from "class-validator";

export const STATUS_FINAIS = [
    "CONCLUIDO",
    "NAO_COMPARECEU",
] as const;
export type StatusFinal = (typeof STATUS_FINAIS)[number];

export class UpdateStatusDto {
    @IsIn([...STATUS_FINAIS], {
        message: "status deve ser CONCLUIDO ou NAO_COMPARECEU",
    })
    status: StatusFinal;
}