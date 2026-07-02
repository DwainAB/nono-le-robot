# Backend Robot

Backend minimal pour brancher le robot en conversation.

## Ce qu'il fait

- recoit le texte du robot
- renvoie une reponse courte, facile a lire a voix haute
- lit les lieux, produits et infos magasin depuis MySQL
- synchronise les positions actuellement atteignables par le robot
- peut utiliser OpenAI si `OPENAI_API_KEY` est configuree

## Demarrage

```bash
cd /Users/dwainyumco/Desktop/SDP/nono-le-robot/backend
cp .env.example .env
npm start
```

Mode dev :

```bash
npm run dev
```

## API

### `GET /health`

Verifie que le serveur tourne.

### `GET /api/locations`

Retourne les lieux connus du magasin avec leur etat robot et leurs contenus.

### `GET /api/store-info`

Retourne les informations magasin connues.

### `POST /api/chat`

Body :

```json
{
  "message": "Je cherche les talons",
  "sessionId": "abc-123",
  "language": "fr"
}
```

Reponse :

```json
{
  "sessionId": "abc-123",
  "reply": "Les talons sont au rayon chaussures, allee 3. Je peux vous y guider si vous voulez.",
  "action": {
    "type": "navigate",
    "destination": "rayon chaussures",
    "locationId": "heels"
  }
}
```

## Branchement robot

Le robot fait :

1. STT local
2. `POST /api/chat`
3. lit `reply` en TTS
4. si `action.type === "navigate"`, il peut lancer la navigation

## Variables `.env`

Le plus simple avec Railway est de renseigner soit `DATABASE_URL`, soit les variables MySQL natives Railway.

Exemple recommande :

```env
HOST=0.0.0.0
PORT=3000
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4.1-mini

DATABASE_URL=mysql://USER:PASSWORD@HOST:3306/DBNAME
DB_SSL=false
DB_SSL_REJECT_UNAUTHORIZED=true
DB_AUTO_MIGRATE=true
```

Alternative si tu preferes les variables separees :

```env
DB_HOST=
DB_PORT=3306
DB_NAME=
DB_USER=
DB_PASSWORD=
DB_SSL=false
DB_SSL_REJECT_UNAUTHORIZED=true
DB_AUTO_MIGRATE=true
```

## Routes utiles

### `POST /api/robot/locations/sync`

Le robot envoie la liste complete des lieux actuellement atteignables. Les lieux absents de la liste ne sont pas supprimes, ils passent juste en indisponible.

```json
{
  "locations": [
    {
      "externalRobotId": "shoe-area",
      "name": "rayon chaussures",
      "zone": "rez-de-chaussee",
      "details": "allee 2",
      "robotCanNavigate": true,
      "aliases": ["chaussures", "souliers"]
    }
  ]
}
```

### `POST /api/admin/locations/upsert`

Ajoute ou met a jour un lieu, y compris un lieu informatif non accessible par le robot.

```json
{
  "name": "bijouterie etage 2",
  "zone": "deuxieme etage",
  "details": "espace bijoux",
  "robotCanNavigate": false,
  "aliases": ["bijoux", "joaillerie"]
}
```

### `POST /api/admin/location-items/replace`

Associe les produits a un lieu.

```json
{
  "locationId": 1,
  "items": [
    {
      "name": "valises",
      "category": "bagagerie",
      "aliases": ["valise", "bagage cabine"]
    },
    {
      "name": "sacs a main",
      "category": "bagagerie"
    }
  ]
}
```

### `POST /api/admin/store-info/upsert`

Ajoute ou met a jour une information magasin.

```json
{
  "title": "Horaires du magasin",
  "kind": "hours",
  "value": "Du lundi au samedi de 10h a 19h"
}
```
