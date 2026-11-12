const test = require('node:test');
const assert = require('node:assert');
const { sanitizePhoneNumber } = require('../src/services/googleContacts');

const CC = '258';

test('mantém números em formato internacional com +', () => {
    assert.strictEqual(sanitizePhoneNumber('+258 84 123 4567', CC), '258841234567@s.whatsapp.net');
    assert.strictEqual(sanitizePhoneNumber('+55 11 91234-5678', CC), '5511912345678@s.whatsapp.net');
});

test('converte prefixo internacional 00', () => {
    assert.strictEqual(sanitizePhoneNumber('00258 84 123 4567', CC), '258841234567@s.whatsapp.net');
});

test('acrescenta o DDI padrão em números locais', () => {
    assert.strictEqual(sanitizePhoneNumber('84 123 4567', CC), '258841234567@s.whatsapp.net');
    assert.strictEqual(sanitizePhoneNumber('084 123 4567', CC), '258841234567@s.whatsapp.net');
});

test('não duplica o DDI quando o número já o contém', () => {
    assert.strictEqual(sanitizePhoneNumber('258841234567', CC), '258841234567@s.whatsapp.net');
});

test('rejeita valores inválidos', () => {
    assert.strictEqual(sanitizePhoneNumber('', CC), null);
    assert.strictEqual(sanitizePhoneNumber(null, CC), null);
    assert.strictEqual(sanitizePhoneNumber('123', CC), null);
    assert.strictEqual(sanitizePhoneNumber('+1234567890123456', CC), null);
});
