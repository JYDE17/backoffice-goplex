# Déploiement — Guide pour l'équipe IT

Guide de remise pour déployer **backoffice-goplex** en production (Docker Swarm
+ Traefik + registre privé, comme les autres services `docker-*` du site).

Ce document décrit **uniquement** le déploiement du conteneur. Le développement
de l'app se fait dans Lovable ; l'IT n'a qu'à builder et déployer.

---

## 1. Prérequis d'infrastructure

Ces deux points sont déjà en place pour vos autres services (goleagues,
dokuwiki, registry) — même pattern :

- **Réseau du site Goplex Brossard.** Le serveur hôte doit être sur le réseau
  du site (ou l'atteindre par VPN) : RaceFacer
  (`racefacer.brossard.goplex.ca`) n'est joignable que de là. Clover, Véloce et
  Supabase sont cloud-hostés et joignables de partout.
- **Réseau overlay Swarm `traefik-public`.** Déclaré `external` dans le
  `docker-compose.yml` — il doit exister avant le déploiement.

Outils requis sur l'hôte : Docker (Swarm actif), accès au registre privé
`registry.brossard.goplex.ca`, et Traefik avec le cert resolver `cloudflare`.

---

## 2. Le fichier `.env` (la seule chose hors du repo)

Pour des raisons de sécurité, les secrets ne sont **pas** versionnés. Le repo
ne contient que `.env.example`. Créez un fichier `.env` à la racine du projet
**sur le serveur**, à partir du modèle ci-dessous.

Transmettez ce fichier de façon sécurisée (gestionnaire de secrets / canal
chiffré) — jamais en clair par email ou chat.

```env
# --- Supabase ---
SUPABASE_URL=https://avkakvoinkuseseqkigm.supabase.co
SUPABASE_SERVICE_ROLE_KEY=          # À REMPLIR (secret) — Supabase > Project Settings > API
SUPABASE_ANON_KEY=sb_publishable_6XrnaQmAEMgWJs3dEdk2Yw_VfiiD1R2

# --- RaceFacer (réseau Goplex Brossard uniquement) ---
RACEFACER_BASE_URL=https://racefacer.brossard.goplex.ca
RACEFACER_USERNAME=                 # À REMPLIR
RACEFACER_PASSWORD=                 # À REMPLIR (secret)

# --- Clover ---
CLOVER_API_BASE_URL=https://api.clover.com
CLOVER_MERCHANT_ID=6KAXS6QR8SCG1
CLOVER_API_TOKEN=                   # À REMPLIR (secret)

# --- Veloce ---
VELOCE_EMAIL=                       # À REMPLIR
VELOCE_PASSWORD=                    # À REMPLIR (secret)
VELOCE_LOCATION_ID=11f07a0a-9a46-7998-b79f-0242ac130015
```

Les lignes déjà remplies sont des valeurs non-secrètes (URLs, identifiants
publics). Ne remplir que les champs marqués `À REMPLIR`.

> **`COOKIE_SECURE=true` est déjà forcé** dans `docker-compose.yml` (l'app est
> servie en HTTPS via Traefik) — inutile de l'ajouter au `.env`.

---

## 3. Déploiement (3 commandes, sur le serveur)

```bash
# 1. Récupérer le code et déposer le .env à la racine
git clone <url-du-repo> && cd backoffice-goplex   # ou `git pull` si déjà cloné
#    → placer le fichier .env ici

# 2. Builder + pousser l'image vers le registre privé
./deploy/build-push.sh                             # tag :latest
#    (versionné : ./deploy/build-push.sh 1.4.0  → tags :1.4.0 et :latest)

# 3. Déployer la stack Swarm
docker stack deploy -c docker-compose.yml --with-registry-auth backoffice
```

Alternative Portainer : après l'étape 2 (`build-push.sh`), utiliser
« Update the stack » (re-pull) dans l'UI Portainer au lieu de l'étape 3.

> **Architecture CPU :** buildez sur la même archi que le serveur (le plus
> simple est de builder directement dessus). Pour cross-builder (ex. Mac arm64
> → serveur amd64), voir la note dans `deploy/build-push.sh`
> (`docker buildx build --platform linux/amd64 --push …`).

---

## 4. Mises à jour futures

Un seul script fait tout (pull `main` → build → push → redeploy → cleanup) :

```bash
./deploy/docker-update.sh
```

Il rebuild toujours, même sans nouveau commit, pour garantir que le service
tourne bien la dernière version.

---

## 5. Accès à l'application

- **URL de production : `https://backoffice.brossard.goplex.ca`** (via Traefik,
  TLS Cloudflare). **Connectez-vous par cette adresse** — le cookie de session
  est `Secure` et ne transite qu'en HTTPS.
- **Fallback LAN : `http://<ip-serveur>:3000`.** Le port est exposé pour un
  accès direct, mais le **login n'y fonctionne pas** (le cookie `Secure` n'est
  jamais renvoyé en HTTP) — c'est attendu. À réserver au diagnostic.

---

## 6. Santé du conteneur

Le `docker-compose.yml` inclut un healthcheck (requête HTTP interne sur le port
3000 toutes les 30s). Vérifier l'état :

```bash
docker stack services backoffice
docker service logs backoffice_backoffice --tail 50
```

---

## Résumé — checklist de remise

- [ ] Serveur hôte sur le réseau Goplex Brossard + réseau `traefik-public` présent
- [ ] Fichier `.env` créé sur le serveur avec les 6 secrets remplis
- [ ] `./deploy/build-push.sh` exécuté (image dans le registre privé)
- [ ] `docker stack deploy …` exécuté (ou « Update the stack » Portainer)
- [ ] Accès confirmé sur `https://backoffice.brossard.goplex.ca`
