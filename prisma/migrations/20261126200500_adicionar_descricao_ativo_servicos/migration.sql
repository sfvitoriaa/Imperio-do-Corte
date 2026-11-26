-- AlterTable
ALTER TABLE `servicos`
    ADD COLUMN `descricao` VARCHAR(191) NULL,
    ADD COLUMN `ativo` BOOLEAN NOT NULL DEFAULT true;
