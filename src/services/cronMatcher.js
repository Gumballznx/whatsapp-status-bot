/**
 * Verificador mínimo de expressões cron (5 campos: minuto hora dia mês dia-da-semana).
 * Suporta "*", números, listas (1,2), intervalos (1-5) e passos (*\/15, 1-30/5).
 * Usado para saber se o horário agendado de hoje já passou.
 */

const FIELD_RANGES = [
    [0, 59], // minuto
    [0, 23], // hora
    [1, 31], // dia do mês
    [1, 12], // mês
    [0, 7]   // dia da semana (0 e 7 = domingo)
];

function parseField(field, [min, max]) {
    const values = new Set();

    for (const part of field.split(',')) {
        const [rangePart, stepPart] = part.split('/');
        const step = stepPart ? parseInt(stepPart, 10) : 1;
        if (!Number.isInteger(step) || step < 1) throw new Error(`Passo inválido: "${part}"`);

        let start;
        let end;
        if (rangePart === '*') {
            start = min;
            end = max;
        } else if (rangePart.includes('-')) {
            [start, end] = rangePart.split('-').map((n) => parseInt(n, 10));
        } else {
            start = parseInt(rangePart, 10);
            end = stepPart ? max : start;
        }

        if (!Number.isInteger(start) || !Number.isInteger(end) || start < min || end > max || start > end) {
            throw new Error(`Campo cron inválido: "${part}"`);
        }

        for (let v = start; v <= end; v += step) values.add(v);
    }

    return values;
}

function parseCron(expression) {
    let fields = expression.trim().split(/\s+/);
    // node-cron aceita um 6º campo opcional de segundos no início: ignorado aqui
    if (fields.length === 6) fields = fields.slice(1);
    if (fields.length !== 5) {
        throw new Error(`Expressão cron não suportada (esperados 5 campos): "${expression}"`);
    }

    const [minutes, hours, daysOfMonth, months, daysOfWeek] = fields.map((f, i) => parseField(f, FIELD_RANGES[i]));
    if (daysOfWeek.has(7)) daysOfWeek.add(0);

    return {
        minutes,
        hours,
        daysOfMonth,
        months,
        daysOfWeek,
        domRestricted: fields[2] !== '*',
        dowRestricted: fields[4] !== '*'
    };
}

/** `m` é um objeto moment já no fuso correto. */
function matchesDay(cron, m) {
    if (!cron.months.has(m.month() + 1)) return false;

    const domMatch = cron.daysOfMonth.has(m.date());
    const dowMatch = cron.daysOfWeek.has(m.day());

    // Regra padrão do cron: se ambos estão restritos, basta um coincidir
    if (cron.domRestricted && cron.dowRestricted) return domMatch || dowMatch;
    return domMatch && dowMatch;
}

/**
 * Retorna true se a expressão cron tinha um disparo previsto entre 00:00 de hoje e `now`.
 * `now` é um objeto moment no fuso do agendamento.
 */
function hasScheduledRunPassedToday(expression, now) {
    const cron = parseCron(expression);
    if (!matchesDay(cron, now)) return false;

    const minutesNow = now.hours() * 60 + now.minutes();
    for (const hour of cron.hours) {
        for (const minute of cron.minutes) {
            if (hour * 60 + minute <= minutesNow) return true;
        }
    }
    return false;
}

module.exports = {
    parseCron,
    hasScheduledRunPassedToday
};
