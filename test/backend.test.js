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
  assert.equal(context.inviaNotificaPushUtente('MARIO@EXAMPLE.IT', 'Firma', 'Documento da firmare', 'viewFirma'), 'PUSH_INVIATA');

  const saved = JSON.parse(properties.get('PUSH_TOKENS'));
  assert.equal(saved['mario@example.it'].length, 1);
  const payload = JSON.parse(requests[0].options.payload);
  assert.equal(payload.message.android.notification.channel_id, 'gens-notifiche');
  assert.equal(payload.message.notification.body, 'Testo');
  const targetedPayload = JSON.parse(requests[1].options.payload);
  assert.equal(targetedPayload.message.notification.title, 'Firma');
  assert.equal(targetedPayload.message.data.viewId, 'viewFirma');
});

test('votazioni: salva il voto e rifiuta un secondo voto dello stesso socio', () => {
  const rows = [['Timestamp', 'HashSocio', 'CandidatoEmail', 'Voto']];
  const voteSheet = dataSheet(rows);
  const ammissioniRows = [
    ['Data', 'Nome', 'Cognome', 'Email', 'Telefono', 'Sponsor 1', 'Sponsor 2', 'Stato', 'Esito'],
    [new Date(), 'Anna', 'Bianchi', 'anna@example.it', '', '', '', 'IN VOTAZIONE', 'DA VOTARE']
  ];
  const ammissioniSheet = dataSheet(ammissioniRows);
  ammissioniSheet.getRange = (row, column) => ({
    getValue: () => ammissioniRows[row - 1] && ammissioniRows[row - 1][column - 1],
    setValue(value) {
      while (ammissioniRows.length < row) ammissioniRows.push([]);
      ammissioniRows[row - 1][column - 1] = value;
    }
  });
  const sociSheet = dataSheet([
    ['Nome', 'Cognome', 'Password', 'Email', 'Stato Socio'],
    ['Mario', 'Rossi', 'hash', 'mario@example.it', 'ATTIVO']
  ]);
  const context = {
    verificaLogin: () => 'OK_LOGIN',
    getHashUnivoco: () => 'hash-socio',
    LockService: {
      getScriptLock: () => ({ waitLock() { }, releaseLock() { } })
    },
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ({ getSheetByName: name => name === 'soci' ? sociSheet : name === 'Ammissioni' ? ammissioniSheet : voteSheet })
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

test('iscrizioni: richiesta pubblica, due avvalli e voto programmato al decimo giorno', () => {
  const sociRows = [
    ['Nome', 'Cognome', 'Password', 'Email', 'Stato Socio'],
    ['Mario', 'Rossi', 'hash', 'mario@example.it', 'ATTIVO'],
    ['Anna', 'Bianchi', 'hash', 'anna@example.it', 'ATTIVO'],
    ['Luca', 'Verdi', 'hash', 'luca@example.it', 'NON ATTIVO']
  ];
  const ammissioniRows = [['Data Richiesta', 'Nome Candidato', 'Cognome Candidato', 'Email Candidato', 'Telefono', 'Sponsor 1', 'Sponsor 2', 'Stato Sostegno', 'Esito Assemblea']];
  const sociSheet = dataSheet(sociRows);
  const ammissioniSheet = dataSheet(ammissioniRows);
  ammissioniSheet.getRange = (row, column) => ({
    getValue() { return ammissioniRows[row - 1] ? ammissioniRows[row - 1][column - 1] : undefined; },
    setValue(value) {
      while (ammissioniRows.length < row) ammissioniRows.push([]);
      ammissioniRows[row - 1][column - 1] = value;
    }
  });
  const votiSheet = dataSheet([['Timestamp', 'HashSocio', 'CandidatoEmail', 'Voto']]);
  const sheets = { soci: sociSheet, Ammissioni: ammissioniSheet, VotiAmmissioni: votiSheet };
  let uuid = 0;
  const sentEmails = [];
  const context = {
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ({ getSheetByName: name => sheets[name] || null, insertSheet: name => (sheets[name] = dataSheet([[]])) })
    },
    Utilities: { getUuid: () => 'richiesta-' + (++uuid) },
    LockService: { getScriptLock: () => ({ waitLock() { }, releaseLock() { } }) },
    MailApp: { sendEmail: (...args) => sentEmails.push(args) },
    inviaNotificaPush() { },
    getHashUnivoco: email => 'hash:' + email,
    verificaLogin: () => 'OK_LOGIN',
    scriviLog() { }
  };
  loadScript('user.js', context);

  const prima = context.richiediIscrizioneSocio({
    nome: 'Giulia', cognome: 'Neri', email: 'giulia@example.net', telefono: '12345',
    presentazione: 'Vorrei partecipare alle attività', consensoPrivacy: true
  });
  assert.equal(prima.ok, true);
  assert.equal(JSON.stringify(ammissioniRows[1].slice(5, 8)), JSON.stringify(['', '', 'RACCOLTA AVVALLI']));
  assert.equal(context.votaAmmissioneSocio({ email: 'mario@example.it', password: 'pw', emailCandidato: 'giulia@example.net', voto: 'FAVOREVOLE' }), 'ERR_VOTAZIONE_CHIUSA');
  assert.equal(context.getRichiesteIscrizioneDaAvvallare('luca@example.it').length, 0);
  assert.equal(context.getRichiesteIscrizioneDaAvvallare('giulia@example.net').length, 0);
  assert.equal(context.avvallaRichiestaIscrizione('mario@example.it', prima.richiestaId).ok, true);
  assert.equal(ammissioniRows[1][7], 'RACCOLTA AVVALLI');
  assert.ok(new Date(ammissioniRows[1][11]).getTime() > Date.now());
  assert.equal(context.avvallaRichiestaIscrizione('mario@example.it', prima.richiestaId).messaggio, 'Hai già avvallato questa richiesta.');
  assert.equal(context.avvallaRichiestaIscrizione('anna@example.it', prima.richiestaId).avvalli, 2);
  assert.equal(ammissioniRows[1][7], 'AVVALLATA - ATTESA VOTO');

  ammissioniRows[1][12] = new Date(Date.now() - 1000);
  context.processaScadenzeAmmissioni();
  assert.equal(ammissioniRows[1][7], 'IN VOTAZIONE');
  assert.equal(context.getAmmissioniInVoto('mario@example.it').length, 1);
  assert.equal(context.votaAmmissioneSocio({ email: 'mario@example.it', password: 'pw', emailCandidato: 'giulia@example.net', voto: 'FAVOREVOLE' }), 'OK');
  assert.ok(sentEmails.length >= 3);

  const seconda = context.richiediIscrizioneSocio({
    nome: 'Paolo', cognome: 'Blu', email: 'paolo@example.net', consensoPrivacy: true
  });
  assert.equal(seconda.ok, true);
  ammissioniRows[2][11] = new Date(Date.now() - 1000);
  context.processaScadenzeAmmissioni();
  assert.equal(ammissioniRows[2][7], 'SCADUTA');
  assert.equal(context.avvallaRichiestaIscrizione('mario@example.it', seconda.richiestaId).messaggio, 'La raccolta degli avvalli è chiusa.');
});

test('eventi: condivide la proposta e rifiuta il doppio voto', () => {
  const sociRows = [['Nome', 'Password', 'Email'], ['Mario', 'hash', 'mario@example.it']];
  const eventiRows = [['ID', 'CreatoIl', 'CreatoreEmail', 'Titolo', 'Descrizione', 'OpzioniJson', 'VotiJson', 'Stato']];
  const sociSheet = dataSheet(sociRows);
  const eventiSheet = dataSheet(eventiRows);
  eventiSheet.getRange = (row, column) => ({
    setValue(value) {
      eventiRows[row - 1][column - 1] = value;
    }
  });
  const spreadsheet = {
    getSheetByName: name => name === 'soci' ? sociSheet : name === 'ProposteEventi' ? eventiSheet : null,
    insertSheet: () => eventiSheet
  };
  const context = {
    SpreadsheetApp: { getActiveSpreadsheet: () => spreadsheet },
    Utilities: { getUuid: () => 'evento-1' },
    LockService: { getScriptLock: () => ({ waitLock() { }, releaseLock() { } }) }
  };

  loadScript('Eventi.js', context);

  const proposta = context.creaPropostaEvento('mario@example.it', {
    titolo: 'Cena sociale',
    descrizione: 'Cena tra soci',
    opzioni: [{ data: '10/10/2026', ora: '20:00', luogo: 'Centro' }]
  });
  assert.equal(proposta.ok, true);
  assert.equal(context.getProposteEventi('mario@example.it').length, 1);
  assert.equal(context.votaPropostaEvento('mario@example.it', 'evento-1', 0).ok, true);
  assert.equal(context.votaPropostaEvento('mario@example.it', 'evento-1', 0).messaggio, 'Hai già votato questa proposta.');
});

test('eventi: ospiti votano interesse e più preferenze senza esporre le email', () => {
  const sociSheet = dataSheet([['Nome', 'Password', 'Email'], ['Mario', 'hash', 'mario@example.it']]);
  const eventiRows = [['ID', 'CreatoIl', 'CreatoreEmail', 'Titolo', 'Descrizione', 'OpzioniJson', 'VotiJson', 'Stato']];
  const eventiSheet = dataSheet(eventiRows);
  eventiSheet.getRange = (row, column) => ({
    setValue(value) { eventiRows[row - 1][column - 1] = value; }
  });
  const spreadsheet = {
    getSheetByName: name => name === 'soci' ? sociSheet : name === 'ProposteEventi' ? eventiSheet : null,
    insertSheet: () => eventiSheet
  };
  const context = {
    SpreadsheetApp: { getActiveSpreadsheet: () => spreadsheet },
    Utilities: {
      getUuid: () => 'evento-ospiti',
      DigestAlgorithm: { SHA_256: 'SHA_256' },
      computeDigest: (algorithm, value) => Array.from(Buffer.from(value, 'utf8').subarray(0, 4))
    },
    LockService: { getScriptLock: () => ({ waitLock() { }, releaseLock() { } }) }
  };

  loadScript('Eventi.js', context);
  context.creaPropostaEvento('mario@example.it', {
    titolo: 'Gita',
    descrizione: 'Scegli quando partecipare',
    opzioni: [
      { data: '10/10/2026', ora: '09:00', luogo: 'Centro' },
      { data: '11/10/2026', ora: '10:00', luogo: 'Centro' }
    ]
  });

  const risposta = { nome: 'Giulia', email: 'ospite@example.net', interesse: 'si', opzioni: [0, 1] };
  assert.equal(context.votaPropostaEvento('', 'evento-ospiti', risposta).ok, true);
  assert.equal(context.votaPropostaEvento('', 'evento-ospiti', Object.assign({}, risposta, { email: 'OSPITE@example.net' })).messaggio, 'Hai già votato questa proposta.');
  assert.equal(context.votaPropostaEvento('', 'evento-ospiti', { nome: 'Paolo', email: 'paolo@example.net', interesse: 'no', opzioni: [] }).ok, true);

  const propostaPubblica = context.getPropostaEventoPubblica('evento-ospiti');
  assert.deepEqual(JSON.parse(JSON.stringify(propostaPubblica.voti)), {
    interesse: { si: 1, no: 1 },
    opzioni: [1, 1]
  });
  assert.equal(JSON.stringify(propostaPubblica).includes('ospite@example.net'), false);
  assert.equal(propostaPubblica.mioVoto, null);
  assert.deepEqual(context.getProposteEventi('').length, 0);
});

test('eventi: il dispatcher serve il link pubblico e registra il voto esterno', () => {
  const sociSheet = dataSheet([['Nome', 'Password', 'Email'], ['Mario', 'hash', 'mario@example.it']]);
  const eventiRows = [
    ['ID', 'CreatoIl', 'CreatoreEmail', 'Titolo', 'Descrizione', 'OpzioniJson', 'VotiJson', 'Stato'],
    ['evento-web', new Date(), 'mario@example.it', 'Passeggiata', 'Percorso cittadino', JSON.stringify([{ data: '10/11/2026', ora: '10:00', luogo: 'Centro' }]), '{}', 'ATTIVA']
  ];
  const eventiSheet = dataSheet(eventiRows);
  eventiSheet.getRange = (row, column) => ({ setValue(value) { eventiRows[row - 1][column - 1] = value; } });
  const spreadsheet = {
    getSheetByName: name => name === 'soci' ? sociSheet : name === 'ProposteEventi' ? eventiSheet : null,
    insertSheet: () => eventiSheet
  };
  const context = {
    SpreadsheetApp: { getActiveSpreadsheet: () => spreadsheet },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'SHA_256' },
      computeDigest: (algorithm, value) => Array.from(Buffer.from(value, 'utf8').subarray(0, 4))
    },
    LockService: { getScriptLock: () => ({ waitLock() { }, releaseLock() { } }) },
    ContentService: {
      MimeType: { JSON: 'JSON' },
      createTextOutput: content => ({ getContent: () => content, setMimeType() { return this; } })
    }
  };
  loadScript('Eventi.js', context);
  loadScript('main.js', context);

  const rispostaEndpoint = richiesta => JSON.parse(context.doPost({ postData: { contents: JSON.stringify(richiesta) } }).getContent());
  const proposta = rispostaEndpoint({ azione: 'getPropostaEventoPubblica', payload: { id: 'evento-web' } });
  assert.equal(proposta.status, 'SUCCESS');
  assert.equal(proposta.data.titolo, 'Passeggiata');

  const voto = rispostaEndpoint({
    azione: 'votaPropostaEvento',
    payload: ['', 'evento-web', { nome: 'Giulia', email: 'giulia@example.net', interesse: 'si', opzioni: [0] }]
  });
  assert.equal(voto.data.ok, true);
});

test('ruoli: riconosce come amministrativi presidente, vicepresidente e segretario ma non consiglieri', () => {
  const context = {};
  loadScript('user.js', context);

  assert.equal(context.isRuoloAmministrativo('Presidente'), true);
  assert.equal(context.isRuoloAmministrativo('Vicepresidente'), true);
  assert.equal(context.isRuoloAmministrativo('Segretario'), true);
  assert.equal(context.isRuoloAmministrativo('Tesoriere'), true);
  assert.equal(context.isRuoloAmministrativo('Consigliere'), false);
  assert.equal(context.isRuoloAmministrativo('Socio semplice'), false);
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
