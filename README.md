# Football Common Players API

İki futbol kulübünde de forma giymiş oyuncuları bulan Wikidata destekli REST API. Veriler SQLite veritabanında tutulur.

**GitHub:** https://github.com/barissenturk/football-api  
**Yerel base URL:** `http://localhost:3000`

---

## Ne yapar?

- Wikidata'dan kulüp ve kariyer (stint) verilerini senkronize eder
- SQLite üzerinde takım / oyuncu sorguları sunar
- Ana kullanım: iki takımda da oynamış ortak oyuncuları döner (`GET /common-players`)

Takım kimliği olarak Wikidata Q-id (ör. `Q495299`) veya takım adı kullanılabilir.

---

## Gereksinimler

- Node.js 18+
- npm

---

## Yerel kurulum

```powershell
cd api
npm install
npm start
```

Geliştirme (dosya değişince yeniden başlatır):

```powershell
npm run dev
```

Sunucu: `http://localhost:3000`

### Veritabanı senkronizasyonu (opsiyonel)

İlk kurulumda veya veriyi güncellemek için:

| Komut | Açıklama |
|--------|----------|
| `npm run sync` | Tam Wikidata senkronizasyonu |
| `npm run sync:quick` | Hızlı / sınırlı senkron |
| `npm run sync:fener` | Örnek: tek kulüp (`Q6601875`) |
| `npm run sync:logos` | Kulüp logolarını günceller |

---

## Ortam değişkenleri

`.env.example` dosyasını referans alabilirsiniz.

| Değişken | Zorunlu | Açıklama |
|----------|---------|----------|
| `PORT` | Hayır | Varsayılan `3000` |
| `CORS_ORIGIN` | Hayır | Frontend origin'leri (virgülle). Örn: `http://localhost:5173,https://uygulama.vercel.app`. Boş bırakılırsa tüm origin'lere izin verilir. |
| `DATABASE_PATH` | Hayır | SQLite dosya yolu. Örn: `./data/football.db` veya Railway volume: `/data/football.db` |

**CORS notu:** Frontend farklı bir origin'den (Vite, Vercel vb.) istek atıyorsa `CORS_ORIGIN` ile izin verilen adresleri ayarlayın.

---

## Endpoint'ler

### `GET /`

API özeti: veritabanı yolu, kayıt sayıları, son senkron zamanı ve endpoint listesi.

```powershell
curl http://localhost:3000/
```

Tarayıcı: http://localhost:3000/

---

### `GET /health`

Sağlık kontrolü.

```powershell
curl http://localhost:3000/health
```

Örnek yanıt: `{ "ok": true }`

---

### `GET /teams`

Takım ara / listele.

| Query | Açıklama |
|-------|----------|
| `q` | İsim veya Q-id ile arama (kısmi eşleşme) |
| `league` | Lig filtresi (kısmi eşleşme) |
| `seeded` | `1` ise yalnızca seeded takımlar |
| `limit` | Sonuç limiti (varsayılan 30, max 100) |

```powershell
curl "http://localhost:3000/teams?q=Galatasaray&limit=10"
curl "http://localhost:3000/teams?league=Süper&seeded=1"
```

Tarayıcı: http://localhost:3000/teams?q=Galatasaray

**Örnek yanıt şekli:**

```json
{
  "count": 1,
  "teams": [
    {
      "id": "Q495299",
      "name": "Galatasaray",
      "nameEn": "Galatasaray S.K.",
      "nameTr": "Galatasaray",
      "country": "Turkey",
      "league": "Süper Lig",
      "logoUrl": "https://...",
      "seeded": true
    }
  ]
}
```

---

### `GET /teams/:id`

Tek takım detayı (+ oyuncu sayısı). `:id` Wikidata Q-id olmalıdır.

```powershell
curl http://localhost:3000/teams/Q495299
```

Tarayıcı: http://localhost:3000/teams/Q495299

404: `{ "error": "Takım bulunamadı" }`

---

### `GET /teams/:id/players`

Takımda oynamış oyuncular.

| Query | Açıklama |
|-------|----------|
| `limit` | Varsayılan 200, max 1000 |

```powershell
curl "http://localhost:3000/teams/Q495299/players?limit=50"
```

---

### `GET /common-players`

**Ana endpoint.** İki takımda da stinti olan ortak oyuncular.

| Query | Açıklama |
|-------|----------|
| `team1` | Zorunlu — Wikidata Q-id **veya** takım adı |
| `team2` | Zorunlu — Wikidata Q-id **veya** takım adı |

Ad ile aramada önce tam eşleşme, yoksa kısmi eşleşme kullanılır (oyuncu sayısı / seeded öncelikli).

```powershell
curl "http://localhost:3000/common-players?team1=Galatasaray&team2=Fenerbahçe"
curl "http://localhost:3000/common-players?team1=Q495299&team2=Q18656"
curl "http://localhost:3000/common-players?team1=Galatasaray&team2=Q18656"
```

Tarayıcı: http://localhost:3000/common-players?team1=Galatasaray&team2=Fenerbahçe

**Örnek yanıt şekli:**

```json
{
  "team1": {
    "id": "Q495299",
    "name": "Galatasaray",
    "nameEn": "Galatasaray S.K.",
    "nameTr": "Galatasaray",
    "country": "Turkey",
    "league": "Süper Lig",
    "logoUrl": "https://...",
    "seeded": true
  },
  "team2": { "id": "Q18656", "name": "Manchester United", "...": "..." },
  "count": 2,
  "players": [
    {
      "id": "Q123",
      "name": "Oyuncu Adı",
      "nameEn": "Player Name",
      "birthYear": "1985",
      "imageUrl": "https://...",
      "stints": {
        "team1": { "teamId": "Q495299", "startYear": "2010", "endYear": "2012" },
        "team2": { "teamId": "Q18656", "startYear": "2013", "endYear": "2015" }
      }
    }
  ]
}
```

Hata örnekleri:
- Eksik parametre → `400` + örnek URL
- Aynı iki takım → `400`

---

### `GET /players/:id`

Oyuncu profili ve kariyer (takım stintleri). `:id` Wikidata Q-id.

```powershell
curl http://localhost:3000/players/Q11571
```

Tarayıcı: http://localhost:3000/players/Q11571

Yanıtta `career` dizisi: her takım için `teamId`, isimler, ülke, lig, logo, `startYear` / `endYear`.

---

## Hızlı referans

| Method | Path | Açıklama |
|--------|------|----------|
| GET | `/` | API bilgisi ve sayaçlar |
| GET | `/health` | Health check |
| GET | `/teams` | Takım ara (`q`, `league`, `seeded`, `limit`) |
| GET | `/teams/:id` | Takım detay |
| GET | `/teams/:id/players` | Takım oyuncuları (`limit`) |
| GET | `/common-players` | Ortak oyuncular (`team1`, `team2`) |
| GET | `/players/:id` | Oyuncu kariyeri |

---

## Lisans / kaynak

Veri kaynağı: [Wikidata](https://www.wikidata.org/).
