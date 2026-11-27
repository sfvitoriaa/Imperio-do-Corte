import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateProfissionaisDto } from './create-profissional.dto.js';
import { UpdateProfissionaisDto } from './update-profissional.dto.js';

describe('Professional DTO validation', () => {
  it('trims and validates professional names', async () => {
    const dto = plainToInstance(CreateProfissionaisDto, { nome: '  João  ' });

    expect(dto.nome).toBe('João');
    await expect(validate(dto)).resolves.toHaveLength(0);

    const emptyName = plainToInstance(CreateProfissionaisDto, { nome: '  ' });
    await expect(validate(emptyName)).resolves.not.toHaveLength(0);
  });

  it('accepts a phone with DDD and rejects invalid phone lengths', async () => {
    const valid = plainToInstance(CreateProfissionaisDto, {
      nome: 'João',
      telefone: '11987654321',
    });
    await expect(validate(valid)).resolves.toHaveLength(0);

    const invalid = plainToInstance(CreateProfissionaisDto, {
      nome: 'João',
      telefone: '12345',
    });
    await expect(validate(invalid)).resolves.not.toHaveLength(0);
  });

  it('accepts boolean activation changes and rejects string values', async () => {
    const validUpdate = plainToInstance(UpdateProfissionaisDto, {
      ativo: false,
    });
    await expect(validate(validUpdate)).resolves.toHaveLength(0);

    const invalidUpdate = plainToInstance(UpdateProfissionaisDto, {
      ativo: 'false',
    });
    await expect(validate(invalidUpdate)).resolves.not.toHaveLength(0);
  });
});
