CREATE TABLE `pagamentos` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `valorPago` DOUBLE NULL,
    `forma` ENUM('DINHEIRO', 'PIX', 'CARTAO_DEBITO', 'CARTAO_CREDITO') NULL,
    `status` ENUM('PENDENTE', 'REALIZADO') NOT NULL DEFAULT 'PENDENTE',
    `registradoEm` DATETIME(3) NULL,
    `criadoEm` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `empresaId` INTEGER NULL,
    `agendamentoId` INTEGER NOT NULL,

    UNIQUE INDEX `pagamentos_agendamentoId_key`(`agendamentoId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `pagamentos`
    ADD CONSTRAINT `pagamentos_empresaId_fkey`
    FOREIGN KEY (`empresaId`) REFERENCES `empresas`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `pagamentos`
    ADD CONSTRAINT `pagamentos_agendamentoId_fkey`
    FOREIGN KEY (`agendamentoId`) REFERENCES `agendamentos`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO `pagamentos` (`status`, `empresaId`, `agendamentoId`)
SELECT 'PENDENTE', `empresaId`, `id`
FROM `agendamentos`;
