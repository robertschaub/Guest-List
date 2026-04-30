const GUESTLIST = {
  guestsSheet: 'Gäste',
  checkinSheets: ['Check-in 1', 'Check-in 2', 'Check-in 3', 'Check-in 4', 'Check-in 5'],
  categories: ['GA', 'Member GA', 'Member VIP', 'On Stage', 'Mitarbeiter'],
  statuses: ['Offen', 'Eingecheckt', 'No Show'],
  guestStartRow: 5,
  checkinStartRow: 7,
  guestRows: 1000,
  checkinRows: 500,
  searchCell: 'C4',
  checkedStatus: 'Eingecheckt',
  openStatus: 'Offen'
};

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Guestlist')
    .addItem('Setup / Fix Check-in', 'setupGuestlistCheckin')
    .addItem('Refresh active Check-in', 'refreshActiveCheckin')
    .addItem('Refresh all Check-in Tabs', 'refreshAllCheckinTabs')
    .addToUi();
}

function setupGuestlistCheckin() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const guests = getGuestsSheet_(ss);
  ensureGuestIds_(guests);
  setupGuestsSheet_(guests);
  setupCheckinSheets_(ss);
  setupListenSheet_(ss);
  setupCategorySheets_(ss);
  refreshAllCheckinTabs();
  ss.toast('Setup erledigt: Check-in Checkboxen funktionieren jetzt über Apps Script.', 'Guestlist', 5);
}

function onEdit(e) {
  if (!e || !e.range) return;
  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(3000)) return;
  try {
    const sheet = e.range.getSheet();
    const sheetName = sheet.getName();
    const row = e.range.getRow();
    const col = e.range.getColumn();
    if (sheetName === GUESTLIST.guestsSheet) {
      handleGuestsEdit_(e, row, col);
      return;
    }
    if (GUESTLIST.checkinSheets.indexOf(sheetName) === -1) return;
    if (e.range.getA1Notation() === GUESTLIST.searchCell) {
      refreshCheckinSheet_(sheet);
      return;
    }
    if (row >= GUESTLIST.checkinStartRow && col === 8) {
      handleCheckinCheckbox_(e);
      return;
    }
    if (row >= GUESTLIST.checkinStartRow && col === 7) {
      handleCheckinComment_(e);
    }
  } catch (err) {
    SpreadsheetApp.getActiveSpreadsheet().toast(String(err.message || err), 'Guestlist Fehler', 8);
  } finally {
    lock.releaseLock();
  }
}

function refreshActiveCheckin() {
  const sheet = SpreadsheetApp.getActiveSheet();
  if (GUESTLIST.checkinSheets.indexOf(sheet.getName()) === -1) {
    SpreadsheetApp.getActiveSpreadsheet().toast('Bitte einen Check-in Tab öffnen.', 'Guestlist', 4);
    return;
  }
  refreshCheckinSheet_(sheet);
}

function refreshAllCheckinTabs() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  GUESTLIST.checkinSheets.forEach(name => {
    const sheet = ss.getSheetByName(name);
    if (sheet) refreshCheckinSheet_(sheet);
  });
}

function setupGuestsSheet_(guests) {
  guests.getRange('A4:H4').setValues([['Guest ID', 'Gastname', 'Kategorie', 'Check-in Status', 'Check-in Zeit', 'Check-in durch', 'Support Kommentar', '1-Klick Check-in']]);
  guests.getRange('C5:C1004').setDataValidation(listValidation_(GUESTLIST.categories));
  guests.getRange('D5:D1004').setDataValidation(listValidation_(GUESTLIST.statuses));
  guests.getRange('F5:F1004').setDataValidation(listValidation_(['Gäste'].concat(GUESTLIST.checkinSheets)));
  guests.getRange('E5:E1004').setNumberFormat('dd.mm.yyyy hh:mm:ss');
  guests.getRange('H5:H1004').insertCheckboxes();
  const statusValues = guests.getRange('D5:D1004').getValues();
  const checkboxValues = statusValues.map(r => [r[0] === GUESTLIST.checkedStatus]);
  guests.getRange('H5:H1004').setValues(checkboxValues);
  guests.getRange('I1').setValue('Live Status');
  guests.getRange('I3:J3').setValues([['Kennzahl', 'Summe']]);
  guests.getRange('I4:J7').setValues([['Total Gäste', null], ['Eingecheckt', null], ['Offen', null], ['No Show', null]]);
  guests.getRange('J4').setFormula('=COUNTA(B5:B1004)');
  guests.getRange('J5').setFormula('=COUNTIF(D5:D1004,"Eingecheckt")');
  guests.getRange('J6').setFormula('=COUNTIFS(B5:B1004,"<>",D5:D1004,"Offen")+COUNTIFS(B5:B1004,"<>",D5:D1004,"")');
  guests.getRange('J7').setFormula('=COUNTIF(D5:D1004,"No Show")');
  guests.setFrozenRows(4);
  guests.getRange('A4:J4').setFontWeight('bold');
  guests.autoResizeColumns(1, 10);
}

function setupCheckinSheets_(ss) {
  GUESTLIST.checkinSheets.forEach((name, index) => {
    const sheet = ss.getSheetByName(name) || ss.insertSheet(name);
    sheet.getRange('A1').setValue('Check-in Gerät ' + (index + 1));
    sheet.getRange('A2').setValue('Suche in C4 eingeben. Treffer werden als Werte geladen; Checkbox in H schreibt in „Gäste“ zurück.');
    sheet.getRange('B4:C4').setValues([['Gastname / ID suchen', '']]);
    sheet.getRange('A6:H6').setValues([['Guest ID', 'Gastname', 'Kategorie', 'Check-in Status', 'Check-in Zeit', 'Check-in durch', 'Support Kommentar', 'Check-in']]);
    sheet.getRange(GUESTLIST.checkinStartRow, 1, GUESTLIST.checkinRows, 8).clearContent();
    sheet.getRange(GUESTLIST.checkinStartRow, 8, GUESTLIST.checkinRows, 1).insertCheckboxes();
    sheet.getRange('E7:E506').setNumberFormat('dd.mm.yyyy hh:mm:ss');
    sheet.setFrozenRows(6);
    sheet.getRange('A6:H6').setFontWeight('bold');
    sheet.autoResizeColumns(1, 8);
  });
}

function setupListenSheet_(ss) {
  const sheet = ss.getSheetByName('Listen') || ss.insertSheet('Listen');
  sheet.getRange('A1').setValue('Listen & Auswertung');
  sheet.getRange('A2').setValue('Übersicht mit Summen sowie gefilterter Liste');
  sheet.getRange('A4:H4').setValues([['Kennzahl', 'Summe', '', 'Kategorie', 'Summe Personen', 'Eingecheckt', 'Offen', 'No Show']]);
  sheet.getRange('A5:A8').setValues([['Total Gäste'], ['Eingecheckt'], ['Offen'], ['No Show']]);
  sheet.getRange('B5').setFormula('=COUNTA(\'Gäste\'!B5:B1004)');
  sheet.getRange('B6').setFormula('=COUNTIFS(\'Gäste\'!B5:B1004,"<>",\'Gäste\'!D5:D1004,"Eingecheckt")');
  sheet.getRange('B7').setFormula('=COUNTIFS(\'Gäste\'!B5:B1004,"<>",\'Gäste\'!D5:D1004,"Offen")+COUNTIFS(\'Gäste\'!B5:B1004,"<>",\'Gäste\'!D5:D1004,"")');
  sheet.getRange('B8').setFormula('=COUNTIFS(\'Gäste\'!B5:B1004,"<>",\'Gäste\'!D5:D1004,"No Show")');
  GUESTLIST.categories.forEach((cat, i) => {
    const r = 5 + i;
    sheet.getRange(r, 4).setValue(cat);
    sheet.getRange(r, 5).setFormula('=COUNTIFS(\'Gäste\'!C5:C1004,"' + cat + '",\'Gäste\'!B5:B1004,"<>")');
    sheet.getRange(r, 6).setFormula('=COUNTIFS(\'Gäste\'!C5:C1004,"' + cat + '",\'Gäste\'!D5:D1004,"Eingecheckt",\'Gäste\'!B5:B1004,"<>")');
    sheet.getRange(r, 8).setFormula('=COUNTIFS(\'Gäste\'!C5:C1004,"' + cat + '",\'Gäste\'!D5:D1004,"No Show",\'Gäste\'!B5:B1004,"<>")');
    sheet.getRange(r, 7).setFormula('=E' + r + '-F' + r + '-H' + r);
  });
  sheet.getRange('A11').setValue('Gefilterte Liste');
  sheet.getRange('A13:B13').setValues([['Kategorie auswählen', 'Alle']]);
  sheet.getRange('B13').setDataValidation(listValidation_(['Alle'].concat(GUESTLIST.categories)));
  sheet.getRange('A15:G15').setValues([['Guest ID', 'Gastname', 'Kategorie', 'Check-in Status', 'Check-in Zeit', 'Check-in durch', 'Support Kommentar']]);
  sheet.getRange('A16:G500').clearContent();
  sheet.getRange('A16').setFormula('=IFERROR(IF(OR($B$13="Alle",$B$13=""),FILTER(\'Gäste\'!A5:G1000,\'Gäste\'!A5:A1000<>""),FILTER(\'Gäste\'!A5:G1000,\'Gäste\'!C5:C1000=$B$13)),"Keine Daten gefunden")');
  sheet.getRange('E16:E500').setNumberFormat('dd.mm.yyyy hh:mm:ss');
  sheet.getRange('A4:H4').setFontWeight('bold');
  sheet.getRange('A15:G15').setFontWeight('bold');
  sheet.autoResizeColumns(1, 8);
}

function setupCategorySheets_(ss) {
  GUESTLIST.categories.forEach(cat => {
    const sheetName = 'Liste - ' + cat;
    const sheet = ss.getSheetByName(sheetName) || ss.insertSheet(sheetName);
    sheet.getRange('A1').setValue(sheetName);
    sheet.getRange('A3:B6').setValues([['Summe Personen', null], ['Eingecheckt', null], ['Offen', null], ['No Show', null]]);
    sheet.getRange('B3').setFormula('=COUNTIFS(\'Gäste\'!C5:C1004,"' + cat + '",\'Gäste\'!B5:B1004,"<>")');
    sheet.getRange('B4').setFormula('=COUNTIFS(\'Gäste\'!C5:C1004,"' + cat + '",\'Gäste\'!D5:D1004,"Eingecheckt",\'Gäste\'!B5:B1004,"<>")');
    sheet.getRange('B6').setFormula('=COUNTIFS(\'Gäste\'!C5:C1004,"' + cat + '",\'Gäste\'!D5:D1004,"No Show",\'Gäste\'!B5:B1004,"<>")');
    sheet.getRange('B5').setFormula('=B3-B4-B6');
    sheet.getRange('A8:G8').setValues([['Guest ID', 'Gastname', 'Kategorie', 'Check-in Status', 'Check-in Zeit', 'Check-in durch', 'Support Kommentar']]);
    sheet.getRange('A9:G500').clearContent();
    sheet.getRange('A9').setFormula('=IFERROR(FILTER(\'Gäste\'!A5:G1000,\'Gäste\'!C5:C1000="' + cat + '"),"Keine Daten gefunden")');
    sheet.getRange('E9:E500').setNumberFormat('dd.mm.yyyy hh:mm:ss');
    sheet.getRange('A8:G8').setFontWeight('bold');
    sheet.autoResizeColumns(1, 7);
  });
}

function handleGuestsEdit_(e, row, col) {
  if (row < GUESTLIST.guestStartRow) return;
  const ss = e.source;
  const sheet = e.range.getSheet();
  const guestId = String(sheet.getRange(row, 1).getDisplayValue()).trim();
  if (col === 8) {
    const checked = String(e.value).toUpperCase() === 'TRUE';
    if (checked) {
      const currentStatus = sheet.getRange(row, 4).getDisplayValue();
      if (currentStatus !== GUESTLIST.checkedStatus) sheet.getRange(row, 4, 1, 3).setValues([[GUESTLIST.checkedStatus, new Date(), 'Gäste']]);
    } else {
      sheet.getRange(row, 4, 1, 3).setValues([[GUESTLIST.openStatus, '', '']]);
    }
    if (guestId) syncDisplayedGuest_(ss, guestId);
    return;
  }
  if (col === 4) {
    sheet.getRange(row, 8).setValue(sheet.getRange(row, 4).getDisplayValue() === GUESTLIST.checkedStatus);
    if (guestId) syncDisplayedGuest_(ss, guestId);
    return;
  }
  if (col === 7 && guestId) syncDisplayedGuest_(ss, guestId);
}

function handleCheckinCheckbox_(e) {
  const sheet = e.range.getSheet();
  const ss = e.source;
  const checked = String(e.value).toUpperCase() === 'TRUE';
  const guestId = String(sheet.getRange(e.range.getRow(), 1).getDisplayValue()).trim();
  if (!guestId || guestId === 'Name in C4 eingeben' || guestId === 'Keine Treffer') {
    e.range.setValue(false);
    return;
  }
  const found = findGuestById_(ss, guestId);
  if (!found) {
    e.range.setValue(false);
    ss.toast('Guest ID nicht gefunden: ' + guestId, 'Guestlist', 5);
    return;
  }
  const guests = found.sheet;
  const current = guests.getRange(found.row, 1, 1, 8).getValues()[0];
  if (checked) {
    if (current[3] === GUESTLIST.checkedStatus) {
      e.range.setValue(true);
      syncDisplayedGuest_(ss, guestId);
      ss.toast('Bereits eingecheckt: ' + current[1] + duplicateText_(current[4], current[5]), 'Guestlist', 6);
      return;
    }
    guests.getRange(found.row, 4, 1, 3).setValues([[GUESTLIST.checkedStatus, new Date(), sheet.getName()]]);
    guests.getRange(found.row, 8).setValue(true);
    ss.toast('Eingecheckt: ' + current[1], 'Guestlist', 3);
  } else {
    guests.getRange(found.row, 4, 1, 3).setValues([[GUESTLIST.openStatus, '', '']]);
    guests.getRange(found.row, 8).setValue(false);
    ss.toast('Check-in zurückgesetzt: ' + current[1], 'Guestlist', 3);
  }
  syncDisplayedGuest_(ss, guestId);
}

function handleCheckinComment_(e) {
  const sheet = e.range.getSheet();
  const ss = e.source;
  const guestId = String(sheet.getRange(e.range.getRow(), 1).getDisplayValue()).trim();
  if (!guestId || guestId === 'Name in C4 eingeben' || guestId === 'Keine Treffer') return;
  const found = findGuestById_(ss, guestId);
  if (!found) return;
  found.sheet.getRange(found.row, 7).setValue(e.value || '');
  syncDisplayedGuest_(ss, guestId);
}

function refreshCheckinSheet_(sheet) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const term = String(sheet.getRange(GUESTLIST.searchCell).getDisplayValue()).trim().toLowerCase();
  const target = sheet.getRange(GUESTLIST.checkinStartRow, 1, GUESTLIST.checkinRows, 8);
  target.clearContent();
  sheet.getRange(GUESTLIST.checkinStartRow, 8, GUESTLIST.checkinRows, 1).insertCheckboxes();
  if (!term) {
    sheet.getRange(GUESTLIST.checkinStartRow, 1).setValue('Name in C4 eingeben');
    return;
  }
  const rows = getGuestRows_(ss).filter(g => {
    if (!g.name) return false;
    const haystack = [g.id, g.name, g.category, g.status, g.comment].join(' ').toLowerCase();
    return haystack.indexOf(term) !== -1;
  }).slice(0, GUESTLIST.checkinRows);
  if (!rows.length) {
    sheet.getRange(GUESTLIST.checkinStartRow, 1).setValue('Keine Treffer');
    return;
  }
  const output = rows.map(g => [g.id, g.name, g.category, g.status, g.time, g.by, g.comment, g.status === GUESTLIST.checkedStatus]);
  sheet.getRange(GUESTLIST.checkinStartRow, 1, output.length, 8).setValues(output);
}

function syncDisplayedGuest_(ss, guestId) {
  const found = findGuestById_(ss, guestId);
  if (!found) return;
  const v = found.sheet.getRange(found.row, 1, 1, 8).getValues()[0];
  GUESTLIST.checkinSheets.forEach(name => {
    const sheet = ss.getSheetByName(name);
    if (!sheet) return;
    const ids = sheet.getRange(GUESTLIST.checkinStartRow, 1, GUESTLIST.checkinRows, 1).getDisplayValues();
    ids.forEach((id, i) => {
      if (String(id[0]).trim() === guestId) {
        const r = GUESTLIST.checkinStartRow + i;
        sheet.getRange(r, 2, 1, 6).setValues([[v[1], v[2], v[3], v[4], v[5], v[6]]]);
        sheet.getRange(r, 8).setValue(v[3] === GUESTLIST.checkedStatus);
      }
    });
  });
}

function getGuestRows_(ss) {
  const guests = getGuestsSheet_(ss);
  const values = guests.getRange(GUESTLIST.guestStartRow, 1, GUESTLIST.guestRows, 8).getValues();
  return values.map((r, i) => ({
    row: GUESTLIST.guestStartRow + i,
    id: String(r[0] || '').trim(),
    name: String(r[1] || '').trim(),
    category: String(r[2] || '').trim(),
    status: String(r[3] || '').trim(),
    time: r[4],
    by: String(r[5] || '').trim(),
    comment: String(r[6] || '').trim(),
    checked: r[7] === true
  }));
}

function findGuestById_(ss, guestId) {
  const guests = getGuestsSheet_(ss);
  const ids = guests.getRange(GUESTLIST.guestStartRow, 1, GUESTLIST.guestRows, 1).getDisplayValues();
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]).trim() === String(guestId).trim()) return {sheet: guests, row: GUESTLIST.guestStartRow + i};
  }
  return null;
}

function ensureGuestIds_(guests) {
  const idRange = guests.getRange(GUESTLIST.guestStartRow, 1, GUESTLIST.guestRows, 1);
  const nameValues = guests.getRange(GUESTLIST.guestStartRow, 2, GUESTLIST.guestRows, 1).getDisplayValues();
  const idValues = idRange.getDisplayValues().map(r => String(r[0] || '').trim());
  let maxId = 0;
  idValues.forEach(id => {
    const n = Number(id);
    if (!isNaN(n) && n > maxId) maxId = n;
  });
  const output = idValues.map((id, i) => {
    if (!String(nameValues[i][0] || '').trim()) return [id || ''];
    if (id) return [id];
    maxId += 1;
    return [String(maxId).padStart(4, '0')];
  });
  idRange.setValues(output);
}

function getGuestsSheet_(ss) {
  const guests = ss.getSheetByName(GUESTLIST.guestsSheet);
  if (!guests) throw new Error('Tab „Gäste“ nicht gefunden.');
  return guests;
}

function listValidation_(values) {
  return SpreadsheetApp.newDataValidation().requireValueInList(values, true).setAllowInvalid(false).build();
}

function duplicateText_(time, by) {
  const tz = Session.getScriptTimeZone() || 'Europe/Zurich';
  const timeText = time instanceof Date ? Utilities.formatDate(time, tz, 'dd.MM.yyyy HH:mm:ss') : '';
  const byText = by ? ' durch ' + by : '';
  return timeText ? ' um ' + timeText + byText : byText;
}
