const path = require('path');
require('dotenv').config({ quiet: true });

module.exports = {
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || '',
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET || '',
    GOOGLE_REFRESH_TOKEN: process.env.GOOGLE_REFRESH_TOKEN || '',
    OWNER_NUMBER: (process.env.OWNER_NUMBER || '').replace(/\D/g, ''),
    BOT_NUMBER: (process.env.BOT_NUMBER || process.env.PAIRING_NUMBER || '').replace(/\D/g, ''),
    // DDI usado para completar números salvos sem código do país (ex: "84 123 4567")
    DEFAULT_COUNTRY_CODE: (process.env.DEFAULT_COUNTRY_CODE || '258').replace(/\D/g, ''),
    // Mantém a conta aparecendo como "online" o tempo todo (padrão: ligado)
    ALWAYS_ONLINE: !/^(false|0|no|nao|não)$/i.test((process.env.ALWAYS_ONLINE || 'true').trim()),
    STATUS_CRON: process.env.STATUS_CRON || '0 9 * * *',
    TIMEZONE: process.env.TIMEZONE || 'Africa/Maputo',
    START_DATE: process.env.START_DATE || '2026-01-01',
    MEDIA_PATH: process.env.MEDIA_PATH ? path.resolve(process.env.MEDIA_PATH) : path.join(__dirname, '../../video.mp4'),
    SESSION_PATH: path.join(__dirname, '../../session')
};
