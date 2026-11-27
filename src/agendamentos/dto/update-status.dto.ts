import { IsIn } from "class-validator";

export const STATUS_FINAIS = [
    "PENDENTE",
    "CONCLUIDO",
    "CANCELADO",
    "NAO_COMPARECEU",
    "AGENDADO",
    "FALTOU",
] as const;
export type StatusFinal = (typeof STATUS_FINAIS)[number];

export class UpdateStatusDto {
    @IsIn([...STATUS_FINAIS], {
        message: "status deve ser PENDENTE, CONCLUIDO, CANCELADO ou NAO_COMPARECEU",
    })
    status: StatusFinal;
}