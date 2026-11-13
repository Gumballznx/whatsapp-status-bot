const { google } = require('googleapis');
const env = require('../config/env');

function getOAuth2Client() {
    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.GOOGLE_REFRESH_TOKEN) {
        throw new Error('Credenciais da Google API incompletas em .env (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN).');
    }

    const oauth2Client = new google.auth.OAuth2(
        env.GOOGLE_CLIENT_ID,
        env.GOOGLE_CLIENT_SECRET
    );

    oauth2Client.setCredentials({
        refresh_token: env.GOOGLE_REFRESH_TOKEN
    });

    return oauth2Client;
}

/**
 * Converte um número de telefone (como salvo nos contatos) em JID do WhatsApp.
 *
 * - "+258 84 123 4567" / "00258841234567" -> formato internacional, usado como está
 * - "84 123 4567" / "084 123 4567"        -> número local, recebe o DDI padrão
 * - "258841234567"                        -> já começa com o DDI padrão, usado como está
 */
function sanitizePhoneNumber(rawNumber, countryCode = env.DEFAULT_COUNTRY_CODE) {
    if (!rawNumber || typeof rawNumber !== 'string') return null;

    const trimmed = rawNumber.trim();
    let digits = trimmed.replace(/\D/g, '');
    if (!digits) return null;

    if (trimmed.startsWith('+')) {
        // Já está no formato internacional
    } else if (digits.startsWith('00')) {
        digits = digits.slice(2);
    } else if (countryCode && !(digits.startsWith(countryCode) && digits.length >= countryCode.length + 8)) {
        // Número local: remove o prefixo de tronco "0" e acrescenta o DDI padrão
        digits = countryCode + digits.replace(/^0+/, '');
    }

    if (digits.length < 10 || digits.length > 15) {
        return null;
    }

    return `${digits}@s.whatsapp.net`;
}

async function fetchGoogleContacts(extraJids = []) {
    const jidSet = new Set();

    if (env.OWNER_NUMBER) {
        jidSet.add(`${env.OWNER_NUMBER}@s.whatsapp.net`);
    }

    for (const jid of extraJids) {
        if (jid && typeof jid === 'string' && jid.endsWith('@s.whatsapp.net')) {
            jidSet.add(jid);
        }
    }

    const googleJids = new Set();

    try {
        const auth = getOAuth2Client();
        const people = google.people({ version: 'v1', auth });

        let pageToken = undefined;

        do {
            const response = await people.people.connections.list({
                resourceName: 'people/me',
                pageSize: 1000,
                personFields: 'phoneNumbers',
                pageToken
            });

            const connections = response.data.connections || [];

            for (const person of connections) {
                const phoneNumbers = person.phoneNumbers || [];
                for (const phone of phoneNumbers) {
                    const sanitizedJid = sanitizePhoneNumber(phone.canonicalForm || phone.value);
                    if (sanitizedJid) {
                        googleJids.add(sanitizedJid);
                        jidSet.add(sanitizedJid);
                    }
                }
            }

            pageToken = response.data.nextPageToken;
        } while (pageToken);

        console.log(`[Google Contacts] Recuperados ${googleJids.size} números válidos da conta Google.`);
    } catch (error) {
        console.error('[Google Contacts] Erro ao sincronizar contatos do Google:', error.message || error);
    }

    const uniqueJids = [...jidSet];
    console.log(`[Google Contacts] Total de destinatários configurados para o status: ${uniqueJids.length}`);
    return uniqueJids;
}

module.exports = {
    fetchGoogleContacts,
    sanitizePhoneNumber
};
