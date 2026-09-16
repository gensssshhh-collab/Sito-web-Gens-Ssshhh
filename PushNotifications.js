// Registrazione dei dispositivi Android per le notifiche push FCM.

function registraTokenPush(dati) {
  if (!dati || !dati.email || !dati.token) return "DATI_MANCANTI";

  var email = String(dati.email).trim().toLowerCase();
  if (!getDatiUtente(email)) return "UTENTE_NON_TROVATO";

  var properties = PropertiesService.getScriptProperties();
  var tokens = {};
  try {
    tokens = JSON.parse(properties.getProperty("PUSH_TOKENS") || "{}");
  } catch (e) {}

  if (!tokens[email]) tokens[email] = [];
  tokens[email] = tokens[email].filter(function(item) {
    return item.token !== dati.token;
  });
  tokens[email].push({
    token: String(dati.token),
    piattaforma: String(dati.piattaforma || "android"),
    aggiornato: new Date().toISOString()
  });

  properties.setProperty("PUSH_TOKENS", JSON.stringify(tokens));
  return "TOKEN_REGISTRATO";
}

function rimuoviTokenPush(dati) {
  if (!dati || !dati.email || !dati.token) return "DATI_MANCANTI";

  var email = String(dati.email).trim().toLowerCase();
  var properties = PropertiesService.getScriptProperties();
  var tokens = {};
  try {
    tokens = JSON.parse(properties.getProperty("PUSH_TOKENS") || "{}");
  } catch (e) {}

  tokens[email] = (tokens[email] || []).filter(function(item) {
    return item.token !== dati.token;
  });
  properties.setProperty("PUSH_TOKENS", JSON.stringify(tokens));
  return "TOKEN_RIMOSSO";
}

function inviaNotificaPush(titolo, testo) {
  var properties = PropertiesService.getScriptProperties();
  var projectId = properties.getProperty("FCM_PROJECT_ID") || "gens-ssshhh";
  if (!projectId) return "FCM_NON_CONFIGURATO";

  var tokens = {};
  try {
    tokens = JSON.parse(properties.getProperty("PUSH_TOKENS") || "{}");
  } catch (e) {
    return "TOKEN_NON_VALIDI";
  }

  var endpoint = "https://fcm.googleapis.com/v1/projects/" + encodeURIComponent(projectId) + "/messages:send";
  var headers = {
    Authorization: "Bearer " + ScriptApp.getOAuthToken(),
    "Content-Type": "application/json"
  };

  Object.keys(tokens).forEach(function(email) {
    (tokens[email] || []).forEach(function(item) {
      try {
        var response = UrlFetchApp.fetch(endpoint, {
          method: "post",
          headers: headers,
          payload: JSON.stringify({
            message: {
              token: item.token,
              notification: { title: titolo, body: testo },
              data: { viewId: "viewDash" }
            }
          }),
          muteHttpExceptions: true
        });
        if (response.getResponseCode() === 404 || response.getResponseCode() === 400) {
          tokens[email] = (tokens[email] || []).filter(function(saved) {
            return saved.token !== item.token;
          });
        }
      } catch (e) {}
    });
  });

  properties.setProperty("PUSH_TOKENS", JSON.stringify(tokens));
  return "PUSH_INVIATA";
}