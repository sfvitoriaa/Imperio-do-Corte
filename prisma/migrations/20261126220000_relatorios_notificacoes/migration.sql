CREATE TABLE `notificacoes_internas` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `tipo` ENUM('ALTERACAO_HORARIO') NOT NULL,
    `entidadeId` INTEGER NOT NULL,
    `mensagem` VARCHAR(191) NOT NULL,
    `criadoEm` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `empresaId` INTEGER NOT NULL,

    UNIQUE INDEX `notificacoes_internas_empresaId_tipo_entidadeId_key`(`empresaId`, `tipo`, `entidadeId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `notificacoes_internas`
    ADD CONSTRAINT `notificacoes_internas_empresaId_fkey`
    FOREIGN KEY (`empresaId`) REFERENCES `empresas`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
