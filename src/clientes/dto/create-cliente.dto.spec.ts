import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateClienteDto } from './create-cliente.dto.js';

describe('CreateClienteDto', () => {
  it('trims client names and accepts a valid phone number', async () => {
    const dto = plainToInstance(CreateClienteDto, {
      nome: '  Ana Costa  ',
      telefone: '11987654321',
    });

    expect(dto.nome).toBe('Ana Costa');
    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('rejects blank names and non-string phone numbers', async () => {
    const dto = plainToInstance(CreateClienteDto, {
      nome: '   ',
      telefone: 11987654321,
    });

    const errors = await validate(dto);

    expect(errors.map(({ property }) => property)).toEqual(
      expect.arrayContaining(['nome', 'telefone']),
    );
  });
});
