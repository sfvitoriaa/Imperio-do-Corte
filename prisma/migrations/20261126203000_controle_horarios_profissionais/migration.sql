CREATE TABLE `horarios_profissionais` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `diaSemana` INTEGER NOT NULL,
    `inicio` VARCHAR(5) NOT NULL,
    `fim` VARCHAR(5) NOT NULL,
    `profissionalId` INTEGER NOT NULL,
    `empresaId` INTEGER NULL,

    UNIQUE INDEX `horarios_profissionais_profissionalId_empresaId_diaSemana_key`(`profissionalId`, `empresaId`, `diaSemana`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `intervalos_horarios` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `inicio` VARCHAR(5) NOT NULL,
    `fim` VARCHAR(5) NOT NULL,
    `horarioId` INTEGER NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `indisponibilidades_profissionais` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `tipo` VARCHAR(191) NOT NULL,
    `inicio` DATETIME(3) NOT NULL,
    `fim` DATETIME(3) NOT NULL,
    `profissionalId` INTEGER NOT NULL,
    `empresaId` INTEGER NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `horarios_profissionais`
    ADD CONSTRAINT `horarios_profissionais_profissionalId_fkey`
    FOREIGN KEY (`profissionalId`) REFERENCES `profissionais`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `horarios_profissionais`
    ADD CONSTRAINT `horarios_profissionais_empresaId_fkey`
    FOREIGN KEY (`empresaId`) REFERENCES `empresas`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `intervalos_horarios`
    ADD CONSTRAINT `intervalos_horarios_horarioId_fkey`
    FOREIGN KEY (`horarioId`) REFERENCES `horarios_profissionais`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `indisponibilidades_profissionais`
    ADD CONSTRAINT `indisponibilidades_profissionais_profissionalId_fkey`
    FOREIGN KEY (`profissionalId`) REFERENCES `profissionais`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `indisponibilidades_profissionais`
    ADD CONSTRAINT `indisponibilidades_profissionais_empresaId_fkey`
    FOREIGN KEY (`empresaId`) REFERENCES `empresas`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
