# Backend Robot

Backend minimal pour brancher le robot en conversation.

## Ce qu'il fait

- recoit le texte du robot
- renvoie une reponse courte, facile a lire a voix haute
- reconnait quelques demandes magasin simples comme `talons`, `baskets`, `sacs`, `caisse`, `toilettes`
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

Retourne les emplacements connus du magasin.

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
