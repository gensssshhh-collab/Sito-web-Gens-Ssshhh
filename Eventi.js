var EVENTI_SHEET_NAME = 'ProposteEventi';

function getFoglioProposteEventi_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(EVENTI_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(EVENTI_SHEET_NAME);
    sheet.appendRow(['ID', 'CreatoIl', 'CreatoreEmail', 'Titolo', 'Descrizione', 'OpzioniJson', 'VotiJson', 'Stato']);
  }
  return sheet;
}

function verificaSocioEvento_(email) {
  var target = String(email || '').trim().toLowerCase();
  if (!target) return false;

  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('soci');
  if (!sheet) return false;

  var rows = sheet.getDataRange().getValues();
  return rows.slice(1).some(function (row) {
    return String(row[2] || '').trim().toLowerCase() === target;
  });
}

function normalizzaOpzioniEvento_(opzioni) {
  if (!Array.isArray(opzioni)) return [];
  return opzioni.map(function (opzione) {
    return {
      data: String(opzione.data || '').trim(),
      ora: String(opzione.ora || '').trim(),
      luogo: String(opzione.luogo || '').trim()
    };
  }).filter(function (opzione) {
    return opzione.data || opzione.ora || opzione.luogo;
  });
}

function getProposteEventi(email) {
  if (!verificaSocioEvento_(email)) return [];

  var values = getFoglioProposteEventi_().getDataRange().getValues();
  return values.slice(1).filter(function (row) {
    return String(row[7] || 'ATTIVA') === 'ATTIVA';
  }).map(function (row) {
    var opzioni = [];
    var voti = {};
    try { opzioni = JSON.parse(row[5] || '[]'); } catch (e) { }
    try { voti = JSON.parse(row[6] || '{}'); } catch (e) { }
    delete voti._votanti;
    return {
      id: String(row[0]),
      titolo: String(row[3] || ''),
      descrizione: String(row[4] || ''),
      opzioni: opzioni,
      voti: voti
    };
  });
}

function creaPropostaEvento(email, proposta) {
  if (!verificaSocioEvento_(email)) return { ok: false, messaggio: 'Socio non autorizzato.' };
  proposta = proposta || {};

  var titolo = String(proposta.titolo || '').trim();
  var descrizione = String(proposta.descrizione || '').trim();
  var opzioni = normalizzaOpzioniEvento_(proposta.opzioni);
  if (!titolo || !descrizione || !opzioni.length) {
    return { ok: false, messaggio: 'Titolo, descrizione e almeno una opzione sono obbligatori.' };
  }

  var id = Utilities.getUuid();
  getFoglioProposteEventi_().appendRow([
    id,
    new Date(),
    String(email).trim().toLowerCase(),
    titolo,
    descrizione,
    JSON.stringify(opzioni),
    JSON.stringify({}),
    'ATTIVA'
  ]);
  return { ok: true, proposta: { id: id, titolo: titolo, descrizione: descrizione, opzioni: opzioni, voti: {} } };
}

function votaPropostaEvento(email, propostaId, optionIndex) {
  if (!verificaSocioEvento_(email)) return { ok: false, messaggio: 'Socio non autorizzato.' };

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sheet = getFoglioProposteEventi_();
    var values = sheet.getDataRange().getValues();
    var rowIndex = values.findIndex(function (row, index) {
      return index > 0 && String(row[0]) === String(propostaId);
    });
    if (rowIndex < 1) return { ok: false, messaggio: 'Proposta non trovata.' };

    var row = values[rowIndex];
    var opzioni = JSON.parse(row[5] || '[]');
    var index = Number(optionIndex);
    if (!Number.isInteger(index) || index < 0 || index >= opzioni.length) {
      return { ok: false, messaggio: 'Opzione non valida.' };
    }

    var voti = {};
    try { voti = JSON.parse(row[6] || '{}'); } catch (e) { }
    var votanti = voti._votanti || {};
    var socio = String(email).trim().toLowerCase();
    if (votanti[socio] !== undefined) return { ok: false, messaggio: 'Hai già votato questa proposta.' };

    voti[index] = Number(voti[index] || 0) + 1;
    votanti[socio] = index;
    voti._votanti = votanti;
    sheet.getRange(rowIndex + 1, 7).setValue(JSON.stringify(voti));
    delete voti._votanti;
    return { ok: true, voti: voti };
  } finally {
    lock.releaseLock();
  }
}