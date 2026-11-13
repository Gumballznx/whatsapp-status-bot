const fs = require('fs');
const path = require('path');

const IMAGE_MIMETYPES = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp'
};

async function postVideoStatus(sock, videoBuffer, caption, jidList) {
    return await sock.sendMessage(
        'status@broadcast',
        { video: videoBuffer, mimetype: 'video/mp4', caption: caption || '' },
        { statusJidList: jidList, broadcast: true }
    );
}

async function postImageStatus(sock, imageBuffer, caption, jidList, mimetype = 'image/jpeg') {
    return await sock.sendMessage(
        'status@broadcast',
        { image: imageBuffer, mimetype, caption: caption || '' },
        { statusJidList: jidList, broadcast: true }
    );
}

async function postTextStatus(sock, text, jidList) {
    return await sock.sendMessage(
        'status@broadcast',
        { text: text },
        { statusJidList: jidList, broadcast: true }
    );
}

async function postMediaFileStatus(sock, filePath, caption, jidList) {
    if (!fs.existsSync(filePath)) {
        throw new Error(`Arquivo de mídia não encontrado: ${filePath}`);
    }

    const buffer = fs.readFileSync(filePath);
    const ext = path.extname(filePath).toLowerCase();

    if (ext === '.mp4') {
        return await postVideoStatus(sock, buffer, caption, jidList);
    }

    if (IMAGE_MIMETYPES[ext]) {
        return await postImageStatus(sock, buffer, caption, jidList, IMAGE_MIMETYPES[ext]);
    }

    throw new Error(`Formato de mídia não suportado para status: ${ext}`);
}

module.exports = {
    postVideoStatus,
    postImageStatus,
    postTextStatus,
    postMediaFileStatus
};
