import { validate } from 'class-validator';
import { UpdateStatusDto } from './update-status.dto.js';

describe('UpdateStatusDto', () => {
  it('accepts only statuses supported by the status-update route', async () => {
    const concluido = Object.assign(new UpdateStatusDto(), { status: 'CONCLUIDO' });
    const naoCompareceu = Object.assign(new UpdateStatusDto(), { status: 'NAO_COMPARECEU' });
    const cancelado = Object.assign(new UpdateStatusDto(), { status: 'CANCELADO' });

    await expect(validate(concluido)).resolves.toHaveLength(0);
    await expect(validate(naoCompareceu)).resolves.toHaveLength(0);
    await expect(validate(cancelado)).resolves.toHaveLength(1);
  });
});
