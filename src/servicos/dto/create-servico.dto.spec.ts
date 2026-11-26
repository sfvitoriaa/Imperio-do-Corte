import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateServicoDto } from './create-servico.dto.js';
import { UpdateServicoDto } from './update-servico.dto.js';

describe('Service DTO validation', () => {
  it('trims service text fields and accepts valid price and duration', async () => {
    const dto = plainToInstance(CreateServicoDto, {
      nome: '  Corte  ',
      descricao: '  Corte tradicional  ',
      preco: 42.5,
      duracaoMin: 30,
    });

    expect(dto.nome).toBe('Corte');
    expect(dto.descricao).toBe('Corte tradicional');
    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('rejects invalid price, fractional duration, and blank names', async () => {
    const dto = plainToInstance(CreateServicoDto, {
      nome: '   ',
      preco: -1,
      duracaoMin: 4.5,
    });

    const errors = await validate(dto);

    expect(errors.map(({ property }) => property)).toEqual(
      expect.arrayContaining(['nome', 'preco', 'duracaoMin']),
    );
  });

  it('rejects prices with more than two decimal places', async () => {
    const dto = plainToInstance(CreateServicoDto, {
      nome: 'Corte',
      preco: 12.345,
      duracaoMin: 20,
    });

    const errors = await validate(dto);

    expect(errors.map(({ property }) => property)).toContain('preco');
  });

  it('accepts boolean activation changes and rejects string values', async () => {
    const validUpdate = plainToInstance(UpdateServicoDto, { ativo: false });
    await expect(validate(validUpdate)).resolves.toHaveLength(0);

    const invalidUpdate = plainToInstance(UpdateServicoDto, {
      ativo: 'false',
    });
    await expect(validate(invalidUpdate)).resolves.not.toHaveLength(0);
  });
});
