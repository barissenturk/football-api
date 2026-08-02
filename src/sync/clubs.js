/**
 * Seed clubs (Wikidata Q-ids). Sync pulls every player who ever played
 * for these clubs, plus each player's full club history.
 */
export const SEED_CLUBS = [
  // Türkiye
  { id: "Q495299", nameEn: "Galatasaray", nameTr: "Galatasaray", country: "TR", league: "Süper Lig" },
  { id: "Q6601875", nameEn: "Fenerbahçe", nameTr: "Fenerbahçe", country: "TR", league: "Süper Lig" },
  { id: "Q172567", nameEn: "Beşiktaş", nameTr: "Beşiktaş", country: "TR", league: "Süper Lig" },
  { id: "Q192641", nameEn: "Trabzonspor", nameTr: "Trabzonspor", country: "TR", league: "Süper Lig" },
  { id: "Q857938", nameEn: "İstanbul Başakşehir", nameTr: "Başakşehir", country: "TR", league: "Süper Lig" },

  // Premier League
  { id: "Q18656", nameEn: "Manchester United", nameTr: "Manchester United", country: "GB", league: "Premier League" },
  { id: "Q50602", nameEn: "Manchester City", nameTr: "Manchester City", country: "GB", league: "Premier League" },
  { id: "Q1130849", nameEn: "Liverpool", nameTr: "Liverpool", country: "GB", league: "Premier League" },
  { id: "Q9617", nameEn: "Arsenal", nameTr: "Arsenal", country: "GB", league: "Premier League" },
  { id: "Q9616", nameEn: "Chelsea", nameTr: "Chelsea", country: "GB", league: "Premier League" },
  { id: "Q18741", nameEn: "Tottenham Hotspur", nameTr: "Tottenham", country: "GB", league: "Premier League" },

  // La Liga
  { id: "Q8682", nameEn: "Real Madrid", nameTr: "Real Madrid", country: "ES", league: "La Liga" },
  { id: "Q7156", nameEn: "FC Barcelona", nameTr: "Barcelona", country: "ES", league: "La Liga" },
  { id: "Q8704", nameEn: "Atlético Madrid", nameTr: "Atlético Madrid", country: "ES", league: "La Liga" },
  { id: "Q10333", nameEn: "Sevilla", nameTr: "Sevilla", country: "ES", league: "La Liga" },
  { id: "Q10467", nameEn: "Valencia", nameTr: "Valencia", country: "ES", league: "La Liga" },

  // Serie A
  { id: "Q1422", nameEn: "Juventus", nameTr: "Juventus", country: "IT", league: "Serie A" },
  { id: "Q1543", nameEn: "AC Milan", nameTr: "Milan", country: "IT", league: "Serie A" },
  { id: "Q631", nameEn: "Inter Milan", nameTr: "Inter", country: "IT", league: "Serie A" },
  { id: "Q2739", nameEn: "AS Roma", nameTr: "Roma", country: "IT", league: "Serie A" },
  { id: "Q2052", nameEn: "Napoli", nameTr: "Napoli", country: "IT", league: "Serie A" },
  { id: "Q1893", nameEn: "SS Lazio", nameTr: "Lazio", country: "IT", league: "Serie A" },

  // Bundesliga
  { id: "Q15789", nameEn: "Bayern Munich", nameTr: "Bayern Münih", country: "DE", league: "Bundesliga" },
  { id: "Q41420", nameEn: "Borussia Dortmund", nameTr: "Dortmund", country: "DE", league: "Bundesliga" },
  { id: "Q101859", nameEn: "Bayer Leverkusen", nameTr: "Leverkusen", country: "DE", league: "Bundesliga" },
  { id: "Q101104", nameEn: "RB Leipzig", nameTr: "Leipzig", country: "DE", league: "Bundesliga" },

  // Ligue 1 / diğer
  { id: "Q483020", nameEn: "Paris Saint-Germain", nameTr: "PSG", country: "FR", league: "Ligue 1" },
  { id: "Q132885", nameEn: "Olympique Marseille", nameTr: "Marsilya", country: "FR", league: "Ligue 1" },
  { id: "Q19518", nameEn: "Olympique Lyonnais", nameTr: "Lyon", country: "FR", league: "Ligue 1" },
  { id: "Q81888", nameEn: "Ajax", nameTr: "Ajax", country: "NL", league: "Eredivisie" },
  { id: "Q173556", nameEn: "Benfica", nameTr: "Benfica", country: "PT", league: "Primeira Liga" },
  { id: "Q128446", nameEn: "Porto", nameTr: "Porto", country: "PT", league: "Primeira Liga" },
  { id: "Q190387", nameEn: "Sporting CP", nameTr: "Sporting", country: "PT", league: "Primeira Liga" },
];

/** Smaller set for a fast first sync / smoke test */
export const QUICK_CLUBS = SEED_CLUBS.filter((c) =>
  [
    "Q495299",
    "Q660187",
    "Q172567",
    "Q18656",
    "Q1130849",
    "Q8682",
    "Q7156",
    "Q1422",
    "Q1543",
    "Q15789",
    "Q483020",
  ].includes(c.id)
);
