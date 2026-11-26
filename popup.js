function formatDate(date = new Date()) {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

function getDayAndFormattedDateFr(dateStr = null) {
  let d;
  if (dateStr) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      const [y, m, day] = dateStr.split("-").map(Number);
      d = new Date(y, m - 1, day);
    } else if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) {
      const [day, m, y] = dateStr.split("/").map(Number);
      d = new Date(y, m - 1, day);
    } else {
      d = new Date(dateStr);
    }
  } else {
    d = new Date();
  }
  if (isNaN(d.getTime())) d = new Date();

  const daysFr = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
  const dayName = daysFr[d.getDay()];
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();

  const dateFormatted = `${dd}/${mm}/${yyyy}`;
  const dayFull = `${dayName} ${dateFormatted}`;
  const dateIso = `${yyyy}-${mm}-${dd}`;
  const dateFile = `${dd}-${mm}-${yyyy}`;
  return { dayName, dateFormatted, dayFull, dateIso, dateFile };
}

function classifyParcelAjournAnnule(parcel) {
  const st = String(parcel?.statut || "").toLowerCase();
  const rs = String(parcel?.raisonAnnulation || "").toLowerCase();
  if (st.includes("annul") || st.includes("refus")) return "annule";
  if (st.includes("ajourn") || st.includes("report")) return "ajourne";
  if (rs.includes("annul") || rs.includes("refus")) return "annule";
  if (rs.includes("ajourn") || rs.includes("report") || rs.includes("injoignable") || rs.includes("absent") || rs.includes("pas chez")) return "ajourne";
  return "ajourne";
}

function buildRiderSlaDefenseComment({ totalC, livC, ajourneC, annuleC, retNonRec = 0, parcels = [], focusCat = "all" }) {
  const tCol = Number(totalC) || 0;
  const liv = Number(livC) || 0;
  const aj = Number(ajourneC) || 0;
  const an = Number(annuleC) || 0;
  if (tCol === 0 && (!parcels || parcels.length === 0)) {
    return "Aucune tournée / 0 colis assigné";
  }

  let grcCancel = 0;
  let badOrderData = 0;
  let clientRefusal = 0;
  let clientUnreach = 0;
  let otherCancel = 0;
  const orderGroups = {};

  (parcels || []).forEach((p) => {
    const code = String(p?.colis || "").trim().toUpperCase();
    const baseMatch = code.match(/^([A-Z]{2,4}\d{8,9})/i);
    const groupKey = baseMatch ? baseMatch[1] : null;

    if (classifyParcelAjournAnnule(p) === "annule") {
      const txt = `${p?.raisonAnnulation || ""} ${p?.statut || ""}`.toLowerCase();
      if (txt.includes("edl 6") || txt.includes("edl\u00a06") || txt.includes("grc") || txt.includes("app") || txt.includes("déjà demand") || txt.includes("deja demand")) {
        grcCancel++;
      } else if (txt.includes("edl 9") || txt.includes("edl\u00a09") || txt.includes("edl 3") || txt.includes("edl\u00a03") || txt.includes("téléphone") || txt.includes("telephone") || txt.includes("adresse")) {
        badOrderData++;
      } else if (txt.includes("edl 1") || txt.includes("edl\u00a01") || txt.includes("edl 2") || txt.includes("edl\u00a02") || txt.includes("absent") || txt.includes("indisponible") || txt.includes("injoignable") || txt.includes("répond") || txt.includes("repond")) {
        clientUnreach++;
      } else if (txt.includes("edl 5") || txt.includes("edl\u00a05") || txt.includes("refus") || txt.includes("prix") || txt.includes("cher")) {
        clientRefusal++;
      } else {
        otherCancel++;
      }
      if (groupKey) {
        orderGroups[groupKey] = (orderGroups[groupKey] || 0) + 1;
      }
    }
  });

  const multiOrders = Object.values(orderGroups).filter((c) => c >= 2);
  const multiParcelSum = multiOrders.reduce((s, c) => s + c, 0);
  const multiNote =
    multiOrders.length > 0
      ? ` (dont ${multiParcelSum} colis groupés sur ${multiOrders.length} commande(s) client)`
      : "";

  const extParts = [];
  if (clientRefusal > 0) extParts.push(`${clientRefusal} refus client [EDL 5]`);
  if (grcCancel > 0) extParts.push(`${grcCancel} déjà annulé(s) sur GRC/APP [EDL 6]`);
  if (badOrderData > 0) extParts.push(`${badOrderData} erreur tél/changement adresse [EDL 3/9]`);
  if (clientUnreach > 0) extParts.push(`${clientUnreach} client absent/injoignable [EDL 1/2]`);
  if (otherCancel > 0) extParts.push(`${otherCancel} autre(s) annulation(s)`);
  const extText = extParts.length > 0 ? extParts.join(", ") : `${an} annulation(s) client`;

  const externalTotal = parcels && parcels.length > 0
    ? grcCancel + badOrderData + clientRefusal + clientUnreach + otherCancel
    : an;
  const deliverableBase = Math.max(liv, tCol - externalTotal);
  const rawRate = tCol > 0 ? (liv / tCol) * 100 : 0;
  const adjRate = deliverableBase > 0 ? (liv / deliverableBase) * 100 : rawRate;
  const retTxt = retNonRec > 0 ? ` • ${retNonRec} retour(s) non récupéré(s)` : "";

  if (tCol === 0) {
    return {
      analyse: `${aj} ajourné(s), ${an} annulé(s) (${extText})${multiNote}`,
      comment: `Tournée incomplète (${aj} ajourné(s), ${an} annulé(s)) liée à ${extText}.`,
    };
  }

  const gapColis = Math.max(1, Math.ceil(tCol * 0.8) - liv);
  const analyse = `${liv}/${tCol} livrés (${rawRate.toFixed(1)}%) • ${aj} ajourné(s), ${an} annulé(s) [${extText}] • Taux corrigé : ${adjRate.toFixed(1)}%${retTxt}`;

  let comment = "";
  if (rawRate >= 80) {
    const label = rawRate >= 90 ? "Objectif ≥80% largement dépassé" : "Objectif 80% atteint";
    if (focusCat === "ajourne") {
      comment = `${label} (${rawRate.toFixed(1)}%). Les ${aj} colis ajournés restent en relance J+1 pendant le pic Black Friday ; taux réel hors annulations client : ${adjRate.toFixed(1)}%.`;
    } else if (focusCat === "annule") {
      comment = `${label} (${rawRate.toFixed(1)}%). Les ${an} annulations (${extText}${multiNote}) sont imputables aux clients/GRC ; taux opérationnel réel : ${adjRate.toFixed(1)}%.`;
    } else {
      comment = `${label} (${rawRate.toFixed(1)}%). Malgré ${an} annulation(s) client/GRC (${extText}), la performance réelle sur colis livrables atteint ${adjRate.toFixed(1)}%.`;
    }
  } else {
    const validatedTxt = adjRate >= 80
      ? ` — preuve que l'objectif ≥80% est respecté dès retrait des causes externes`
      : ` — écart fortement réduit sans les refus/erreurs client`;
    if (focusCat === "ajourne") {
      comment = `Sous le seuil de 80% (à ${gapColis} colis en pic Black Friday) : ${aj} colis reportés en relance J+1 et ${an} annulation(s) hors contrôle (${extText}${multiNote}). Taux réel corrigé : ${adjRate.toFixed(1)}%${validatedTxt}.`;
    } else {
      comment = `Sous le seuil de 80% (à ${gapColis} colis en pic Black Friday) à cause de ${an} annulation(s) hors responsabilité livreur (${extText}${multiNote})${aj > 0 ? ` et de ${aj} colis ajourné(s) en relance J+1` : ""}. Hors facteurs client/GRC, le livreur réalise ${adjRate.toFixed(1)}%${validatedTxt}.`;
    }
  }

  return { analyse, comment };
}

async function fetchAiRiderSlaComments(riderPayloads) {
  try {
    const { gofleet_gemini_api_key = "", gofleet_use_ai_comments = false } = await chrome.storage.local.get({
      gofleet_gemini_api_key: "",
      gofleet_use_ai_comments: false,
    });
    const apiKey = String(gofleet_gemini_api_key || "").trim();
    if (!gofleet_use_ai_comments || !apiKey || !Array.isArray(riderPayloads) || riderPayloads.length === 0) {
      return {};
    }

    const prompt =
      "Tu es responsable des opérations de livraison partenaire de Marjane Mall pendant le Black Friday (cible SLA : 80%). " +
      "Pour chaque livreur dans le JSON ci-dessous, rédige un commentaire professionnel et convaincant en français (1 à 2 phrases max, ton factuel pour défendre le livreur auprès de Marjane Mall) " +
      "expliquant pourquoi le seuil de 80% n'a pas été atteint (ou comment la performance est solide) en citant les vrais chiffres (EDL 5 refus client, EDL 6 déjà annulé GRC/APP, EDL 3/9 adresse ou téléphone erroné, EDL 1/2 absent/injoignable, colis ajournés en relance J+1, commandes multi-colis et taux hors facteurs client). " +
      "Retourne UNIQUEMENT un objet JSON { \"NOM_LIVREUR\": \"commentaire\" }.\nDonnées :\n" +
      JSON.stringify(riderPayloads);

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`;
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0.3 },
      }),
    });
    if (!resp.ok) return {};
    const json = await resp.json();
    const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return {};
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (err) {
    console.warn("[GoFleet AI] Repli sur le moteur local (Gemini indisponible):", err);
    return {};
  }
}

async function generateDeliveryExcel(customData = null, targetDateStr = null) {
  try {
    let deliveryBoys = customData;
    const stored = await chrome.storage.local.get([
      "deliveryBoys",
      "gofleet_non_delivered_by_rider",
      "gofleet_non_delivered_history",
    ]);
    if (!deliveryBoys || !deliveryBoys.length) {
      deliveryBoys = stored.deliveryBoys || [];
    }

    if (!deliveryBoys || !deliveryBoys.length) {
      alert("Aucune donnée de livreur disponible pour l'export.");
      return;
    }

    const { dayName, dateFormatted, dayFull, dateIso } = getDayAndFormattedDateFr(targetDateStr);
    const historyForDate = (stored.gofleet_non_delivered_history || {})[dateIso] || {};
    const byRiderMap = stored.gofleet_non_delivered_by_rider || {};
    const nonDeliveredMap = { ...byRiderMap, ...historyForDate };
    const normalizeRiderKey = (s) => String(s || "").toLowerCase().replace(/\s+/g, " ").trim();
    const toIsoSafe = (ds) => {
      if (!ds) return null;
      if (/^\d{4}-\d{2}-\d{2}$/.test(ds)) return ds;
      if (/^\d{2}\/\d{2}\/\d{4}$/.test(ds)) {
        const [d, m, y] = ds.split("/");
        return `${y}-${m}-${d}`;
      }
      return null;
    };
    const nonDeliveredByRider = new Map();
    const nonDeliveredByTournee = new Map();
    Object.entries(nonDeliveredMap).forEach(([k, v]) => {
      const tagged = historyForDate[k] === v ? { ...v, __fromDateHistory: true } : v;
      nonDeliveredByRider.set(normalizeRiderKey(k), tagged);
      if (v && v.tourneeId) nonDeliveredByTournee.set(String(v.tourneeId), tagged);
    });
    const wb = await XlsxPopulate.fromBlankAsync();
    const ws = wb.sheet(0);
    ws.name(`SYNTHESE_${dateIso}`);
    ws.gridLinesVisible(true);

    // Column Widths (12 columns A to L)
    const colWidths = {
      A: 6,   // N°
      B: 22,  // Date / Jour
      C: 28,  // Livreur / Tournée
      D: 15,  // Total Colis
      E: 15,  // Livrés
      F: 15,  // Ajourné
      G: 18,  // Annulé
      H: 19,  // Retours Récupérés
      I: 21,  // Retours Non Récupérés
      J: 20,  // Taux de Livraison (%)
      K: 50,  // Analyse des Écarts
      L: 74   // Commentaire (Défense SLA 80%)
    };
    for (const [col, w] of Object.entries(colWidths)) {
      ws.column(col).width(w);
    }

    // Row 1: Header Banner
    ws.row(1).height(38);
    ws.range("A1:L1").merged(true).value("MARJANE MALL • SUIVI QUOTIDIEN DE LIVRAISON & CONTRÔLE DE CAISSE")
      .style({
        fill: "0F172A",
        fontColor: "FFFFFF",
        bold: true,
        fontSize: 14,
        fontFamily: "Segoe UI",
        horizontalAlignment: "center",
        verticalAlignment: "center"
      });

    // Row 2: Subtitle Metadata
    ws.row(2).height(20);
    ws.range("A2:L2").merged(true).value(
      `📅 Jour d'activité : ${dayFull} | 🛵 ${deliveryBoys.length} livreur(s) actif(s) | Export mis à jour automatiquement via GoFleet Enhancer`
    ).style({
      fill: "1E293B",
      fontColor: "94A3B8",
      italic: true,
      fontSize: 9.5,
      fontFamily: "Segoe UI",
      horizontalAlignment: "center",
      verticalAlignment: "center"
    });

    // Row 3: Spacer
    ws.row(3).height(8);

    // Rows 4-6: KPI Cards
    ws.row(4).height(22);
    ws.row(5).height(22);
    ws.row(6).height(22);

    const startRow = 9;
    const endRow = startRow + deliveryBoys.length - 1;

    function styleCard(colStart, colEnd, title, titleFill, titleColor, formulaOrVal, valColor, borderColor, isPct = false, isDate = false, isBig = false) {
      const titleTarget = colStart === colEnd
        ? ws.cell(colStart + "4")
        : ws.range(colStart + "4:" + colEnd + "4").merged(true);
      titleTarget.value(title)
        .style({
          fill: titleFill,
          fontColor: titleColor,
          bold: true,
          fontSize: isBig ? 10.5 : 8.5,
          fontFamily: "Segoe UI",
          horizontalAlignment: "center",
          verticalAlignment: "center",
          topBorder: isBig ? "medium" : "thin",
          leftBorder: isBig ? "medium" : "thin",
          rightBorder: isBig ? "medium" : "thin",
          bottomBorder: "none",
          borderColor: borderColor
        });
      const valRange = ws.range(colStart + "5:" + colEnd + "6").merged(true);
      if (typeof formulaOrVal === "string" && (formulaOrVal.startsWith("=") || formulaOrVal.includes("("))) {
        valRange.formula(formulaOrVal.startsWith("=") ? formulaOrVal.slice(1) : formulaOrVal);
      } else {
        valRange.value(formulaOrVal);
      }
      valRange.style({
        fill: "FFFFFF",
        fontColor: valColor,
        bold: true,
        fontSize: isBig ? 22 : (isDate ? 11 : 16),
        fontFamily: "Segoe UI",
        horizontalAlignment: "center",
        verticalAlignment: "center",
        bottomBorder: isBig ? "medium" : "thin",
        leftBorder: isBig ? "medium" : "thin",
        rightBorder: isBig ? "medium" : "thin",
        topBorder: "none",
        borderColor: borderColor,
        numberFormat: isDate ? "dddd dd/mm/yyyy" : (isPct ? "0.0%" : "#,##0")
      });
    }

    styleCard("A", "B", "📅 JOUR DE L'EXPORT", "F1F5F9", "334155", dayFull, "0F172A", "CBD5E1", false, true, false);
    styleCard("C", "D", "📦 TOTAL COLIS ASSIGNÉS", "F1F5F9", "475569", `SUM(D${startRow}:D${endRow})`, "0F172A", "CBD5E1", false, false, false);
    styleCard("E", "F", "✅ TOTAL COLIS LIVRÉS", "ECFDF5", "065F46", `SUM(E${startRow}:E${endRow})`, "059669", "A7F3D0", false, false, false);
    styleCard("G", "G", "⏸️ COLIS AJOURNÉ", "FFFBEB", "B45309", `SUM(F${startRow}:F${endRow})`, "D97706", "FDE68A", false, false, false);
    styleCard("H", "H", "❌ COLIS ANNULÉ", "FFF1F2", "9F1239", `SUM(G${startRow}:G${endRow})`, "E11D48", "FECDD3", false, false, false);
    styleCard("I", "L", "🎯 TAUX LIVRAISON GLOBAL", "EFF6FF", "1E40AF", "IF(C5>0, E5/C5, 0)", "2563EB", "2563EB", true, false, true);

    // Row 7: Spacer
    ws.row(7).height(10);

    // Row 8: Table Headers
    ws.row(8).height(28);
    const headers = [
      { col: "A", text: "N°" },
      { col: "B", text: "Date / Jour" },
      { col: "C", text: "Livreur / Tournée" },
      { col: "D", text: "Total Colis" },
      { col: "E", text: "Livrés" },
      { col: "F", text: "Ajourné" },
      { col: "G", text: "Annulé" },
      { col: "H", text: "Retours Récupérés" },
      { col: "I", text: "Retours Non Récupérés" },
      { col: "J", text: "Taux de Livraison (%)" },
      { col: "K", text: "Analyse des Écarts" },
      { col: "L", text: "Commentaire (Défense SLA 80%)" },
    ];

    headers.forEach((h) => {
      ws.cell(h.col + "8").value(h.text).style({
        fill: "1E293B",
        fontColor: "FFFFFF",
        bold: true,
        fontSize: 9.5,
        fontFamily: "Segoe UI",
        horizontalAlignment: "center",
        verticalAlignment: "center",
        border: "thin",
        borderColor: "0F172A"
      });
    });

    const preparedRows = deliveryBoys.map((entry) => {
      const totalC = Number(entry.totalColis) || 0;
      const livC = Number(entry.livree) || 0;
      const nonLivC = Number(entry.nonLivree) || 0;
      const retRec = Number(entry.retourRecupere) || 0;
      const retNonRec = Number(entry.retourNonRecupere) || 0;
      const rate = totalC > 0 ? livC / totalC : 0;

      // Resolve Ajourné & Annulé from entry (live enriched) or cached TraitementLivreur parcels
      const cachedND =
        (entry.tourneeId && nonDeliveredByTournee.get(String(entry.tourneeId))) ||
        nonDeliveredByRider.get(normalizeRiderKey(entry.name));
      const cachedIso = cachedND?.dateIso ? toIsoSafe(cachedND.dateIso) : toIsoSafe(cachedND?.date);
      const isAdjacentDay =
        cachedIso &&
        Math.abs(new Date(cachedIso).getTime() - new Date(dateIso).getTime()) <= 86400000;
      const sameTournee =
        entry.tourneeId && cachedND?.tourneeId && String(entry.tourneeId) === String(cachedND.tourneeId);
      const sameDateCached =
        !!cachedND &&
        (!!cachedND.__fromDateHistory ||
          sameTournee ||
          !cachedND.date ||
          cachedND.date === dateFormatted ||
          cachedND.date === dateIso ||
          cachedIso === dateIso ||
          isAdjacentDay);

      let ajourneC = typeof entry.ajourne === "number" ? entry.ajourne : null;
      let annuleC = typeof entry.annule === "number" ? entry.annule : null;

      const isValidParcelItem = (p) => {
        if (!p) return false;
        const st = String(p.statut || "").toLowerCase();
        const code = String(p.colis || "").trim().toUpperCase();
        if (code.startsWith("RET")) return false;
        return !(
          st.includes("retour") ||
          st.includes("récupér") ||
          st.includes("recupere") ||
          st.includes("reçu hub") ||
          st.includes("recu hub") ||
          st.includes("reçu au hub") ||
          st.includes("recu au hub") ||
          st.includes("affecté") ||
          st.includes("affecte") ||
          st.includes("assigné") ||
          st.includes("assigne") ||
          st.includes("ramassage")
        );
      };

      const validCachedParcels = sameDateCached && Array.isArray(cachedND.parcels)
        ? cachedND.parcels.filter(isValidParcelItem)
        : [];

      if (validCachedParcels.length > 0) {
        let aCnt = 0;
        let cCnt = 0;
        validCachedParcels.forEach((p) => {
          if (classifyParcelAjournAnnule(p) === "annule") cCnt++;
          else aCnt++;
        });
        ajourneC = aCnt;
        annuleC = cCnt;
      }
      if (ajourneC === null) ajourneC = 0;
      if (annuleC === null) annuleC = 0;

      const slaInfo = buildRiderSlaDefenseComment({
        totalC,
        livC,
        ajourneC,
        annuleC,
        retNonRec,
        parcels: validCachedParcels,
        focusCat: "all",
      });

      return {
        entry, totalC, livC, nonLivC, retRec, retNonRec, rate, ajourneC, annuleC, validCachedParcels,
        analyseTxt: slaInfo.analyse,
        commentTxt: slaInfo.comment,
      };
    });

    const aiCommentsMap = await fetchAiRiderSlaComments(
      preparedRows.map((p) => ({
        livreur: p.entry.name,
        total: p.totalC,
        livres: p.livC,
        ajournes: p.ajourneC,
        annules: p.annuleC,
        motifs: p.validCachedParcels.map((x) => ({ statut: x.statut, motif: x.raisonAnnulation || "" })),
      }))
    );

    preparedRows.forEach((item, index) => {
      const r = startRow + index;
      const bg = (index % 2 === 0) ? "FFFFFF" : "F8FAFC";
      const { entry, totalC, livC, retRec, retNonRec, rate, ajourneC, annuleC, analyseTxt, commentTxt } = item;
      const aiText = aiCommentsMap[entry.name] || aiCommentsMap[normalizeRiderKey(entry.name)];
      const finalComment = aiText && String(aiText).trim() ? String(aiText).trim() : commentTxt;

      ws.cell("A" + r).value(index + 1).style({ fill: bg, fontColor: "64748B", horizontalAlignment: "center", verticalAlignment: "center", border: "thin", borderColor: "E2E8F0" });
      ws.cell("B" + r).value(dayFull).style({ fill: bg, fontColor: "475569", horizontalAlignment: "center", verticalAlignment: "center", border: "thin", borderColor: "E2E8F0" });
      ws.cell("C" + r).value(entry.name).style({ fill: bg, fontColor: "1E293B", bold: true, horizontalAlignment: "left", verticalAlignment: "center", border: "thin", borderColor: "E2E8F0" });
      ws.cell("D" + r).value(totalC).style({ fill: bg, fontColor: "0F172A", bold: true, horizontalAlignment: "center", verticalAlignment: "center", border: "thin", borderColor: "E2E8F0", numberFormat: "#,##0" });
      ws.cell("E" + r).value(livC).style({ fill: "F0FDF4", fontColor: "059669", bold: true, horizontalAlignment: "center", verticalAlignment: "center", border: "thin", borderColor: "E2E8F0", numberFormat: "#,##0" });
      ws.cell("F" + r).value(ajourneC).style({ fill: "FFFBEB", fontColor: "B45309", bold: true, horizontalAlignment: "center", verticalAlignment: "center", border: "thin", borderColor: "E2E8F0", numberFormat: "#,##0" });
      ws.cell("G" + r).value(annuleC).style({ fill: "FFF1F2", fontColor: "E11D48", bold: true, horizontalAlignment: "center", verticalAlignment: "center", border: "thin", borderColor: "E2E8F0", numberFormat: "#,##0" });
      ws.cell("H" + r).value(retRec).style({ fill: bg, fontColor: "0D9488", horizontalAlignment: "center", verticalAlignment: "center", border: "thin", borderColor: "E2E8F0", numberFormat: "#,##0" });
      ws.cell("I" + r).value(retNonRec).style({ fill: bg, fontColor: "64748B", horizontalAlignment: "center", verticalAlignment: "center", border: "thin", borderColor: "E2E8F0", numberFormat: "#,##0" });
      ws.cell("J" + r).formula(`IF(D${r}>0, E${r}/D${r}, 0)`).style({ fill: bg, fontColor: "2563EB", bold: true, horizontalAlignment: "center", verticalAlignment: "center", border: "thin", borderColor: "E2E8F0", numberFormat: "0.0%" });

      const analysisColor = totalC === 0 ? "64748B" : rate >= 0.9 ? "065F46" : rate >= 0.8 ? "92400E" : "9F1239";
      ws.cell("K" + r).value(analyseTxt).style({ fill: bg, fontColor: "334155", fontSize: 9, horizontalAlignment: "left", verticalAlignment: "center", wrapText: true, border: "thin", borderColor: "E2E8F0" });
      ws.cell("L" + r).value(finalComment).style({ fill: bg, fontColor: analysisColor, fontSize: 9, bold: rate < 0.8, horizontalAlignment: "left", verticalAlignment: "center", wrapText: true, border: "thin", borderColor: "E2E8F0" });
      const neededLines = Math.max(Math.ceil(analyseTxt.length / 44), Math.ceil(finalComment.length / 66));
      ws.row(r).height(Math.max(36, neededLines * 15 + 10));
    });

    // Total row
    const totalRow = endRow + 1;
    ws.row(totalRow).height(28);
    ws.range(`A${totalRow}:C${totalRow}`).merged(true).value(`TOTAL GÉNÉRAL (${deliveryBoys.length} livreurs)`)
      .style({ fill: "0F172A", fontColor: "FFFFFF", bold: true, fontSize: 10, horizontalAlignment: "center", verticalAlignment: "center", border: "thin", borderColor: "0F172A" });
    ws.cell(`D${totalRow}`).formula(`SUM(D${startRow}:D${endRow})`).style({ fill: "0F172A", fontColor: "FFFFFF", bold: true, horizontalAlignment: "center", verticalAlignment: "center", border: "thin", borderColor: "0F172A", numberFormat: "#,##0" });
    ws.cell(`E${totalRow}`).formula(`SUM(E${startRow}:E${endRow})`).style({ fill: "0F172A", fontColor: "34D399", bold: true, horizontalAlignment: "center", verticalAlignment: "center", border: "thin", borderColor: "0F172A", numberFormat: "#,##0" });
    ws.cell(`F${totalRow}`).formula(`SUM(F${startRow}:F${endRow})`).style({ fill: "0F172A", fontColor: "FBBF24", bold: true, horizontalAlignment: "center", verticalAlignment: "center", border: "thin", borderColor: "0F172A", numberFormat: "#,##0" });
    ws.cell(`G${totalRow}`).formula(`SUM(G${startRow}:G${endRow})`).style({ fill: "0F172A", fontColor: "F87171", bold: true, horizontalAlignment: "center", verticalAlignment: "center", border: "thin", borderColor: "0F172A", numberFormat: "#,##0" });
    ws.cell(`H${totalRow}`).formula(`SUM(H${startRow}:H${endRow})`).style({ fill: "0F172A", fontColor: "2DD4BF", bold: true, horizontalAlignment: "center", verticalAlignment: "center", border: "thin", borderColor: "0F172A", numberFormat: "#,##0" });
    ws.cell(`I${totalRow}`).formula(`SUM(I${startRow}:I${endRow})`).style({ fill: "0F172A", fontColor: "CBD5E1", bold: true, horizontalAlignment: "center", verticalAlignment: "center", border: "thin", borderColor: "0F172A", numberFormat: "#,##0" });
    ws.cell(`J${totalRow}`).formula(`IF(D${totalRow}>0, E${totalRow}/D${totalRow}, 0)`).style({ fill: "0F172A", fontColor: "60A5FA", bold: true, horizontalAlignment: "center", verticalAlignment: "center", border: "thin", borderColor: "0F172A", numberFormat: "0.0%" });
    ws.cell(`K${totalRow}`).formula(`"Taux global : " & TEXT(J${totalRow},"0.0%") & " (" & E${totalRow} & "/" & D${totalRow} & " livrés, " & F${totalRow} & " aj., " & G${totalRow} & " ann.)"`).style({ fill: "0F172A", fontColor: "E2E8F0", fontSize: 9, horizontalAlignment: "left", verticalAlignment: "center", wrapText: true, border: "thin", borderColor: "0F172A" });
    ws.cell(`L${totalRow}`).value("Synthèse SLA Black Friday (Cible 80%)").style({ fill: "0F172A", fontColor: "94A3B8", italic: true, fontSize: 9, horizontalAlignment: "center", verticalAlignment: "center", border: "thin", borderColor: "0F172A" });

    const blob = await wb.outputAsync("blob");
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `EXPORT_LIVREURS_${dayName.toUpperCase()}_${dateIso}.xlsx`;
    document.body.appendChild(a);
    a.click();

    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  } catch (error) {
    console.error("Excel generation failed:", error);
    alert("Erreur de génération Excel: " + error.message);
  }
}

const button = document.getElementById("colisInfoInSourceView");
const targetUrl =
  "https://tms.marjanemall.ma/Hub/Consultation/ZoneColisList?zoneId=4";

button.addEventListener("click", async () => {
  try {
    button.disabled = true;
    const originalContent = button.innerHTML;

    // Show spinner while loading
    button.innerHTML = `
      <span class="button-spinner-wrapper">
        <span class="spinner"></span>
        <span>Chargement...</span>
      </span>
    `;

    // Fetch the raw HTML
    const response = await fetch(targetUrl, { credentials: "include" });
    let html = await response.text();

    // Clean HTML (remove scripts and stylesheets)
    html = html.replace(
      /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
      ""
    );
    html = html.replace(/<link[^>]*rel=["']stylesheet["'][^>]*>/gi, "");

    // Wrap in basic HTML structure to ensure compatibility
    const finalHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <title>Colis Info</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; }
            table { border-collapse: collapse; width: 100%; }
            td, th { border: 1px solid #ccc; padding: 6px; text-align: left; }
          </style>
        </head>
        <body>
          ${html}
        </body>
      </html>
    `;

    // Create a blob with cleaned HTML
    const blob = new Blob([finalHtml], { type: "text/html" });
    const blobUrl = URL.createObjectURL(blob);

    // Open tab AFTER everything is ready
    chrome.tabs.create({ url: blobUrl });

    // Restore button content
    button.innerHTML = originalContent;
    button.disabled = false;
  } catch (error) {
    console.error("Failed to open source view:", error);
    button.disabled = false;
    button.innerHTML = "Erreur ! Réessayer";
  }
});

async function generateExcel() {
  try {
    const { expeditions = [] } = await chrome.storage.local.get("expeditions");

    const templatePath = chrome.runtime.getURL(
      "dummy-content/ECHEC-RETOUR_CLIENT-CASABLANCA.xlsx"
    );
    const templateBuffer = await fetch(templatePath).then((r) =>
      r.arrayBuffer()
    );

    const workbook = await XlsxPopulate.fromDataAsync(templateBuffer);

    const processData = (suffix) =>
      expeditions.flatMap((exp) =>
        exp.palettes
          .filter((p) => p.number.endsWith(suffix))
          .map((p) => ({
            paletteNumber: p.number,
            expeditionNumber: exp.number.replace("N° ", ""),
            tourneeNumber: exp.tourneeNumber,
            colisCount: p.colisCount,
            colis: p.colis,
          }))
      );

    function formatDate(date = new Date()) {
      const d = date;
      const month = `${d.getMonth() + 1}`.padStart(2, "0");
      const day = `${d.getDate()}`.padStart(2, "0");
      const year = d.getFullYear();
      return `${year}-${month}-${day}`;
    }

    // Update sheet
    const updateSheet = (sheetName, data) => {
      const sheet = workbook.sheet(sheetName);
      sheet.cell("I2").value(formatDate());

      data.forEach((item) => {
        sheet.cell("J4").value(item.expeditionNumber);
        sheet.cell("J5").value(item.tourneeNumber);
        sheet.cell("J9").value(item.colisCount);

        ["A", "B", "C", "D", "E"].forEach((col) => {
          sheet.cell(`${col}12`).value(item.paletteNumber);
        });

        const cols = ["F", "G", "H", "I", "J"];
        for (const col of cols) {
          for (let row = 12; row <= 30; row++) {
            const cell = sheet.cell(`${col}${row}`);
            cell.clear();
          }
        }

        let colisIndex = 0;
        for (const col of cols) {
          for (let row = 12; row <= 30; row++) {
            if (colisIndex < item.colis.length) {
              const colis = item.colis[colisIndex];
              sheet.cell(`${col}${row}`).value(colis.number);
              colisIndex++;
            }
          }
        }
      });
    };

    updateSheet("ECHEC CASA", processData("001"));
    updateSheet("RTC CASA", processData("002"));

    const blob = await workbook.outputAsync("blob");
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ECHEC DE LIVRAISON _RETOUR CLIENT_${formatDate()}.xlsx`;
    document.body.appendChild(a);
    a.click();

    await chrome.storage.local.remove("expeditions");

    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  } catch (error) {
    console.error("Excel generation failed:", error);
    alert("Erreur de génération Excel: " + error.message);
  }
}

async function generateExcelHorsCasa() {
  try {
    const cities = ["tanger", "meknes", "fes", "rabat"];
    const storedData = await chrome.storage.local.get(
      cities.map((c) => `expeditions_${c}`)
    );

    const templatePath = chrome.runtime.getURL(
      "dummy-content/ECHEC-RETOUR_CLIENT-HORS-CASA.xlsx"
    );
    const templateBuffer = await fetch(templatePath).then((r) =>
      r.arrayBuffer()
    );
    const workbook = await XlsxPopulate.fromDataAsync(templateBuffer);

    function formatDate(date = new Date()) {
      const month = `${date.getMonth() + 1}`.padStart(2, "0");
      const day = `${date.getDate()}`.padStart(2, "0");
      const year = date.getFullYear();
      return `${year}-${month}-${day}`;
    }

    const updateSheet = (sheetName, data) => {
      const sheet = workbook.sheet(sheetName);
      sheet.cell("I2").value(formatDate());

      let startRow = 12;
      data.forEach((item) => {
        sheet.cell("J4").value(item.expeditionNumber);
        sheet.cell("J5").value(item.tourneeNumber);
        sheet.cell("J9").value(item.colisCount);

        ["A", "B", "C", "D", "E"].forEach((col) => {
          sheet.cell(`${col}${startRow}`).value(item.paletteNumber);
        });

        const cols = ["F", "G", "H", "I", "J"];
        for (const col of cols) {
          for (let row = startRow; row <= 30; row++) {
            sheet.cell(`${col}${row}`).clear();
          }
        }

        let colisIndex = 0;
        for (const col of cols) {
          for (let row = startRow; row <= 30; row++) {
            if (colisIndex < item.colis.length) {
              const colis = item.colis[colisIndex];
              sheet.cell(`${col}${row}`).value(colis.number);
              colisIndex++;
            }
          }
        }
      });
    };

    for (const city of cities) {
      const expeditions = storedData[`expeditions_${city}`] || [];

      const processData = (suffix) =>
        expeditions.flatMap((exp) =>
          exp.palettes
            .filter((p) => p.number.endsWith(suffix))
            .map((p) => ({
              paletteNumber: p.number,
              expeditionNumber: exp.number.replace("N° ", ""),
              tourneeNumber: exp.tourneeNumber,
              colisCount: p.colisCount,
              colis: p.colis,
            }))
        );

      updateSheet(`ECHEC ${city.toUpperCase()}`, processData("001"));
      updateSheet(`RTC ${city.toUpperCase()}`, processData("002"));
    }

    const blob = await workbook.outputAsync("blob");
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ECHEC-RETOUR_CLIENT-HORS-CASA_${formatDate()}.xlsx`;
    document.body.appendChild(a);
    a.click();

    await chrome.storage.local.remove(cities.map((c) => `expeditions_${c}`));

    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  } catch (error) {
    console.error("Excel generation failed:", error);
    alert("Erreur de génération Excel: " + error.message);
  }
}

/**
 * Envoie un message à l'onglet avec injection automatique de secours
 * si le content script a été déconnecté (rechargement de l'extension / onglet orphelin).
 */
async function sendTabMessageWithFallback(tabId, message, tabUrl = "") {
  if (!tabId) {
    throw new Error("Aucun onglet actif détecté.");
  }

  async function trySend() {
    return await chrome.tabs.sendMessage(tabId, message);
  }

  try {
    return await trySend();
  } catch (err) {
    const isConnErr =
      err &&
      err.message &&
      (err.message.includes("Receiving end does not exist") ||
        err.message.includes("Could not establish connection") ||
        err.message.includes("The message port closed"));

    if (!isConnErr) {
      throw err;
    }

    console.warn(
      `[GoFleet] Extension déconnectée de l'onglet ${tabId}. Tentative de réinjection automatique...`,
      err
    );

    // Vérifier si l'URL est injectable (doit être http:// ou https://)
    const url = (tabUrl || "").toLowerCase();
    const isInjectable = url.startsWith("http://") || url.startsWith("https://");

    if (!isInjectable || !chrome.scripting || !chrome.scripting.executeScript) {
      throw new Error(
        "Impossible de communiquer avec cet onglet.\nVeuillez actualiser la page TMS (F5) pour activer l'extension."
      );
    }

    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ["xlsx-populate.min.js", "xlsx.full.min.js", "content.js"],
      });

      // Attente courte pour initialiser les listeners
      await new Promise((resolve) => setTimeout(resolve, 350));

      // Deuxième essai
      return await trySend();
    } catch (injectErr) {
      console.error("[GoFleet] Échec de l'injection automatique:", injectErr);
      throw new Error(
        "Connexion avec la page TMS interrompue.\n\n" +
        "Veuillez rafraîchir la page TMS (F5) dans votre navigateur, puis réessayez l'export."
      );
    }
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  // Optional Gemini AI Comments settings initialization
  const enableAiCheckbox = document.getElementById("enableAiComments");
  const geminiKeyRow = document.getElementById("geminiKeyRow");
  const geminiApiInput = document.getElementById("geminiApiKeyInput");
  const saveGeminiBtn = document.getElementById("saveGeminiKeyBtn");
  const aiModeBadge = document.getElementById("aiModeBadge");

  function updateAiUi(enabled, hasKey) {
    if (geminiKeyRow) geminiKeyRow.style.display = enabled ? "flex" : "none";
    if (aiModeBadge) {
      if (enabled && hasKey) {
        aiModeBadge.textContent = "IA Active";
        aiModeBadge.style.background = "#e0e7ff";
        aiModeBadge.style.color = "#4338ca";
      } else if (enabled) {
        aiModeBadge.textContent = "Clé requise";
        aiModeBadge.style.background = "#fef3c7";
        aiModeBadge.style.color = "#b45309";
      } else {
        aiModeBadge.textContent = "Mode Local";
        aiModeBadge.style.background = "#f1f5f9";
        aiModeBadge.style.color = "#475569";
      }
    }
  }

  if (enableAiCheckbox) {
    const aiCfg = await chrome.storage.local.get({ gofleet_gemini_api_key: "", gofleet_use_ai_comments: false });
    enableAiCheckbox.checked = !!aiCfg.gofleet_use_ai_comments;
    if (geminiApiInput && aiCfg.gofleet_gemini_api_key) {
      geminiApiInput.value = aiCfg.gofleet_gemini_api_key;
    }
    updateAiUi(!!aiCfg.gofleet_use_ai_comments, !!(aiCfg.gofleet_gemini_api_key || "").trim());

    enableAiCheckbox.addEventListener("change", async () => {
      const checked = enableAiCheckbox.checked;
      await chrome.storage.local.set({ gofleet_use_ai_comments: checked });
      updateAiUi(checked, !!(geminiApiInput?.value || "").trim());
    });
  }

  if (saveGeminiBtn && geminiApiInput) {
    saveGeminiBtn.addEventListener("click", async () => {
      const val = geminiApiInput.value.trim();
      await chrome.storage.local.set({ gofleet_gemini_api_key: val });
      updateAiUi(!!enableAiCheckbox?.checked, !!val);
      saveGeminiBtn.textContent = "✓";
      setTimeout(() => { saveGeminiBtn.textContent = "OK"; }, 1200);
    });
  }

  document.getElementById("printRetour").addEventListener("click", async () => {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (tab) {
      try {
        await sendTabMessageWithFallback(tab.id, { action: "printRetourIframes" }, tab.url);
      } catch (err) {
        console.warn("Could not print retour:", err);
      }
    }
  });

  const searchBtn = document.getElementById("searchTrackingBtn");
  const input = document.getElementById("trackingInput");
  const startBtn = document.getElementById("startSearchBtn");

  let isVisible = false;

  searchBtn.addEventListener("click", () => {
    isVisible = !isVisible;

    if (isVisible) {
      input.style.display = "block";
      startBtn.style.display = "block";

      // Auto focus input after showing it
      setTimeout(() => input.focus(), 50);
    } else {
      input.style.display = "none";
      startBtn.style.display = "none";
    }
  });

  startBtn.addEventListener("click", async () => {
    const trackingToFind = input.value.trim();
    if (!trackingToFind) {
      alert("Veuillez entrer un code tracking.");
      input.focus(); // Keep focus if empty
      return;
    }

    startBtn.innerHTML = `
      <span class="button-spinner-wrapper">
        <span class="spinner"></span>
        <span>Chargement...</span>
      </span>
    `;
    startBtn.disabled = true;

    console.log("Envoi du tracking au content script:", trackingToFind);

    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      const tab = tabs[0];
      if (!tab) return;
      try {
        const response = await sendTabMessageWithFallback(
          tab.id,
          { action: "searchTracking", trackingToFind },
          tab.url
        );
        console.log("Réponse du content script:", response);

        if (response && response.found) {
          alert(`✅ Tracking trouvé: ${response.trackingCode}`);
        } else {
          alert("❌ Tracking introuvable dans cette page.");
        }
      } catch (err) {
        console.warn("searchTracking error:", err);
        alert(err.message || "Erreur de communication avec la page.");
      } finally {
        // Reset UI
        startBtn.innerHTML = "Valider";
        startBtn.disabled = false;
        input.value = "";

        input.style.display = "none";
        startBtn.style.display = "none";
        isVisible = false;
      }
    });
  });

  // Populate livreur history dates dropdown
  const livreurSelect = document.getElementById("livreurDateSelect");
  const historyBadge = document.getElementById("historyBadge");

  chrome.storage.local.get({ caissier_history: {} }, (res) => {
    const history = res.caissier_history || {};
    if (!livreurSelect) return;

    const dates = Object.keys(history).sort().reverse();
    if (dates.length > 0) {
      if (historyBadge) historyBadge.textContent = `${dates.length} date(s)`;
      dates.forEach((d) => {
        const opt = document.createElement("option");
        opt.value = d;
        const count = history[d]?.deliveryBoys?.length || 0;
        opt.textContent = `📅 ${d} (${count} livreurs)`;
        livreurSelect.appendChild(opt);
      });
    }
  });

  if (livreurSelect) {
    livreurSelect.addEventListener("change", () => {
      if (livreurSelect.value === "CURRENT") {
        if (historyBadge) {
          historyBadge.textContent = "⚡ En direct";
          historyBadge.style.background = "#e0e7ff";
          historyBadge.style.color = "#4338ca";
        }
      } else {
        if (historyBadge) {
          historyBadge.textContent = "📂 Archive";
          historyBadge.style.background = "#fef3c7";
          historyBadge.style.color = "#92400e";
        }
      }
    });
  }

  const exportLivreurBtn = document.getElementById("exportLivreur");
  if (exportLivreurBtn) {
    exportLivreurBtn.addEventListener("click", async () => {
      const originalHtml = exportLivreurBtn.innerHTML;
      try {
        exportLivreurBtn.disabled = true;
        exportLivreurBtn.innerHTML = `
          <div class="button-content" style="flex-direction: row; align-items: center; justify-content: center; width: 100%; gap: 10px;">
            <span class="spinner"></span>
            <span style="font-weight: 600;">Extraction Caissier & Traitement...</span>
          </div>
        `;

        const selectedDate = livreurSelect?.value || "CURRENT";

        // If user selected a specific historical date from dropdown
        if (selectedDate !== "CURRENT") {
          const { caissier_history = {} } = await chrome.storage.local.get(
            "caissier_history"
          );
          const historyItem = caissier_history[selectedDate];
          if (
            historyItem &&
            historyItem.deliveryBoys &&
            historyItem.deliveryBoys.length > 0
          ) {
            await generateDeliveryExcel(historyItem.deliveryBoys, selectedDate);
            alert(
              `Export Excel réussi depuis l'historique pour le ${selectedDate} (${historyItem.deliveryBoys.length} livreurs) !`
            );
            return;
          } else {
            alert(
              `Aucune donnée trouvée dans l'historique pour le ${selectedDate}.`
            );
            return;
          }
        }

        // Default: Collect from active tab
        const [tab] = await chrome.tabs.query({
          active: true,
          currentWindow: true,
        });

        if (!tab) {
          alert("Aucun onglet actif trouvé.");
          return;
        }

        const result = await sendTabMessageWithFallback(
          tab.id,
          { action: "collectDeliveryBoyData" },
          tab.url
        );

        if (result?.status === "ok") {
          const msg = result.fromHistory
            ? `Données livreur récupérées depuis l'historique (${result.date}) !`
            : "Données livreur & statuts TraitementLivreur récupérés avec succès !";
          alert(msg);
          console.log(result.deliveryBoys);
          await generateDeliveryExcel(result.deliveryBoys, result.date);
        } else {
          alert(result?.message || "Échec de la récupération des données.");
        }
      } catch (err) {
        console.error("exportLivreur failed:", err);
        alert(err.message || "Échec de l'exportation des livreurs.");
      } finally {
        exportLivreurBtn.disabled = false;
        exportLivreurBtn.innerHTML = originalHtml;
      }
    });
  }

  document
    .getElementById("exportEchecCasa")
    .addEventListener("click", async () => {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });

      // Store original URL at start
      const originalUrl = tab.url;
      let currentUrl = originalUrl;

      // Configuration - Adjust these values as needed
      const config = {
        navigationTimeout: 5000, // Increased from 2000 to 5000ms
        retryDelay: 3000, // Increased from 1000 to 3000ms
        maxRetries: 5, // Increased from 3 to 5 attempts
        dataCollectionDelay: 5000, // Added delay after page loads
        betweenExpeditionDelay: 5000, // Delay between processing expeditions
      };

      // Enhanced navigation with timeout and retry
      async function navigateWithRetry(url, maxAttempts = config.maxRetries) {
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          try {
            await chrome.tabs.update(tab.id, { url });

            // Wait for page to load with timeout
            await new Promise((resolve, reject) => {
              const timeout = setTimeout(
                () => reject(new Error(`Navigation timeout for ${url}`)),
                config.navigationTimeout
              );

              const checkComplete = async () => {
                const newUrl = (await chrome.tabs.get(tab.id)).url;
                if (newUrl === url) {
                  clearTimeout(timeout);
                  currentUrl = newUrl;
                  resolve();
                }
              };

              // Check every 500ms
              const interval = setInterval(checkComplete, 500);
            });

            // Additional delay after successful navigation
            await new Promise((r) => setTimeout(r, config.dataCollectionDelay));
            return true;
          } catch (error) {
            console.warn(`Navigation attempt ${attempt} failed:`, error);
            if (attempt === maxAttempts) throw error;
            await new Promise((r) =>
              setTimeout(r, attempt * config.retryDelay)
            );
          }
        }
      }

      // Enhanced data collection with status checks
      async function processPalette(palette, expedition) {
        const paletteUrl = new URL(palette.link, expedition.link).href;

        // Navigate to palette page with enhanced retry
        await navigateWithRetry(paletteUrl);

        // Collect data with multiple retries and validation
        let colisData;
        for (let attempt = 1; attempt <= config.maxRetries; attempt++) {
          try {
            colisData = await chrome.tabs.sendMessage(tab.id, {
              action: "collectFullExpeditionData",
            });

            // Validate the collected data
            if (colisData?.colisList?.length) {
              console.log(
                `Successfully collected ${colisData.colisList.length} items from palette ${palette.number}`
              );
              break;
            } else {
              throw new Error("Empty or invalid colis data");
            }
          } catch (error) {
            console.warn(
              `Attempt ${attempt} failed for palette ${palette.number}:`,
              error
            );
            if (attempt === config.maxRetries) throw error;
            await new Promise((r) =>
              setTimeout(r, attempt * config.retryDelay)
            );
          }
        }

        // Return to expedition edit page
        await navigateWithRetry(expedition.link);

        return colisData.colisList;
      }

      // Main processing function with enhanced error handling
      async function processExpeditions() {
        try {
          // --- INITIAL DATA COLLECTION ---
          console.log("Starting initial data collection...");
          const initialData = await chrome.tabs.sendMessage(tab.id, {
            action: "collectFullExpeditionData",
          });

          if (!initialData?.expeditions) {
            throw new Error("No expedition data found on the initial page");
          }

          // --- FILTER EXPEDITIONS ---
          const allowedStatuses = [
            "en cours de creation",
            "en cours d'expedition mm",
          ];

          const validExpeditions = initialData.expeditions.filter((exp) => {
            const cleanedStatus = exp.status
              .normalize("NFD")
              .replace(/[\u0300-\u036f]/g, "")
              .replace(/[’‘`´]/g, "'")
              .toLowerCase()
              .trim();

            return allowedStatuses.includes(cleanedStatus);
          });

          if (validExpeditions.length === 0) {
            const total = initialData.expeditions.length;
            throw new Error(
              total > 0
                ? `${total} expeditions found, none with required status`
                : "No expeditions found in the list"
            );
          }

          console.log(
            `Found ${validExpeditions.length} valid expeditions to process`
          );

          // --- PROCESS EACH EXPEDITION ---
          const processedExpeditions = [];
          let processedCount = 0;

          for (const expedition of validExpeditions) {
            try {
              console.log(
                `Processing expedition ${processedCount + 1}/${
                  validExpeditions.length
                }: ${expedition.number}`
              );

              // Navigate to expedition edit page
              await navigateWithRetry(expedition.link);

              // Collect expedition details
              let detailData;
              try {
                detailData = await chrome.tabs.sendMessage(tab.id, {
                  action: "collectFullExpeditionData",
                });
              } catch (error) {
                console.error("Failed to collect expedition data:", error);
                continue;
              }

              // Process each palette
              const processedPalettes = [];
              for (const palette of detailData.palettes) {
                try {
                  console.log(`Processing palette ${palette.number}`);
                  const colisList = await processPalette(palette, expedition);

                  processedPalettes.push({
                    ...palette,
                    colis: colisList,
                    colisCount: colisList.length,
                    collectedAt: new Date().toISOString(),
                  });

                  console.log(
                    `Completed palette ${palette.number} with ${colisList.length} colis`
                  );
                } catch (error) {
                  console.error(
                    `Failed to process palette ${palette.number}:`,
                    error
                  );
                  processedPalettes.push({
                    ...palette,
                    error: error.message,
                    colis: [],
                    colisCount: 0,
                  });
                }
              }

              processedExpeditions.push({
                ...expedition,
                tourneeNumber: detailData.tourneeNumber,
                plombNumber: detailData.plombNumber,
                palettes: processedPalettes,
                processedAt: new Date().toISOString(),
              });

              processedCount++;

              // Return to list page between expeditions
              await navigateWithRetry(originalUrl);

              // Add delay between expeditions
              if (processedCount < validExpeditions.length) {
                await new Promise((r) =>
                  setTimeout(r, config.betweenExpeditionDelay)
                );
              }
            } catch (error) {
              console.error(
                `Failed to process expedition ${expedition.number}:`,
                error
              );
              processedExpeditions.push({
                ...expedition,
                error: error.message,
                palettes: [],
              });
            }
          }

          // --- FINALIZE PROCESSING ---
          console.log("Processing complete, saving results...");
          await chrome.storage.local.set({
            expeditions: processedExpeditions,
            lastExport: new Date().toISOString(),
          });

          await generateExcel();
          console.log("Exportation terminé pour Zone CASA");
        } catch (error) {
          console.error("Export failed:", error);
          await navigateWithRetry(originalUrl);
          alert(`Export failed: ${error.message}`);
          throw error;
        }
      }

      // Execute the main process
      await processExpeditions();
    });

  document
    .getElementById("exportEchecHorsCasa")
    .addEventListener("click", async () => {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      const { city } = await chrome.tabs.sendMessage(tab.id, {
        action: "detectCity",
      });

      if (!["tanger", "meknes", "fes", "rabat"].includes(city)) {
        alert("City not recognized or not supported.");
        return;
      }

      const originalUrl = tab.url;
      let currentUrl = originalUrl;

      const config = {
        navigationTimeout: 5000,
        retryDelay: 3000,
        maxRetries: 5,
        dataCollectionDelay: 5000,
        betweenExpeditionDelay: 5000,
      };

      async function navigateWithRetry(url, maxAttempts = config.maxRetries) {
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          try {
            await chrome.tabs.update(tab.id, { url });
            await new Promise((resolve, reject) => {
              const timeout = setTimeout(
                () => reject(new Error(`Navigation timeout for ${url}`)),
                config.navigationTimeout
              );
              const checkComplete = async () => {
                const newUrl = (await chrome.tabs.get(tab.id)).url;
                if (newUrl === url) {
                  clearTimeout(timeout);
                  resolve();
                }
              };
              const interval = setInterval(checkComplete, 500);
            });
            await new Promise((r) => setTimeout(r, config.dataCollectionDelay));
            return true;
          } catch (error) {
            console.warn(`Navigation attempt ${attempt} failed:`, error);
            if (attempt === maxAttempts) throw error;
            await new Promise((r) =>
              setTimeout(r, attempt * config.retryDelay)
            );
          }
        }
      }

      async function processPalette(palette, expedition) {
        const paletteUrl = new URL(palette.link, expedition.link).href;
        await navigateWithRetry(paletteUrl);

        let colisData;
        for (let attempt = 1; attempt <= config.maxRetries; attempt++) {
          try {
            colisData = await chrome.tabs.sendMessage(tab.id, {
              action: "collectFullExpeditionData",
            });
            if (colisData?.colisList?.length) break;
            throw new Error("Empty or invalid colis data");
          } catch (error) {
            console.warn(
              `Attempt ${attempt} failed for palette ${palette.number}:`,
              error
            );
            if (attempt === config.maxRetries) throw error;
            await new Promise((r) =>
              setTimeout(r, attempt * config.retryDelay)
            );
          }
        }

        await navigateWithRetry(expedition.link);
        return colisData.colisList;
      }

      async function runExportLogic(tab, city) {
        const initialData = await chrome.tabs.sendMessage(tab.id, {
          action: "collectFullExpeditionData",
        });

        if (!initialData?.expeditions)
          throw new Error("No expedition data found on the initial page");

        const allowedStatuses = [
          "en cours de creation",
          "en cours d'expedition mm",
        ];
        const validExpeditions = initialData.expeditions.filter((exp) => {
          const cleanedStatus = exp.status
            .normalize("NFD")
            .replace(/[̀-ͯ]/g, "")
            .replace(/[’‘`´]/g, "'")
            .toLowerCase()
            .trim();
          return allowedStatuses.includes(cleanedStatus);
        });

        const processedExpeditions = [];
        for (const expedition of validExpeditions) {
          try {
            await navigateWithRetry(expedition.link);
            const detailData = await chrome.tabs.sendMessage(tab.id, {
              action: "collectFullExpeditionData",
            });
            const processedPalettes = [];

            for (const palette of detailData.palettes || []) {
              try {
                const colisList = await processPalette(palette, expedition);
                processedPalettes.push({
                  ...palette,
                  colis: colisList,
                  colisCount: colisList.length,
                });
              } catch (error) {
                processedPalettes.push({
                  ...palette,
                  error: error.message,
                  colis: [],
                  colisCount: 0,
                });
              }
            }

            processedExpeditions.push({
              ...expedition,
              tourneeNumber: detailData.tourneeNumber,
              plombNumber: detailData.plombNumber,
              palettes: processedPalettes,
            });

            await navigateWithRetry(originalUrl);
            await new Promise((r) =>
              setTimeout(r, config.betweenExpeditionDelay)
            );
          } catch (error) {
            console.error(
              `Failed to process expedition ${expedition.number}:`,
              error
            );
            processedExpeditions.push({
              ...expedition,
              error: error.message,
              palettes: [],
            });
          }
        }

        return processedExpeditions;
      }

      const collectedData = await runExportLogic(tab, city);
      const storageKey = `expeditions_${city}`;
      await chrome.storage.local.set({ [storageKey]: collectedData });

      const keys = await chrome.storage.local.get([
        "expeditions_tanger",
        "expeditions_meknes",
        "expeditions_fes",
        "expeditions_rabat",
      ]);

      const completed = Object.values(keys).filter(Boolean).length;

      if (completed === 4) {
        await generateExcelHorsCasa();
        alert("Exportation terminé pour toutes les Zones hors CASA !");
      } else {
        alert(`Ville ${city.toUpperCase()} terminée. Passez à la suivante.`);
      }
    });

  function formatDateForFilename(date = new Date()) {
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();

    return `${day}-${month}-${year}`;
  }

  document
    .getElementById("exportRefused")
    .addEventListener("click", async () => {
      try {
        // Get all refused colis from storage
        const { refusedColis = [] } = await chrome.storage.local.get({
          refusedColis: [],
        });

        // Prepare data for export
        const cleanData = refusedColis.map((item) => ({
          Date: item.date,
          Colis: item.colis,
          "Raison Annulation": item.raisonAnnulation,
          Livreur: item.livreur,
          Description: "",
        }));

        // Create workbook and worksheet
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(cleanData);

        // Set column widths
        ws["!cols"] = [
          { wch: 15 }, // Date
          { wch: 25 }, // Colis
          { wch: 35 }, // Raison Annulation
          { wch: 30 }, // Livreur
          { wch: 20 }, // Description
        ];

        // Add headers with styling
        const headerStyle = {
          font: { bold: true, color: { rgb: "FFFFFF" } },
          fill: { fgColor: { rgb: "4A6CF7" } },
          alignment: { horizontal: "center" },
        };

        const headerRow = [
          "Date",
          "Colis",
          "Raison Annulation",
          "Livreur",
          "Description",
        ];
        XLSX.utils.sheet_add_aoa(ws, [headerRow], { origin: "A1" });

        for (let col = 0; col < headerRow.length; col++) {
          const cellRef = XLSX.utils.encode_cell({ r: 0, c: col });
          if (!ws[cellRef]) ws[cellRef] = {};
          if (!ws[cellRef].s) ws[cellRef].s = {};
          Object.assign(ws[cellRef].s, headerStyle);
        }

        // Add sheet to workbook
        XLSX.utils.book_append_sheet(wb, ws, "Colis Refusés");

        // ✅ Create a Blob from workbook and download it manually
        const wbArrayBuffer = XLSX.write(wb, {
          bookType: "xlsx",
          type: "array",
        });
        const blob = new Blob([wbArrayBuffer], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        });

        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `Colis_refusés_${formatDateForFilename()}.xlsx`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        // Clear data
        await chrome.storage.local.remove("refusedColis");

        console.log(
          `✅ Exportation réussie: ${refusedColis.length} colis refusés exportés`
        );
      } catch (error) {
        console.error("Export échoué:", error);
        alert(`Erreur: ${error.message}`);
      }
    });

  // --- Module Export Colis Non Livrés (Par Livreur & Analytique) ---
  function sanitizeExcelSheetName(name, existingSet = new Set()) {
    if (!name || typeof name !== "string") name = "Livreur";
    let clean = name.replace(/[\\/?*[\]:]/g, "_").trim();
    if (clean.length > 28) {
      clean = clean.substring(0, 28).trim();
    }
    if (!clean) clean = "Livreur";

    let candidate = clean;
    let idx = 1;
    while (existingSet.has(candidate.toLowerCase())) {
      candidate = `${clean.substring(0, 25)}_${idx}`;
      idx++;
    }
    existingSet.add(candidate.toLowerCase());
    return candidate;
  }

  async function buildSleekNonDeliveredWorkbook(map, deliveryBoys = []) {
    const riderNames = Object.keys(map || {});
    if (riderNames.length === 0) {
      alert("Aucun colis non livré (ajourné ou annulé) n'a été trouvé.");
      return { success: false };
    }

    const normalizeKey = (s) => String(s || "").toLowerCase().replace(/\s+/g, " ").trim();
    const deliveryByRider = new Map();
    (deliveryBoys || []).forEach((b) => {
      if (b && b.name) deliveryByRider.set(normalizeKey(b.name), b);
    });

    const isReturnParcel = (p) => {
      const st = String(p?.statut || "").toLowerCase();
      const code = String(p?.colis || "").trim().toUpperCase();
      return (
        code.startsWith("RET") ||
        st.includes("retour") ||
        st.includes("récupér") ||
        st.includes("recupere") ||
        st.includes("reçu hub") ||
        st.includes("recu hub") ||
        st.includes("reçu au hub") ||
        st.includes("recu au hub") ||
        st.includes("affecté") ||
        st.includes("affecte") ||
        st.includes("assigné") ||
        st.includes("assigne") ||
        st.includes("ramassage")
      );
    };

    // 1. Gather all parcels & compute separated Ajourné vs Annulé analytics
    let totalParcelsCount = 0;
    let totalAjournes = 0;
    let totalAnnules = 0;
    const repartitionCounts = {};
    const riderStats = [];

    riderNames.forEach((name) => {
      const r = map[name] || {};
      const validParcels = (r.parcels || []).filter((p) => p && !isReturnParcel(p));
      totalParcelsCount += validParcels.length;

      const ajournesList = [];
      const annulesList = [];
      const rAjourneMotifs = {};
      const rAnnuleMotifs = {};

      validParcels.forEach((p) => {
        const cat = classifyParcelAjournAnnule(p);
        const rawMotif = (p.raisonAnnulation || "").trim();
        if (cat === "annule") {
          const motif = rawMotif || "Annulé / Refusé (Motif non renseigné)";
          annulesList.push({ ...p, _resolvedMotif: motif });
          const repKey = `annule::${motif}`;
          if (!repartitionCounts[repKey]) repartitionCounts[repKey] = { label: motif, cat: "annule", count: 0 };
          repartitionCounts[repKey].count++;
          rAnnuleMotifs[motif] = (rAnnuleMotifs[motif] || 0) + 1;
          totalAnnules++;
        } else {
          const ajLabel = rawMotif || (p.statut || "Colis Ajourné").trim();
          ajournesList.push({ ...p, _resolvedMotif: rawMotif || "-" });
          const repKey = `ajourne::${ajLabel}`;
          if (!repartitionCounts[repKey]) repartitionCounts[repKey] = { label: ajLabel, cat: "ajourne", count: 0 };
          repartitionCounts[repKey].count++;
          rAjourneMotifs[ajLabel] = (rAjourneMotifs[ajLabel] || 0) + 1;
          totalAjournes++;
        }
      });

      const getTopMotif = (countsObj) => {
        let best = "-";
        let max = 0;
        for (const [m, c] of Object.entries(countsObj)) {
          if (c > max) {
            max = c;
            best = m;
          }
        }
        return best;
      };

      const topAjourneMotif = getTopMotif(rAjourneMotifs);
      const topAnnuleMotif = getTopMotif(rAnnuleMotifs);

      const dbMatch = deliveryByRider.get(normalizeKey(name));
      const totalColis =
        dbMatch && Number(dbMatch.totalColis) > 0
          ? Number(dbMatch.totalColis)
          : typeof r.totalCount === "number" && r.totalCount > 0
            ? r.totalCount
            : null;
      const ratePct =
        totalColis && totalColis >= validParcels.length
          ? ((totalColis - validParcels.length) / totalColis) * 100
          : null;

      const ajInfo = buildRiderSlaDefenseComment({
        totalC: totalColis || 0,
        livC: totalColis ? Math.max(0, totalColis - validParcels.length) : 0,
        ajourneC: ajournesList.length,
        annuleC: annulesList.length,
        retNonRec: dbMatch ? Number(dbMatch.retourNonRecupere) || 0 : 0,
        parcels: validParcels,
        focusCat: "ajourne",
      });
      const anInfo = buildRiderSlaDefenseComment({
        totalC: totalColis || 0,
        livC: totalColis ? Math.max(0, totalColis - validParcels.length) : 0,
        ajourneC: ajournesList.length,
        annuleC: annulesList.length,
        retNonRec: dbMatch ? Number(dbMatch.retourNonRecupere) || 0 : 0,
        parcels: validParcels,
        focusCat: "annule",
      });
      const allInfo = buildRiderSlaDefenseComment({
        totalC: totalColis || 0,
        livC: totalColis ? Math.max(0, totalColis - validParcels.length) : 0,
        ajourneC: ajournesList.length,
        annuleC: annulesList.length,
        retNonRec: dbMatch ? Number(dbMatch.retourNonRecupere) || 0 : 0,
        parcels: validParcels,
        focusCat: "all",
      });

      const rDayInfo = getDayAndFormattedDateFr(r.date || null);

      riderStats.push({
        livreur: name,
        tourneeId: r.tourneeId || "N/A",
        date: r.date ? rDayInfo.dayFull : "",
        count: validParcels.length,
        ajournes: ajournesList.length,
        annules: annulesList.length,
        ajournesList,
        annulesList,
        totalColis,
        ratePct,
        topAjourneMotif,
        topAnnuleMotif,
        ajourneAnalyse: ajInfo.analyse,
        ajourneComment: ajInfo.comment,
        annuleAnalyse: anInfo.analyse,
        annuleComment: anInfo.comment,
        summaryDesc: `${allInfo.analyse} | ${allInfo.comment}`,
        parcels: validParcels,
      });
    });

    if (totalParcelsCount === 0) {
      alert("Tous les colis trouvés sont marqués comme livrés. Aucun colis ajourné/annulé à exporter.");
      return { success: false };
    }

    const aiCommentsMap = await fetchAiRiderSlaComments(
      riderStats.map((rs) => ({
        livreur: rs.livreur,
        total: rs.totalColis || 0,
        livres: rs.totalColis ? Math.max(0, rs.totalColis - rs.count) : 0,
        ajournes: rs.ajournes,
        annules: rs.annules,
        motifs: (rs.parcels || []).map((x) => ({ statut: x.statut, motif: x.raisonAnnulation || "" })),
      }))
    );
    riderStats.forEach((rs) => {
      const aiText = aiCommentsMap[rs.livreur] || aiCommentsMap[normalizeKey(rs.livreur)];
      if (aiText && String(aiText).trim()) {
        const cleanAi = String(aiText).trim();
        rs.ajourneComment = cleanAi;
        rs.annuleComment = cleanAi;
        rs.summaryDesc = cleanAi;
      }
    });

    const sortedRepartition = Object.values(repartitionCounts).sort((a, b) => b.count - a.count);
    const ajournePct = totalParcelsCount > 0 ? ((totalAjournes / totalParcelsCount) * 100).toFixed(1) : "0.0";
    const annulePct = totalParcelsCount > 0 ? ((totalAnnules / totalParcelsCount) * 100).toFixed(1) : "0.0";
    const { dayName, dayFull, dateFile } = getDayAndFormattedDateFr();

    // A) XlsxPopulate Rich Modern Export
    if (typeof XlsxPopulate !== "undefined") {
      const wb = await XlsxPopulate.fromBlankAsync();

      // === SHEET 1: DASHBOARD ANALYTICS ===
      const wsDash = wb.sheet(0);
      wsDash.name("TABLEAU_DE_BORD");
      wsDash.gridLinesVisible(true);

      const dashWidths = { A: 6, B: 30, C: 15, D: 18, E: 20, F: 26, G: 48, H: 74 };
      for (const [c, w] of Object.entries(dashWidths)) {
        wsDash.column(c).width(w);
      }

      // Row 1: Header Banner
      wsDash.row(1).height(38);
      wsDash.range("A1:H1").merged(true).value("GOFLEET • TABLEAU DE BORD ANALYTIQUE DES COLIS NON LIVRÉS (AJOURNÉS & ANNULÉS)")
        .style({
          fill: "0F172A",
          fontColor: "FFFFFF",
          bold: true,
          fontSize: 13,
          fontFamily: "Segoe UI",
          horizontalAlignment: "center",
          verticalAlignment: "center",
        });

      // Row 2: Subtitle
      wsDash.row(2).height(20);
      wsDash.range("A2:H2").merged(true).value(
        `📅 Jour d'analyse : ${dayFull} | 🛵 ${riderNames.length} tournée(s) analysée(s) | 📦 ${totalParcelsCount} colis non livrés (${totalAjournes} Ajourné(s) • ${totalAnnules} Annulé(s))`
      ).style({
        fill: "1E293B",
        fontColor: "94A3B8",
        italic: true,
        fontSize: 9.5,
        fontFamily: "Segoe UI",
        horizontalAlignment: "center",
        verticalAlignment: "center",
      });

      // Row 3: Spacer
      wsDash.row(3).height(8);

      // Rows 4-6: KPI Cards (NO CRBT)
      wsDash.row(4).height(20);
      wsDash.row(5).height(20);
      wsDash.row(6).height(20);

      function createCard(c1, c2, title, tFill, tColor, valText, vColor, bColor, fontSz = 14) {
        wsDash.range(`${c1}4:${c2}4`).merged(true).value(title).style({
          fill: tFill,
          fontColor: tColor,
          bold: true,
          fontSize: 8.5,
          fontFamily: "Segoe UI",
          horizontalAlignment: "center",
          verticalAlignment: "center",
          topBorder: "thin",
          leftBorder: "thin",
          rightBorder: "thin",
          bottomBorder: "none",
          borderColor: bColor,
        });
        wsDash.range(`${c1}5:${c2}6`).merged(true).value(valText).style({
          fill: "FFFFFF",
          fontColor: vColor,
          bold: true,
          fontSize: fontSz,
          fontFamily: "Segoe UI",
          horizontalAlignment: "center",
          verticalAlignment: "center",
          wrapText: true,
          bottomBorder: "thin",
          leftBorder: "thin",
          rightBorder: "thin",
          topBorder: "none",
          borderColor: bColor,
        });
      }

      createCard("A", "B", "📅 JOUR D'ANALYSE", "F1F5F9", "334155", dayFull, "0F172A", "CBD5E1", 11);
      createCard("C", "D", "⏸️ TOTAL COLIS AJOURNÉS", "FFFBEB", "92400E", `${totalAjournes} (${ajournePct}%)`, "B45309", "FDE68A", 14);
      createCard("E", "E", "❌ TOTAL COLIS ANNULÉS", "FFF1F2", "9F1239", `${totalAnnules} (${annulePct}%)`, "E11D48", "FECDD3", 14);
      createCard("F", "H", "🛵 TOURNÉES & NON LIVRÉS", "F0FDFA", "115E59", `${totalParcelsCount} Colis (${riderNames.length} Livreurs)`, "0D9488", "99F6E4", 13);

      // Row 7: Spacer
      wsDash.row(7).height(12);

      const sectionHeaderStyle = {
        fontColor: "FFFFFF",
        bold: true,
        fontSize: 10,
        fontFamily: "Segoe UI",
        horizontalAlignment: "left",
        verticalAlignment: "center",
        indent: 1,
      };
      const tableColHeaderStyle = {
        fill: "1E293B",
        fontColor: "FFFFFF",
        bold: true,
        fontSize: 9,
        fontFamily: "Segoe UI",
        horizontalAlignment: "center",
        verticalAlignment: "center",
        wrapText: true,
        border: "thin",
        borderColor: "0F172A",
      };

      let curRow = 8;
      // Section 1: Single Unified Répartition Table (Statuts Ajournés & Motifs Annulés)
      wsDash.row(curRow).height(24);
      wsDash.range(`A${curRow}:H${curRow}`).merged(true).value("📊 RÉPARTITION GLOBALE DES STATUTS & MOTIFS (AJOURNÉS & ANNULÉS)")
        .style({ ...sectionHeaderStyle, fill: "1E293B" });

      curRow++;
      wsDash.row(curRow).height(24);
      wsDash.cell(`A${curRow}`).value("N°").style(tableColHeaderStyle);
      wsDash.range(`B${curRow}:C${curRow}`).merged(true).value("Statut / Motif").style(tableColHeaderStyle);
      wsDash.cell(`D${curRow}`).value("Nb Colis").style(tableColHeaderStyle);
      wsDash.cell(`E${curRow}`).value("% Total Non Livrés").style(tableColHeaderStyle);
      wsDash.cell(`F${curRow}`).value("Catégorie").style(tableColHeaderStyle);
      wsDash.range(`G${curRow}:H${curRow}`).merged(true).value("Action Recommandée (Dispatch / Caisse)").style(tableColHeaderStyle);

      const repStartR = curRow + 1;
      sortedRepartition.forEach((item, idx) => {
        curRow++;
        wsDash.row(curRow).height(23);
        const bg = idx % 2 === 0 ? "FFFFFF" : "F8FAFC";
        const pctAll = totalParcelsCount > 0 ? item.count / totalParcelsCount : 0;
        const isAnn = item.cat === "annule";

        let action = isAnn ? "📦 Retour stock Hub & contrôle caisse" : "🔄 Reprogrammer livraison / Relancer client";
        const lm = item.label.toLowerCase();
        if (lm.includes("injoignable") || lm.includes("répond")) action = "📞 Relance Téléphone / SMS client & reprogrammation";
        else if (lm.includes("absent") || lm.includes("pas chez")) action = "🔄 Reprogrammer livraison J+1";
        else if (lm.includes("refus") || lm.includes("prix") || lm.includes("cher")) action = "📦 Retour immédiat au Hub (Contrôle stock)";
        else if (lm.includes("report") || lm.includes("demande") || lm.includes("date")) action = "📅 Reprogrammer à la date convenue";
        else if (lm.includes("adresse") || lm.includes("incompl") || lm.includes("trouv")) action = "📍 Valider localisation GPS avec client";
        else if (lm.includes("annul")) action = "❌ Annulation définitive (Retour stock Hub)";

        wsDash.cell(`A${curRow}`).value(idx + 1).style({ fill: bg, fontColor: "64748B", horizontalAlignment: "center", verticalAlignment: "center", border: "thin", borderColor: "E2E8F0" });
        wsDash.range(`B${curRow}:C${curRow}`).merged(true).value(item.label).style({ fill: bg, fontColor: "0F172A", bold: true, horizontalAlignment: "left", verticalAlignment: "center", wrapText: true, border: "thin", borderColor: "E2E8F0" });
        wsDash.cell(`D${curRow}`).value(item.count).style({ fill: bg, fontColor: isAnn ? "E11D48" : "B45309", bold: true, horizontalAlignment: "center", verticalAlignment: "center", border: "thin", borderColor: "E2E8F0", numberFormat: "#,##0" });
        wsDash.cell(`E${curRow}`).value(pctAll).style({ fill: bg, fontColor: "2563EB", horizontalAlignment: "center", verticalAlignment: "center", border: "thin", borderColor: "E2E8F0", numberFormat: "0.0%" });
        wsDash.cell(`F${curRow}`).value(isAnn ? "❌ Annulé / Refusé" : "⏸️ Ajourné").style({ fill: isAnn ? "FFF1F2" : "FFFBEB", fontColor: isAnn ? "9F1239" : "92400E", bold: true, horizontalAlignment: "center", verticalAlignment: "center", border: "thin", borderColor: "E2E8F0" });
        wsDash.range(`G${curRow}:H${curRow}`).merged(true).value(action).style({ fill: bg, fontColor: "334155", italic: true, horizontalAlignment: "left", verticalAlignment: "center", border: "thin", borderColor: "E2E8F0" });
      });

      curRow++;
      wsDash.row(curRow).height(24);
      wsDash.range(`A${curRow}:C${curRow}`).merged(true).value("TOTAL GÉNÉRAL RÉPARTITION").style({ fill: "0F172A", fontColor: "FFFFFF", bold: true, fontSize: 9.5, horizontalAlignment: "center", verticalAlignment: "center", border: "thin", borderColor: "0F172A" });
      wsDash.cell(`D${curRow}`).formula(`SUM(D${repStartR}:D${curRow - 1})`).style({ fill: "0F172A", fontColor: "34D399", bold: true, horizontalAlignment: "center", verticalAlignment: "center", border: "thin", borderColor: "0F172A", numberFormat: "#,##0" });
      wsDash.cell(`E${curRow}`).value(1).style({ fill: "0F172A", fontColor: "60A5FA", bold: true, horizontalAlignment: "center", verticalAlignment: "center", border: "thin", borderColor: "0F172A", numberFormat: "0.0%" });
      wsDash.range(`F${curRow}:H${curRow}`).merged(true).value(`${totalAjournes} Ajourné(s) • ${totalAnnules} Annulé(s)`).style({ fill: "0F172A", fontColor: "CBD5E1", bold: true, horizontalAlignment: "center", verticalAlignment: "center", border: "thin", borderColor: "0F172A" });
      curRow += 2;

      // Helper to render the 2 separate Rider Summary Tables (Analyse + Commentaire)
      function renderRiderTable(title, headerFill, rowsList, countField, motifField, analyseField, commentField, countColTitle, isAnnuleTbl) {
        wsDash.row(curRow).height(24);
        wsDash.range(`A${curRow}:H${curRow}`).merged(true).value(title).style({ ...sectionHeaderStyle, fill: headerFill });

        curRow++;
        wsDash.row(curRow).height(26);
        const cols = ["A", "B", "C", "D", "E", "F", "G", "H"];
        const hdrs = ["N°", "Nom Livreur", "N° Tournée", "Taux Livraison", countColTitle, isAnnuleTbl ? "Motif Dominant" : "Statut Dominant", "Analyse des Écarts", "Commentaire (Défense SLA 80%)"];
        hdrs.forEach((h, idx) => wsDash.cell(`${cols[idx]}${curRow}`).value(h).style(tableColHeaderStyle));

        if (rowsList.length === 0) {
          curRow++;
          wsDash.row(curRow).height(22);
          wsDash.range(`A${curRow}:H${curRow}`).merged(true).value(`✅ Aucun livreur n'a de colis ${isAnnuleTbl ? "annulé" : "ajourné"}.`)
            .style({ fill: "F0FDF4", fontColor: "059669", bold: true, horizontalAlignment: "center", verticalAlignment: "center", border: "thin", borderColor: "A7F3D0" });
          curRow += 2;
          return;
        }

        const startR = curRow + 1;
        rowsList.forEach((r, idx) => {
          curRow++;
          const aStr = String(r[analyseField] || "");
          const cStr = String(r[commentField] || "");
          const neededLines = Math.max(Math.ceil(aStr.length / 42), Math.ceil(cStr.length / 66));
          wsDash.row(curRow).height(Math.max(34, neededLines * 15 + 10));
          const bg = idx % 2 === 0 ? "FFFFFF" : "F8FAFC";
          const rateLabel = r.ratePct !== null ? `${r.ratePct.toFixed(1)}% (${Math.max(0, r.totalColis - r.count)}/${r.totalColis})` : "N/A";
          const rateColor = r.ratePct === null ? "64748B" : r.ratePct >= 90 ? "059669" : r.ratePct >= 80 ? "D97706" : "E11D48";
          const descColor = r.ratePct !== null && r.ratePct >= 90 ? "065F46" : r.ratePct !== null && r.ratePct >= 80 ? "92400E" : "9F1239";

          wsDash.cell(`A${curRow}`).value(idx + 1).style({ fill: bg, fontColor: "64748B", horizontalAlignment: "center", verticalAlignment: "center", border: "thin", borderColor: "E2E8F0" });
          wsDash.cell(`B${curRow}`).value(r.livreur).style({ fill: bg, fontColor: "0F172A", bold: true, horizontalAlignment: "left", verticalAlignment: "center", border: "thin", borderColor: "E2E8F0" });
          wsDash.cell(`C${curRow}`).value(r.tourneeId).style({ fill: bg, fontColor: "334155", horizontalAlignment: "center", verticalAlignment: "center", border: "thin", borderColor: "E2E8F0" });
          wsDash.cell(`D${curRow}`).value(rateLabel).style({ fill: bg, fontColor: rateColor, bold: true, horizontalAlignment: "center", verticalAlignment: "center", border: "thin", borderColor: "E2E8F0" });
          wsDash.cell(`E${curRow}`).value(r[countField]).style({ fill: isAnnuleTbl ? "FFF1F2" : "FFFBEB", fontColor: isAnnuleTbl ? "E11D48" : "B45309", bold: true, horizontalAlignment: "center", verticalAlignment: "center", border: "thin", borderColor: "E2E8F0", numberFormat: "#,##0" });
          wsDash.cell(`F${curRow}`).value(r[motifField]).style({ fill: bg, fontColor: "2563EB", italic: true, horizontalAlignment: "left", verticalAlignment: "center", wrapText: true, border: "thin", borderColor: "E2E8F0" });
          wsDash.cell(`G${curRow}`).value(aStr).style({ fill: bg, fontColor: "334155", fontSize: 9, horizontalAlignment: "left", verticalAlignment: "center", wrapText: true, border: "thin", borderColor: "E2E8F0" });
          wsDash.cell(`H${curRow}`).value(cStr).style({ fill: bg, fontColor: descColor, fontSize: 9, bold: r.ratePct !== null && r.ratePct < 80, horizontalAlignment: "left", verticalAlignment: "center", wrapText: true, border: "thin", borderColor: "E2E8F0" });
        });

        curRow++;
        wsDash.row(curRow).height(25);
        wsDash.range(`A${curRow}:D${curRow}`).merged(true).value(isAnnuleTbl ? "TOTAL COLIS ANNULÉS" : "TOTAL COLIS AJOURNÉS")
          .style({ fill: "0F172A", fontColor: "FFFFFF", bold: true, fontSize: 9.5, horizontalAlignment: "center", verticalAlignment: "center", border: "thin", borderColor: "0F172A" });
        wsDash.cell(`E${curRow}`).formula(`SUM(E${startR}:E${curRow - 1})`)
          .style({ fill: "0F172A", fontColor: isAnnuleTbl ? "F87171" : "FBBF24", bold: true, horizontalAlignment: "center", verticalAlignment: "center", border: "thin", borderColor: "0F172A", numberFormat: "#,##0" });
        wsDash.range(`F${curRow}:H${curRow}`).merged(true).value(`Synthèse du ${dayFull}`)
          .style({ fill: "0F172A", fontColor: "94A3B8", italic: true, horizontalAlignment: "center", verticalAlignment: "center", border: "thin", borderColor: "0F172A" });
        curRow += 2;
      }

      const ajourneRiders = riderStats.filter((r) => r.ajournes > 0).sort((a, b) => b.ajournes - a.ajournes);
      const annuleRiders = riderStats.filter((r) => r.annules > 0).sort((a, b) => b.annules - a.annules);

      // Section 2A & 2B: Two separate Rider Summary Tables
      renderRiderTable("⏸️ SYNTHÈSE PAR LIVREUR — COLIS AJOURNÉS", "B45309", ajourneRiders, "ajournes", "topAjourneMotif", "ajourneAnalyse", "ajourneComment", "Colis Ajournés", false);
      renderRiderTable("❌ SYNTHÈSE PAR LIVREUR — COLIS ANNULÉS / REFUSÉS", "9F1239", annuleRiders, "annules", "topAnnuleMotif", "annuleAnalyse", "annuleComment", "Colis Annulés", true);

      // === SHEETS 2..N: INDIVIDUAL RIDER SHEETS (Ajournés & Annulés separated, 6 clean columns) ===
      const existingSheets = new Set(["tableau_de_bord"]);

      riderNames.forEach((riderName, rIdx) => {
        const rData = map[riderName] || {};
        const rStat = riderStats[rIdx] || {};
        const safeSheetName = sanitizeExcelSheetName(riderName, existingSheets);
        const wsRider = wb.addSheet(safeSheetName);
        wsRider.gridLinesVisible(true);

        const rCols = { A: 6, B: 24, C: 24, D: 58, E: 15, F: 24 };
        for (const [col, w] of Object.entries(rCols)) {
          wsRider.column(col).width(w);
        }

        const riderDisplayDate = rStat.date || dayFull;

        // Banner
        wsRider.row(1).height(34);
        wsRider.range("A1:F1").merged(true).value(`TOURNÉE LIVREUR : ${riderName.toUpperCase()}`)
          .style({ fill: "0D9488", fontColor: "FFFFFF", bold: true, fontSize: 13, fontFamily: "Segoe UI", horizontalAlignment: "center", verticalAlignment: "center" });

        wsRider.row(2).height(20);
        wsRider.range("A2:F2").merged(true).value(
          `N° Tournée : ${rData.tourneeId || "N/A"} | Date : ${riderDisplayDate} | Ajournés : ${rStat.ajournes} | Annulés : ${rStat.annules} | Total Non Livrés : ${rStat.count}`
        ).style({ fill: "1E293B", fontColor: "94A3B8", italic: true, fontSize: 9.5, fontFamily: "Segoe UI", horizontalAlignment: "center", verticalAlignment: "center" });

        wsRider.row(3).height(8);

        let rCur = 4;
        const rHeaders = ["N°", "Code Colis / Tracking", "Statut Colis", "Motif / Raison", "N° Tournée", "Date / Jour"];
        const rColKeys = ["A", "B", "C", "D", "E", "F"];

        function renderRiderParcelBlock(blockTitle, blockFill, list, isAnnuleBlk) {
          wsRider.row(rCur).height(24);
          wsRider.range(`A${rCur}:F${rCur}`).merged(true).value(blockTitle)
            .style({ fill: blockFill, fontColor: "FFFFFF", bold: true, fontSize: 10, fontFamily: "Segoe UI", horizontalAlignment: "left", verticalAlignment: "center", indent: 1 });

          rCur++;
          wsRider.row(rCur).height(25);
          rHeaders.forEach((h, i) => {
            wsRider.cell(`${rColKeys[i]}${rCur}`).value(h).style({ fill: "1E293B", fontColor: "FFFFFF", bold: true, fontSize: 9.5, fontFamily: "Segoe UI", horizontalAlignment: "center", verticalAlignment: "center", border: "thin", borderColor: "0F172A" });
          });

          if (list.length > 0) {
            list.forEach((p, idx) => {
              rCur++;
              const motifVal = isAnnuleBlk ? (p._resolvedMotif || p.raisonAnnulation || "-") : (p.raisonAnnulation || "-");
              wsRider.row(rCur).height(motifVal.length > 52 ? 32 : 22);
              const bg = idx % 2 === 0 ? "FFFFFF" : "F8FAFC";
              const pDay = p.date ? getDayAndFormattedDateFr(p.date).dayFull : riderDisplayDate;

              wsRider.cell(`A${rCur}`).value(idx + 1).style({ fill: bg, fontColor: "64748B", horizontalAlignment: "center", verticalAlignment: "center", border: "thin", borderColor: "E2E8F0" });
              wsRider.cell(`B${rCur}`).value(p.colis || "-").style({ fill: bg, fontColor: "0F172A", bold: true, horizontalAlignment: "center", verticalAlignment: "center", border: "thin", borderColor: "E2E8F0" });
              wsRider.cell(`C${rCur}`).value(p.statut || (isAnnuleBlk ? "Annulé" : "Ajourné")).style({ fill: bg, fontColor: isAnnuleBlk ? "E11D48" : "B45309", bold: true, horizontalAlignment: "center", verticalAlignment: "center", border: "thin", borderColor: "E2E8F0" });
              wsRider.cell(`D${rCur}`).value(motifVal).style({ fill: bg, fontColor: motifVal === "-" ? "94A3B8" : "334155", horizontalAlignment: motifVal === "-" ? "center" : "left", verticalAlignment: "center", wrapText: true, border: "thin", borderColor: "E2E8F0" });
              wsRider.cell(`E${rCur}`).value(p.tourneeId || rData.tourneeId || "-").style({ fill: bg, fontColor: "64748B", horizontalAlignment: "center", verticalAlignment: "center", border: "thin", borderColor: "E2E8F0" });
              wsRider.cell(`F${rCur}`).value(pDay).style({ fill: bg, fontColor: "64748B", horizontalAlignment: "center", verticalAlignment: "center", border: "thin", borderColor: "E2E8F0" });
            });

            rCur++;
            wsRider.row(rCur).height(24);
            wsRider.range(`A${rCur}:F${rCur}`).merged(true).value(
              `SOUS-TOTAL ${isAnnuleBlk ? "ANNULÉS / REFUSÉS" : "AJOURNÉS"} : ${list.length} COLIS`
            ).style({ fill: "0F172A", fontColor: isAnnuleBlk ? "F87171" : "FBBF24", bold: true, fontSize: 9.5, horizontalAlignment: "center", verticalAlignment: "center", border: "thin", borderColor: "0F172A" });
          } else {
            rCur++;
            wsRider.row(rCur).height(22);
            wsRider.range(`A${rCur}:F${rCur}`).merged(true).value(`✅ Aucun colis ${isAnnuleBlk ? "annulé / refusé" : "ajourné"} pour ce livreur.`)
              .style({ fill: "F0FDF4", fontColor: "059669", bold: true, fontSize: 10, horizontalAlignment: "center", verticalAlignment: "center", border: "thin", borderColor: "A7F3D0" });
          }
          rCur += 2;
        }

        renderRiderParcelBlock(`⏸️ COLIS AJOURNÉS (${rStat.ajournes})`, "B45309", rStat.ajournesList, false);
        renderRiderParcelBlock(`❌ COLIS ANNULÉS / REFUSÉS (${rStat.annules})`, "9F1239", rStat.annulesList, true);

        // Rider Diagnostic Footer
        wsRider.row(rCur).height(28);
        wsRider.range(`A${rCur}:F${rCur}`).merged(true).value(`📊 Synthèse Livreur : ${rStat.summaryDesc}`)
          .style({ fill: "F1F5F9", fontColor: "0F172A", bold: true, fontSize: 9.5, horizontalAlignment: "center", verticalAlignment: "center", wrapText: true, border: "thin", borderColor: "CBD5E1" });
      });

      const blob = await wb.outputAsync("blob");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const filename = riderNames.length === 1
        ? `COLIS_NON_LIVRES_${riderNames[0].replace(/\s+/g, "_")}_${dayName.toUpperCase()}_${dateFile}.xlsx`
        : `COLIS_NON_LIVRES_${riderNames.length}_LIVREURS_${dayName.toUpperCase()}_${dateFile}.xlsx`;

      a.download = filename;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        a.remove();
        URL.revokeObjectURL(url);
      }, 150);
      return { success: true, count: totalParcelsCount, ajournes: totalAjournes, annules: totalAnnules, filename, totalRiders: riderNames.length };
    } else {
      // B) SheetJS Fallback (Ajourné vs Annulé separated, NO CRBT)
      const wb = XLSX.utils.book_new();
      const existingSheets = new Set();

      const summaryRows = [];
      sortedRepartition.forEach((item) => {
        summaryRows.push({
          "Date / Jour": dayFull,
          "Type": item.cat === "annule" ? "Motif Annulé" : "Statut Ajourné",
          "Libellé": item.label,
          "Nb Colis": item.count,
          "% Total": `${totalParcelsCount > 0 ? ((item.count / totalParcelsCount) * 100).toFixed(1) : "0.0"}%`,
          "Analyse des Écarts": "-",
          "Commentaire (Défense SLA 80%)": "-",
        });
      });
      riderStats.filter((r) => r.ajournes > 0).forEach((r) => {
        summaryRows.push({
          "Date / Jour": r.date || dayFull,
          "Type": "Livreur (Ajournés)",
          "Libellé": `${r.livreur} (Tournée ${r.tourneeId})`,
          "Nb Colis": r.ajournes,
          "% Total": r.ratePct !== null ? `${r.ratePct.toFixed(1)}%` : "-",
          "Analyse des Écarts": r.ajourneAnalyse,
          "Commentaire (Défense SLA 80%)": r.ajourneComment,
        });
      });
      riderStats.filter((r) => r.annules > 0).forEach((r) => {
        summaryRows.push({
          "Date / Jour": r.date || dayFull,
          "Type": "Livreur (Annulés)",
          "Libellé": `${r.livreur} (Tournée ${r.tourneeId})`,
          "Nb Colis": r.annules,
          "% Total": r.ratePct !== null ? `${r.ratePct.toFixed(1)}%` : "-",
          "Analyse des Écarts": r.annuleAnalyse,
          "Commentaire (Défense SLA 80%)": r.annuleComment,
        });
      });

      const wsSummary = XLSX.utils.json_to_sheet(summaryRows);
      wsSummary["!cols"] = [{ wch: 22 }, { wch: 20 }, { wch: 36 }, { wch: 12 }, { wch: 14 }, { wch: 52 }];
      XLSX.utils.book_append_sheet(wb, wsSummary, "TABLEAU_DE_BORD");
      existingSheets.add("tableau_de_bord");

      riderNames.forEach((riderName, rIdx) => {
        const rData = map[riderName] || {};
        const rStat = riderStats[rIdx] || {};
        const combined = [
          ...(rStat.ajournesList || []).map((p) => ({ ...p, _catLabel: "AJOURNÉ" })),
          ...(rStat.annulesList || []).map((p) => ({ ...p, _catLabel: "ANNULÉ" })),
        ];
        const sheetData = combined.map((item, idx) => ({
          "N°": idx + 1,
          "Catégorie": item._catLabel,
          "Colis": item.colis || "",
          "Statut": item.statut || item._catLabel,
          "Motif / Raison": item._resolvedMotif || item.raisonAnnulation || "-",
          "Destinataire": item.client || "-",
          "Téléphone": item.telephone || "-",
          "Adresse": item.adresse || "-",
          "N° Tournée": item.tourneeId || rData.tourneeId || "-",
          "Date / Jour": item.date ? getDayAndFormattedDateFr(item.date).dayFull : dayFull,
          "Livreur": riderName,
        }));
        const ws = XLSX.utils.json_to_sheet(sheetData);
        ws["!cols"] = [{ wch: 6 }, { wch: 14 }, { wch: 22 }, { wch: 16 }, { wch: 32 }, { wch: 26 }, { wch: 18 }, { wch: 38 }, { wch: 14 }, { wch: 22 }, { wch: 24 }];

        const safeSheetName = sanitizeExcelSheetName(riderName, existingSheets);
        XLSX.utils.book_append_sheet(wb, ws, safeSheetName);
      });

      const wbArrayBuffer = XLSX.write(wb, { bookType: "xlsx", type: "array" });
      const blob = new Blob([wbArrayBuffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const filename = riderNames.length === 1
        ? `COLIS_NON_LIVRES_${riderNames[0].replace(/\s+/g, "_")}_${dayName.toUpperCase()}_${dateFile}.xlsx`
        : `COLIS_NON_LIVRES_${riderNames.length}_LIVREURS_${dayName.toUpperCase()}_${dateFile}.xlsx`;

      a.download = filename;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        a.remove();
        URL.revokeObjectURL(url);
      }, 150);
      return { success: true, count: totalParcelsCount, ajournes: totalAjournes, annules: totalAnnules, filename, totalRiders: riderNames.length };
    }
  }

  function updateNonDeliveredBadge() {
    const label = document.getElementById("nonDeliveredCountLabel");
    if (!label) return;

    chrome.storage.local.get({ gofleet_non_delivered_by_rider: {} }, (res) => {
      const data = res.gofleet_non_delivered_by_rider || {};
      const riders = Object.keys(data);
      let totalParcels = 0;
      riders.forEach((r) => {
        totalParcels += (data[r]?.parcels || []).length;
      });

      label.innerHTML = `
        <i class="fa-solid fa-layer-group" style="color: #0d9488;"></i>
        <span><strong>${riders.length}</strong> livreur(s) • <strong>${totalParcels}</strong> colis non livré(s)</span>
      `;
    });
  }

  // Update badge on load
  updateNonDeliveredBadge();

  // Reset button
  const clearNonDeliveredBtn = document.getElementById("clearNonDeliveredBtn");
  if (clearNonDeliveredBtn) {
    clearNonDeliveredBtn.addEventListener("click", async () => {
      if (confirm("Voulez-vous réinitialiser tous les colis non livrés mémorisés pour tous les livreurs ?")) {
        await chrome.storage.local.remove(["gofleet_non_delivered_by_rider", "gofleet_non_delivered_history"]);
        updateNonDeliveredBadge();
        alert("Mémoire des colis non livrés réinitialisée.");
      }
    });
  }

  // Main Export Button
  const exportNonDeliveredBtn = document.getElementById("exportNonDeliveredRiders");
  if (exportNonDeliveredBtn) {
    exportNonDeliveredBtn.addEventListener("click", async () => {
      const originalHtml = exportNonDeliveredBtn.innerHTML;
      try {
        exportNonDeliveredBtn.disabled = true;
        exportNonDeliveredBtn.innerHTML = `
          <div class="button-content" style="flex-direction: row; align-items: center; justify-content: center; width: 100%; gap: 10px;">
            <span class="spinner"></span>
            <span style="font-weight: 600;">Génération de l'Excel...</span>
          </div>
        `;

        // 1. Try to collect live data depending on active tab
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        const activeUrl = (activeTab?.url || "").toLowerCase();
        let caissierResp = null;

        if (activeUrl.includes("/caissier/caissier") && !activeUrl.includes("traitementlivreurexcute")) {
          const isSingleEncaissement = activeUrl.includes("tourneeencaisement");
          exportNonDeliveredBtn.innerHTML = `
            <div class="button-content" style="flex-direction: row; align-items: center; justify-content: center; width: 100%; gap: 10px;">
              <span class="spinner"></span>
              <span style="font-weight: 600;">${isSingleEncaissement ? "Extraction de la tournée..." : "Extraction de toutes les tournées..."}</span>
            </div>
          `;
          try {
            const response = await sendTabMessageWithFallback(
              activeTab.id,
              { action: "collectAllCaissierRidersParcels" },
              activeTab?.url
            );
            if (response?.status === "ok" && response.data) {
              caissierResp = response;
              console.log("Données de tous les livreurs collectées depuis Caissier:", response.data);
            } else if (response?.status === "error") {
              console.warn("Avertissement renvoyé par Caissier:", response.message);
            }
          } catch (e) {
            console.warn("Could not query Caissier page for riders (fallback to storage):", e);
          }
        } else if (activeUrl.includes("traitementlivreurexcute")) {
          exportNonDeliveredBtn.innerHTML = `
            <div class="button-content" style="flex-direction: row; align-items: center; justify-content: center; width: 100%; gap: 10px;">
              <span class="spinner"></span>
              <span style="font-weight: 600;">Extraction des colis de la tournée...</span>
            </div>
          `;
          try {
            const response = await sendTabMessageWithFallback(
              activeTab.id,
              { action: "collectNonDeliveredParcels" },
              activeTab?.url
            );
            if (response?.status === "ok" && response.data) {
              console.log("Données collectées en direct depuis l'onglet actif:", response.data);
            } else if (response?.status === "error") {
              console.warn("Avertissement renvoyé par TraitementLivreur:", response.message);
            }
          } catch (e) {
            console.warn("Could not query active tab for live non-delivered parcels (fallback to storage):", e);
          }
        }

        // Rafraîchir le badge du compteur
        updateNonDeliveredBadge();

        // 2. Read all accumulated non-delivered parcels & rider stats from storage (with >24h history fallback)
        const {
          gofleet_non_delivered_by_rider = {},
          gofleet_non_delivered_history = {},
          deliveryBoys = [],
        } = await chrome.storage.local.get([
          "gofleet_non_delivered_by_rider",
          "gofleet_non_delivered_history",
          "deliveryBoys",
        ]);

        const storedHistoryMap =
          caissierResp?.date && gofleet_non_delivered_history[caissierResp.date]
            ? gofleet_non_delivered_history[caissierResp.date]
            : null;
        const ridersParcelSource =
          caissierResp?.data && Object.keys(caissierResp.data).length > 0
            ? caissierResp.data
            : storedHistoryMap && Object.keys(storedHistoryMap).length > 0
              ? storedHistoryMap
              : gofleet_non_delivered_by_rider;
        const resolvedDeliveryBoys =
          caissierResp?.deliveryBoys && caissierResp.deliveryBoys.length > 0
            ? caissierResp.deliveryBoys
            : deliveryBoys;

        const res = await buildSleekNonDeliveredWorkbook(ridersParcelSource, resolvedDeliveryBoys);
        if (res && res.success) {
          updateNonDeliveredBadge();
          alert(
            `✅ Export Analytique Excel Réussi !\n\n` +
            `• Total Colis Non Livrés : ${res.count}\n` +
            `• Colis Ajournés : ${res.ajournes}\n` +
            `• Colis Annulés / Refusés : ${res.annules}\n` +
            `• Tournées / Livreurs : ${res.totalRiders}\n` +
            `• Fichier : ${res.filename}\n\n` +
            `📊 Tableau de bord généré avec séparation Ajournés / Annulés et onglets individuels par livreur.`
          );
        }
      } catch (err) {
        console.error("Export non livrés échoué:", err);
        alert(`Erreur d'exportation : ${err.message}`);
      } finally {
        exportNonDeliveredBtn.disabled = false;
        exportNonDeliveredBtn.innerHTML = originalHtml;
      }
    });
  }
});
