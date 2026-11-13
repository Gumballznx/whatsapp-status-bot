const test = require('node:test');
const assert = require('node:assert');
const moment = require('moment-timezone');
const { hasScheduledRunPassedToday, parseCron } = require('../src/services/cronMatcher');

const TZ = 'Africa/Maputo';
const at = (str) => moment.tz(str, TZ);

test('antes do horário agendado retorna false', () => {
    assert.strictEqual(hasScheduledRunPassedToday('0 9 * * *', at('2026-11-12 07:00')), false);
    assert.strictEqual(hasScheduledRunPassedToday('0 9 * * *', at('2026-11-12 08:59')), false);
});

test('no horário ou depois retorna true', () => {
    assert.strictEqual(hasScheduledRunPassedToday('0 9 * * *', at('2026-11-12 09:00')), true);
    assert.strictEqual(hasScheduledRunPassedToday('0 9 * * *', at('2026-11-12 23:00')), true);
});

test('respeita o dia da semana', () => {
    // 2026-11-12 é quinta-feira (4)
    assert.strictEqual(hasScheduledRunPassedToday('0 9 * * 1-5', at('2026-11-12 10:00')), true);
    assert.strictEqual(hasScheduledRunPassedToday('0 9 * * 0,6', at('2026-11-12 10:00')), false);
    // 2026-11-15 é domingo: 7 também representa domingo
    assert.strictEqual(hasScheduledRunPassedToday('0 9 * * 7', at('2026-11-15 10:00')), true);
});

test('suporta passos, listas e campo de segundos', () => {
    assert.strictEqual(hasScheduledRunPassedToday('*/30 10,18 * * *', at('2026-11-12 09:59')), false);
    assert.strictEqual(hasScheduledRunPassedToday('*/30 10,18 * * *', at('2026-11-12 10:00')), true);
    assert.strictEqual(hasScheduledRunPassedToday('0 0 9 * * *', at('2026-11-12 09:00')), true);
});

test('expressões inválidas lançam erro', () => {
    assert.throws(() => parseCron('0 9 * *'));
    assert.throws(() => parseCron('0 25 * * *'));
});
