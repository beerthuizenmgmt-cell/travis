function vindRegel(regels, dienst, type) {
  return regels.find((r) => r.dienst === dienst && r.type === type);
}

function pakketType(reservation) {
  return reservation.pakket && reservation.pakket.toLowerCase().includes('jaardeal') ? 'jaardeal' : 'pakket';
}

export function berekenCommissieVoorReservering(reservation, regels) {
  const pakketRegel = vindRegel(regels, reservation.dienst, pakketType(reservation));
  const extraRegel = vindRegel(regels, reservation.dienst, 'extra');

  const nettoBasis = Number(reservation.bruto_prijs) - Number(reservation.productie_kosten || 0);
  const pakketBasisBedrag = pakketRegel?.basis === 'netto' ? nettoBasis : Number(reservation.bruto_prijs);
  const pakketCommissie = pakketRegel ? pakketBasisBedrag * (pakketRegel.percentage / 100) : 0;

  const extras = Array.isArray(reservation.extras) ? reservation.extras : [];
  const extraCommissie = extras.reduce((sum, extra) => {
    if (!extraRegel) return sum;
    return sum + Number(extra.bedrag || 0) * (extraRegel.percentage / 100);
  }, 0);

  return {
    pakketCommissie,
    extraCommissie,
    totaalCommissie: pakketCommissie + extraCommissie,
    nettoBasis,
  };
}

export function brutoOmzetVoorReservering(reservation) {
  const extras = Array.isArray(reservation.extras) ? reservation.extras : [];
  const extraTotaal = extras.reduce((sum, e) => sum + Number(e.bedrag || 0), 0);
  return Number(reservation.bruto_prijs) + extraTotaal;
}

export function vindBonus(aantalKlanten, bonusTiers) {
  const tiers = [...(bonusTiers || [])].sort((a, b) => b.vanaf - a.vanaf);
  const match = tiers.find((t) => aantalKlanten >= t.vanaf);
  return match ? Number(match.bonus) : 0;
}

export function berekenMaandoverzicht(reservations, regels, instellingen) {
  const bevestigd = reservations.filter((r) => r.status === 'bevestigd');
  const perReservering = bevestigd.map((r) => ({
    reservation: r,
    ...berekenCommissieVoorReservering(r, regels),
  }));

  const totaalCommissie = perReservering.reduce((sum, r) => sum + r.totaalCommissie, 0);
  const bonus = vindBonus(bevestigd.length, instellingen?.bonus_tiers);
  const minimumGarantie = Number(instellingen?.minimum_garantie || 0);
  const uitbetaling = Math.max(totaalCommissie + bonus, minimumGarantie);
  const minimumToegepast = totaalCommissie + bonus < minimumGarantie;

  return {
    perReservering,
    aantalKlanten: bevestigd.length,
    totaalCommissie,
    bonus,
    minimumGarantie,
    minimumToegepast,
    uitbetaling,
  };
}

export function berekenWinst(reservations, advertentiekosten, uitbetalingNathanisya) {
  const bevestigd = reservations.filter((r) => r.status === 'bevestigd');
  const brutoOmzet = bevestigd.reduce((sum, r) => sum + brutoOmzetVoorReservering(r), 0);
  const productieTotaal = bevestigd.reduce((sum, r) => sum + Number(r.productie_kosten || 0), 0);
  const advertentieTotaal = (advertentiekosten || []).reduce((sum, a) => sum + Number(a.bedrag || 0), 0);
  const winst = brutoOmzet - productieTotaal - advertentieTotaal - uitbetalingNathanisya;
  const winstPercentage = brutoOmzet > 0 ? (winst / brutoOmzet) * 100 : 0;

  return { brutoOmzet, productieTotaal, advertentieTotaal, winst, winstPercentage };
}

export function groepeerPerPakket(perReservering) {
  const groepen = new Map();
  for (const item of perReservering) {
    const key = `${item.reservation.dienst}__${item.reservation.pakket}`;
    if (!groepen.has(key)) {
      groepen.set(key, {
        dienst: item.reservation.dienst,
        pakket: item.reservation.pakket,
        aantal: 0,
        brutoOmzet: 0,
        nettoBasis: 0,
        commissie: 0,
      });
    }
    const g = groepen.get(key);
    g.aantal += 1;
    g.brutoOmzet += brutoOmzetVoorReservering(item.reservation);
    g.nettoBasis += item.nettoBasis;
    g.commissie += item.totaalCommissie;
  }
  return [...groepen.values()];
}
