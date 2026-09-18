const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

function loadScript(file, sandbox) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  vm.runInNewContext(source, sandbox, { filename: file });
  return sandbox;
}

function dataSheet(values) {
  return {
    getDataRange() {
      return { getValues: () => values };
    },
    appendRow(row) {
      values.push(row.slice());
    },
    getRange() {
      return {
        setValue() { }
      };
    }
  };
}

test('login: accetta credenziali corrette e blocca dopo cinque errori', () => {
  const cacheValues = new Map();
  const cache = {
    get: key => cacheValues.get(key) || null,
    put: (key, value) => cacheValues.set(key, value),
    remove: key => cacheValues.delete(key)
  };
  const sociSheet = dataSheet([
    ['Nome', 'Password', 'Email'],
    ['Mario', 'hash:segreta', 'Mario@Example.it']
  ]);
  const logRows = [['Data', 'Email', 'Azione', 'Info']];
  const logSheet = dataSheet(logRows);
  const spreadsheet = {
    getSheetByName: name => name === 'Log' ? logSheet : sociSheet
  };
  const context = {
    SpreadsheetApp: { getActiveSpreadsheet: () => spreadsheet },
    CacheService: { getScriptCache: () => cache },
    Utilities: { base64Encode: value => Buffer.from(value).toString('base64') },
    creaHash: value => 'hash:' + value
  };

  loadScript('Auth.js', context);

  assert.equal(context.verificaLogin({ email: ' mario@example.it ', password: 'segreta', info: 'test' }), 'OK_LOGIN');
  assert.equal(context.verificaLogin({ email: 'mario@example.it', password: 'errata' }), 'ERR_CREDENZIALI');
  assert.equal(cacheValues.size, 1);
  cacheValues.set('block_login_bWFyaW9AZXhhbXBsZS5pdA==', '5');
  assert.equal(context.verificaLogin({ email: 'mario@example.it', password: 'segreta' }), 'BLOCKED');
  assert.ok(logRows.some(row => row[2] === 'LOGIN_OK'));
});

test('notifiche: registra un token una sola volta e invia il canale Android', () => {
  const properties = new Map();
  const requests = [];
  const context = {
    getDatiUtente: () => ({ email: 'mario@example.it' }),
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: key => properties.get(key) || null,
        setProperty: (key, value) => properties.set(key, value)
      })
    },
    ScriptApp: { getOAuthToken: () => 'oauth-token' },
    UrlFetchApp: {
      fetch: (url, options) => {
        requests.push({ url, options });
        return { getResponseCode: () => 200 };
      }
    }
  };

  loadScript('PushNotifications.js', context);

  const token = { email: 'Mario@Example.it', token: 'token-1', piattaforma: 'android' };
  assert.equal(context.registraTokenPush(token), 'TOKEN_REGISTRATO');
  assert.equal(context.registraTokenPush(token), 'TOKEN_REGISTRATO');
  assert.equal(context.inviaNotificaPush('Titolo', 'Testo'), 'PUSH_INVIATA');

  const saved = JSON.parse(properties.get('PUSH_TOKENS'));
  assert.equal(saved['mario@example.it'].length, 1);
  const payload = JSON.parse(requests[0].options.payload);
  assert.equal(payload.message.android.notification.channel_id, 'gens-notifiche');
  assert.equal(payload.message.notification.body, 'Testo');
});

test('votazioni: salva il voto e rifiuta un secondo voto dello stesso socio', () => {
  const rows = [['Timestamp', 'HashSocio', 'CandidatoEmail', 'Voto']];
  const voteSheet = dataSheet(rows);
  const context = {
    verificaLogin: () => 'OK_LOGIN',
    getHashUnivoco: () => 'hash-socio',
    LockService: {
      getScriptLock: () => ({ waitLock() { }, releaseLock() { } })
    },
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ({ getSheetByName: () => voteSheet })
    },
    scriviLog() { },
    Date
  };

  loadScript('user.js', context);

  const voto = { email: 'mario@example.it', password: 'pw', emailCandidato: 'anna@example.it', voto: 'SI' };
  assert.equal(context.votaAmmissioneSocio(voto), 'OK');
  assert.equal(context.votaAmmissioneSocio(voto), 'GIA_VOTATO');
  assert.equal(rows.length, 2);
});

test('firme: invia OTP e lega il codice al documento richiesto', () => {
  const cacheValues = new Map();
  let emailSent = null;
  const context = {
    getDatiUtente: () => ({ email: 'mario@example.it' }),
    CacheService: {
      getScriptCache: () => ({
        put: (key, value, ttl) => cacheValues.set(key, { value, ttl }),
        get: key => (cacheValues.get(key) || {}).value || null,
        remove: key => cacheValues.delete(key)
      })
    },
    MailApp: { sendEmail: message => { emailSent = message; } },
    Math,
    String
  };

  loadScript('Signature.js', context);

  assert.equal(context.requestSignOTP('mario@example.it', 'doc-123'), 'OTP_SENT');
  assert.match(cacheValues.get('SIGN_OTP_mario@example.it').value, /^\d{6}$/);
  assert.equal(cacheValues.get('SIGN_OTP_mario@example.it').ttl, 300);
  assert.equal(cacheValues.get('SIGN_DOC_mario@example.it').value, 'doc-123');
  assert.equal(emailSent.to, 'mario@example.it');
});

test('documenti: elenca categorie e carica un file nella cartella pubblica', () => {
  const files = [
    { getId: () => 'file-1', getName: () => 'verbale.pdf', getUrl: () => 'https://drive/file-1', getDescription: () => '' }
  ];
  let uploaded = null;
  const folder = {
    getName: () => 'Verbali Ufficiali',
    getFiles: () => ({ hasNext: () => files.length > 0, next: () => files.shift() }),
    getFolders: () => ({ hasNext: () => false }),
    createFile: blob => { uploaded = blob; return { setDescription: description => { uploaded.description = description; } }; }
  };
  const config = { getRange: () => ({ getValue: () => 'public-folder' }) };
  const context = {
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ({ getSheetByName: name => name === 'Config' ? config : null })
    },
    DriveApp: { getFolderById: () => folder },
    Utilities: {
      newBlob: (content, mimeType, name) => ({ content, mimeType, name }),
      base64Decode: value => Buffer.from(value, 'base64')
    },
    scriviLog() { }
  };

  loadScript('Documents.js', context);

  const listed = context.getListaDocumenti('PUBBLICO', 'mario@example.it');
  assert.equal(JSON.stringify(listed), JSON.stringify([{ id: 'file-1', nome: 'verbale.pdf', url: 'https://drive/file-1', categoria: 'Verbale' }]));
  assert.equal(context.uploadFile({ content: Buffer.from('pdf').toString('base64'), mimeType: 'application/pdf', filename: 'nuovo.pdf', category: 'Bilancio' }, 'PUBBLICO', 'mario@example.it'), 'UPLOAD_OK');
  assert.equal(uploaded.name, 'nuovo.pdf');
  assert.equal(uploaded.description, 'Bilancio');
});
